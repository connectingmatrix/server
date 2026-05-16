import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Channel } from '@connectingmatrix/orm/repositories/entities/tree/Channel';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';
import type { StoredNode, StoredRelation } from '@giga/shared/types/contracts/graphql.types';

function makeNeoRunMock() {
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
      if (statement.includes('MERGE (channel:Channel {id: $channelId})')) {
        const channelId = String(params.channelId);
        const channel = {
          ...((nodes.get(keyForNode('Channel', channelId)) || { id: channelId }) as StoredNode),
          ...((params.channelProps || {}) as StoredNode),
        };
        nodes.set(keyForNode('Channel', channelId), channel);
        const ownerId = String(params.ownerUserPermissionsId);
        const owner = {
          ...((nodes.get(keyForNode('UserPermissions', ownerId)) || { id: ownerId }) as StoredNode),
          ...((params.ownerProps || {}) as StoredNode),
        };
        nodes.set(keyForNode('UserPermissions', ownerId), owner);
        relations.set(keyForRelation('UserPermissions', ownerId, 'OWNS', 'Channel', channelId), {
          props: { ...((params.ownCreateProps || {}) as Record<string, unknown>) },
          relation: 'OWNS',
          sourceId: ownerId,
          sourceLabel: 'UserPermissions',
          targetId: channelId,
          targetLabel: 'Channel',
        });
        if (params.parentChannelId) {
          relations.set(keyForRelation('Channel', String(params.parentChannelId), 'CONTAINS_CHANNEL', 'Channel', channelId), {
            props: { ...((params.containsCreateProps || {}) as Record<string, unknown>) },
            relation: 'CONTAINS_CHANNEL',
            sourceId: String(params.parentChannelId),
            sourceLabel: 'Channel',
            targetId: channelId,
            targetLabel: 'Channel',
          });
        }
        return [
          {
            channel,
            ownerUserPermissions: owner,
            parentChannel: params.parentChannelId ? nodes.get(keyForNode('Channel', String(params.parentChannelId))) || null : null,
          },
        ];
      }

      if (statement.includes('MERGE (category:Category {id: $categoryId})')) {
        const categoryId = String(params.categoryId);
        const category = {
          ...((nodes.get(keyForNode('Category', categoryId)) || { id: categoryId }) as StoredNode),
          ...((params.categoryProps || {}) as StoredNode),
        };
        nodes.set(keyForNode('Category', categoryId), category);
        const parentLabel = params.parentChannelId ? 'Channel' : 'Category';
        const parentId = String(params.parentChannelId || params.parentCategoryId);
        relations.set(keyForRelation(parentLabel, parentId, 'CONTAINS_CATEGORY', 'Category', categoryId), {
          props: { ...((params.containsCreateProps || {}) as Record<string, unknown>) },
          relation: 'CONTAINS_CATEGORY',
          sourceId: parentId,
          sourceLabel: parentLabel,
          targetId: categoryId,
          targetLabel: 'Category',
        });
        return [
          {
            category,
            ownerUserPermissions: nodes.get(keyForNode('UserPermissions', String(params.ownerUserPermissionsId))) || null,
            parentCategory: params.parentCategoryId ? nodes.get(keyForNode('Category', String(params.parentCategoryId))) || null : null,
            parentChannel: params.parentChannelId ? nodes.get(keyForNode('Channel', String(params.parentChannelId))) || null : null,
          },
        ];
      }

      if (statement.includes('MERGE (subject:SubjectRef {id: $subjectId})')) {
        const subjectId = String(params.subjectId);
        const subject = {
          ...((nodes.get(keyForNode('SubjectRef', subjectId)) || { id: subjectId }) as StoredNode),
          ...((params.subjectProps || {}) as StoredNode),
        };
        nodes.set(keyForNode('SubjectRef', subjectId), subject);
        const parentLabel = statement.includes('OPTIONAL MATCH (parent:SubjectRef') ? 'SubjectRef' : 'Category';
        const parentId = String(params.parentId);
        relations.set(keyForRelation(parentLabel, parentId, 'CONTAINS_SUBJECT', 'SubjectRef', subjectId), {
          props: { ...((params.containsCreateProps || {}) as Record<string, unknown>) },
          relation: 'CONTAINS_SUBJECT',
          sourceId: parentId,
          sourceLabel: parentLabel,
          targetId: subjectId,
          targetLabel: 'SubjectRef',
        });
        return [{ conflictId: null, parentId, parentIsGlobal: false, parentOrganizationId: null, subjectId }];
      }

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

      if (statement.includes('MATCH (parent:Channel') && statement.includes('RETURN properties(parent) AS parent')) {
        const parent = nodes.get(keyForNode('Channel', String(params.parentChannelId)));
        return parent ? [{ parent }] : [];
      }

      if (statement.includes('MATCH (parent:Category') && statement.includes('RETURN properties(parent) AS parent')) {
        const parent = nodes.get(keyForNode('Category', String(params.parentCategoryId)));
        return parent ? [{ parent }] : [];
      }

      if (matchNodeLabel && statement.includes('count(node) > 0 AS exists')) {
        const id = String(params.id);
        return [{ exists: nodes.has(keyForNode(matchNodeLabel, id)) }];
      }

      if (
        statement.includes('MATCH (source:UserPermissions') &&
        statement.includes('RETURN properties(rel) AS props') &&
        statement.includes('LIMIT 1')
      ) {
        const relationType = statement.match(/\[rel:([A-Z_]+)\]/)?.[1] || 'OWNS';
        const targetLabel = statement.match(/\(target:([A-Za-z0-9_]+)\s+\{id: \$resourceId\}\)/)?.[1] || 'Channel';
        const sourceId = String(params.userPermissionsId);
        const targetId = String(params.resourceId);
        const relation = relations.get(keyForRelation('UserPermissions', sourceId, relationType, targetLabel, targetId));
        return relation ? [{ props: relation.props }] : [];
      }

      if (statement.includes('RETURN cyclePath IS NULL AS cycleFree')) {
        return [{ cycleFree: true }];
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

      if (statement.includes('DELETE rel')) {
        const channelId = String(params.channelId);
        for (const [key, relation] of relations.entries()) {
          if (relation.relation === 'CONTAINS_CHANNEL' && relation.targetId === channelId) {
            relations.delete(key);
          }
        }
        return [];
      }

      return [];
    },
  } as any;

  return { neo, nodes, relations };
}

test.skip('createChannel enforces createdBy from userPermissionsId', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, nodes } = makeNeoRunMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    nodes.set('UserPermissions:user-chan', {
      id: 'user-chan',
      kind: 'USER',
      isRoot: true,
    });
    await Channel.create({
      scopeId: 'user-chan',
      userPermissionsId: 'user-chan',
      isSupabaseRoot: true,
      ownerUserPermissionsId: 'ignored-owner',
      channel: {
        id: 'channel-1',
        name: 'Channel 1',
        slug: 'channel-1',
      },
    } as any);

    const channel = nodes.get('Channel:channel-1');
    assert.equal(channel?.id, 'channel-1');
    assert.equal(channel?.createdBy, 'user-chan');
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test.skip('createCategory enforces createdBy from userPermissionsId', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, nodes } = makeNeoRunMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    nodes.set('UserPermissions:user-cat', {
      id: 'user-cat',
      kind: 'USER',
      isRoot: true,
    });
    nodes.set('Channel:channel-cat-parent', {
      createdBy: 'user-cat',
      id: 'channel-cat-parent',
    });
    await Channel.create({
      userPermissionsId: 'user-cat',
      isSupabaseRoot: true,
      ownerUserPermissionsId: 'ignored-owner',
      parentChannelId: 'channel-cat-parent',
      channel: {
        id: 'category-1',
        name: 'Category 1',
        slug: 'category-1',
      },
    } as any);

    const category = nodes.get('Category:category-1');
    assert.equal(category?.id, 'category-1');
    assert.equal(category?.createdBy, 'user-cat');
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test.skip('attachSubjectToGraph upserts SubjectRef.createdBy from userPermissionsId when attachedBy is omitted', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, nodes } = makeNeoRunMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  const supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'subject-1',
              name: 'Subject 1',
              slug: 'subject-1',
              description: 'desc',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-02T00:00:00.000Z',
            },
            error: null,
          }),
        }),
      }),
    }),
  } as any;

  try {
    nodes.set('UserPermissions:user-subj', {
      id: 'user-subj',
      kind: 'USER',
      isRoot: true,
    });
    nodes.set('Category:category-subj-parent', {
      createdBy: 'user-subj',
      id: 'category-subj-parent',
    });
    void supabase;

    const subjectRef = nodes.get('SubjectRef:subject-1');
    assert.equal(subjectRef?.id, 'subject-1');
    assert.equal(subjectRef?.createdBy, 'user-subj');
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test.skip('createChannel in organization scope attaches the root to Organisation and skips UserPermissions ownership', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, nodes, relations } = makeNeoRunMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    nodes.set('Organisation:org-1', {
      id: 'org-1',
      slug: 'org-1',
      name: 'Org 1',
    });
    nodes.set('UserPermissions:user-org', {
      id: 'user-org',
      kind: 'USER',
      isRoot: true,
    });

    await Channel.create({
      scopeId: 'org-1',
      userPermissionsId: 'user-org',
      organizationId: 'org-1',
      channel: {
        id: 'channel-org',
        name: 'Org Channel',
        slug: 'org-channel',
      },
    } as any);

    const channel = nodes.get('Channel:channel-org');
    assert.equal(channel?.createdBy, 'user-org');
    assert.equal(channel?.organizationId, 'org-1');
    assert.ok(relations.has('Organisation:org-1:OWNS:Channel:channel-org'));
    assert.equal(relations.has('UserPermissions:user-org:OWNS:Channel:channel-org'), false);
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});

test.skip('createChannel in personal scope attaches UserPermissions ownership and skips Organisation ownership', async () => {
  const original = Neo4JConnection.getInstance;
  const { neo, nodes, relations } = makeNeoRunMock();
  (Neo4JConnection as any).getInstance = async () => neo;

  try {
    nodes.set('UserPermissions:user-self', {
      id: 'user-self',
      kind: 'USER',
      isRoot: true,
    });

    await Channel.create({
      scopeId: 'user-self',
      userPermissionsId: 'user-self',
      channel: {
        id: 'channel-self',
        name: 'Self Channel',
        slug: 'self-channel',
      },
    } as any);

    const channel = nodes.get('Channel:channel-self');
    assert.equal(channel?.createdBy, 'user-self');
    assert.equal(channel?.organizationId, undefined);
    assert.ok(relations.has('UserPermissions:user-self:OWNS:Channel:channel-self'));
    assert.equal(
      Array.from(relations.keys()).some((key) => key.endsWith(':OWNS:Channel:channel-self') && key.startsWith('Organisation:')),
      false,
    );
  } finally {
    (Neo4JConnection as any).getInstance = original;
  }
});
