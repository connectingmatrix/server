import '@giga/shared/test/dom-polyfills';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { AIPostsRepository } from '@connectingmatrix/orm/repositories/ai-posts.repository';
import { AISubjectsRepository } from '@connectingmatrix/orm/repositories/ai-subjects.repository';
import { deleteAiCategoryBranch, deleteAiChannelBranch } from '@giga/tree/services/giga/tree/write/deleteOwnedBranch';
import { Neo4JConnection } from '@giga/general/decorators/runtime/neo';

const originalNeoGetInstance = Neo4JConnection.getInstance;
const originalGetBySubjectIds = AIPostsRepository.prototype.getBySubjectIds;
const originalDeletePostByIds = AIPostsRepository.prototype.deleteByIds;
const originalDeleteSubjectByIds = AISubjectsRepository.prototype.deleteByIds;

afterEach(() => {
  (Neo4JConnection as any).getInstance = originalNeoGetInstance;
  AIPostsRepository.prototype.getBySubjectIds = originalGetBySubjectIds;
  AIPostsRepository.prototype.deleteByIds = originalDeletePostByIds;
  AISubjectsRepository.prototype.deleteByIds = originalDeleteSubjectByIds;
});

test('deleteAiChannelBranch recursively deletes only OWNS/CONTAINS branch and subject/post rows', async () => {
  const calls: Array<{ statement: string; params: Record<string, unknown> }> = [];
  (Neo4JConnection as any).getInstance = async () => ({
    run: async (statement: string, params: Record<string, unknown> = {}) => {
      calls.push({ statement, params });

      if (statement.includes('root IS NOT NULL AS exists')) {
        return [{ exists: true, owns: true, organizationId: '' }];
      }

      if (statement.includes('RETURN [n IN nodes | {id: n.id, labels: labels(n), supabaseId: n.supabaseId}] AS nodes')) {
        return [
          {
            nodes: [
              { id: 'channel-1', labels: ['Channel'] },
              { id: 'category-1', labels: ['Category'] },
              {
                id: 'subject-1',
                labels: ['SubjectRef'],
                supabaseId: 'subject-1',
              },
            ],
          },
        ];
      }

      if (statement.includes('RETURN size(nodes) AS deletedNodeCount')) {
        return [{ deletedNodeCount: 3 }];
      }

      throw new Error(`Unexpected cypher: ${statement}`);
    },
  });

  let capturedSubjectIds: string[] = [];
  let deletedPostIds: string[] = [];
  let deletedSubjectIds: string[] = [];
  AIPostsRepository.prototype.getBySubjectIds = async (subjectIds: string[]) => {
    capturedSubjectIds = subjectIds;
    return [{ id: 'post-1', subject_id: 'subject-1' } as any, { id: 'post-2', subject_id: 'subject-1' } as any];
  };
  AIPostsRepository.prototype.deleteByIds = async (ids: string[]) => {
    deletedPostIds = ids;
    return ids.length;
  };
  AISubjectsRepository.prototype.deleteByIds = async (ids: string[]) => {
    deletedSubjectIds = ids;
    return ids.length;
  };

  const result = await deleteAiChannelBranch({} as any, {
    channelId: 'channel-1',
    userPermissionsId: 'user-1',
  });

  assert.deepEqual(capturedSubjectIds, ['subject-1']);
  assert.deepEqual(deletedPostIds, ['post-1', 'post-2']);
  assert.deepEqual(deletedSubjectIds, ['subject-1']);
  assert.equal(result.deleted, true);
  assert.equal(result.deletedNodeCount, 3);
  assert.equal(result.deletedSubjectCount, 1);
  assert.equal(result.deletedPostCount, 2);

  const traversalQueries = calls.filter((call) => call.statement.includes('CONTAINS_CHANNEL|CONTAINS_CATEGORY|CONTAINS_SUBJECT'));
  assert.ok(traversalQueries.length >= 2);
  traversalQueries.forEach((call) => {
    assert.equal(call.statement.includes('LINKS_'), false);
  });
});

test('deleteAiChannelBranch rejects non-owner deletes', async () => {
  let collectCalled = false;
  (Neo4JConnection as any).getInstance = async () => ({
    run: async (statement: string) => {
      if (statement.includes('root IS NOT NULL AS exists')) {
        return [{ exists: true, owns: false, organizationId: '' }];
      }

      if (statement.includes('count(ownershipPath) > 0 AS owns')) {
        return [{ owns: false }];
      }

      collectCalled = true;
      return [];
    },
  });

  let postsLookupCalled = false;
  AIPostsRepository.prototype.getBySubjectIds = async () => {
    postsLookupCalled = true;
    return [];
  };

  await assert.rejects(
    () =>
      deleteAiChannelBranch({} as any, {
        channelId: 'channel-2',
        userPermissionsId: 'user-2',
      }),
    /do not own/i,
  );

  assert.equal(collectCalled, false);
  assert.equal(postsLookupCalled, false);
});

test('deleteAiCategoryBranch returns deleted=false when category does not exist', async () => {
  let traversalCalled = false;
  (Neo4JConnection as any).getInstance = async () => ({
    run: async (statement: string) => {
      if (statement.includes('root IS NOT NULL AS exists')) {
        return [{ exists: false, owns: false, organizationId: '' }];
      }

      traversalCalled = true;
      return [];
    },
  });

  const result = await deleteAiCategoryBranch({} as any, {
    categoryId: 'missing-category',
    userPermissionsId: 'user-3',
  });

  assert.equal(traversalCalled, false);
  assert.deepEqual(result, {
    deleted: false,
    deletedNodeCount: 0,
    deletedSubjectCount: 0,
    deletedPostCount: 0,
  });
});
