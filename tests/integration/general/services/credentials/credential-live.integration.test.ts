import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ensureEntityOrmInstalled, withEntityRequestContext } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { CredentialResolver } from '@giga/general/services/graphql/resolvers/integration/credential.resolver';
import { recordCredentialExecutionResult } from '@giga/general/services/credentials';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { CreateCredentialInput, CredentialQueryInput, UpdateCredentialInput } from '@giga/general/services/credentials/contracts/types';

const adminSupabase = () => SupabaseClientAdmin();
const resolver = new CredentialResolver();
const createdCredentialIds = new Set<string>();
const createdOrganizationIds = new Set<string>();
const createdMembershipIds = new Set<string>();
const createdPermissionIds = new Set<string>();

async function ensureCredentialsTableReady() {
  const { error } = await adminSupabase().from('ai_credentials').select('id').limit(1);
  if (error) {
    throw new Error(
      `ai_credentials table is not available in the live Supabase environment. Apply sql/20260329_ai_credentials.sql first. Original error: ${error.message}`,
    );
  }
}

async function getRootUserId(): Promise<string> {
  const { data, error } = await adminSupabase().from('app_root_users').select('user_id').eq('is_active', true).limit(1).maybeSingle();
  if (error || !data?.user_id) {
    throw new Error(`Could not resolve an active root user. ${error?.message || ''}`.trim());
  }
  return String(data.user_id);
}

async function getNonRootUsers(rootUserId: string): Promise<[string, string]> {
  const { data, error } = await adminSupabase().from('User').select('id').neq('id', rootUserId).limit(2);
  if (error) {
    throw error;
  }
  const ids = Array.isArray(data) ? data.map((row) => String((row as any).id || '')).filter(Boolean) : [];
  if (ids.length < 2) {
    throw new Error('At least two non-root users are required for live credential permission tests.');
  }
  return [ids[0], ids[1]];
}

async function createOrganization(input: { createdBy: string }) {
  const organizationId = randomUUID();
  const now = new Date().toISOString();
  const slug = `cred-live-${organizationId.slice(0, 8)}`;
  const { error } = await adminSupabase()
    .from('organizations')
    .insert({
      id: organizationId,
      slug,
      name: `Credential Live ${organizationId.slice(0, 8)}`,
      description: 'Credential integration test organization',
      is_active: true,
      metadata: { billing: { currentPlanId: 'business-lite' } },
      created_by: input.createdBy,
      created_at: now,
      updated_at: now,
    });
  if (error) throw error;
  createdOrganizationIds.add(organizationId);
  return organizationId;
}

async function addMembership(input: { organizationId: string; userId: string; role: 'ADMIN' | 'MEMBER' | 'SUPER_ADMIN' }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const { error } = await adminSupabase().from('organization_members').insert({
    id,
    organization_id: input.organizationId,
    user_id: input.userId,
    role: input.role,
    is_disabled: false,
    metadata: {},
    created_at: now,
    updated_at: now,
  });
  if (error) throw error;
  createdMembershipIds.add(id);
}

async function addPermission(input: {
  organizationId: string;
  userId?: string | null;
  scope?: 'ORGANIZATION' | 'ORGANIZATION_MEMBER' | 'USER';
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canExecute: boolean;
}) {
  const id = randomUUID();
  const { error } = await adminSupabase()
    .from('ai_permissions')
    .insert({
      id,
      scope: input.scope || 'ORGANIZATION_MEMBER',
      organization_id: input.organizationId,
      user_id: input.userId || null,
      module: 'CREDENTIAL',
      can_create: input.canCreate,
      can_read: input.canRead,
      can_update: input.canUpdate,
      can_delete: input.canDelete,
      can_execute: input.canExecute,
    });
  if (error) {
    if ((error as any).code === '23514') {
      throw new Error(
        `ai_permissions is not ready for CREDENTIAL module. Apply sql/20260331_ai_permissions.sql first. Original error: ${error.message}`,
      );
    }
    throw error;
  }
  createdPermissionIds.add(id);
}

function makeContext(userId: string, effectiveRoot = false) {
  return {
    request: { headers: {} },
    supabase: adminSupabase(),
    body: {},
    userId,
    effectiveRoot,
  } as any;
}

async function callCredentialCatalog(context: GraphqlResolverContext) {
  return withEntityRequestContext(context, {}, () => resolver.credentialCatalog({}, context));
}

async function callCredentials(input: CredentialQueryInput, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { input }, () => resolver.credentials({ input }, context));
}

async function callCredentialById(id: string, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { id }, () => resolver.credential({ id }, context));
}

async function callCreateCredential(input: CreateCredentialInput, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { input }, () => resolver.createCredential({ input }, context));
}

async function callUpdateCredential(input: UpdateCredentialInput, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { input }, () => resolver.updateCredential({ input }, context));
}

async function callDeleteCredential(id: string, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { id }, () => resolver.deleteCredential({ id }, context));
}

async function callActivateCredential(id: string, context: GraphqlResolverContext) {
  return withEntityRequestContext(context, { id }, () => resolver.activateCredential({ id }, context));
}

before(async () => {
  await ensureEntityOrmInstalled();
  await ensureCredentialsTableReady();
});

after(async () => {
  if (createdCredentialIds.size > 0) {
    await adminSupabase().from('ai_credentials').delete().in('id', Array.from(createdCredentialIds));
  }
  if (createdPermissionIds.size > 0) {
    await adminSupabase().from('ai_permissions').delete().in('id', Array.from(createdPermissionIds));
  }
  if (createdMembershipIds.size > 0) {
    await adminSupabase().from('organization_members').delete().in('id', Array.from(createdMembershipIds));
  }
  if (createdOrganizationIds.size > 0) {
    await adminSupabase().from('organizations').delete().in('id', Array.from(createdOrganizationIds));
  }
});

test('live credential flow covers global, personal, org admin, and execute-only metadata access', async () => {
  const rootUserId = await getRootUserId();
  const [orgAdminUserId, executeOnlyUserId] = await getNonRootUsers(rootUserId);
  const organizationId = await createOrganization({ createdBy: rootUserId });

  await addMembership({ organizationId, userId: orgAdminUserId, role: 'SUPER_ADMIN' });
  await addMembership({ organizationId, userId: executeOnlyUserId, role: 'MEMBER' });
  await addPermission({
    organizationId,
    scope: 'ORGANIZATION',
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canExecute: true,
  });
  await addPermission({
    organizationId,
    userId: orgAdminUserId,
    canCreate: true,
    canRead: true,
    canUpdate: true,
    canDelete: true,
    canExecute: true,
  });
  await addPermission({
    organizationId,
    userId: executeOnlyUserId,
    canCreate: false,
    canRead: false,
    canUpdate: false,
    canDelete: false,
    canExecute: true,
  });

  const rootContext = makeContext(rootUserId, true);
  const nonRootContext = makeContext(orgAdminUserId, false);
  const executeOnlyContext = makeContext(executeOnlyUserId, false);

  const catalog = await callCredentialCatalog(rootContext);
  assert.equal(Array.isArray(catalog), true);
  assert.equal(
    (catalog as any[]).some((service) => service.serviceId === 'openai'),
    true,
  );

  const globalCredential = await callCreateCredential(
    {
      scope: 'GLOBAL',
      credentialName: 'Global OpenAI Credential',
      serviceId: 'openai',
      credJson: { api_key: 'global-secret', organization_id: 'org_global' },
    },
    rootContext,
  );
  createdCredentialIds.add(globalCredential.id);
  assert.equal(globalCredential.status, 'DRAFT');

  await assert.rejects(
    () =>
      callCreateCredential(
        {
          scope: 'GLOBAL',
          credentialName: 'Forbidden',
          serviceId: 'openai',
          credJson: { api_key: 'forbidden-secret' },
        },
        nonRootContext,
      ),
    /Insufficient permissions for global credentials/i,
  );

  const rawGlobalRow = await adminSupabase().from('ai_credentials').select('cred_json').eq('id', globalCredential.id).maybeSingle();
  assert.equal(typeof rawGlobalRow.data?.cred_json, 'string');
  assert.notEqual(rawGlobalRow.data?.cred_json, JSON.stringify({ api_key: 'global-secret', organization_id: 'org_global' }));

  const personalCredential = await callCreateCredential(
    {
      scope: 'PERSONAL',
      credentialName: 'Personal OpenAI Credential',
      serviceId: 'openai',
      credJson: { api_key: 'personal-secret' },
    },
    rootContext,
  );
  createdCredentialIds.add(personalCredential.id);

  const personalList = await callCredentials({ scope: 'PERSONAL' }, rootContext);
  assert.equal(
    personalList.rows.some((row: any) => row.id === personalCredential.id),
    true,
  );

  const orgCredential = await callCreateCredential(
    {
      scope: 'ORGANIZATION',
      organizationId,
      credentialName: 'Org OpenAI Credential',
      serviceId: 'openai',
      credJson: { api_key: 'org-secret' },
    },
    nonRootContext,
  );
  createdCredentialIds.add(orgCredential.id);

  const orgListAdmin = await callCredentials({ scope: 'ORGANIZATION', organizationId }, nonRootContext);
  assert.equal(
    orgListAdmin.rows.some((row: any) => row.id === orgCredential.id),
    true,
  );
  assert.equal(orgListAdmin.access.canReadSecrets, true);

  const orgListExecuteOnly = await callCredentials({ scope: 'ORGANIZATION', organizationId }, executeOnlyContext);
  assert.equal(
    orgListExecuteOnly.rows.some((row: any) => row.id === orgCredential.id),
    true,
  );
  assert.equal(orgListExecuteOnly.access.canReadSecrets, false);
  assert.equal(orgListExecuteOnly.access.canExecute, true);

  const executeOnlyCredential = await callCredentialById(orgCredential.id, executeOnlyContext);
  assert.equal(executeOnlyCredential?.credJson, null);

  const updatedOrgCredential = await callUpdateCredential(
    {
      id: orgCredential.id,
      credentialName: 'Org OpenAI Credential Updated',
      credJson: { api_key: 'org-secret-2', organization_id: 'org_456' },
    },
    nonRootContext,
  );
  assert.equal(updatedOrgCredential.credentialName, 'Org OpenAI Credential Updated');
  assert.equal((updatedOrgCredential.credJson as any)?.organization_id, 'org_456');

  const activeOrgCredential = await callActivateCredential(orgCredential.id, nonRootContext);
  assert.equal(activeOrgCredential.status, 'ACTIVE');

  const afterSuccess = await recordCredentialExecutionResult({ credentialId: orgCredential.id, success: true });
  assert.equal(afterSuccess?.status, 'ACTIVE');
  assert.equal(afterSuccess?.successCount, 1);
  assert.equal(typeof afterSuccess?.lastUsedAt, 'string');

  const afterFailure = await recordCredentialExecutionResult({ credentialId: orgCredential.id, success: false });
  assert.equal(afterFailure?.status, 'FAILED');
  assert.equal(afterFailure?.failureCount, 1);

  await callDeleteCredential(orgCredential.id, nonRootContext);
  createdCredentialIds.delete(orgCredential.id);
  const deleted = await adminSupabase().from('ai_credentials').select('id').eq('id', orgCredential.id).maybeSingle();
  assert.equal(deleted.data, null);
});
