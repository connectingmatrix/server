import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { GRAPH_LABELS } from '@giga/shared/types/contracts/graph.types';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import { saveOrganizationTreeNode } from '@giga/general/services/giga/runtime/organization-tree-node';
import { graphqlRequest, startLiveApi, stopLiveApi } from './activity-log-live.runtime.fixture';

const admin = () => SupabaseClientAdmin();
const port = 3012;
const url = `http://localhost:${port}/api/v2/graphql`;
const loginQuery = 'mutation Login($input: AuthLoginInput!) { authLogin(input: $input) { token { access_token } profile { id email } } }';
const createQuery =
  'mutation CreateChannel($input: AI_CreateChannelInput!) { gigaCreateChannel(input: $input) { channel { id createdBy organizationId slug } ownerUserPermissions { id } } }';
let server: ChildProcess | null = null;
let richUserId = '';
let richOrganizationId = '';
let richAccessToken = '';
const createdChannelIds = new Set<string>();

function configureRealNeo() {
  process.env.NEO4J_URI = process.env.GIGA_GRAPH_TEST_URI || process.env.NEO4J_URI || 'bolt://localhost:7687/memgraph';
  process.env.NEO4J_USERNAME = process.env.GIGA_GRAPH_TEST_USERNAME || process.env.NEO4J_USERNAME || '';
  process.env.NEO4J_PASSWORD = process.env.GIGA_GRAPH_TEST_PASSWORD || process.env.NEO4J_PASSWORD || '';
}

async function resetNeoConnection() {
  const current = (Neo4JConnection as any).instance;
  const driver = current && current.driver && current.driver.driver;
  if (driver && typeof driver.close === 'function') await driver.close();
  (Neo4JConnection as any).instance = null;
}

function asNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toNumber === 'function') return (value as any).toNumber();
  if (value && typeof (value as any).low === 'number') return (value as any).low;
  return Number(value || 0);
}

async function readCount(statement: string, params: Record<string, unknown>) {
  configureRealNeo();
  const rows = await (await TreeGraphEntity.getNeo()).run<{ count: number }>(statement, params);
  return asNumber(rows[0] ? rows[0].count : 0);
}

async function loginAsRich() {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: loginQuery, variables: { input: { email: 'rich@gigaintelligence.com', password: 'dashed' } } }),
  });
  const payload = await response.json();
  if (!response.ok || (payload.errors && payload.errors.length)) throw new Error(JSON.stringify(payload));
  richAccessToken = String(payload.data.authLogin.token.access_token || '');
  richUserId = String(payload.data.authLogin.profile.id || '');
  assert.equal(richUserId.length > 0, true);
  assert.equal(richAccessToken.length > 0, true);
}

before(async () => {
  const user = await admin().from('User').select('id').eq('email', 'rich@gigaintelligence.com').maybeSingle();
  if (user.error || !user.data || !user.data.id) throw new Error(`Could not resolve rich user. ${user.error ? user.error.message : ''}`.trim());
  const memberships = await admin().from('organization_members').select('organization_id,role').eq('user_id', user.data.id).eq('is_disabled', false);
  if (memberships.error) throw memberships.error;
  for (const row of memberships.data || []) {
    if (row.role !== 'SUPER_ADMIN') continue;
    const organization = await admin()
      .from('organizations')
      .select('id,slug,name,description,created_by,is_active,created_at,updated_at')
      .eq('id', row.organization_id)
      .maybeSingle();
    if (organization.error || !organization.data || organization.data.is_active === false) continue;
    richOrganizationId = String(organization.data.id || '');
    await saveOrganizationTreeNode({
      id: richOrganizationId,
      slug: String(organization.data.slug || ''),
      name: String(organization.data.name || ''),
      description: organization.data.description || null,
      createdBy: organization.data.created_by || null,
      isActive: organization.data.is_active !== false,
      createdAt: organization.data.created_at || null,
      updatedAt: organization.data.updated_at || null,
    });
    break;
  }
  if (!richOrganizationId) throw new Error('Could not resolve an active Rich super admin organization.');
  server = await startLiveApi(port);
  await loginAsRich();
});

after(async () => {
  if (createdChannelIds.size) {
    configureRealNeo();
    await (
      await TreeGraphEntity.getNeo()
    ).run(`MATCH (n:${GRAPH_LABELS.channel}) WHERE n.id IN $ids DETACH DELETE n`, {
      ids: Array.from(createdChannelIds),
    });
  }
  await resetNeoConnection();
  await stopLiveApi(server);
});

test('live dashed Rich channel creation keeps org OWNS only on root org channels and keeps personal ownership on personal channels', async () => {
  const orgChannelId = randomUUID();
  const orgSlug = `rich-org-${orgChannelId.slice(0, 8)}`;
  const personalChannelId = randomUUID();
  const personalSlug = `rich-user-${personalChannelId.slice(0, 8)}`;
  const orgCreated = await graphqlRequest<{
    gigaCreateChannel: { channel: { id: string; createdBy: string; organizationId: string | null }; ownerUserPermissions: null };
  }>(url, richAccessToken, createQuery, {
    input: { organizationId: richOrganizationId, channel: { id: orgChannelId, name: 'Rich Org Root', slug: orgSlug } },
  });
  createdChannelIds.add(orgChannelId);
  assert.equal(orgCreated.gigaCreateChannel.channel.id, orgChannelId);
  assert.equal(orgCreated.gigaCreateChannel.channel.createdBy, richUserId);
  assert.equal(orgCreated.gigaCreateChannel.channel.organizationId, richOrganizationId);
  assert.equal(orgCreated.gigaCreateChannel.ownerUserPermissions, null);

  const personalCreated = await graphqlRequest<{
    gigaCreateChannel: { channel: { id: string; createdBy: string; organizationId: string | null }; ownerUserPermissions: { id: string } };
  }>(url, richAccessToken, createQuery, { input: { channel: { id: personalChannelId, name: 'Rich Personal Root', slug: personalSlug } } });
  createdChannelIds.add(personalChannelId);
  assert.equal(personalCreated.gigaCreateChannel.channel.id, personalChannelId);
  assert.equal(personalCreated.gigaCreateChannel.channel.createdBy, richUserId);
  assert.equal(personalCreated.gigaCreateChannel.channel.organizationId, null);
  assert.equal(personalCreated.gigaCreateChannel.ownerUserPermissions.id, richUserId);

  assert.equal(
    await readCount(`MATCH (:Organisation {id: $orgId})-[rel:OWNS]-(:Channel {id: $channelId, createdBy: $userId}) RETURN count(rel) AS count`, {
      orgId: richOrganizationId,
      channelId: orgChannelId,
      userId: richUserId,
    }),
    1,
  );
  assert.equal(
    await readCount(`MATCH (:UserPermissions {id: $userId})-[rel:OWNS]-(:Channel {id: $channelId}) RETURN count(rel) AS count`, {
      userId: richUserId,
      channelId: orgChannelId,
    }),
    0,
  );
  assert.equal(
    await readCount(`MATCH (:Organisation {id: $orgId})-[rel:OWNS]-(:Channel {id: $channelId, createdBy: $userId}) RETURN count(rel) AS count`, {
      orgId: richOrganizationId,
      channelId: personalChannelId,
      userId: richUserId,
    }),
    0,
  );
  assert.equal(
    await readCount(`MATCH (:UserPermissions {id: $userId})-[rel:OWNS]-(:Channel {id: $channelId, createdBy: $userId}) RETURN count(rel) AS count`, {
      userId: richUserId,
      channelId: personalChannelId,
    }),
    1,
  );
});
