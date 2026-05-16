import { randomUUID } from 'node:crypto';
import { ensureEntityOrmInstalled } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { AppRootUserEntity } from '@connectingmatrix/orm/repositories/entities/auth/AppRootUserEntity';
import { UserEntity } from '@connectingmatrix/orm/repositories/entities/runtime/UserEntity';
import { ChatEntity } from '@connectingmatrix/orm/repositories/entities/runtime/ChatEntity';
import { createUserSessionHeader, graphqlRequest, startLiveApi, stopLiveApi } from './activity-log-live.runtime.fixture';
import type { ChildProcess } from 'node:child_process';

const CREATE_CHANNEL = `mutation CreateChannel($input: AI_CreateChannelInput!) { gigaCreateChannel(input: $input) { channel { id } } }`;
const CREATE_CATEGORY = `mutation CreateCategory($input: AI_CreateCategoryInput!) { aiCreateCategory(input: $input) { category { id } } }`;
const CREATE_SUBJECT = `mutation CreateSubject($input: CreateAiSubjectInput!) { createAiSubject(input: $input) { id } }`;
const CREATE_POST = `mutation CreatePost($input: CreateAiPostInput!) { createAiPost(input: $input) { id } }`;
const DELETE_POST = `mutation DeletePost($id: String!) { deleteAiPost(id: $id) { message } }`;
const DELETE_SUBJECT = `mutation DeleteSubject($id: String!) { deleteAiSubject(id: $id) { message } }`;
const DELETE_CATEGORY = `mutation DeleteCategory($id: String!) { deleteAiCategory(id: $id) { message } }`;
const DELETE_CHANNEL = `mutation DeleteChannel($id: String!) { deleteAiChannel(id: $id) { message } }`;

export type SweepFixture = {
  userId: string;
  email: string;
  organizationId: string | null;
  channelId: string;
  categoryId: string;
  subjectId: string;
  postId: string;
  chatId: string;
};

async function login() {
  await ensureEntityOrmInstalled();
  const rootIdentity = await GigaORM.run({ caller: { id: 'live-query-sweep', type: 'root' } }, () =>
    AppRootUserEntity.find({ is_active: true }).select('user_id,email').single(),
  );
  const rootUserId = String(rootIdentity?.user_id || '').trim();
  const rootEmail = String(rootIdentity?.email || '').trim();
  const user = await GigaORM.run({ caller: { id: 'live-query-sweep', type: 'root' } }, () =>
    UserEntity.find({ id: rootUserId }).select('id,email').single(),
  );
  const userId = String(user?.id || rootUserId).trim();
  const email = String(user?.email || rootEmail).trim();
  if (!userId || !email) throw new Error('Could not resolve an active root user for live query sweep bootstrap.');
  const accessToken = await createUserSessionHeader(userId, email);
  return { token: { access_token: accessToken }, profile: { id: userId, email } };
}

export async function bootLiveSweep(
  port: number,
): Promise<{ cleanup: () => Promise<void>; fixture: SweepFixture; server: ChildProcess | null; token: string; url: string }> {
  const server = await startLiveApi(port);
  const url = `http://localhost:${port}/api/v2/graphql`;
  const rich = await login();
  const userId = String(rich.profile.id || '').trim();
  const email = String(rich.profile.email || '').trim();
  const token = rich.token.access_token;
  const run = async <T>(label: string, query: string, variables: Record<string, unknown>): Promise<T> => {
    try {
      return await graphqlRequest<T>(url, token, query, variables);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${label}: ${message}`);
    }
  };
  const suffix = randomUUID().slice(0, 8);
  const channelId = randomUUID();
  const channel = await run<{ gigaCreateChannel: { channel: { id: string } } }>('create-channel', CREATE_CHANNEL, {
    input: { channel: { id: channelId, name: `live-sweep-${suffix}`, slug: `live-sweep-${suffix}` } },
  });
  const categoryId = randomUUID();
  const category = await run<{ aiCreateCategory: { category: { id: string } } }>('create-category', CREATE_CATEGORY, {
    input: {
      parentChannelId: channel.gigaCreateChannel.channel.id,
      category: { id: categoryId, name: `live-sweep-cat-${suffix}`, slug: `live-sweep-cat-${suffix}` },
    },
  });
  const subject = await run<{ createAiSubject: { id: string } }>('create-subject', CREATE_SUBJECT, {
    input: { categoryId: category.aiCreateCategory.category.id, name: `live-sweep-sub-${suffix}`, description: 'Live query sweep subject.' },
  });
  const post = await run<{ createAiPost: { id: string } }>('create-post', CREATE_POST, {
    input: { subject_id: subject.createAiSubject.id, title: `live-sweep-post-${suffix}`, narrative: 'Live query sweep post.' },
  });
  const chat = await GigaORM.run({ caller: { id: 'live-query-sweep', type: 'root' } }, () =>
    ChatEntity.ensureSession({
      userId,
      title: `live-sweep-chat-${suffix}`,
      metadata: { source: 'live-query-sweep' },
      scopeType: 'post',
      scopeId: post.createAiPost.id,
      scopeSnapshot: { type: 'post', id: post.createAiPost.id, subject_id: subject.createAiSubject.id, post_id: post.createAiPost.id },
    }),
  );
  const chatId = String(chat.id || '').trim();
  if (!chatId) throw new Error('Could not create live query sweep chat session.');
  const fixture: SweepFixture = {
    userId,
    email,
    organizationId: null,
    channelId: channel.gigaCreateChannel.channel.id,
    categoryId: category.aiCreateCategory.category.id,
    subjectId: subject.createAiSubject.id,
    postId: post.createAiPost.id,
    chatId,
  };
  const cleanup = async () => {
    await Promise.allSettled([
      graphqlRequest(url, token, DELETE_POST, { id: fixture.postId }),
      graphqlRequest(url, token, DELETE_SUBJECT, { id: fixture.subjectId }),
      graphqlRequest(url, token, DELETE_CATEGORY, { id: fixture.categoryId }),
      graphqlRequest(url, token, DELETE_CHANNEL, { id: fixture.channelId }),
    ]);
    await stopLiveApi(server);
  };
  return { cleanup, fixture, server, token, url };
}
