import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { waitForCondition } from '@connectingmatrix/workflow-driver/services/workflow/queue/__tests__/workflow-webhook-live.runtime.fixture';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { createUserSessionHeader, graphqlRequest, startLiveApi, stopLiveApi } from './activity-log-live.runtime.fixture';

const adminSupabase = () => SupabaseClientAdmin();
const port = 3011;
const url = `http://localhost:${port}/api/v2/graphql`;
let server: ChildProcess | null = null;
let rootUserId = '';
let sessionHeader = '';

const CREATE = 'mutation CreateOrganization($input: OrganizationInput!) { createOrganization(input: $input) { id slug name } }';
const UPDATE = 'mutation UpdateOrganization($input: OrganizationInput!) { updateOrganization(input: $input) { id slug name } }';
const DELETE = 'mutation DeleteOrganization($id: UUID!) { deleteOrganization(id: $id) { message } }';
const ORGANIZATIONS = 'query Organizations($input: OrganizationsInput) { organizations(input: $input) { id slug name isActive } }';
const LOGS =
  'query UserActivityLogsCollection($first: Int, $filter: user_activity_logsFilter, $orderBy: [user_activity_logsOrderBy!]) { user_activity_logsCollection(first: $first, filter: $filter, orderBy: $orderBy) { edges { node { event actor subject organization_id user_id metadata } } } }';

async function readRootUserId() {
  const { data, error } = await adminSupabase().from('app_root_users').select('user_id').eq('is_active', true).limit(1).maybeSingle();
  if (error || !data?.user_id) throw new Error(`Could not resolve root user. ${error?.message || ''}`.trim());
  return String(data.user_id);
}

async function readLogs(organizationId: string) {
  const data = await graphqlRequest<{ user_activity_logsCollection: { edges: Array<{ node: any }> } }>(url, sessionHeader, LOGS, {
    first: 20,
    filter: {
      user_id: { eq: rootUserId },
    },
    orderBy: [{ created_at: 'DescNullsLast' }],
  });
  return data.user_activity_logsCollection.edges
    .map((edge) => edge.node)
    .filter((row) => row.subject === `organization:${organizationId}` || row.metadata?.organizationId === organizationId);
}

before(async () => {
  rootUserId = await readRootUserId();
  sessionHeader = await createUserSessionHeader(rootUserId);
  server = await startLiveApi(port);
});

after(async () => {
  await stopLiveApi(server);
});

test('live graphql api writes organization create update delete activity logs and exposes them through user_activity_logsCollection', async () => {
  const slug = `activity-live-${randomUUID().slice(0, 8)}`;
  const created = await graphqlRequest<{ createOrganization: { id: string } }>(url, sessionHeader, CREATE, {
    input: { slug, name: `Activity ${slug}`, description: 'Live activity log test', isActive: true },
  });
  const organizationId = created.createOrganization.id;

  try {
    const updated = await graphqlRequest<{ updateOrganization: { id: string; name: string } }>(url, sessionHeader, UPDATE, {
      input: { id: organizationId, slug, name: `Activity ${slug} Updated`, description: 'Live activity log test updated', isActive: true },
    });
    assert.equal(updated.updateOrganization.id, organizationId);

    const deleted = await graphqlRequest<{ deleteOrganization: { message: string } }>(url, sessionHeader, DELETE, { id: organizationId });
    assert.match(deleted.deleteOrganization.message, /deleted successfully|No organization found/i);

    const organizations = await graphqlRequest<{ organizations: Array<{ id: string; isActive: boolean }> }>(url, sessionHeader, ORGANIZATIONS, {
      input: { id: organizationId },
    });
    assert.equal(organizations.organizations.length, 1);
    assert.equal(organizations.organizations[0]?.id, organizationId);
    assert.equal(organizations.organizations[0]?.isActive, false);

    const organizationRow = await adminSupabase().from('organizations').select('id,is_active').eq('id', organizationId).maybeSingle();
    assert.equal(organizationRow.error, null);
    assert.equal(organizationRow.data?.id, organizationId);
    assert.equal(organizationRow.data?.is_active, false);

    await waitForCondition(
      async () => {
        const logs = await readLogs(organizationId);
        return (
          logs.some((row) => row.event === 'CREATE' && row.actor === 'createOrganization') &&
          logs.some((row) => row.event === 'UPDATE' && row.actor === 'updateOrganization') &&
          logs.some((row) => row.event === 'DELETE' && row.actor === 'deleteOrganization')
        );
      },
      30_000,
      500,
    );

    const logs = await readLogs(organizationId);
    assert.equal(
      logs.some((row) => row.subject === `organization:${organizationId}`),
      true,
    );
    assert.equal(
      logs.every((row) => row.user_id === rootUserId),
      true,
    );
  } finally {
    await adminSupabase().from('user_activity_logs').delete().eq('actor_user_id', rootUserId).eq('subject', `organization:${organizationId}`);
    await adminSupabase().from('organizations').delete().eq('id', organizationId);
  }
});
