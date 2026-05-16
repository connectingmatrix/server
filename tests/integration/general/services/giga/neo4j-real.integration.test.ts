import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { UserPermissionsEntity } from '@connectingmatrix/orm/repositories/graph-entities';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { createCategory } from '@connectingmatrix/orm/repositories/entities/tree/Category';
import { Channel } from '@connectingmatrix/orm/repositories/entities/tree/Channel';
import { GRAPH_LABELS, GRAPH_SYSTEM_IDS, MOVE_CHANNEL_MODES, SLUG_SCOPES, USER_PERMISSIONS_TYPES } from '@giga/shared/types/contracts/graph.types';
import { checkSlugAvailability } from '@giga/general/services/giga/runtime/check-slug-availability';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';

let testPrefix = '';

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

function asNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toNumber === 'function') {
    return (value as any).toNumber();
  }
  if (value && typeof (value as any).low === 'number') {
    return (value as any).low;
  }
  return Number(value || 0);
}

async function cleanupByPrefix(prefix: string) {
  const neo = await getNeo();
  await neo.run(
    `
      MATCH (n)
      WHERE (
        n:${GRAPH_LABELS.channel}
        OR n:${GRAPH_LABELS.category}
        OR n:${GRAPH_LABELS.subjectRef}
        OR n:${GRAPH_LABELS.userPermissions}
        OR n:${GRAPH_LABELS.permissionProfile}
      )
      AND n.id STARTS WITH $prefix
      DETACH DELETE n
    `,
    { prefix },
  );
}

async function countByPrefix(prefix: string): Promise<number> {
  const neo = await getNeo();
  const rows = await neo.run<{ count: number }>(
    `
      MATCH (n)
      WHERE (
        n:${GRAPH_LABELS.channel}
        OR n:${GRAPH_LABELS.category}
        OR n:${GRAPH_LABELS.subjectRef}
        OR n:${GRAPH_LABELS.userPermissions}
        OR n:${GRAPH_LABELS.permissionProfile}
      )
      AND n.id STARTS WITH $prefix
      RETURN count(n) AS count
    `,
    { prefix },
  );
  return asNumber(rows[0]?.count);
}

async function seedUserPermissions(id: string, isRoot: boolean) {
  const nowIso = new Date().toISOString();
  await new UserPermissionsEntity({
    id,
    kind: USER_PERMISSIONS_TYPES.user,
    isRoot,
    createdAt: nowIso,
    updatedAt: nowIso,
  }).commit();
}

beforeEach(async () => {
  testPrefix = `qa-${randomUUID()}`;
  await resetNeoConnection();
  await cleanupByPrefix(testPrefix);
});

afterEach(async () => {
  await cleanupByPrefix(testPrefix);
  const leftovers = asNumber(await countByPrefix(testPrefix));
  assert.equal(leftovers, 0, `Expected no leftover neo4j test nodes for ${testPrefix}, found ${leftovers}`);
  await resetNeoConnection();
});

test('createCategory attaches under the owned channel path without creating a category root grant', async () => {
  const userId = `${testPrefix}-user-a`;
  await seedUserPermissions(userId, true);

  const channelId = `${testPrefix}-ch-parent`;
  const categoryId = `${testPrefix}-cat-1`;
  await Channel.create({
    scopeId: userId,
    userPermissionsId: userId,
    isSupabaseRoot: true,
    channel: {
      id: channelId,
      name: 'Parent Channel',
      slug: `${testPrefix}-parent-channel`,
    },
  });

  await createCategory({
    userPermissionsId: userId,
    isSupabaseRoot: false,
    parentChannelId: channelId,
    category: {
      id: categoryId,
      name: 'Category',
      slug: `${testPrefix}-category`,
    },
  });

  const neo = await getNeo();
  const containsRows = await neo.run<{ count: number }>(
    `
      MATCH (:${GRAPH_LABELS.channel} {id: $channelId})-[rel:CONTAINS_CATEGORY]->(:${GRAPH_LABELS.category} {id: $categoryId})
      RETURN count(rel) AS count
    `,
    { channelId, categoryId },
  );
  assert.equal(asNumber(containsRows[0]?.count), 1);

  const inheritedRows = await neo.run<{ count: number }>(
    `
      MATCH (:${GRAPH_LABELS.userPermissions} {id: $userId})-[:OWNS]->(root)-[:CONTAINS_CATEGORY*1..]->(:${GRAPH_LABELS.category} {id: $categoryId})
      RETURN count(root) AS count
    `,
    { userId, categoryId },
  );
  assert.equal(asNumber(inheritedRows[0]?.count), 1);

  const directRows = await neo.run<{ count: number }>(
    `
      MATCH (:${GRAPH_LABELS.userPermissions} {id: $userId})-[rel:OWNS]->(:${GRAPH_LABELS.category} {id: $categoryId})
      RETURN count(rel) AS count
    `,
    { userId, categoryId },
  );
  assert.equal(asNumber(directRows[0]?.count), 0);
});

test('repeated create operations do not duplicate UserPermissions nodes', async () => {
  const userId = `${testPrefix}-user-repeat`;
  await seedUserPermissions(userId, true);

  const firstChannelId = `${testPrefix}-ch-first`;
  const secondChannelId = `${testPrefix}-ch-second`;
  await Channel.create({
    scopeId: userId,
    userPermissionsId: userId,
    isSupabaseRoot: true,
    channel: {
      id: firstChannelId,
      name: 'First Channel',
      slug: `${testPrefix}-first`,
    },
  });
  await Channel.create({
    scopeId: userId,
    userPermissionsId: userId,
    isSupabaseRoot: false,
    parentChannelId: firstChannelId,
    channel: {
      id: secondChannelId,
      name: 'Second Channel',
      slug: `${testPrefix}-second`,
    },
  });

  const neo = await getNeo();
  const rows = await neo.run<{ count: number }>(
    `
      MATCH (u:${GRAPH_LABELS.userPermissions} {id: $userId})
      RETURN count(u) AS count
    `,
    { userId },
  );
  assert.equal(asNumber(rows[0]?.count), 1);
});

test('root-level global create requires both Supabase root claim and graph isRoot=true, while personal root create is allowed', async () => {
  const userWithGraphRoot = `${testPrefix}-user-root`;
  const userWithoutGraphRoot = `${testPrefix}-user-not-root`;
  await seedUserPermissions(userWithGraphRoot, true);
  await seedUserPermissions(userWithoutGraphRoot, false);

  await assert.rejects(
    () =>
      Channel.create({
        scopeId: GRAPH_SYSTEM_IDS.userGlobal,
        userPermissionsId: userWithGraphRoot,
        isSupabaseRoot: false,
        channel: {
          id: `${testPrefix}-ch-denied-1`,
          name: 'Denied A',
          slug: `${testPrefix}-denied-a`,
          isGlobal: true,
        },
      }),
    /Only root users/i,
  );

  await assert.rejects(
    () =>
      Channel.create({
        scopeId: GRAPH_SYSTEM_IDS.userGlobal,
        userPermissionsId: userWithoutGraphRoot,
        isSupabaseRoot: true,
        channel: {
          id: `${testPrefix}-ch-denied-2`,
          name: 'Denied B',
          slug: `${testPrefix}-denied-b`,
          isGlobal: true,
        },
      }),
    /must have isRoot=true/i,
  );

  const personalRootCreated = await Channel.create({
    scopeId: userWithoutGraphRoot,
    userPermissionsId: userWithoutGraphRoot,
    isSupabaseRoot: false,
    channel: {
      id: `${testPrefix}-ch-personal-ok`,
      name: 'Personal Root Allowed',
      slug: `${testPrefix}-personal-allowed`,
    },
  });
  assert.equal(personalRootCreated.id, `${testPrefix}-ch-personal-ok`);

  const created = await Channel.create({
    scopeId: GRAPH_SYSTEM_IDS.userGlobal,
    userPermissionsId: userWithGraphRoot,
    isSupabaseRoot: true,
    channel: {
      id: `${testPrefix}-ch-ok`,
      name: 'Allowed',
      slug: `${testPrefix}-allowed`,
      isGlobal: true,
    },
  });
  assert.equal(created.id, `${testPrefix}-ch-ok`);
});

test('cross-scope move requires LINK mode and creates UserPermissions->LINKS for non-owned channels', async () => {
  const userA = `${testPrefix}-user-a`;
  const userB = `${testPrefix}-user-b`;
  await seedUserPermissions(userA, true);
  await seedUserPermissions(userB, true);

  const userARoot = `${testPrefix}-user-a-root`;
  const userAChild = `${testPrefix}-user-a-child`;
  const userBRoot = `${testPrefix}-user-b-root`;
  const globalChannel = `${testPrefix}-global-root`;

  await Channel.create({
    scopeId: userA,
    userPermissionsId: userA,
    isSupabaseRoot: true,
    channel: {
      id: userARoot,
      name: 'User A Root',
      slug: `${testPrefix}-u-a-root`,
    },
  });
  await Channel.create({
    scopeId: userA,
    userPermissionsId: userA,
    isSupabaseRoot: false,
    parentChannelId: userARoot,
    channel: {
      id: userAChild,
      name: 'User A Child',
      slug: `${testPrefix}-u-a-child`,
    },
  });
  await Channel.create({
    scopeId: userB,
    userPermissionsId: userB,
    isSupabaseRoot: true,
    channel: {
      id: userBRoot,
      name: 'User B Root',
      slug: `${testPrefix}-u-b-root`,
    },
  });
  await Channel.create({
    scopeId: GRAPH_SYSTEM_IDS.userGlobal,
    userPermissionsId: userA,
    isSupabaseRoot: true,
    channel: {
      id: globalChannel,
      name: 'Global Root',
      slug: `${testPrefix}-global-root`,
      isGlobal: true,
    },
  });

  await assert.rejects(
    () =>
      Channel.moveChannel({
        userPermissionsId: userB,
        channelId: userAChild,
        newParentChannelId: userBRoot,
      }),
    /mode=LINK/i,
  );

  await Channel.moveChannel({
    userPermissionsId: userB,
    channelId: userAChild,
    newParentChannelId: userBRoot,
    mode: MOVE_CHANNEL_MODES.link,
  });

  await Channel.linkChannel({
    userPermissionsId: userB,
    parentChannelId: userBRoot,
    channelId: globalChannel,
  });

  const neo = await getNeo();
  const linkedPersonRows = await neo.run<{ count: number }>(
    `
      MATCH (:${GRAPH_LABELS.userPermissions} {id: $userB})-[rel:LINKS]->(:${GRAPH_LABELS.channel} {id: $userAChild})
      RETURN count(rel) AS count
    `,
    { userB, userAChild },
  );
  assert.equal(asNumber(linkedPersonRows[0]?.count), 1);

  const linkedGlobalRows = await neo.run<{ count: number }>(
    `
      MATCH (:${GRAPH_LABELS.userPermissions} {id: $userB})-[rel:LINKS]->(:${GRAPH_LABELS.channel} {id: $globalChannel})
      RETURN count(rel) AS count
    `,
    { userB, globalChannel },
  );
  assert.equal(asNumber(linkedGlobalRows[0]?.count), 1);
});

test('slug uniqueness is enforced per user scope and global scope', async () => {
  const userA = `${testPrefix}-user-slug-a`;
  const userB = `${testPrefix}-user-slug-b`;
  await seedUserPermissions(userA, true);
  await seedUserPermissions(userB, true);

  const userASlug = `${testPrefix}-shared`;
  await Channel.create({
    scopeId: userA,
    userPermissionsId: userA,
    isSupabaseRoot: true,
    channel: {
      id: `${testPrefix}-slug-channel-a`,
      name: 'Slug Channel A',
      slug: userASlug,
    },
  });

  const userAScope = await checkSlugAvailability({
    slug: userASlug,
    scope: SLUG_SCOPES.user,
    createdBy: userA,
  });
  assert.equal(userAScope.exists, true);
  assert.equal(userAScope.conflict?.resourceType, 'CHANNEL');

  const userBScope = await checkSlugAvailability({
    slug: userASlug,
    scope: SLUG_SCOPES.user,
    createdBy: userB,
  });
  assert.equal(userBScope.exists, false);

  const globalSlug = `${testPrefix}-global-shared`;
  await Channel.create({
    scopeId: GRAPH_SYSTEM_IDS.userGlobal,
    userPermissionsId: userA,
    isSupabaseRoot: true,
    channel: {
      id: `${testPrefix}-slug-channel-global`,
      name: 'Global Slug',
      slug: globalSlug,
      isGlobal: true,
    },
  });

  const globalScope = await checkSlugAvailability({
    slug: globalSlug,
    scope: SLUG_SCOPES.global,
  });
  assert.equal(globalScope.exists, true);

  await assert.rejects(
    () =>
      createCategory({
        userPermissionsId: userA,
        isSupabaseRoot: true,
        parentChannelId: `${testPrefix}-slug-channel-a`,
        category: {
          id: `${testPrefix}-cat-collision`,
          name: 'Collision Category',
          slug: userASlug,
        },
      }),
    /already exists/i,
  );
});
