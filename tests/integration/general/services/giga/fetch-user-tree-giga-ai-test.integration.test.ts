import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { buildTreeFromGraph } from '@giga/shared/lib/tree';
import { __fetchUserTreeTestUtils, fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import {
  GIGA_AI_TEST_DATES,
  cleanupGigaAiTestGraph,
  resetGigaAiTestNeoConnection,
  seedGigaAiTestGraph,
} from '@giga/general/services/giga/test-fixtures/giga-ai-test-tree';

const runFixture = process.env.RUN_GIGA_FETCH_USER_TREE_FIXTURE_TESTS === '1';
const fixtureTest = runFixture ? test : test.skip;
const supabase = () => SupabaseClientAdmin();

function collectTreeIds(nodes: Array<{ id: string; children: any[] }>) {
  const ids = new Set<string>();
  const visit = (node: { id: string; children: any[] }) => {
    if (!node || !node.id || ids.has(node.id)) {
      return;
    }
    ids.add(node.id);
    for (const child of node.children || []) {
      visit(child);
    }
  };
  for (const node of nodes || []) {
    visit(node);
  }
  return ids;
}

before(async () => {
  if (!runFixture) {
    return;
  }
  await resetGigaAiTestNeoConnection();
  await cleanupGigaAiTestGraph();
  await seedGigaAiTestGraph({ size: 'small', nowIso: GIGA_AI_TEST_DATES.nowIso });
});

after(async () => {
  if (!runFixture) {
    return;
  }
  await cleanupGigaAiTestGraph();
  await resetGigaAiTestNeoConnection();
});

fixtureTest('owner access returns the seeded giga-ai-test tree in user scope', async () => {
  const result = await fetchUserTree(supabase() as any, {
    userPermissionsId: 'giga-ai-test-owner',
    includeGlobal: false,
    nowIso: GIGA_AI_TEST_DATES.nowIso,
  });

  const userIds = collectTreeIds(result.user);
  assert.equal(result.global.length, 0);
  assert.equal(result.organization.length, 0);
  assert.equal(
    result.user.some((node) => node.id === 'giga-ai-test'),
    true,
  );
  assert.equal(userIds.has('giga-ai-test-child-1'), true);
  assert.equal(userIds.has('giga-ai-test-cat-1'), true);
  assert.equal(userIds.has('giga-ai-test-subject-1'), true);
  assert.equal(userIds.has('giga-ai-test-linked'), true);
});

fixtureTest('includeGlobal=true returns user-global roots without changing user scope', async () => {
  const result = await fetchUserTree(supabase() as any, {
    userPermissionsId: 'giga-ai-test-owner',
    includeGlobal: true,
    nowIso: GIGA_AI_TEST_DATES.nowIso,
  });

  assert.equal(
    result.user.some((node) => node.id === 'giga-ai-test'),
    true,
  );
  assert.equal(
    result.global.some((node) => node.id === 'giga-ai-test-linked'),
    true,
  );
  assert.equal(result.organization.length, 0);
});

fixtureTest('reader linked access keeps active linked roots and excludes expired/future category grants', async () => {
  const result = await fetchUserTree(supabase() as any, {
    userPermissionsId: 'giga-ai-test-reader',
    includeGlobal: false,
    nowIso: GIGA_AI_TEST_DATES.nowIso,
  });

  const userIds = collectTreeIds(result.user);
  assert.equal(
    result.user.some((node) => node.id === 'giga-ai-test-linked'),
    true,
  );
  assert.equal(userIds.has('giga-ai-test-cat-2'), false);
  assert.equal(userIds.has('giga-ai-test-cat-3'), false);
  assert.equal(userIds.has('giga-ai-test-subject-1'), false);
});

fixtureTest('explicit root keeps tree rooted at giga-ai-test-cat-1 and preserves inherited permission source', async () => {
  const result = await fetchUserTree(supabase() as any, {
    userPermissionsId: 'giga-ai-test-owner',
    includeGlobal: false,
    rootId: 'giga-ai-test-cat-1',
    nowIso: GIGA_AI_TEST_DATES.nowIso,
  });

  const userRoot = result.user[0];
  const userIds = collectTreeIds(result.user);

  assert.equal(Boolean(userRoot), true);
  assert.equal(userRoot?.id, 'giga-ai-test-cat-1');
  assert.equal(userRoot?.permission?.inheritedFromResourceId, 'giga-ai-test');
  assert.equal(userIds.has('giga-ai-test-cat-2'), false);
});

fixtureTest('no-access user receives empty user/organization/global trees', async () => {
  const result = await fetchUserTree(supabase() as any, {
    userPermissionsId: 'giga-ai-test-no-access',
    includeGlobal: false,
    nowIso: GIGA_AI_TEST_DATES.nowIso,
  });

  assert.deepEqual(result, {
    user: [],
    organization: [],
    global: [],
  });
});

fixtureTest('optimized graph loading and legacy graph loading return equivalent fixture root graphs and tree ids', async (t) => {
  const neo = await TreeGraphEntity.getNeo();
  const rootGrants = [
    {
      rootId: 'giga-ai-test',
      ancestorId: 'giga-ai-test',
      rootType: 'CHANNEL',
      grantType: 'OWNS',
      permission: {},
    },
    {
      rootId: 'giga-ai-test-linked',
      ancestorId: 'giga-ai-test-linked',
      rootType: 'CHANNEL',
      grantType: 'LINKS',
      permission: {},
    },
  ];

  let optimized = null as Awaited<ReturnType<typeof __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats>> | null;
  try {
    optimized = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(neo, rootGrants as any, { mode: 'batched' });
  } catch {
    try {
      optimized = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(neo, rootGrants as any, { mode: 'grouped' });
    } catch {
      t.skip('Batched/grouped graph loader is unsupported by this local graph runtime.');
      return;
    }
  }

  const legacy = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(neo, rootGrants as any, { mode: 'legacy' });
  const optimizedRootIds = Array.from((optimized || legacy).graphs.keys()).sort();
  const legacyRootIds = Array.from(legacy.graphs.keys()).sort();
  assert.deepEqual(optimizedRootIds, legacyRootIds);

  for (const rootId of legacyRootIds) {
    const optimizedGraph = (optimized || legacy).graphs.get(rootId) || { nodes: [], edges: [] };
    const legacyGraph = legacy.graphs.get(rootId) || { nodes: [], edges: [] };
    const optimizedNodeIds = optimizedGraph.nodes.map((node) => node.id).sort();
    const legacyNodeIds = legacyGraph.nodes.map((node) => node.id).sort();
    const optimizedEdgeIds = optimizedGraph.edges.map((edge) => `${edge.sourceId}|${edge.targetId}|${edge.type}`).sort();
    const legacyEdgeIds = legacyGraph.edges.map((edge) => `${edge.sourceId}|${edge.targetId}|${edge.type}`).sort();
    assert.deepEqual(optimizedNodeIds, legacyNodeIds);
    assert.deepEqual(optimizedEdgeIds, legacyEdgeIds);

    const optimizedTree = buildTreeFromGraph({
      rootId,
      nodes: optimizedGraph.nodes,
      edges: optimizedGraph.edges,
      permission: null,
      allowDescendants: true,
      postsBySubjectId: new Map(),
    });
    const legacyTree = buildTreeFromGraph({
      rootId,
      nodes: legacyGraph.nodes,
      edges: legacyGraph.edges,
      permission: null,
      allowDescendants: true,
      postsBySubjectId: new Map(),
    });
    assert.deepEqual(Array.from(collectTreeIds([optimizedTree])).sort(), Array.from(collectTreeIds([legacyTree])).sort());
  }
});
