import { randomUUID } from 'node:crypto';
import { graphqlRequest } from './activity-log-live.runtime.fixture';

export const CREATE_CHANNEL = `mutation($input: AI_CreateChannelInput!) { gigaCreateChannel(input: $input) { channel { id } } }`;
export const CREATE_CATEGORY = `mutation($input: AI_CreateCategoryInput!) { aiCreateCategory(input: $input) { category { id } } }`;
export const CREATE_SUBJECT = `mutation($input: CreateAiSubjectInput!) { createAiSubject(input: $input) { id } }`;
export const CREATE_POST = `mutation($input: CreateAiPostInput!) { createAiPost(input: $input) { id } }`;
const DELETE_POST = `mutation($id: String!) { deleteAiPost(id: $id) { message } }`;
const DELETE_SUBJECT = `mutation($id: String!) { deleteAiSubject(id: $id) { message } }`;
const DELETE_CATEGORY = `mutation($id: String!) { deleteAiCategory(id: $id) { message } }`;
const DELETE_CHANNEL = `mutation($id: String!) { deleteAiChannel(id: $id) { message } }`;

export type PersonalTree = {
  categoryId: string;
  channelId: string;
  postId: string;
  subjectId: string;
};

export async function createPersonalTree(input: { token: string; url: string }): Promise<PersonalTree> {
  const suffix = randomUUID().slice(0, 8);
  const channel = await graphqlRequest<{ gigaCreateChannel: { channel: { id: string } } }>(input.url, input.token, CREATE_CHANNEL, {
    input: { channel: { id: randomUUID(), name: `e2e-channel-${suffix}`, slug: `e2e-channel-${suffix}` } },
  });
  const category = await graphqlRequest<{ aiCreateCategory: { category: { id: string } } }>(input.url, input.token, CREATE_CATEGORY, {
    input: {
      parentChannelId: channel.gigaCreateChannel.channel.id,
      category: { id: randomUUID(), name: `e2e-cat-${suffix}`, slug: `e2e-cat-${suffix}` },
    },
  });
  const subject = await graphqlRequest<{ createAiSubject: { id: string } }>(input.url, input.token, CREATE_SUBJECT, {
    input: { categoryId: category.aiCreateCategory.category.id, name: `e2e-subject-${suffix}` },
  });
  const post = await graphqlRequest<{ createAiPost: { id: string } }>(input.url, input.token, CREATE_POST, {
    input: { subject_id: subject.createAiSubject.id, title: `e2e-post-${suffix}` },
  });
  return {
    channelId: channel.gigaCreateChannel.channel.id,
    categoryId: category.aiCreateCategory.category.id,
    subjectId: subject.createAiSubject.id,
    postId: post.createAiPost.id,
  };
}

export async function cleanupTree(url: string, token: string, tree: PersonalTree) {
  await Promise.allSettled([
    graphqlRequest(url, token, DELETE_POST, { id: tree.postId }),
    graphqlRequest(url, token, DELETE_SUBJECT, { id: tree.subjectId }),
    graphqlRequest(url, token, DELETE_CATEGORY, { id: tree.categoryId }),
    graphqlRequest(url, token, DELETE_CHANNEL, { id: tree.channelId }),
  ]);
}
