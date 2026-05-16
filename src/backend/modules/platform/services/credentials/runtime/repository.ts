import { SupabaseClient } from '@supabase/supabase-js';
import { CredentialEntity } from '@connectingmatrix/orm/repositories/entities/runtime/CredentialEntity';
import type { CredentialRow, CredentialStatus } from '@giga/general/services/credentials/contracts/types';

export async function listCredentialRows(
  _supabase: SupabaseClient,
  input: { isGlobal?: boolean | null; organizationId?: string | null; userId?: string | null; serviceId?: string | null },
): Promise<CredentialRow[]> {
  const result = await CredentialEntity.findByFilter({
    includeGlobal: input.isGlobal === true,
    organizationId: input.organizationId || null,
    userId: input.userId || null,
    serviceId: input.serviceId || null,
  });
  return result.rows.map((row) => row.extract() as CredentialRow);
}

export async function getCredentialRowById(_supabase: SupabaseClient, id: string): Promise<CredentialRow | null> {
  const row = await CredentialEntity.findById(id);
  return row ? (row.extract() as CredentialRow) : null;
}

export async function createCredentialRow(
  _supabase: SupabaseClient,
  input: {
    credentialName: string;
    serviceId: string;
    encryptedCredJson: string;
    status: CredentialStatus;
    isGlobal: boolean | null;
    organizationId: string | null;
    userId: string | null;
  },
): Promise<CredentialRow> {
  const data = await CredentialEntity.create({
    credential_name: input.credentialName,
    service_id: input.serviceId,
    status: input.status,
    is_global: input.isGlobal,
    organization_id: input.organizationId,
    user_id: input.userId,
    cred_json: input.encryptedCredJson,
  });
  return data.extract() as CredentialRow;
}

export async function updateCredentialRow(
  _supabase: SupabaseClient,
  input: {
    id: string;
    credentialName: string;
    encryptedCredJson: string;
  },
): Promise<CredentialRow> {
  const data = await CredentialEntity.updateById(input.id, {
    credential_name: input.credentialName,
    cred_json: input.encryptedCredJson,
  });
  if (!data) throw new Error(`Credential ${input.id} not found.`);
  return data.extract() as CredentialRow;
}

export async function updateCredentialStatusRow(_supabase: SupabaseClient, id: string, status: CredentialStatus): Promise<CredentialRow> {
  const data = await CredentialEntity.updateStatusById(id, status);
  if (!data) throw new Error(`Credential ${id} not found.`);
  return data.extract() as CredentialRow;
}

export async function deleteCredentialRow(_supabase: SupabaseClient, id: string): Promise<void> {
  await CredentialEntity.deleteById(id);
}

export async function updateCredentialExecutionTelemetryRow(
  _supabase: SupabaseClient,
  input: { id: string; success: boolean; lastUsedAt: string },
): Promise<CredentialRow> {
  const data = await CredentialEntity.updateExecutionTelemetryById(input.id, { success: input.success, usedAt: input.lastUsedAt });
  return data.extract() as CredentialRow;
}
