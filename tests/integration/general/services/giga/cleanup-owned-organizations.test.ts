import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseStub } from '@giga/shared/test/supabase-stub';
import { cleanupOwnedOrganizations } from '@giga/general/services/organization/cleanup-owned-organizations';

function createCleanupSupabase() {
  return createSupabaseStub({
    User: [{ id: 'user-1', email: 'rich@gigaintelligence.com' }],
    organizations: [
      { id: 'keep-org', name: 'Keep Org', created_by: 'user-1', billing_status: 'UNPAID', metadata: {} },
      { id: 'delete-org', name: 'Delete Org', created_by: 'user-1', billing_status: 'UNPAID', metadata: {} },
    ],
    organization_members: [
      { id: 'm-1', organization_id: 'keep-org', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
      { id: 'm-2', organization_id: 'delete-org', user_id: 'user-1', role: 'SUPER_ADMIN', is_disabled: false },
    ],
    ai_permissions: [],
    organization_node_restrictions: [],
    organization_content_restrictions: [],
    ai_workflows: [],
  });
}

test('cleanupOwnedOrganizations dry run reports the orgs that would be deleted', async () => {
  const supabase = createCleanupSupabase();
  const result = await cleanupOwnedOrganizations(supabase as any, {
    email: 'rich@gigaintelligence.com',
    keepOrganizationId: 'keep-org',
  });
  assert.deepEqual(result.deleteOrganizationIds, ['delete-org']);
  assert.deepEqual(result.deletedOrganizationIds, []);
});

test('cleanupOwnedOrganizations apply deletes safe extra orgs and keeps the requested org', async () => {
  const supabase = createCleanupSupabase();
  const deletedTreeIds: string[] = [];
  const result = await cleanupOwnedOrganizations(supabase as any, {
    apply: true,
    deleteTree: async (_client, input) => {
      deletedTreeIds.push(input.organizationId);
    },
    email: 'rich@gigaintelligence.com',
    keepOrganizationId: 'keep-org',
  });
  assert.deepEqual(result.deletedOrganizationIds, ['delete-org']);
  assert.deepEqual(deletedTreeIds, ['delete-org']);
  assert.deepEqual(
    (supabase as any).tables.organizations.map((row: any) => row.id),
    ['keep-org'],
  );
});

test('cleanupOwnedOrganizations aborts when an extra org has billing state', async () => {
  const supabase = createCleanupSupabase();
  (supabase as any).tables.organizations[1].metadata = { billing: { stripeCustomerId: 'cus_123' } };
  await assert.rejects(
    () =>
      cleanupOwnedOrganizations(supabase as any, {
        apply: true,
        email: 'rich@gigaintelligence.com',
        keepOrganizationId: 'keep-org',
      }),
    /has billing state/i,
  );
});
