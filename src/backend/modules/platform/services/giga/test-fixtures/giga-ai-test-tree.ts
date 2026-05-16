import { createHash } from 'node:crypto';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { Post, Subject } from '@connectingmatrix/orm/repositories/entities';
import { ACCESS_RELATIONS, GRAPH_LABELS, GRAPH_SYSTEM_IDS, STRUCTURAL_RELATIONS } from '@giga/shared/types/contracts/graph.types';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import type { GraphEntityTypeToken, GraphRelationToken } from '@giga/shared/types/contracts/graph.types';

export type GigaAiTestFixtureSize = 'small' | 'medium' | 'large';

type FixtureNodeSeed = {
  id: string;
  props: Record<string, unknown>;
};

type FixtureEdgeSeed = {
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  relation: string;
  props: Record<string, unknown>;
};

type FixtureShape = {
  nodesByLabel: Partial<Record<GraphEntityTypeToken, FixtureNodeSeed[]>>;
  edges: FixtureEdgeSeed[];
  subjectIds: string[];
};

const FIXTURE_PREFIX = 'giga-ai-test';
const FIXTURE_POST_PREFIX = 'giga-ai-test-post-';
const FIXTURE_USER_IDS = ['giga-ai-test-owner', 'giga-ai-test-reader', 'giga-ai-test-no-access'];

export const GIGA_AI_TEST_DATES = {
  nowIso: '2026-01-01T00:00:00.000Z',
  expiredFromIso: '2024-01-01T00:00:00.000Z',
  expiredToIso: '2024-12-31T23:59:59.999Z',
  futureFromIso: '2027-01-01T00:00:00.000Z',
} as const;

const ALLOWED_LABELS = new Set<GraphEntityTypeToken>(Object.values(GRAPH_LABELS));
const ALLOWED_RELATIONS = new Set<GraphRelationToken>([
  ACCESS_RELATIONS.owns,
  ACCESS_RELATIONS.subscribedTo,
  ACCESS_RELATIONS.canAccess,
  STRUCTURAL_RELATIONS.containsChannel,
  STRUCTURAL_RELATIONS.containsCategory,
  STRUCTURAL_RELATIONS.containsSubject,
  STRUCTURAL_RELATIONS.links,
]);

function deterministicFixtureUuid(scope: string, value: string) {
  const hex = createHash('sha1').update(`${FIXTURE_PREFIX}:${scope}:${value}`).digest('hex').slice(0, 32);
  const variant = ['8', '9', 'a', 'b'][Number.parseInt(hex.slice(16, 17), 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function textFlag(value: string | undefined, fallback: string) {
  const next = String(value || '').trim();
  return next || fallback;
}

function boolFlag(value: string | undefined, fallback: boolean) {
  const next = String(value || '')
    .trim()
    .toLowerCase();
  if (!next) {
    return fallback;
  }
  return next === '1' || next === 'true' || next === 'yes';
}

function cleanProps(input: Record<string, unknown>) {
  const rows: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    rows[key] = value;
  }
  return rows;
}

function configureFixtureNeoEnv() {
  process.env.NEO4J_URI = textFlag(process.env.GIGA_GRAPH_TEST_URI || process.env.NEO4J_URI, 'bolt://localhost:7687/memgraph');
  process.env.NEO4J_USERNAME = textFlag(process.env.GIGA_GRAPH_TEST_USERNAME || process.env.NEO4J_USERNAME, '');
  process.env.NEO4J_PASSWORD = textFlag(process.env.GIGA_GRAPH_TEST_PASSWORD || process.env.NEO4J_PASSWORD, '');
}

function createEmptyShape(): FixtureShape {
  return {
    nodesByLabel: {
      [GRAPH_LABELS.channel]: [],
      [GRAPH_LABELS.category]: [],
      [GRAPH_LABELS.subjectRef]: [],
      [GRAPH_LABELS.userPermissions]: [],
    },
    edges: [],
    subjectIds: [],
  };
}

function pushNode(shape: FixtureShape, label: GraphEntityTypeToken, id: string, props: Record<string, unknown>) {
  if (!ALLOWED_LABELS.has(label)) {
    throw new Error(`Unsupported graph label ${label}`);
  }
  const bucket = shape.nodesByLabel[label] || [];
  bucket.push({ id, props: cleanProps(props) });
  shape.nodesByLabel[label] = bucket;
}

function pushEdge(
  shape: FixtureShape,
  sourceLabel: GraphEntityTypeToken,
  sourceId: string,
  relation: GraphRelationToken,
  targetLabel: GraphEntityTypeToken,
  targetId: string,
  props: Record<string, unknown>,
) {
  if (!ALLOWED_LABELS.has(sourceLabel) || !ALLOWED_LABELS.has(targetLabel)) {
    throw new Error(`Unsupported edge labels ${sourceLabel}:${targetLabel}`);
  }
  if (!ALLOWED_RELATIONS.has(relation)) {
    throw new Error(`Unsupported edge relation ${relation}`);
  }
  shape.edges.push({
    sourceId,
    sourceLabel,
    targetId,
    targetLabel,
    relation,
    props: cleanProps(props),
  });
}

export function gigaAiTestSubjectSupabaseId(subjectId: string) {
  return deterministicFixtureUuid('subject', subjectId);
}

function gigaAiTestPostSupabaseId(postId: string) {
  return deterministicFixtureUuid('post', postId);
}

function pushSubject(shape: FixtureShape, id: string, name: string, nowIso: string) {
  pushNode(shape, GRAPH_LABELS.subjectRef, id, {
    id,
    supabaseId: gigaAiTestSubjectSupabaseId(id),
    name,
    slug: id,
    description: `Fixture subject ${name}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  shape.subjectIds.push(id);
}

function addSmallFixture(shape: FixtureShape, nowIso: string) {
  pushNode(shape, GRAPH_LABELS.channel, 'giga-ai-test', {
    id: 'giga-ai-test',
    name: 'giga-ai-test',
    slug: 'giga-ai-test',
    description: 'Deterministic test fixture channel for fetchUserTree performance testing',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.channel, 'giga-ai-test-child-1', {
    id: 'giga-ai-test-child-1',
    name: 'giga-ai-test-child-1',
    slug: 'giga-ai-test-child-1',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.channel, 'giga-ai-test-child-2', {
    id: 'giga-ai-test-child-2',
    name: 'giga-ai-test-child-2',
    slug: 'giga-ai-test-child-2',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.channel, 'giga-ai-test-linked', {
    id: 'giga-ai-test-linked',
    name: 'giga-ai-test-linked',
    slug: 'giga-ai-test-linked',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  pushNode(shape, GRAPH_LABELS.category, 'giga-ai-test-cat-1', {
    id: 'giga-ai-test-cat-1',
    name: 'giga-ai-test-cat-1',
    slug: 'giga-ai-test-cat-1',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.category, 'giga-ai-test-sub-cat-1', {
    id: 'giga-ai-test-sub-cat-1',
    name: 'giga-ai-test-sub-cat-1',
    slug: 'giga-ai-test-sub-cat-1',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.category, 'giga-ai-test-cat-2', {
    id: 'giga-ai-test-cat-2',
    name: 'giga-ai-test-cat-2',
    slug: 'giga-ai-test-cat-2',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.category, 'giga-ai-test-cat-3', {
    id: 'giga-ai-test-cat-3',
    name: 'giga-ai-test-cat-3',
    slug: 'giga-ai-test-cat-3',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.category, 'giga-ai-test-linked-cat-1', {
    id: 'giga-ai-test-linked-cat-1',
    name: 'giga-ai-test-linked-cat-1',
    slug: 'giga-ai-test-linked-cat-1',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  pushSubject(shape, 'giga-ai-test-subject-1', 'giga-ai-test-subject-1', nowIso);
  pushSubject(shape, 'giga-ai-test-subject-2', 'giga-ai-test-subject-2', nowIso);
  pushSubject(shape, 'giga-ai-test-subject-3', 'giga-ai-test-subject-3', nowIso);
  pushSubject(shape, 'giga-ai-test-subject-4', 'giga-ai-test-subject-4', nowIso);
  pushSubject(shape, 'giga-ai-test-subject-5', 'giga-ai-test-subject-5', nowIso);
  pushSubject(shape, 'giga-ai-test-linked-subject-1', 'giga-ai-test-linked-subject-1', nowIso);

  pushNode(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-owner', {
    id: 'giga-ai-test-owner',
    kind: 'USER',
    displayName: 'Giga AI Test Owner',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-reader', {
    id: 'giga-ai-test-reader',
    kind: 'USER',
    displayName: 'Giga AI Test Reader',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-no-access', {
    id: 'giga-ai-test-no-access',
    kind: 'USER',
    displayName: 'Giga AI Test No Access',
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushNode(shape, GRAPH_LABELS.userPermissions, GRAPH_SYSTEM_IDS.userGlobal, {
    id: GRAPH_SYSTEM_IDS.userGlobal,
    kind: 'SYSTEM',
    displayName: 'Global',
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  pushEdge(shape, GRAPH_LABELS.channel, 'giga-ai-test', STRUCTURAL_RELATIONS.containsChannel, GRAPH_LABELS.channel, 'giga-ai-test-child-1', {});
  pushEdge(shape, GRAPH_LABELS.channel, 'giga-ai-test', STRUCTURAL_RELATIONS.containsChannel, GRAPH_LABELS.channel, 'giga-ai-test-child-2', {});
  pushEdge(
    shape,
    GRAPH_LABELS.channel,
    'giga-ai-test-child-1',
    STRUCTURAL_RELATIONS.containsCategory,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-1',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.channel,
    'giga-ai-test-child-1',
    STRUCTURAL_RELATIONS.containsCategory,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-2',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.channel,
    'giga-ai-test-child-2',
    STRUCTURAL_RELATIONS.containsCategory,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-3',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-1',
    STRUCTURAL_RELATIONS.containsCategory,
    GRAPH_LABELS.category,
    'giga-ai-test-sub-cat-1',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-sub-cat-1',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-1',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-sub-cat-1',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-2',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-1',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-1',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-1',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-2',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-2',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-3',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-3',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-4',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-cat-3',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-5',
    {},
  );
  pushEdge(shape, GRAPH_LABELS.channel, 'giga-ai-test', STRUCTURAL_RELATIONS.links, GRAPH_LABELS.channel, 'giga-ai-test-linked', {});
  pushEdge(
    shape,
    GRAPH_LABELS.channel,
    'giga-ai-test-linked',
    STRUCTURAL_RELATIONS.containsCategory,
    GRAPH_LABELS.category,
    'giga-ai-test-linked-cat-1',
    {},
  );
  pushEdge(
    shape,
    GRAPH_LABELS.category,
    'giga-ai-test-linked-cat-1',
    STRUCTURAL_RELATIONS.containsSubject,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-linked-subject-1',
    {},
  );

  pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-owner', ACCESS_RELATIONS.owns, GRAPH_LABELS.channel, 'giga-ai-test', {
    read: true,
    write: true,
    recursive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-reader', STRUCTURAL_RELATIONS.links, GRAPH_LABELS.channel, 'giga-ai-test-linked', {
    read: true,
    write: false,
    recursive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushEdge(
    shape,
    GRAPH_LABELS.userPermissions,
    'giga-ai-test-reader',
    ACCESS_RELATIONS.canAccess,
    GRAPH_LABELS.subjectRef,
    'giga-ai-test-subject-1',
    {
      read: true,
      write: false,
      recursive: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  );
  pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-reader', ACCESS_RELATIONS.canAccess, GRAPH_LABELS.category, 'giga-ai-test-cat-2', {
    read: true,
    write: false,
    recursive: true,
    availableFrom: GIGA_AI_TEST_DATES.expiredFromIso,
    availableTo: GIGA_AI_TEST_DATES.expiredToIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-reader', ACCESS_RELATIONS.canAccess, GRAPH_LABELS.category, 'giga-ai-test-cat-3', {
    read: true,
    write: false,
    recursive: true,
    availableFrom: GIGA_AI_TEST_DATES.futureFromIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  pushEdge(shape, GRAPH_LABELS.userPermissions, GRAPH_SYSTEM_IDS.userGlobal, ACCESS_RELATIONS.owns, GRAPH_LABELS.channel, 'giga-ai-test-linked', {
    read: true,
    write: false,
    recursive: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
}

function addLargeFixture(shape: FixtureShape, size: GigaAiTestFixtureSize, nowIso: string) {
  if (size === 'small') {
    return;
  }

  const categoryCount = size === 'medium' ? 50 : 200;
  for (let index = 1; index <= categoryCount; index += 1) {
    const categoryId = `giga-ai-test-extra-cat-${index}`;
    pushNode(shape, GRAPH_LABELS.category, categoryId, {
      id: categoryId,
      name: categoryId,
      slug: categoryId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    pushEdge(shape, GRAPH_LABELS.channel, 'giga-ai-test', STRUCTURAL_RELATIONS.containsCategory, GRAPH_LABELS.category, categoryId, {});

    for (let offset = 1; offset <= 4; offset += 1) {
      const subjectId = `giga-ai-test-extra-subject-${index}-${offset}`;
      pushSubject(shape, subjectId, subjectId, nowIso);
      pushEdge(shape, GRAPH_LABELS.category, categoryId, STRUCTURAL_RELATIONS.containsSubject, GRAPH_LABELS.subjectRef, subjectId, {});
    }
  }

  const extraGrantRoots = size === 'medium' ? 10 : 30;
  for (let index = 1; index <= extraGrantRoots; index += 1) {
    const channelId = `giga-ai-test-extra-root-${index}`;
    const categoryId = `giga-ai-test-extra-root-${index}-cat`;
    const subjectId = `giga-ai-test-extra-root-${index}-subject`;

    pushNode(shape, GRAPH_LABELS.channel, channelId, {
      id: channelId,
      name: channelId,
      slug: channelId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    pushNode(shape, GRAPH_LABELS.category, categoryId, {
      id: categoryId,
      name: categoryId,
      slug: categoryId,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    pushSubject(shape, subjectId, subjectId, nowIso);

    pushEdge(shape, GRAPH_LABELS.channel, channelId, STRUCTURAL_RELATIONS.containsCategory, GRAPH_LABELS.category, categoryId, {});
    pushEdge(shape, GRAPH_LABELS.category, categoryId, STRUCTURAL_RELATIONS.containsSubject, GRAPH_LABELS.subjectRef, subjectId, {});

    pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-owner', STRUCTURAL_RELATIONS.links, GRAPH_LABELS.channel, channelId, {
      read: true,
      write: false,
      recursive: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (index % 2 === 0) {
      pushEdge(shape, GRAPH_LABELS.userPermissions, 'giga-ai-test-reader', STRUCTURAL_RELATIONS.links, GRAPH_LABELS.channel, channelId, {
        read: true,
        write: false,
        recursive: true,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
  }
}

function buildFixtureShape(size: GigaAiTestFixtureSize, nowIso: string): FixtureShape {
  const shape = createEmptyShape();
  addSmallFixture(shape, nowIso);
  addLargeFixture(shape, size, nowIso);

  for (const label of Object.keys(shape.nodesByLabel) as GraphEntityTypeToken[]) {
    const uniqueById = new Map<string, FixtureNodeSeed>();
    for (const node of shape.nodesByLabel[label] || []) {
      uniqueById.set(node.id, node);
    }
    shape.nodesByLabel[label] = Array.from(uniqueById.values());
  }

  const uniqueEdges = new Map<string, FixtureEdgeSeed>();
  for (const edge of shape.edges) {
    const key = `${edge.sourceLabel}:${edge.sourceId}:${edge.relation}:${edge.targetLabel}:${edge.targetId}`;
    uniqueEdges.set(key, edge);
  }
  shape.edges = Array.from(uniqueEdges.values());
  shape.subjectIds = Array.from(new Set(shape.subjectIds));

  return shape;
}

async function mergeNodesByLabel(label: GraphEntityTypeToken, nodes: FixtureNodeSeed[]) {
  await TreeGraphEntity.mergeFixtureNodesByLabel(label, nodes);
}

async function mergeEdges(edges: FixtureEdgeSeed[], nowIso: string) {
  const groups = new Map<string, FixtureEdgeSeed[]>();
  for (const edge of edges) {
    const key = `${edge.sourceLabel}:${edge.relation}:${edge.targetLabel}`;
    const bucket = groups.get(key) || [];
    bucket.push(edge);
    groups.set(key, bucket);
  }

  for (const [key, rows] of groups.entries()) {
    const [sourceLabel, relation, targetLabel] = key.split(':');
    await TreeGraphEntity.mergeFixtureEdges({
      sourceLabel: sourceLabel as GraphEntityTypeToken,
      relation,
      targetLabel: targetLabel as GraphEntityTypeToken,
      rows: rows.map((row) => ({
        sourceId: row.sourceId,
        targetId: row.targetId,
        props: row.props,
      })),
      nowIso,
    });
  }
}

export async function seedGigaAiTestGraph(options?: { size?: GigaAiTestFixtureSize; nowIso?: string }) {
  configureFixtureNeoEnv();
  const size = options?.size || 'small';
  const nowIso = options?.nowIso || GIGA_AI_TEST_DATES.nowIso;
  const shape = buildFixtureShape(size, nowIso);

  await mergeNodesByLabel(GRAPH_LABELS.channel, shape.nodesByLabel[GRAPH_LABELS.channel]);
  await mergeNodesByLabel(GRAPH_LABELS.category, shape.nodesByLabel[GRAPH_LABELS.category]);
  await mergeNodesByLabel(GRAPH_LABELS.subjectRef, shape.nodesByLabel[GRAPH_LABELS.subjectRef]);
  await mergeNodesByLabel(GRAPH_LABELS.userPermissions, shape.nodesByLabel[GRAPH_LABELS.userPermissions]);
  await mergeEdges(shape.edges, nowIso);

  return {
    size,
    nowIso,
    nodeCounts: {
      channels: (shape.nodesByLabel[GRAPH_LABELS.channel] || []).length,
      categories: (shape.nodesByLabel[GRAPH_LABELS.category] || []).length,
      subjects: (shape.nodesByLabel[GRAPH_LABELS.subjectRef] || []).length,
      permissions: (shape.nodesByLabel[GRAPH_LABELS.userPermissions] || []).length,
    },
    edgeCount: shape.edges.length,
    subjectIds: shape.subjectIds,
  };
}

export async function cleanupGigaAiTestGraph() {
  configureFixtureNeoEnv();
  await TreeGraphEntity.cleanupFixtureGraph({
    prefix: FIXTURE_PREFIX,
    extraPermissionIds: FIXTURE_USER_IDS,
    userGlobal: GRAPH_SYSTEM_IDS.userGlobal,
  });

  return {
    deletedPrefix: FIXTURE_PREFIX,
    skipped: GRAPH_SYSTEM_IDS.userGlobal,
  };
}

function toPostBaseId(subjectId: string) {
  return subjectId.startsWith(`${FIXTURE_PREFIX}-`) ? subjectId.slice(FIXTURE_PREFIX.length + 1) : subjectId;
}

function buildPostRows(subjectIds: string[], nowIso: string) {
  const posts: Array<Record<string, unknown>> = [];
  for (const subjectId of subjectIds) {
    const base = toPostBaseId(subjectId);
    const subjectSupabaseId = gigaAiTestSubjectSupabaseId(subjectId);
    const fixturePostId = `${FIXTURE_POST_PREFIX}${base}-1`;
    posts.push({
      id: gigaAiTestPostSupabaseId(fixturePostId),
      subject_id: subjectSupabaseId,
      title: `${subjectId} post 1`,
      narrative: `Fixture narrative for ${subjectId} post 1`,
      metadata: { fixture: FIXTURE_PREFIX, fixturePostId, graphSubjectId: subjectId },
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (subjectId === 'giga-ai-test-subject-1') {
      const fixturePostIdSecond = `${FIXTURE_POST_PREFIX}subject-1-2`;
      posts.push({
        id: gigaAiTestPostSupabaseId(fixturePostIdSecond),
        subject_id: subjectSupabaseId,
        title: `${subjectId} post 2`,
        narrative: `Fixture narrative for ${subjectId} post 2`,
        metadata: { fixture: FIXTURE_PREFIX, fixturePostId: fixturePostIdSecond, graphSubjectId: subjectId },
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }
  return posts;
}

function buildSubjectRows(subjectIds: string[], nowIso: string) {
  return subjectIds.map((subjectId) => ({
    id: gigaAiTestSubjectSupabaseId(subjectId),
    name: subjectId,
    slug: subjectId,
    description: `Fixture subject row for ${subjectId}`,
    summary: null,
    metadata: { fixture: FIXTURE_PREFIX, graphSubjectId: subjectId },
    created_at: nowIso,
    updated_at: nowIso,
  }));
}

export async function seedGigaAiTestPosts(options?: { size?: GigaAiTestFixtureSize; nowIso?: string }) {
  const size = options?.size || 'small';
  const nowIso = options?.nowIso || GIGA_AI_TEST_DATES.nowIso;
  const shape = buildFixtureShape(size, nowIso);
  const supabase = SupabaseClientAdmin();

  const subjectRows = buildSubjectRows(shape.subjectIds, nowIso);
  const posts = buildPostRows(shape.subjectIds, nowIso);

  await Subject.upsertRows(supabase, subjectRows as Array<Record<string, unknown>>);
  await Post.upsertRows(supabase, posts as Array<Record<string, unknown>>);

  return {
    size,
    seededSubjects: subjectRows.length,
    seededPosts: posts.length,
  };
}

export async function cleanupGigaAiTestPosts() {
  const supabase = SupabaseClientAdmin();
  const deletedByPrefix = await Post.deleteByIdPrefix(supabase, FIXTURE_POST_PREFIX).catch((error: any) => {
    if (error?.code === '42883') return [];
    throw error;
  });
  const deletedByMetadata = await Post.deleteByMetadataContains(supabase, { fixture: FIXTURE_PREFIX });
  const ids = new Set<string>([
    ...deletedByPrefix.map((row: any) => String(row.id || '')),
    ...deletedByMetadata.map((row: any) => String(row.id || '')),
  ]);
  return {
    deletedPosts: ids.size,
  };
}

export function fixtureSizeFromInput(value: string | undefined): GigaAiTestFixtureSize {
  const next = textFlag(value, 'small').toLowerCase();
  if (next === 'small' || next === 'medium' || next === 'large') {
    return next;
  }
  throw new Error(`Invalid --size value "${value}". Expected small|medium|large.`);
}

export function fixtureBoolFromInput(value: string | undefined, fallback: boolean) {
  return boolFlag(value, fallback);
}

export async function resetGigaAiTestNeoConnection() {
  const holder = Neo4JConnection as any;
  const { instance } = holder;
  const driver = instance?.driver?.driver;
  if (driver && typeof driver.close === 'function') {
    await driver.close();
  }
  holder.instance = null;
}

export const GIGA_AI_TEST_FIXTURE = {
  prefix: FIXTURE_PREFIX,
  postPrefix: FIXTURE_POST_PREFIX,
  systemUserId: GRAPH_SYSTEM_IDS.userGlobal,
  userIds: FIXTURE_USER_IDS,
};
