/**
 * Validation and normalization helpers for ai_permissions CRUD.
 * This file decides which permission scope applies to a query, validates the target shape,
 * and converts resolver or UI writes into the stored ai_permissions row format.
 * It feeds permission-store and the GraphQL permission mutation/query layer.
 */
import { BadRequestError } from 'routing-controllers';
import type { AIPermissionQueryInput, AIPermissionScope, OrganizationModule, UpsertAIPermissionInput } from '@giga/shared/types/contracts/org.types';

export type UpsertAIPermissionArgs = {
  scope: AIPermissionScope;
  organizationId?: string | null;
  userId?: string | null;
  module: OrganizationModule;
  canCreate?: boolean | null;
  canRead?: boolean | null;
  canUpdate?: boolean | null;
  canDelete?: boolean | null;
  canExecute?: boolean | null;
};

export function readAIPermissionQueryScope(input: AIPermissionQueryInput): AIPermissionScope {
  if (input.organizationId && input.userId) return 'ORGANIZATION_MEMBER';
  if (input.organizationId) return 'ORGANIZATION';
  if (input.userId) return 'USER';
  throw new BadRequestError('organizationId or userId is required.');
}

export function assertAIPermissionScope(input: { scope: AIPermissionScope; organizationId?: string | null; userId?: string | null }) {
  if (input.scope === 'ORGANIZATION' && input.organizationId && !input.userId) return;
  if (input.scope === 'ORGANIZATION_MEMBER' && input.organizationId && input.userId) return;
  if (input.scope === 'USER' && !input.organizationId && input.userId) return;
  throw new BadRequestError(`Invalid ${input.scope} permission target.`);
}

export function buildAIPermissionWrite(input: UpsertAIPermissionArgs): UpsertAIPermissionInput {
  assertAIPermissionScope(input);
  return {
    scope: input.scope,
    organizationId: input.organizationId || null,
    userId: input.userId || null,
    module: input.module,
    can_create: typeof input.canCreate === 'boolean' ? input.canCreate : null,
    can_read: typeof input.canRead === 'boolean' ? input.canRead : null,
    can_update: typeof input.canUpdate === 'boolean' ? input.canUpdate : null,
    can_delete: typeof input.canDelete === 'boolean' ? input.canDelete : null,
    can_execute: typeof input.canExecute === 'boolean' ? input.canExecute : null,
  };
}
