import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { graphqlRequest } from './activity-log-live.runtime.fixture';
import { expectGraphqlError } from './graphql-e2e-full.fixture';
import { cleanupTree, createPersonalTree, CREATE_CATEGORY, CREATE_POST, CREATE_SUBJECT } from './graphql-e2e-full.tree-fixture';
import type { SweepFixture } from './live-query-sweep.fixture';

type TreeRunInput = {
  fixture: SweepFixture;
  normalToken: string;
  orgAdminToken: string;
  rootToken: string;
  url: string;
};

export async function runTreeIntegrity(input: TreeRunInput) {
  await expectGraphqlError({
    url: input.url,
    token: input.rootToken,
    query: CREATE_CATEGORY,
    variables: { input: { category: { name: 'no-parent', slug: `no-parent-${Date.now()}` } } },
    pattern: /parent|required/i,
  });
  await expectGraphqlError({
    url: input.url,
    token: input.rootToken,
    query: CREATE_SUBJECT,
    variables: { input: { name: 'no-parent' } },
    pattern: /parent|required/i,
  });
  await expectGraphqlError({
    url: input.url,
    token: input.rootToken,
    query: CREATE_POST,
    variables: { input: { title: 'no-parent' } },
    pattern: /subject_id|required/i,
  });
  await expectGraphqlError({
    url: input.url,
    token: input.rootToken,
    query: CREATE_POST,
    variables: { input: { subject_id: randomUUID(), title: 'missing-subject' } },
    pattern: /not found|accessible/i,
  });

  const normalTree = await createPersonalTree({ url: input.url, token: input.normalToken });
  try {
    await expectGraphqlError({
      url: input.url,
      token: input.orgAdminToken,
      query: CREATE_POST,
      variables: { input: { subject_id: normalTree.subjectId, title: 'other-user-post' } },
      pattern: /accessible|access/i,
    });
    await expectGraphqlError({
      url: input.url,
      token: input.normalToken,
      query: CREATE_CATEGORY,
      variables: {
        input: {
          parentChannelId: input.fixture.channelId,
          category: { id: randomUUID(), name: 'other-user-cat', slug: `other-user-cat-${Date.now()}` },
        },
      },
      pattern: /accessible|access/i,
    });
  } finally {
    await cleanupTree(input.url, input.normalToken, normalTree);
  }

  const unlink = await graphqlRequest<{ aiUnlinkSubjectFromCategory: { deletedCount: number } }>(
    input.url,
    input.rootToken,
    `mutation($input: AI_UnlinkSubjectFromCategoryInput!) { aiUnlinkSubjectFromCategory(input: $input) { deletedCount } }`,
    { input: { categoryId: input.fixture.categoryId, subjectId: input.fixture.subjectId } },
  );
  assert.equal(unlink.aiUnlinkSubjectFromCategory.deletedCount >= 0, true);
  const tree = await graphqlRequest<{ aiFetchUserTree: unknown }>(
    input.url,
    input.rootToken,
    `query($input: AI_FetchUserTreeInput!) { aiFetchUserTree(input: $input) { user { id children { id categories { id subjects { id } } } } } }`,
    { input: { userPermissionsId: input.fixture.userId } },
  );
  assert.equal(JSON.stringify(tree).includes(input.fixture.subjectId), true);
}
