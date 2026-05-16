import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { graphqlRequest } from './activity-log-live.runtime.fixture';
import { expectGraphqlError } from './graphql-e2e-full.fixture';

const CREATE_CHANNEL = `mutation($input: AI_CreateChannelInput!) { gigaCreateChannel(input: $input) { channel { id } } }`;
const CREATE_CATEGORY = `mutation($input: AI_CreateCategoryInput!) { aiCreateCategory(input: $input) { category { id } } }`;
const CREATE_SUBJECT = `mutation($input: CreateAiSubjectInput!) { createAiSubject(input: $input) { id } }`;
const CREATE_POST = `mutation($input: CreateAiPostInput!) { createAiPost(input: $input) { id } }`;
const DELETE_POST = `mutation($id: String!) { deleteAiPost(id: $id) { message } }`;
const DELETE_SUBJECT = `mutation($id: String!) { deleteAiSubject(id: $id) { message } }`;
const DELETE_CATEGORY = `mutation($id: String!) { deleteAiCategory(id: $id) { message } }`;
const DELETE_CHANNEL = `mutation($id: String!) { deleteAiChannel(id: $id) { message } }`;

type OrgMemberInput = {
  memberToken: string;
  organizationId: string;
  rootToken: string;
  url: string;
};

export async function runOrgMemberTreeMatrix(input: OrgMemberInput) {
  const suffix = randomUUID().slice(0, 8);
  const channel = await graphqlRequest<{ gigaCreateChannel: { channel: { id: string } } }>(input.url, input.rootToken, CREATE_CHANNEL, {
    input: {
      organizationId: input.organizationId,
      channel: { id: randomUUID(), name: `e2e-org-channel-${suffix}`, slug: `e2e-org-channel-${suffix}` },
    },
  });
  const created: { categoryId?: string; postId?: string; subjectId?: string } = {};
  try {
    const category = await graphqlRequest<{ aiCreateCategory: { category: { id: string } } }>(input.url, input.memberToken, CREATE_CATEGORY, {
      input: {
        parentChannelId: channel.gigaCreateChannel.channel.id,
        category: { id: randomUUID(), name: `e2e-org-cat-${suffix}`, slug: `e2e-org-cat-${suffix}` },
      },
    });
    created.categoryId = category.aiCreateCategory.category.id;
    const subject = await graphqlRequest<{ createAiSubject: { id: string } }>(input.url, input.memberToken, CREATE_SUBJECT, {
      input: { categoryId: created.categoryId, name: `e2e-org-subject-${suffix}` },
    });
    created.subjectId = subject.createAiSubject.id;
    const post = await graphqlRequest<{ createAiPost: { id: string } }>(input.url, input.memberToken, CREATE_POST, {
      input: { subject_id: created.subjectId, title: `e2e-org-post-${suffix}` },
    });
    created.postId = post.createAiPost.id;
    assert.equal(Boolean(created.postId && created.subjectId && created.categoryId), true);

    await expectGraphqlError({
      url: input.url,
      token: input.memberToken,
      query: DELETE_POST,
      variables: { id: created.postId },
      pattern: /delete|plan|access/i,
    });
    await expectGraphqlError({
      url: input.url,
      token: input.memberToken,
      query: DELETE_SUBJECT,
      variables: { id: created.subjectId },
      pattern: /delete|plan|access/i,
    });
    await expectGraphqlError({
      url: input.url,
      token: input.memberToken,
      query: DELETE_CATEGORY,
      variables: { id: created.categoryId },
      pattern: /delete|plan|access/i,
    });
  } finally {
    await Promise.allSettled([
      created.postId ? graphqlRequest(input.url, input.rootToken, DELETE_POST, { id: created.postId }) : Promise.resolve(),
      created.subjectId ? graphqlRequest(input.url, input.rootToken, DELETE_SUBJECT, { id: created.subjectId }) : Promise.resolve(),
      created.categoryId ? graphqlRequest(input.url, input.rootToken, DELETE_CATEGORY, { id: created.categoryId }) : Promise.resolve(),
      graphqlRequest(input.url, input.rootToken, DELETE_CHANNEL, { id: channel.gigaCreateChannel.channel.id }),
    ]);
  }
}
