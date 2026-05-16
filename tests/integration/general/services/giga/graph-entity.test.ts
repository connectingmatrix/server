import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import test from 'node:test';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { ACCESS_RELATIONS, GRAPH_LABELS, STRUCTURAL_RELATIONS } from '@giga/shared/types/contracts/graph.types';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import type { StoredNode, StoredRelation } from '@giga/shared/types/contracts/graphql.types';

function makeGraphHarness(options: { cycleFree?: boolean; treeGraph?: any } = {}) {
  const calls: Array<{ statement: string; params: Record<string, unknown> }> = [];
  const nodes = new Map<string, StoredNode>();
  const relations = new Map<string, StoredRelation>();

  const keyForNode = (label: string, id: string) => `${label}:${id}`;
  const keyForRelation = (sourceLabel: string, sourceId: string, relation: string, targetLabel: string, targetId: string) =>
    `${sourceLabel}:${sourceId}:${relation}:${targetLabel}:${targetId}`;

  const extractLabel = (statement: string, marker: string) => {
    const regex = new RegExp(`${marker}:([A-Za-z0-9_]+)`);
    return statement.match(regex)?.[1] || null;
  };

  const neo = {
    run: async (statement: string, params: Record<string, unknown> = {}) => {
      calls.push({ statement, params });

      const mergeNodeLabel = extractLabel(statement, 'MERGE \\(node');
      if (mergeNodeLabel && statement.includes('SET node += $props')) {
        const id = String(params.id);
        const props = (params.props || {}) as Record<string, unknown>;
        const existing = nodes.get(keyForNode(mergeNodeLabel, id)) || { id };
        const merged = {
          ...existing,
          ...props,
          id,
        };
        nodes.set(keyForNode(mergeNodeLabel, id), merged);
        return [{ props: merged }];
      }

      const matchNodeLabel = extractLabel(statement, 'MATCH \\(node');
      if (matchNodeLabel && statement.includes('RETURN properties(node) AS props') && !statement.includes('count(node) > 0 AS exists')) {
        const id = String(params.id);
        const node = nodes.get(keyForNode(matchNodeLabel, id));
        return node ? [{ props: node }] : [];
      }

      if (matchNodeLabel && statement.includes('count(node) > 0 AS exists')) {
        const id = String(params.id);
        return [{ exists: nodes.has(keyForNode(matchNodeLabel, id)) }];
      }

      if (statement.includes('RETURN cyclePath IS NULL AS cycleFree')) {
        return [{ cycleFree: options.cycleFree !== false }];
      }

      if (statement.includes('MERGE (source)-[rel:')) {
        const relationType = statement.match(/\[rel:([A-Z_]+)\]/)?.[1];
        const sourceLabel = statement.match(/MATCH \(source:([A-Za-z0-9_]+)\s+\{id: \$sourceId\}\)/)?.[1] || 'UnknownSource';
        const targetLabel = statement.match(/MATCH \(target:([A-Za-z0-9_]+)\s+\{id: \$targetId\}\)/)?.[1] || 'UnknownTarget';
        const sourceId = String(params.sourceId);
        const targetId = String(params.targetId);
        const relationKey = keyForRelation(sourceLabel, sourceId, relationType || 'REL', targetLabel, targetId);
        const existing = relations.get(relationKey);
        const onCreateProps = (params.onCreateProps || {}) as Record<string, unknown>;
        const onMatchProps = (params.onMatchProps || {}) as Record<string, unknown>;

        if (existing) {
          existing.props = {
            ...existing.props,
            ...onMatchProps,
          };
          relations.set(relationKey, existing);
          return [{ props: existing.props }];
        }

        const created: StoredRelation = {
          sourceLabel,
          sourceId,
          relation: relationType || 'REL',
          targetLabel,
          targetId,
          props: { ...onCreateProps },
        };
        relations.set(relationKey, created);
        return [{ props: created.props }];
      }

      if (statement.includes('WITH collect(rel) AS rels') && statement.includes('DELETE rel')) {
        const relationType = statement.match(/\[rel:([A-Z_]+)\]/)?.[1];
        const sourceLabel = statement.match(/MATCH \(source:([A-Za-z0-9_]+)\s+\{id: \$sourceId\}\)/)?.[1] || 'UnknownSource';
        const targetLabel = statement.match(/\(target:([A-Za-z0-9_]+)\s+\{id: \$targetId\}\)/)?.[1] || 'UnknownTarget';
        const relationKey = keyForRelation(sourceLabel, String(params.sourceId), relationType || 'REL', targetLabel, String(params.targetId));
        const deletedCount = relations.delete(relationKey) ? 1 : 0;
        return [{ deletedCount }];
      }

      if (statement.includes('RETURN {id: root.id, labels: labels(root), props: properties(root)} AS node')) {
        if (options.treeGraph) {
          const rootId = String(params.rootId);
          const rootNode = options.treeGraph.nodes.find((node: any) => node.id === rootId);
          return rootNode ? [{ node: rootNode }] : [];
        }
        return [];
      }

      if (statement.includes('MATCH (node)-[rel]->(child)')) {
        if (!options.treeGraph) return [];
        const frontierIds = new Set((params.frontierIds as string[]) || []);
        const nodeById = new Map(options.treeGraph.nodes.map((node: any) => [node.id, node]));
        return options.treeGraph.edges
          .filter((edge: any) => frontierIds.has(edge.sourceId) && nodeById.has(edge.targetId))
          .map((edge: any) => ({
            node: nodeById.get(edge.targetId),
            edge,
          }));
      }

      if (matchNodeLabel && statement.includes('WITH collect(node) AS nodes')) {
        const id = String(params.id);
        const nodeKey = keyForNode(matchNodeLabel, id);
        const exists = nodes.has(nodeKey);
        if (exists) {
          nodes.delete(nodeKey);
          for (const [relationKey, relation] of relations.entries()) {
            if (relation.sourceId === id || relation.targetId === id) {
              relations.delete(relationKey);
            }
          }
        }
        return [{ deletedCount: exists ? 1 : 0 }];
      }

      return [];
    },
  } as any;

  return { neo, calls, nodes, relations };
}

test('GraphEntity commit MERGEs by id and updates properties', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness();
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const first = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'c-1',
        name: 'First',
        slug: 'first',
      },
    });
    await first.commit();

    const second = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'c-1',
        name: 'Updated',
        slug: 'first',
        description: 'updated description',
      },
    });
    await second.commit();

    const loaded = await second.load();
    assert.equal(loaded?.id, 'c-1');
    assert.equal(loaded?.name, 'Updated');
    assert.equal(loaded?.description, 'updated description');
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('GraphEntity relation upsert normalizes nullable props and preserves createdAt on match', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness();
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const user = new GraphEntity({
      type: GRAPH_LABELS.userPermissions,
      data: {
        id: 'u-1',
        kind: 'USER',
      },
    });
    const channel = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'c-1',
        name: 'Channel',
        slug: 'channel',
      },
    });
    await user.commit();
    await channel.commit();

    user.createRelation(channel, {
      relation: ACCESS_RELATIONS.canAccess,
      properties: {
        read: true,
        write: true,
        recursive: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        availableFrom: null,
        availableTo: undefined,
      },
    });
    await user.commit();

    user.createRelation(channel, {
      relation: ACCESS_RELATIONS.canAccess,
      properties: {
        read: true,
        write: false,
        recursive: false,
        createdAt: '2030-01-01T00:00:00.000Z',
      },
    });
    await user.commit();

    const relation = Array.from(harness.relations.values()).find(
      (value) => value.relation === ACCESS_RELATIONS.canAccess && value.sourceId === 'u-1' && value.targetId === 'c-1',
    );
    assert.ok(relation, 'expected CAN_ACCESS relation to exist');
    assert.equal('availableFrom' in (relation?.props || {}), false);
    assert.equal('availableTo' in (relation?.props || {}), false);
    assert.equal(relation?.props.createdAt, '2026-01-01T00:00:00.000Z');
    assert.equal(relation?.props.write, false);
    assert.equal(relation?.props.recursive, false);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('GraphEntity subject category attach uses CONTAINS_SUBJECT while unlink preserves hierarchy', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness();
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const category = new GraphEntity({
      type: GRAPH_LABELS.category,
      data: {
        id: 'cat-1',
        name: 'Category',
        slug: 'category',
      },
    });
    await category.commit();
    await category.linkSubjectToCategory({ subjectId: 'sub-1', createdByUserPermissionsId: 'user-1' });

    const subject = new GraphEntity({ type: GRAPH_LABELS.subjectRef, data: { id: 'sub-1', supabaseId: 'sub-1' } });
    assert.equal(
      Array.from(harness.relations.values()).some((relation) => relation.relation === STRUCTURAL_RELATIONS.containsSubject),
      true,
    );
    assert.equal(
      Array.from(harness.relations.values()).some((relation) => relation.relation === STRUCTURAL_RELATIONS.links),
      false,
    );

    const deletedLinks = await category.deleteRelation(subject, { relation: STRUCTURAL_RELATIONS.links, direction: 'out' });
    assert.equal(deletedLinks, 0);

    assert.equal(
      Array.from(harness.relations.values()).some((relation) => relation.relation === STRUCTURAL_RELATIONS.links),
      false,
    );
    assert.equal(
      Array.from(harness.relations.values()).some((relation) => relation.relation === STRUCTURAL_RELATIONS.containsSubject),
      true,
    );
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('GraphEntity rejects channel cycle creation when assertCycle is enabled', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness({ cycleFree: false });
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const parent = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'parent',
        name: 'Parent',
        slug: 'parent',
      },
    });
    const child = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'child',
        name: 'Child',
        slug: 'child',
      },
    });
    await parent.commit();
    await child.commit();

    parent.createRelation(child, {
      relation: STRUCTURAL_RELATIONS.links,
      assertCycle: true,
    });

    await assert.rejects(() => parent.commit(), /would create a cycle/i);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('GraphEntity fetchTree applies include/relations filters and projects DAG paths', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness({
    treeGraph: {
      nodes: [
        {
          id: 'root',
          labels: ['Channel'],
          props: { id: 'root', name: 'Root', slug: 'root' },
        },
        {
          id: 'cat-a',
          labels: ['Category'],
          props: { id: 'cat-a', name: 'A', slug: 'a' },
        },
        {
          id: 'cat-b',
          labels: ['Category'],
          props: { id: 'cat-b', name: 'B', slug: 'b' },
        },
        {
          id: 'sub-1',
          labels: ['SubjectRef'],
          props: { id: 'sub-1', name: 'Sub', slug: 'sub' },
        },
      ],
      edges: [
        {
          sourceId: 'root',
          targetId: 'cat-a',
          type: 'CONTAINS_CATEGORY',
          props: {},
        },
        {
          sourceId: 'root',
          targetId: 'cat-b',
          type: 'CONTAINS_CATEGORY',
          props: {},
        },
        {
          sourceId: 'cat-a',
          targetId: 'sub-1',
          type: 'CONTAINS_SUBJECT',
          props: {},
        },
        {
          sourceId: 'cat-b',
          targetId: 'sub-1',
          type: 'CONTAINS_SUBJECT',
          props: {},
        },
      ],
    },
  });
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const root = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'root',
      },
    });

    const tree = await root.fetchTree({
      include: [GRAPH_LABELS.channel, GRAPH_LABELS.category, GRAPH_LABELS.subjectRef],
      relations: [STRUCTURAL_RELATIONS.containsCategory, STRUCTURAL_RELATIONS.containsSubject],
    });

    const fetchGraphCall = harness.calls.find((call) => call.statement.includes('MATCH (node)-[rel]->(child)'));
    assert.ok(fetchGraphCall, 'expected fetchTree graph query');
    assert.deepEqual(fetchGraphCall?.params.include, [GRAPH_LABELS.channel, GRAPH_LABELS.category, GRAPH_LABELS.subjectRef]);
    assert.deepEqual(fetchGraphCall?.params.relations, [STRUCTURAL_RELATIONS.containsCategory, STRUCTURAL_RELATIONS.containsSubject]);

    assert.equal(tree.id, 'root');
    assert.equal(tree.children.length, 2);
    assert.equal(tree.children[0].children[0].id, 'sub-1');
    assert.equal(tree.children[1].children[0].id, 'sub-1');
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test('GraphEntity delete removes node from graph and returns deleted count', async () => {
  const original = Neo4JConnection.getInstance;
  const harness = makeGraphHarness();
  (Neo4JConnection as any).getInstance = async () => harness.neo;

  try {
    const channel = new GraphEntity({
      type: GRAPH_LABELS.channel,
      data: {
        id: 'delete-me',
        name: 'Delete Me',
        slug: 'delete-me',
      },
    });
    await channel.commit();

    const deletedCount = await channel.delete();
    assert.equal(deletedCount, 1);
    assert.equal(await channel.exists(), false);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});
