import type { Json, Tables } from '@giga/shared/types/contracts/database.types';
import type { WorkflowResolvedCredential } from '@workflow/executor';

export type CredentialScope = 'GLOBAL' | 'ORGANIZATION' | 'PERSONAL';
export type CredentialStatus = 'DRAFT' | 'ACTIVE' | 'FAILED';

export type CredentialCatalogFieldKind = 'secret' | 'text' | 'url' | 'boolean' | 'number' | 'json' | 'textarea' | 'select' | 'string_array';

export type CredentialCatalogFieldOption = {
  label: string;
  value: string;
};

export type CredentialCatalogField = {
  key: string;
  label: string;
  token: string;
  inputKind: CredentialCatalogFieldKind;
  required: boolean;
  multiline: boolean;
  options: CredentialCatalogFieldOption[];
};

export type CredentialCatalogService = {
  serviceId: string;
  serviceName: string;
  serviceIcon: string | null;
  fields: CredentialCatalogField[];
};

export type CredentialAccess = {
  scope: CredentialScope;
  organizationId: string | null;
  userId: string | null;
  canCreate: boolean;
  canReadSecrets: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExecute: boolean;
  canActivate: boolean;
};

export type CredentialFieldValues = Record<string, Json>;

export type CredentialRow = Tables<'ai_credentials'>;

export type CredentialRecordPayload = {
  id: string;
  credentialName: string;
  serviceId: string;
  serviceName: string | null;
  serviceIcon: string | null;
  scope: CredentialScope;
  status: CredentialStatus;
  lastUsedAt: string | null;
  failureCount: number;
  successCount: number;
  isGlobal: boolean;
  organizationId: string | null;
  userId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  credJson: CredentialFieldValues | null;
};

export type CredentialsPayload = {
  access: CredentialAccess;
  rows: CredentialRecordPayload[];
};

export type CredentialQueryInput = {
  scope: CredentialScope;
  organizationId?: string | null;
  serviceId?: string | null;
};

export type CreateCredentialInput = {
  scope: CredentialScope;
  organizationId?: string | null;
  credentialName: string;
  serviceId: string;
  credJson: CredentialFieldValues;
};

export type UpdateCredentialInput = {
  id: string;
  credentialName: string;
  credJson: CredentialFieldValues;
};

export type CredentialExecutionResultInput = {
  credentialId: string;
  success: boolean;
  lastUsedAt?: string | null;
};

export type ResolvedWorkflowCredential = WorkflowResolvedCredential;
