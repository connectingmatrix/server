/**
 * Pure merge rules for permission rows.
 * This converts plan rows, organization baselines, and member or user overrides into
 * one boolean summary the runtime can enforce, and it also detects empty writes.
 * It feeds access.context, readEffectiveAIPolicy, and permission-store.
 */
import type { AIPermissionRow, OrganizationPermissionSummary, UpsertAIPermissionInput } from '@giga/shared/types/contracts/org.types';

const fields = ['can_create', 'can_read', 'can_update', 'can_delete', 'can_execute'] as const;

function actionAllowed(value?: boolean | null) {
  return value !== false;
}

export function buildPermissionSummary(baseline?: AIPermissionRow | null, member?: AIPermissionRow | null): OrganizationPermissionSummary {
  return {
    allowCreate: actionAllowed(baseline?.can_create) && actionAllowed(member?.can_create),
    allowRead: actionAllowed(baseline?.can_read) && actionAllowed(member?.can_read),
    allowUpdate: actionAllowed(baseline?.can_update) && actionAllowed(member?.can_update),
    allowDelete: actionAllowed(baseline?.can_delete) && actionAllowed(member?.can_delete),
    allowExecute: actionAllowed(baseline?.can_execute) && actionAllowed(member?.can_execute),
  };
}

export function permissionInputHasValues(input: UpsertAIPermissionInput) {
  return fields.some((field) => input[field] !== null && typeof input[field] !== 'undefined');
}

export function memberGrantBlocked(baseline?: AIPermissionRow | null, input?: UpsertAIPermissionInput | null) {
  if (!baseline || !input) return false;
  return (
    (baseline.can_create === false && input.can_create === true) ||
    (baseline.can_read === false && input.can_read === true) ||
    (baseline.can_update === false && input.can_update === true) ||
    (baseline.can_delete === false && input.can_delete === true) ||
    (baseline.can_execute === false && input.can_execute === true)
  );
}

export function blankPermissionSummary(): OrganizationPermissionSummary {
  return {
    allowCreate: true,
    allowRead: true,
    allowUpdate: true,
    allowDelete: true,
    allowExecute: true,
  };
}
