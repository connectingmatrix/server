import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { UserPermissionsEntity } from '@connectingmatrix/orm/repositories/graph-entities';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { Channel } from '@connectingmatrix/orm/repositories/entities/tree/Channel';
import { fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { GRAPH_LABELS, USER_PERMISSIONS_TYPES } from '@giga/shared/types/contracts/graph.types';
import { saveOrganizationTreeNode } from '@giga/general/services/giga/runtime/organization-tree-node';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';

let testPrefix = '';
const createdOrganizationIds = new Set<string>();
const createdRestrictionIds = new Set<string>();
const createdGraphUserPermissionIds = new Set<string>();
const createdSubscriptionIds = new Set<string>();

function configureRealNeo() {
  process.env.NEO4J_URI = process.env.GIGA_GRAPH_TEST_URI || process.env.NEO4J_URI || 'bolt://localhost:7687/memgraph';
  process.env.NEO4J_USERNAME = process.env.GIGA_GRAPH_TEST_USERNAME || process.env.NEO4J_USERNAME || '';
  process.env.NEO4J_PASSWORD = process.env.GIGA_GRAPH_TEST_PASSWORD || process.env.NEO4J_PASSWORD || '';
}

async function getNeo() {
  configureRealNeo();
  return TreeGraphEntity.getNeo();
}

async function resetNeoConnection() {
  const { instance } = Neo4JConnection as any;
  const driver = instance?.driver?.driver;
  if (driver && typeof driver.close === 'function') {
    await driver.close();
  }
  (Neo4JConnection as any).instance = null;
}

async function cleanupNeoByPrefix(prefix: string) {
  const neo = await getNeo();
  await neo.run(
    `
      MATCH (n)
      WHERE (
        n:${GRAPH_LABELS.channel}
        OR n:${GRAPH_LABELS.category}
        OR n:${GRAPH_LABELS.subjectRef}
        OR n:${GRAPH_LABELS.userPermissions}
      )
      AND (n.id STARTS WITH $prefix OR n.id IN $extraIds)
      DETACH DELETE n
    `,
    { prefix, extraIds: Array.from(createdGraphUserPermissionIds) },
  );
}

async function seedUserPermissions(id: string) {
  const nowIso = new Date().toISOString();
  await new UserPermissionsEntity({
    id,
    kind: USER_PERMISSIONS_TYPES.user,
    isRoot: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  }).commit();
  createdGraphUserPermissionIds.add(id);
}

async function cleanupSupabaseRows() {
  const admin = SupabaseClientAdmin();

  if (createdRestrictionIds.size) {
    const { error } = await admin.from('organization_content_restrictions').delete().in('id', Array.from(createdRestrictionIds));
    if (error) throw error;
    createdRestrictionIds.clear();
  }

  if (createdOrganizationIds.size) {
    const organizationIds = Array.from(createdOrganizationIds);

    const memberDelete = await admin.from('organization_members').delete().in('organization_id', organizationIds);
    if (memberDelete.error) throw memberDelete.error;

    const organizationDelete = await admin.from('organizations').delete().in('id', organizationIds);
    if (organizationDelete.error) throw organizationDelete.error;

    createdOrganizationIds.clear();
  }

  if (createdSubscriptionIds.size) {
    const { error } = await admin.from('Subscription').delete().in('subscriptionId', Array.from(createdSubscriptionIds));
    if (error) throw error;
    createdSubscriptionIds.clear();
  }
}

async function readActiveRootUserId(): Promise<string> {
  const admin = SupabaseClientAdmin();
  const result = await admin.from('app_root_users').select('user_id').eq('is_active', true).limit(1).maybeSingle();
  if (result.error || !result.data?.user_id) throw new Error(`Could not resolve an active root user. ${result.error?.message || ''}`.trim());
  return String(result.data.user_id);
}

async function createOrganizationRecord(params: { organizationId: string; memberUserId: string; slug: string; name: string }) {
  const now = new Date().toISOString();
  const admin = SupabaseClientAdmin();
  const insert = await admin.from('organizations').insert({
    id: params.organizationId,
    slug: params.slug,
    name: params.name,
    description: null,
    is_active: true,
    created_by: null,
    metadata: {},
    created_at: now,
    updated_at: now,
  });
  if (insert.error) throw insert.error;
  createdOrganizationIds.add(params.organizationId);

  const membership = await admin.from('organization_members').insert({
    organization_id: params.organizationId,
    user_id: params.memberUserId,
    role: 'MEMBER',
    is_disabled: false,
    metadata: {},
    created_at: now,
    updated_at: now,
  });
  if (membership.error) throw membership.error;
}

async function createOrganizationSubscription(params: { organizationId: string; userId: string }) {
  const now = new Date().toISOString();
  const subscriptionId = `sub-${randomUUID()}`;
  const admin = SupabaseClientAdmin();
  const insert = await admin.from('Subscription').insert({
    orderId: subscriptionId,
    paymentSource: `STRIPE:organization:${params.organizationId}:business-lite:paid`,
    plansId: null,
    subscribedBy: params.userId,
    subscriptionId,
    status: 'active',
    startDate: now,
    nextBillingDate: now,
    expiresAt: now,
    autoRenew: true,
    cancelledAt: null,
    updatedAt: now,
  });
  if (insert.error) throw insert.error;
  createdSubscriptionIds.add(subscriptionId);
}

beforeEach(async () => {
  testPrefix = `qa-tree-${randomUUID()}`;
  await resetNeoConnection();
  await cleanupNeoByPrefix(testPrefix);
  await cleanupSupabaseRows();
  createdGraphUserPermissionIds.clear();
});

afterEach(async () => {
  await cleanupSupabaseRows();
  await cleanupNeoByPrefix(testPrefix);
  createdGraphUserPermissionIds.clear();
  await resetNeoConnection();
});

test('real fetchUserTree returns organization roots in the organization field and leaves the personal tree untouched', async () => {
  const userId = await readActiveRootUserId();
  const channelA = `${testPrefix}-personal-channel-a`;
  const channelB = `${testPrefix}-personal-channel-b`;
  const orgChannelA = `${testPrefix}-org-channel-a`;
  const orgChannelB = `${testPrefix}-org-channel-b`;
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const admin = SupabaseClientAdmin();

  await seedUserPermissions(userId);
  await Channel.create({
    scopeId: userId,
    userPermissionsId: userId,
    isSupabaseRoot: true,
    channel: {
      id: channelA,
      name: 'Alpha Channel',
      slug: `${testPrefix}-alpha`,
    },
  });
  await Channel.create({
    scopeId: userId,
    userPermissionsId: userId,
    isSupabaseRoot: true,
    channel: {
      id: channelB,
      name: 'Beta Channel',
      slug: `${testPrefix}-beta`,
    },
  });

  await createOrganizationRecord({
    organizationId: organizationA,
    memberUserId: userId,
    slug: `${testPrefix}-org-a`,
    name: 'Org A',
  });
  await createOrganizationRecord({
    organizationId: organizationB,
    memberUserId: userId,
    slug: `${testPrefix}-org-b`,
    name: 'Org B',
  });
  await createOrganizationSubscription({ organizationId: organizationA, userId });
  await createOrganizationSubscription({ organizationId: organizationB, userId });
  await saveOrganizationTreeNode({
    id: organizationA,
    slug: `${testPrefix}-org-a`,
    name: 'Org A',
  });
  await saveOrganizationTreeNode({
    id: organizationB,
    slug: `${testPrefix}-org-b`,
    name: 'Org B',
  });
  await Channel.create({
    scopeId: organizationA,
    userPermissionsId: userId,
    organizationId: organizationA,
    channel: {
      id: orgChannelA,
      name: 'Org Alpha Channel',
      slug: `${testPrefix}-org-alpha`,
    },
  });
  await Channel.create({
    scopeId: organizationB,
    userPermissionsId: userId,
    organizationId: organizationB,
    channel: {
      id: orgChannelB,
      name: 'Org Beta Channel',
      slug: `${testPrefix}-org-beta`,
    },
  });

  const personalTree = await fetchUserTree(admin as any, {
    userPermissionsId: userId,
    includeGlobal: false,
  });
  const orgATree = await fetchUserTree(admin as any, {
    userPermissionsId: userId,
    includeGlobal: false,
    organizationId: organizationA,
  });
  const orgBTree = await fetchUserTree(admin as any, {
    userPermissionsId: userId,
    includeGlobal: false,
    organizationId: organizationB,
  });

  const personalIds = new Set(personalTree.user.map((node) => node.id));
  const orgAIds = new Set(orgATree.organization.map((node) => node.id));
  const orgBIds = new Set(orgBTree.organization.map((node) => node.id));

  assert.deepEqual(Array.from(personalIds).sort(), [channelA, channelB].sort());
  assert.deepEqual(Array.from(orgAIds), [orgChannelA]);
  assert.deepEqual(Array.from(orgBIds), [orgChannelB]);
});
