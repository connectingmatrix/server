/**
 * Persistence helpers for ai_permissions.
 * This file is the CRUD boundary for reading one row, reading a scoped set of rows,
 * and saving or deleting rows based on tri-state permission inputs.
 * It feeds GraphQL permission resolvers and admin flows that edit ai_permissions.
 */
import { readScopedPermissionQuery } from '@giga/permissions/manifest/permission-query';
import { PermissionEntity } from '@connectingmatrix/orm/repositories/entities/auth/PermissionEntity';
import { permissionInputHasValues } from '@giga/general/services/giga/auth/ai-permission-state';
import type { AIPermissionQueryInput, AIPermissionRow, UpsertAIPermissionInput } from '@giga/shared/types/contracts/org.types';

export function readAIPermissionRows(supabase: any, input: AIPermissionQueryInput): Promise<AIPermissionRow[]> {
  return readScopedPermissionQuery(supabase, input);
}

export async function readAIPermissionRow(
  _supabase: any,
  input: { scope: string; module: string; organizationId?: string | null; userId?: string | null },
) {
  const row = await PermissionEntity.find({
    scope: input.scope,
    module: input.module,
    organization_id: input.organizationId || null,
    user_id: input.userId || null,
  }).single();
  return row ? (row.extract() as AIPermissionRow) : null;
}

export async function saveAIPermissionRow(supabase: any, input: UpsertAIPermissionInput) {
  const current = await readAIPermissionRow(supabase, input);
  if (!permissionInputHasValues(input)) {
    if (!current?.id) return null;
    await PermissionEntity.deleteById(current.id);
    return null;
  }
  const payload = {
    scope: input.scope,
    organization_id: input.organizationId || null,
    user_id: input.userId || null,
    module: input.module,
    can_create: input.can_create ?? null,
    can_read: input.can_read ?? null,
    can_update: input.can_update ?? null,
    can_delete: input.can_delete ?? null,
    can_execute: input.can_execute ?? null,
    updated_at: new Date().toISOString(),
  };
  if (current?.id) {
    const row = await PermissionEntity.updateById(current.id, payload);
    return row ? (row.extract() as AIPermissionRow) : null;
  }
  return (await PermissionEntity.create(payload)).extract() as AIPermissionRow;
}
