import { GigaORM } from '@connectingmatrix/orm/orm';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { getCredentialCatalogService } from '@giga/general/services/credentials/telemetry/catalog';
import { decryptCredentialJson } from '@giga/general/services/credentials/runtime/crypto';
import { getCredentialRowById, updateCredentialExecutionTelemetryRow } from '@giga/general/services/credentials/runtime/repository';
import type { CredentialExecutionResultInput, CredentialRecordPayload } from '@giga/general/services/credentials/contracts/types';

export async function recordCredentialExecutionResult(input: CredentialExecutionResultInput): Promise<CredentialRecordPayload | null> {
  const supabase = SupabaseClientAdmin();
  const row = await GigaORM.run({ caller: { id: 'credential-telemetry', type: 'root' } }, () => getCredentialRowById(supabase, input.credentialId));
  if (!row) return null;

  const updated = await GigaORM.run({ caller: { id: 'credential-telemetry', type: 'root' } }, () =>
    updateCredentialExecutionTelemetryRow(supabase, {
      id: input.credentialId,
      success: input.success,
      lastUsedAt: input.lastUsedAt || new Date().toISOString(),
    }),
  );
  const catalog = getCredentialCatalogService(updated.service_id);

  return {
    id: updated.id,
    credentialName: updated.credential_name,
    serviceId: updated.service_id,
    serviceName: catalog?.serviceName || null,
    serviceIcon: catalog?.serviceIcon || null,
    scope: updated.is_global === true ? 'GLOBAL' : updated.organization_id ? 'ORGANIZATION' : 'PERSONAL',
    status: String(updated.status || 'DRAFT').toUpperCase() as CredentialRecordPayload['status'],
    lastUsedAt: updated.last_used_at || null,
    failureCount: Number(updated.failure_count || 0),
    successCount: Number(updated.success_count || 0),
    isGlobal: updated.is_global === true,
    organizationId: updated.organization_id || null,
    userId: updated.user_id || null,
    createdAt: updated.created_at || null,
    updatedAt: updated.updated_at || null,
    credJson: decryptCredentialJson(updated.cred_json),
  };
}
