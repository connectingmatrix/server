import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { AllowAllPermissionEngine, GigaORM } from '@connectingmatrix/orm/orm';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { AIPostsRepository } from '@connectingmatrix/orm/repositories/ai-posts.repository';
import {
  OrganisationEntity,
  OrganizationContentRestrictionEntity,
  OrganizationMemberEntity,
  OrganizationNodeRestrictionEntity,
  PermissionEntity,
  PlanPolicyEntity,
  SubscriptionEntity,
  UserEntity,
} from '@connectingmatrix/orm/repositories/entities';
import { __fetchUserTreeTestUtils, fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import { MockSupabaseNeoAdapter } from '../../../../../shared/__tests__/entities/mocks/supabase-neo4j-mocks';

type TableMap = Record<string, any[]>;

const ormAdapter = new MockSupabaseNeoAdapter();
const ormEntities = [
  OrganisationEntity,
  OrganizationMemberEntity,
  OrganizationContentRestrictionEntity,
  OrganizationNodeRestrictionEntity,
  PermissionEntity,
  PlanPolicyEntity,
  SubscriptionEntity,
  UserEntity,
].filter(Boolean) as any[];

function seedTable(table: string, rows: any[]) {
  const map = new Map<string, any>();
  rows.forEach((row, index) => {
    const id = String(row?.id || `${table}-${index + 1}`);
    map.set(id, { ...row, id });
  });
  ormAdapter.tables.set(table, map);
}

function installFetchTreeOrm(tables: TableMap) {
  ormAdapter.tables.clear();
  ormAdapter.relations.length = 0;
  seedTable(
    'organizations',
    (tables.organizations || []).map((row) => ({
      ...row,
      billingStatus: row?.billingStatus || row?.billing_status || 'PAID',
      createdBy: row?.createdBy || row?.created_by || null,
      isActive: row?.isActive ?? row?.is_active ?? true,
    })),
  );
  seedTable('organization_members', tables.organization_members || []);
  seedTable('organization_content_restrictions', tables.organization_content_restrictions || []);
  seedTable('organization_node_restrictions', tables.organization_node_restrictions || []);
  seedTable('ai_permissions', tables.ai_permissions || []);
  seedTable('ai_plan_policies', tables.ai_plan_policies || []);
  seedTable('Subscription', tables.Subscription || []);
  seedTable('User', tables.User || []);
  GigaORM.install({
    supabase: ormAdapter as never,
    neo4j: ormAdapter as never,
    permissions: new AllowAllPermissionEngine(),
    entities: ormEntities as never,
    defaultContext: { caller: { id: 'test-user', type: 'user' }, scope: { id: 'test-user', type: 'user' } },
  });
}

const originalGetInstance = Neo4JConnection.getInstance;
const originalFetchTreeGraph = GraphEntity.prototype.fetchTreeGraph;
const originalGetBySubjectIds = AIPostsRepository.prototype.getBySubjectIds;

function createSupabaseStub(tables: TableMap) {
  installFetchTreeOrm(tables);
  return {
    from(tableName: string) {
      const rows = Array.isArray(tables[tableName]) ? tables[tableName] : [];
      const predicates: Array<(row: Record<string, unknown>) => boolean> = [];

      const filteredRows = () => rows.filter((row) => predicates.every((predicate) => predicate(row)));
      const selectedRows = () =>
        tableName === 'organization_members'
          ? filteredRows().map((row) => ({
              ...row,
              organization: (tables.organizations || []).find((organization) => organization.id === row.organization_id) || null,
            }))
          : filteredRows();
      const execute = () => ({
        data: selectedRows(),
        error: null,
      });
      const executeSingle = () => ({
        data: selectedRows()[0] || null,
        error: null,
      });

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          predicates.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          predicates.push((row) => values.includes(row[column]));
          return builder;
        },
        is(column: string, value: unknown) {
          predicates.push((row) => row[column] === value);
          return builder;
        },
        like(column: string, value: string) {
          const pattern = String(value || '').replace(/%/g, '');
          predicates.push((row) => String(row[column] || '').includes(pattern));
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(executeSingle());
        },
        limit() {
          return builder;
        },
        order() {
          return builder;
        },
        then(resolve: (value: { data: any[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

afterEach(() => {
  Neo4JConnection.getInstance = originalGetInstance;
  GraphEntity.prototype.fetchTreeGraph = originalFetchTreeGraph;
  AIPostsRepository.prototype.getBySubjectIds = originalGetBySubjectIds;
  ormAdapter.tables.clear();
  ormAdapter.relations.length = 0;
});

test('organization-scoped tree applies selected org restrictions while personal tree remains unfiltered', async () => {
  Neo4JConnection.getInstance = async () =>
    ({
      run: async () => [
        {
          rootId: 'channel-1',
          ancestorId: 'channel-1',
          rootType: 'CHANNEL',
          grantType: 'OWNS',
          permission: {},
        },
      ],
    } as any);

  GraphEntity.prototype.fetchTreeGraph = async () => ({
    nodes: [
      {
        id: 'channel-1',
        labels: ['Channel'],
        props: {
          name: 'Channel 1',
          slug: 'channel-1',
        },
      },
    ],
    edges: [],
  });

  AIPostsRepository.prototype.getBySubjectIds = async () => [];

  const supabase = createSupabaseStub({
    organizations: [
      {
        id: 'org-1',
        is_active: true,
      },
    ],
    organization_members: [
      {
        organization_id: 'org-1',
        user_id: 'user-1',
        role: 'MEMBER',
        is_disabled: false,
      },
    ],
    organization_content_restrictions: [
      {
        organization_id: 'org-1',
        user_id: null,
        target_type: 'CHANNEL',
        target_id: 'channel-1',
      },
    ],
    organization_node_restrictions: [],
    Subscription: [
      {
        paymentSource: 'STRIPE:organization:org-1:business-lite:paid',
        status: 'active',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    ai_permissions: [],
    ai_plan_policies: [
      {
        plan_id: 'business-lite',
        mode: 'PAID',
        scope: 'ORGANIZATION',
        permissions: { CHANNEL: { read: true }, CATEGORY: { read: true }, SUBJECT: { read: true }, POST: { read: true } },
        limitations: {},
      },
    ],
  });

  const personalTree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: false,
  });
  const organizationTree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: false,
    organizationId: 'org-1',
  });

  assert.equal(personalTree.user.length, 1);
  assert.equal(personalTree.user[0]?.id, 'channel-1');
  assert.equal(organizationTree.organization.length, 0);
});

test('organization-scoped tree resolves roots from the organisation node and keeps the scoped root identity', async () => {
  const statements: string[] = [];
  Neo4JConnection.getInstance = async () =>
    ({
      run: async (statement: string) => {
        statements.push(statement);
        return [
          {
            rootId: 'channel-org',
            ancestorId: 'channel-org',
            rootType: 'CHANNEL',
            grantType: 'OWNS',
            permission: {},
          },
        ];
      },
    } as any);

  GraphEntity.prototype.fetchTreeGraph = async () => ({
    nodes: [
      {
        id: 'channel-org',
        labels: ['Channel'],
        props: {
          name: 'Org Channel',
          slug: 'org-channel',
          organizationId: 'org-1',
        },
      },
    ],
    edges: [],
  });

  AIPostsRepository.prototype.getBySubjectIds = async () => [];

  const supabase = createSupabaseStub({
    organizations: [
      {
        id: 'org-1',
        is_active: true,
      },
    ],
    organization_members: [
      {
        organization_id: 'org-1',
        user_id: 'user-1',
        role: 'MEMBER',
        is_disabled: false,
      },
    ],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    Subscription: [
      {
        paymentSource: 'STRIPE:organization:org-1:business-lite:paid',
        status: 'active',
        createdAt: '2026-04-01T00:00:00.000Z',
      },
    ],
    ai_permissions: [],
    ai_plan_policies: [
      {
        plan_id: 'business-lite',
        mode: 'PAID',
        scope: 'ORGANIZATION',
        permissions: { CHANNEL: { read: true }, CATEGORY: { read: true }, SUBJECT: { read: true }, POST: { read: true } },
        limitations: {},
      },
    ],
  });

  const organizationTree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: true,
    organizationId: 'org-1',
  });

  assert.equal(organizationTree.organization.length, 1);
  assert.equal(organizationTree.organization[0]?.id, 'channel-org');
  assert.equal(organizationTree.global.length, 1);
  assert.equal(organizationTree.global[0]?.id, 'channel-org');
  assert.ok(statements.some((statement) => statement.includes('MATCH (organizationNode:Organisation {id: $organizationId})')));
  assert.equal(
    statements.some((statement) => statement.includes('MATCH (permissionsNode:UserPermissions {id: $userPermissionsId})')),
    true,
  );
});

test('organization-scoped tree returns no results for inactive organizations', async () => {
  Neo4JConnection.getInstance = async () =>
    ({
      run: async () => [],
    } as any);

  GraphEntity.prototype.fetchTreeGraph = async () => ({
    nodes: [],
    edges: [],
  });

  AIPostsRepository.prototype.getBySubjectIds = async () => [];

  const supabase = createSupabaseStub({
    organizations: [
      {
        id: 'org-1',
        is_active: false,
      },
    ],
    organization_members: [
      {
        organization_id: 'org-1',
        user_id: 'user-1',
        role: 'MEMBER',
        is_disabled: false,
      },
    ],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [],
  });

  const organizationTree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: false,
    organizationId: 'org-1',
  });

  assert.equal(organizationTree.organization.length, 0);
  assert.equal(organizationTree.global.length, 0);
});

test('buildForest hydrates posts once for multiple roots by batching subject ids', async () => {
  const postCalls: string[][] = [];
  Neo4JConnection.getInstance = async () =>
    ({
      run: async (statement: string) => {
        if (statement.includes('MATCH (permissionsNode:UserPermissions') && statement.includes('root.id AS rootId')) {
          return [
            {
              rootId: 'root-a',
              ancestorId: 'root-a',
              rootType: 'CHANNEL',
              grantType: 'OWNS',
              permission: {},
            },
            {
              rootId: 'root-b',
              ancestorId: 'root-b',
              rootType: 'CHANNEL',
              grantType: 'OWNS',
              permission: {},
            },
          ];
        }

        if (statement.includes('UNWIND $roots AS rootRef')) {
          return [
            {
              rootId: 'root-a',
              nodes: [
                { id: 'root-a', labels: ['Channel'], props: { name: 'Root A', slug: 'root-a' } },
                { id: 'cat-a', labels: ['Category'], props: { name: 'Cat A', slug: 'cat-a' } },
                { id: 'subject-1', labels: ['SubjectRef'], props: { name: 'Subject 1', slug: 'subject-1' } },
              ],
              edges: [
                { sourceId: 'root-a', targetId: 'cat-a', type: 'CONTAINS_CATEGORY', props: {} },
                { sourceId: 'cat-a', targetId: 'subject-1', type: 'CONTAINS_SUBJECT', props: {} },
              ],
            },
            {
              rootId: 'root-b',
              nodes: [
                { id: 'root-b', labels: ['Channel'], props: { name: 'Root B', slug: 'root-b' } },
                { id: 'cat-b', labels: ['Category'], props: { name: 'Cat B', slug: 'cat-b' } },
                { id: 'subject-2', labels: ['SubjectRef'], props: { name: 'Subject 2', slug: 'subject-2' } },
              ],
              edges: [
                { sourceId: 'root-b', targetId: 'cat-b', type: 'CONTAINS_CATEGORY', props: {} },
                { sourceId: 'cat-b', targetId: 'subject-2', type: 'CONTAINS_SUBJECT', props: {} },
              ],
            },
          ];
        }

        return [];
      },
    } as any);

  GraphEntity.prototype.fetchTreeGraph = async () => ({
    nodes: [],
    edges: [],
  });

  AIPostsRepository.prototype.getBySubjectIds = async (subjectIds: string[]) => {
    postCalls.push(subjectIds);
    return [{ id: 'post-1', subject_id: 'subject-1' } as any, { id: 'post-2', subject_id: 'subject-2' } as any];
  };

  const supabase = createSupabaseStub({
    organizations: [],
    organization_members: [],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [],
  });

  const tree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: false,
    nowIso: '2026-01-01T00:00:00.000Z',
  });

  assert.equal(tree.user.length, 2);
  assert.equal(postCalls.length, 1);
  assert.deepEqual(new Set(postCalls[0]), new Set(['subject-1', 'subject-2']));
});

test('buildForest hydrates posts by SubjectRef.supabaseId and attaches them to graph subject id', async () => {
  const postCalls: string[][] = [];
  const subjectSupabaseId = '11111111-1111-4111-8111-111111111111';

  Neo4JConnection.getInstance = async () =>
    ({
      run: async (statement: string) => {
        if (statement.includes('MATCH (permissionsNode:UserPermissions') && statement.includes('root.id AS rootId')) {
          return [
            {
              rootId: 'root-supabase-id',
              ancestorId: 'root-supabase-id',
              rootType: 'CHANNEL',
              grantType: 'OWNS',
              permission: {},
            },
          ];
        }

        if (statement.includes('UNWIND $roots AS rootRef')) {
          return [
            {
              rootId: 'root-supabase-id',
              nodes: [
                { id: 'root-supabase-id', labels: ['Channel'], props: { name: 'Root', slug: 'root' } },
                { id: 'cat-supabase-id', labels: ['Category'], props: { name: 'Cat', slug: 'cat' } },
                {
                  id: 'subject-graph-id',
                  labels: ['SubjectRef'],
                  props: {
                    name: 'Subject Graph',
                    slug: 'subject-graph',
                    supabaseId: subjectSupabaseId,
                  },
                },
              ],
              edges: [
                { sourceId: 'root-supabase-id', targetId: 'cat-supabase-id', type: 'CONTAINS_CATEGORY', props: {} },
                { sourceId: 'cat-supabase-id', targetId: 'subject-graph-id', type: 'CONTAINS_SUBJECT', props: {} },
              ],
            },
          ];
        }

        return [];
      },
    } as any);

  GraphEntity.prototype.fetchTreeGraph = async () => ({
    nodes: [],
    edges: [],
  });

  AIPostsRepository.prototype.getBySubjectIds = async (subjectIds: string[]) => {
    postCalls.push(subjectIds);
    return [{ id: 'post-uuid', subject_id: subjectSupabaseId } as any];
  };

  const supabase = createSupabaseStub({
    organizations: [],
    organization_members: [],
    organization_content_restrictions: [],
    organization_node_restrictions: [],
    ai_permissions: [],
  });

  const tree = await fetchUserTree(supabase as any, {
    userPermissionsId: 'user-1',
    includeGlobal: false,
    nowIso: '2026-01-01T00:00:00.000Z',
  });

  const postsByNodeId = new Map<string, string[]>();
  const visit = (node: any) => {
    if (!node || !node.id) {
      return;
    }
    if (node.posts && node.posts.length) {
      postsByNodeId.set(
        node.id,
        node.posts.map((post: any) => post.id),
      );
    }
    for (const child of node.children || []) {
      visit(child);
    }
  };
  for (const root of tree.user) {
    visit(root);
  }

  assert.equal(postCalls.length, 1);
  assert.deepEqual(postCalls[0], [subjectSupabaseId]);
  assert.deepEqual(postsByNodeId.get('subject-graph-id'), ['post-uuid']);
});

test('batched graph loading falls back to grouped mode when batch query fails', async () => {
  const neo = {
    run: async (statement: string, params: Record<string, unknown>) => {
      if (statement.includes('UNWIND $roots AS rootRef')) {
        throw new Error('batched query unsupported');
      }
      if (statement.includes('UNWIND $rootIds AS rootId')) {
        const rootIds = (params.rootIds as string[]) || [];
        return rootIds.map((rootId) => ({
          rootId,
          nodes: [{ id: rootId, labels: ['Channel'], props: { name: rootId, slug: rootId } }],
          edges: [],
        }));
      }
      return [];
    },
  } as any;

  const result = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(
    neo,
    [
      { rootId: 'root-a', ancestorId: 'root-a', rootType: 'CHANNEL', grantType: 'OWNS', permission: null },
      { rootId: 'root-b', ancestorId: 'root-b', rootType: 'CATEGORY', grantType: 'OWNS', permission: null },
    ],
    {},
  );

  assert.equal(result.mode, 'grouped');
  assert.equal(result.graphs.size, 2);
  assert.equal(result.queryCount >= 2, true);
});

test('graph loading falls back to legacy mode when batched and grouped queries fail', async () => {
  let legacyCalls = 0;
  const neo = {
    run: async (statement: string) => {
      if (statement.includes('UNWIND $roots AS rootRef') || statement.includes('UNWIND $rootIds AS rootId')) {
        throw new Error('unsupported query');
      }
      return [];
    },
  } as any;

  GraphEntity.prototype.fetchTreeGraph = async function fetchTreeGraphMock() {
    legacyCalls += 1;
    return {
      nodes: [{ id: (this as any).id, labels: ['Channel'], props: { name: (this as any).id, slug: (this as any).id } }],
      edges: [],
    };
  };

  const result = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(
    neo,
    [
      { rootId: 'legacy-a', ancestorId: 'legacy-a', rootType: 'CHANNEL', grantType: 'OWNS', permission: null },
      { rootId: 'legacy-b', ancestorId: 'legacy-b', rootType: 'CHANNEL', grantType: 'OWNS', permission: null },
    ],
    {},
  );

  assert.equal(result.mode, 'legacy');
  assert.equal(result.graphs.size, 2);
  assert.equal(legacyCalls, 2);
});

test('batched and legacy graph loading return equivalent root node and edge ids', async () => {
  const graphByRootId: Record<string, { nodes: any[]; edges: any[] }> = {
    'root-a': {
      nodes: [
        { id: 'root-a', labels: ['Channel'], props: { name: 'Root A', slug: 'root-a' } },
        { id: 'cat-a', labels: ['Category'], props: { name: 'Cat A', slug: 'cat-a' } },
      ],
      edges: [{ sourceId: 'root-a', targetId: 'cat-a', type: 'CONTAINS_CATEGORY', props: {} }],
    },
    'root-b': {
      nodes: [
        { id: 'root-b', labels: ['Channel'], props: { name: 'Root B', slug: 'root-b' } },
        { id: 'cat-b', labels: ['Category'], props: { name: 'Cat B', slug: 'cat-b' } },
      ],
      edges: [{ sourceId: 'root-b', targetId: 'cat-b', type: 'CONTAINS_CATEGORY', props: {} }],
    },
  };

  const neo = {
    run: async (statement: string, params: Record<string, unknown>) => {
      if (statement.includes('UNWIND $roots AS rootRef')) {
        const roots = (params.roots as Array<{ rootId: string }>) || [];
        return roots.map((root) => ({ rootId: root.rootId, ...graphByRootId[root.rootId] }));
      }
      return [];
    },
  } as any;

  GraphEntity.prototype.fetchTreeGraph = async function fetchTreeGraphMock() {
    return graphByRootId[(this as any).id];
  };

  const rootGrants = [
    { rootId: 'root-a', ancestorId: 'root-a', rootType: 'CHANNEL', grantType: 'OWNS', permission: {} },
    { rootId: 'root-b', ancestorId: 'root-b', rootType: 'CHANNEL', grantType: 'OWNS', permission: {} },
  ];

  const batched = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(neo, rootGrants as any, { mode: 'batched' });
  const legacy = await __fetchUserTreeTestUtils.loadGraphsForRootGrantsWithStats(neo, rootGrants as any, { mode: 'legacy' });

  assert.equal(batched.mode, 'batched');
  assert.equal(legacy.mode, 'legacy');
  assert.deepEqual(Array.from(batched.graphs.keys()).sort(), Array.from(legacy.graphs.keys()).sort());

  for (const rootId of batched.graphs.keys()) {
    const batchedGraph = batched.graphs.get(rootId) || { nodes: [], edges: [] };
    const legacyGraph = legacy.graphs.get(rootId) || { nodes: [], edges: [] };
    const batchedNodeIds = batchedGraph.nodes.map((node) => node.id).sort();
    const legacyNodeIds = legacyGraph.nodes.map((node) => node.id).sort();
    const batchedEdgeIds = batchedGraph.edges.map((edge) => `${edge.sourceId}|${edge.targetId}|${edge.type}`).sort();
    const legacyEdgeIds = legacyGraph.edges.map((edge) => `${edge.sourceId}|${edge.targetId}|${edge.type}`).sort();
    assert.deepEqual(batchedNodeIds, legacyNodeIds);
    assert.deepEqual(batchedEdgeIds, legacyEdgeIds);
  }
});
