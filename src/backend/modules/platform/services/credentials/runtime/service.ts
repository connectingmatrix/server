import { BadRequestError } from 'routing-controllers';
import { decryptCredentialJson, encryptCredentialJson } from '@giga/general/services/credentials/runtime/crypto';
import { getCredentialCatalogService, listCredentialCatalog } from '@giga/general/services/credentials/telemetry/catalog';
import {
  deleteCredentialRow,
  getCredentialRowById,
  createCredentialRow,
  listCredentialRows,
  updateCredentialRow,
  updateCredentialStatusRow,
} from './repository';
import type { WorkflowResolvedCredential } from '@workflow/executor';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CreateCredentialInput,
  CredentialAccess,
  CredentialCatalogField,
  CredentialFieldValues,
  CredentialQueryInput,
  CredentialRecordPayload,
  CredentialRow,
  CredentialsPayload,
  CredentialScope,
  UpdateCredentialInput,
} from '@giga/general/services/credentials/contracts/types';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isJsonObject(value: unknown): value is CredentialFieldValues {
  return Boolean(value) && !Array.isArray(value) && typeof value === 'object';
}

function deriveScope(row: CredentialRow): 'GLOBAL' | 'ORGANIZATION' | 'PERSONAL' {
  if (row.is_global === true) return 'GLOBAL';
  if (row.organization_id) return 'ORGANIZATION';
  return 'PERSONAL';
}

function buildScopeInputFromRow(row: CredentialRow): CredentialQueryInput {
  return row.is_global === true
    ? { scope: 'GLOBAL' }
    : row.organization_id
    ? { scope: 'ORGANIZATION', organizationId: row.organization_id }
    : { scope: 'PERSONAL' };
}

function validateFieldValue(field: CredentialCatalogField, value: unknown): void {
  if (value == null || value === '') {
    if (field.required) {
      throw new BadRequestError(`${field.label} is required.`);
    }
    return;
  }

  if (field.inputKind === 'boolean' && typeof value !== 'boolean') {
    throw new BadRequestError(`${field.label} must be a boolean.`);
  }
  if (field.inputKind === 'number' && typeof value !== 'number') {
    throw new BadRequestError(`${field.label} must be a number.`);
  }
  if (field.inputKind === 'select' && (!field.options.some((option) => option.value === value) || typeof value !== 'string')) {
    throw new BadRequestError(`${field.label} must be one of the supported options.`);
  }
  if (field.inputKind === 'string_array') {
    const isValid = typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
    if (!isValid) {
      throw new BadRequestError(`${field.label} must be a string or array of strings.`);
    }
  }
  if (
    (field.inputKind === 'text' || field.inputKind === 'url' || field.inputKind === 'secret' || field.inputKind === 'textarea') &&
    typeof value !== 'string'
  ) {
    throw new BadRequestError(`${field.label} must be a string.`);
  }
  if (field.inputKind === 'json') {
    const isValid = typeof value === 'string' || isJsonObject(value) || Array.isArray(value);
    if (!isValid) {
      throw new BadRequestError(`${field.label} must be a JSON-safe value.`);
    }
  }
}

function validateMcpCredentialValues(values: CredentialFieldValues): void {
  const servers = values.mcpServers;
  if (!isJsonObject(servers)) {
    throw new BadRequestError('MCP Servers must be a JSON object.');
  }

  const entries = Object.entries(servers);
  if (entries.length !== 1) {
    throw new BadRequestError('MCP credentials must define exactly one MCP server.');
  }

  const [serverKey, serverValue] = entries[0];
  if (!normalizeString(serverKey)) {
    throw new BadRequestError('MCP server key is required.');
  }
  if (!isJsonObject(serverValue)) {
    throw new BadRequestError('MCP server config must be a JSON object.');
  }

  if (normalizeString(serverValue.type) !== 'streamable-http') {
    throw new BadRequestError('MCP server type must be "streamable-http".');
  }
  if (!normalizeString(serverValue.url)) {
    throw new BadRequestError('MCP server URL is required.');
  }
  if (serverValue.headers != null && !isJsonObject(serverValue.headers)) {
    throw new BadRequestError('MCP server headers must be a JSON object.');
  }
  if (serverValue.note != null && typeof serverValue.note !== 'string') {
    throw new BadRequestError('MCP server note must be a string.');
  }
}

export function validateCredentialValues(serviceId: string, values: CredentialFieldValues): CredentialFieldValues {
  const service = getCredentialCatalogService(serviceId);
  if (!service) {
    throw new BadRequestError(`Unsupported credential service: ${serviceId}`);
  }

  if (!isJsonObject(values)) {
    throw new BadRequestError('Credential payload must be an object.');
  }

  const fieldsByKey = new Map(service.fields.map((field) => [field.key, field]));

  Object.keys(values).forEach((key) => {
    if (!fieldsByKey.has(key)) {
      throw new BadRequestError(`Unsupported credential field: ${key}`);
    }
  });

  service.fields.forEach((field) => {
    validateFieldValue(field, values[field.key]);
  });
  if (service.serviceId === 'mcp') {
    validateMcpCredentialValues(values);
  }

  return values;
}

function toCredentialRecordPayload(row: CredentialRow, access: CredentialAccess, includeSecrets: boolean): CredentialRecordPayload {
  const catalog = getCredentialCatalogService(row.service_id);

  return {
    id: row.id,
    credentialName: row.credential_name,
    serviceId: row.service_id,
    serviceName: catalog?.serviceName || null,
    serviceIcon: catalog?.serviceIcon || null,
    scope: deriveScope(row),
    status: (normalizeString(row.status).toUpperCase() || 'DRAFT') as CredentialRecordPayload['status'],
    lastUsedAt: row.last_used_at || null,
    failureCount: Number(row.failure_count || 0),
    successCount: Number(row.success_count || 0),
    isGlobal: row.is_global === true,
    organizationId: row.organization_id || null,
    userId: row.user_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    credJson: includeSecrets && access.canReadSecrets ? decryptCredentialJson(row.cred_json) : null,
  };
}

function scopeFilter(input: CredentialQueryInput, access: CredentialAccess) {
  if (input.scope === 'GLOBAL') {
    return { isGlobal: true, organizationId: null, userId: null, serviceId: input.serviceId || null };
  }

  if (input.scope === 'PERSONAL') {
    return { isGlobal: null, organizationId: null, userId: access.userId, serviceId: input.serviceId || null };
  }

  return { isGlobal: null, organizationId: access.organizationId, userId: null, serviceId: input.serviceId || null };
}

export function getCredentialCatalogPayload() {
  return listCredentialCatalog();
}

export async function listCredentials(supabase: SupabaseClient, input: CredentialQueryInput, access: CredentialAccess): Promise<CredentialsPayload> {
  const rows = await listCredentialRows(supabase, scopeFilter(input, access));
  return {
    access,
    rows: rows.map((row) => toCredentialRecordPayload(row, access, false)),
  };
}

export async function getCredential(
  supabase: SupabaseClient,
  id: string,
  accessByScope: (scope: CredentialQueryInput) => Promise<CredentialAccess>,
): Promise<CredentialRecordPayload | null> {
  const row = await getCredentialRowById(supabase, id);
  if (!row) return null;

  const scopeInput = buildScopeInputFromRow(row);
  const access = await accessByScope(scopeInput);
  return toCredentialRecordPayload(row, access, true);
}

export async function resolveCredentialForExecution(
  supabase: SupabaseClient,
  id: string,
  accessByScope: (scope: CredentialQueryInput) => Promise<CredentialAccess>,
): Promise<WorkflowResolvedCredential | null> {
  const row = await getCredentialRowById(supabase, id);
  if (!row) return null;

  const access = await accessByScope(buildScopeInputFromRow(row));
  if (!access.canExecute && !access.canReadSecrets) {
    throw new BadRequestError('Insufficient permissions for credential execution.');
  }

  const values = decryptCredentialJson(row.cred_json);
  return {
    id: row.id,
    credentialId: row.id,
    credentialName: row.credential_name,
    serviceId: row.service_id,
    serviceName: getCredentialCatalogService(row.service_id)?.serviceName || null,
    serviceIcon: getCredentialCatalogService(row.service_id)?.serviceIcon || null,
    scope: deriveScope(row) as CredentialScope,
    values: values && typeof values === 'object' && !Array.isArray(values) ? values : {},
  };
}

export async function createCredential(
  supabase: SupabaseClient,
  input: CreateCredentialInput,
  access: CredentialAccess,
): Promise<CredentialRecordPayload> {
  const credentialName = normalizeString(input.credentialName);
  if (!credentialName) {
    throw new BadRequestError('credentialName is required.');
  }

  const serviceId = normalizeString(input.serviceId);
  const credJson = validateCredentialValues(serviceId, input.credJson);
  const row = await createCredentialRow(supabase, {
    credentialName,
    serviceId,
    encryptedCredJson: encryptCredentialJson(credJson),
    status: 'DRAFT',
    isGlobal: access.scope === 'GLOBAL' ? true : null,
    organizationId: access.scope === 'ORGANIZATION' ? access.organizationId : null,
    userId: access.scope === 'PERSONAL' ? access.userId : null,
  });

  return toCredentialRecordPayload(row, access, true);
}

export async function updateCredential(
  supabase: SupabaseClient,
  input: UpdateCredentialInput,
  accessByScope: (scope: CredentialQueryInput) => Promise<CredentialAccess>,
): Promise<CredentialRecordPayload> {
  const current = await getCredentialRowById(supabase, input.id);
  if (!current) {
    throw new BadRequestError('Credential was not found.');
  }

  const access = await accessByScope(buildScopeInputFromRow(current));
  const credentialName = normalizeString(input.credentialName);
  if (!credentialName) {
    throw new BadRequestError('credentialName is required.');
  }

  const credJson = validateCredentialValues(current.service_id, input.credJson);
  const row = await updateCredentialRow(supabase, {
    id: current.id,
    credentialName,
    encryptedCredJson: encryptCredentialJson(credJson),
  });
  return toCredentialRecordPayload(row, access, true);
}

export async function deleteCredential(
  supabase: SupabaseClient,
  id: string,
  accessByScope: (scope: CredentialQueryInput) => Promise<CredentialAccess>,
): Promise<void> {
  const current = await getCredentialRowById(supabase, id);
  if (!current) return;
  await accessByScope(buildScopeInputFromRow(current));
  await deleteCredentialRow(supabase, id);
}

export async function activateCredential(
  supabase: SupabaseClient,
  id: string,
  accessByScope: (scope: CredentialQueryInput) => Promise<CredentialAccess>,
): Promise<CredentialRecordPayload> {
  const current = await getCredentialRowById(supabase, id);
  if (!current) {
    throw new BadRequestError('Credential was not found.');
  }

  const access = await accessByScope(buildScopeInputFromRow(current));
  const row = await updateCredentialStatusRow(supabase, id, 'ACTIVE');
  return toCredentialRecordPayload(row, access, false);
}
