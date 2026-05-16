import { Readable } from 'node:stream';
import { SupabaseClient } from '@supabase/supabase-js';
import { Channel } from '@connectingmatrix/orm/repositories/entities/tree/Channel';
import { SubjectEntity } from '@connectingmatrix/orm/repositories/entities/tree/Subject';
import { Post } from '@connectingmatrix/orm/repositories/entities/tree/Post';
import {
  AttachmentEntity,
  ChatEntity,
  ChatMessageEntity,
  ChunkEntity,
  UserEntity,
  UserPreferenceEntity,
} from '@connectingmatrix/orm/repositories/entities';
import { fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { managePostAttachments, removeUploadedAttachmentFiles } from '@giga/tree/services/post/file';
import { ingestAttachment } from '@giga/tree/services/post/ingest-attachment';
import { ingestPost } from '@giga/tree/services/post/ingest-post';
import { buildGettingStartedMarkdown } from './guide-content';
import { renderGettingStartedPdf } from './pdf';
import {
  GENERAL_NAME,
  GETTING_STARTED_ATTACHMENT_MARKDOWN,
  GETTING_STARTED_ATTACHMENT_PDF,
  GETTING_STARTED_AUTO_MESSAGE,
  GETTING_STARTED_CONTENT_VERSION,
  GETTING_STARTED_POST_TITLE,
  GETTING_STARTED_SOURCE,
  SIGNUP_ONBOARDING_PREFERENCE,
} from './constants';
import type { TreeNode } from '@giga/shared/types/contracts/graph.types';

export interface GettingStartedOnboardingPayload {
  autoMessageSent: boolean;
  categoryId: string;
  channelId: string;
  chatId: string;
  contentVersion: string;
  markdownAttachmentId: string | null;
  pdfAttachmentId: string | null;
  postId: string;
  route: string;
  subjectId: string;
}

type OnboardingAttachment = {
  id: string;
  storage_path?: string | null;
  metadata?: { original_file_name?: string | null } | null;
};

type OnboardingPost = {
  id: string;
  metadata?: Record<string, unknown> | null;
  ai_attachments?: OnboardingAttachment[];
};

type OnboardingUser = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;
};

type OnboardingMessageContent = { text?: string | null };

const byName = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase();

function file(buffer: Buffer, originalname: string, mimetype: string): Express.Multer.File {
  return {
    buffer,
    destination: '',
    encoding: '7bit',
    fieldname: 'files',
    filename: originalname,
    mimetype,
    originalname,
    path: '',
    size: buffer.length,
    stream: Readable.from(buffer),
  };
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'getting-started'
  );
}

function direct(nodes: TreeNode[], type: TreeNode['nodeType'], name: string): TreeNode | null {
  return nodes.find((node) => node.nodeType === type && byName(node.name) === byName(name)) || null;
}

function userName(user: OnboardingUser): string {
  return (
    [user.firstName, user.lastName]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ') || String(user.name || user.username || user.email || '').trim()
  );
}

async function loadUser(_supabase: SupabaseClient, userId: string): Promise<OnboardingUser> {
  const user = await UserEntity.single(userId);
  if (!user?.id) throw new Error('Current user was not found.');
  return user.extract() as OnboardingUser;
}

async function ensureWorkspace(supabase: SupabaseClient, userId: string) {
  const user = await loadUser(supabase, userId);
  const channelName = userName(user);
  if (!channelName) throw new Error('Could not resolve the default onboarding channel name.');
  const tree = await fetchUserTree(supabase, { userPermissionsId: userId, includeGlobal: false });
  const existingChannel = direct(tree.user, 'CHANNEL', channelName);
  const newChannelSlug = slug(`${channelName}-${userId.slice(0, 8)}`);
  const channelSlug = existingChannel ? slug(existingChannel.slug || existingChannel.name || channelName) : newChannelSlug;
  const channelId =
    existingChannel?.id ||
    (
      await Channel.create({
        scopeId: userId,
        userPermissionsId: userId,
        channel: { name: channelName, slug: channelSlug, description: 'Personal onboarding workspace.' },
      })
    ).id;
  const existingCategory = direct(existingChannel?.children || [], 'CATEGORY', GENERAL_NAME);
  const newCategorySlug = slug(`${GENERAL_NAME}-${channelId.slice(0, 8)}`);
  const categorySlug = existingCategory ? slug(existingCategory.slug || existingCategory.name || GENERAL_NAME) : newCategorySlug;
  const categoryId =
    existingCategory?.id ||
    (
      await Channel.load(channelId).categories.create({
        name: GENERAL_NAME,
        slug: categorySlug,
        description: 'Default category.',
      })
    ).id;
  if (!categoryId) throw new Error('Could not create the default onboarding category.');
  const existingSubject = direct(existingCategory?.children || [], 'SUBJECT', GENERAL_NAME);
  if (existingSubject?.id) {
    return {
      categoryId,
      categorySlug,
      channelId,
      channelName,
      channelSlug,
      subjectId: existingSubject.id,
      subjectSlug: slug(existingSubject.slug || existingSubject.name || GENERAL_NAME),
    };
  }
  const createdSubject = await SubjectEntity.create({
    name: GENERAL_NAME,
    description: 'Default onboarding subject.',
    metadata: { categoryId, userPermissionsId: userId, attachedByUserPermissionsId: userId },
  });
  const subjectId = createdSubject.id;
  if (!subjectId) throw new Error('Could not create the default onboarding subject.');
  return {
    categoryId,
    categorySlug,
    channelId,
    channelName,
    channelSlug,
    subjectId,
    subjectSlug: slug(GENERAL_NAME),
  };
}

function postRoute(workspace: { channelSlug: string; categorySlug: string; subjectSlug: string }, postId: string): string {
  const subjectPath = `/u/channel/${encodeURIComponent(workspace.channelSlug)}/category/${encodeURIComponent(
    workspace.categorySlug,
  )}/subject/${encodeURIComponent(workspace.subjectSlug)}`;
  return `${subjectPath}/post/${encodeURIComponent(postId)}`;
}

async function findPost(_supabase: SupabaseClient, subjectId: string) {
  const post = await Post.findBySubjectAndTitle(subjectId, GETTING_STARTED_POST_TITLE);
  if (!post) return null;
  return { ...post, ai_attachments: post.ai_attachments || [] };
}

async function cleanupPost(supabase: SupabaseClient, postId: string, attachments: OnboardingAttachment[]) {
  await Promise.allSettled([
    removeUploadedAttachmentFiles(supabase, attachments.map((attachment) => attachment.storage_path).filter(Boolean)),
    ChunkEntity.deleteByPostId(postId),
    AttachmentEntity.deleteMany({ post_id: postId }),
    Post.deleteMany({ id: postId }),
  ]);
}

async function attachMissingFiles(supabase: SupabaseClient, postId: string, markdown: string, attachments: OnboardingAttachment[]) {
  const names = new Set(attachments.map((attachment) => String(attachment.metadata?.original_file_name || '').trim()));
  const files = [];
  if (!names.has(GETTING_STARTED_ATTACHMENT_MARKDOWN)) files.push(file(Buffer.from(markdown), GETTING_STARTED_ATTACHMENT_MARKDOWN, 'text/markdown'));
  if (!names.has(GETTING_STARTED_ATTACHMENT_PDF))
    files.push(file(renderGettingStartedPdf(markdown), GETTING_STARTED_ATTACHMENT_PDF, 'application/pdf'));
  if (!files.length) return attachments;
  const created = await managePostAttachments({
    supabase,
    postId,
    files,
    baseMetadata: { source: GETTING_STARTED_SOURCE, contentVersion: GETTING_STARTED_CONTENT_VERSION },
  });
  try {
    for (const attachment of created) await ingestAttachment(supabase, { attachmentId: attachment.id, replaceExisting: true });
  } catch (error) {
    const createdIds = created.map((attachment) => attachment.id).filter(Boolean);
    await Promise.allSettled([
      removeUploadedAttachmentFiles(supabase, created.map((attachment) => attachment.storage_path).filter(Boolean)),
      AttachmentEntity.deleteMany({ in: { id: createdIds } }),
    ]);
    throw error;
  }
  return [...attachments, ...(created as OnboardingAttachment[])];
}

async function ensurePost(supabase: SupabaseClient, workspace: { channelId: string; channelName: string; categoryId: string; subjectId: string }) {
  const firstMarkdown = buildGettingStartedMarkdown(workspace);
  let post: OnboardingPost | null = await findPost(supabase, workspace.subjectId);
  if (!post) {
    const created = await Post.create({
      subject_id: workspace.subjectId,
      title: GETTING_STARTED_POST_TITLE,
      narrative: firstMarkdown,
      metadata: { source: GETTING_STARTED_SOURCE, contentVersion: GETTING_STARTED_CONTENT_VERSION },
    });
    post = { ...(created.extract() as OnboardingPost), ai_attachments: [] };
    if (!post?.id) throw new Error('Could not create getting started onboarding post.');
    try {
      post.ai_attachments = await attachMissingFiles(supabase, post.id, buildGettingStartedMarkdown({ ...workspace, postId: post.id }), []);
    } catch (error) {
      await cleanupPost(supabase, post.id, post.ai_attachments || []);
      throw error;
    }
    return post;
  }
  const markdown = buildGettingStartedMarkdown({ ...workspace, postId: post.id });
  const postEntity = await Post.single(post.id);
  if (!postEntity) throw new Error('Could not load getting started onboarding post.');
  await postEntity.update({
    narrative: markdown,
    metadata: { ...(post.metadata || {}), source: GETTING_STARTED_SOURCE, contentVersion: GETTING_STARTED_CONTENT_VERSION },
  });
  await ingestPost(supabase, { postId: post.id, replaceExisting: true });
  post.ai_attachments = await attachMissingFiles(supabase, post.id, markdown, post.ai_attachments || []);
  return post;
}

async function savePreference(_supabase: SupabaseClient, userId: string, payload: GettingStartedOnboardingPayload) {
  const now = new Date().toISOString();
  const preferences = {
    channelId: payload.channelId,
    categoryId: payload.categoryId,
    subjectId: payload.subjectId,
    ownWorkspaceReady: true,
    chatReady: true,
    completedAt: now,
    gettingStartedPostId: payload.postId,
    gettingStartedChatId: payload.chatId,
    gettingStartedContentVersion: payload.contentVersion,
    markdownAttachmentId: payload.markdownAttachmentId,
    pdfAttachmentId: payload.pdfAttachmentId,
    autoHelpMessageSentAt: payload.autoMessageSent ? now : null,
  };
  const existing = await UserPreferenceEntity.findByUserAndName(userId, SIGNUP_ONBOARDING_PREFERENCE);
  if (existing?.id) {
    await existing.update({ preferences, updatedAt: now });
    return;
  }
  await UserPreferenceEntity.create({
    createdBy: userId,
    name: SIGNUP_ONBOARDING_PREFERENCE,
    preferences,
    createdAt: now,
    updatedAt: now,
  });
}

export async function ensureGettingStartedOnboarding(supabase: SupabaseClient, userId: string): Promise<GettingStartedOnboardingPayload> {
  const workspace = await ensureWorkspace(supabase, userId);
  const post = await ensurePost(supabase, workspace);
  const existing = await ChatEntity.getScopedSession({ userId, scopeType: 'post', scopeId: post.id });
  const chat =
    existing ||
    (await ChatEntity.ensureSession({
      userId,
      title: GETTING_STARTED_POST_TITLE,
      metadata: { onboarding: true, source: GETTING_STARTED_SOURCE },
      scopeType: 'post',
      scopeId: post.id,
      scopeSnapshot: { type: 'post', id: post.id, subject_id: workspace.subjectId, post_id: post.id },
    }));
  const history = await ChatMessageEntity.listForChat({ chatId: String(chat.id || ''), first: 50, offset: 0 });
  const autoMessageSent = history.records.some((message) => {
    const content = message.content as OnboardingMessageContent | null;
    const text = String(content?.text || message.content || '');
    return message.role === 'user' && text === GETTING_STARTED_AUTO_MESSAGE;
  });
  const attachments = post.ai_attachments || [];
  const markdownAttachmentId =
    attachments.find((attachment) => attachment.metadata?.original_file_name === GETTING_STARTED_ATTACHMENT_MARKDOWN)?.id || null;
  const pdfAttachmentId = attachments.find((attachment) => attachment.metadata?.original_file_name === GETTING_STARTED_ATTACHMENT_PDF)?.id || null;
  const route = postRoute(workspace, post.id);
  const payload = {
    autoMessageSent,
    categoryId: workspace.categoryId,
    channelId: workspace.channelId,
    chatId: String(chat.id || ''),
    contentVersion: GETTING_STARTED_CONTENT_VERSION,
    markdownAttachmentId,
    pdfAttachmentId,
    postId: post.id,
    route,
    subjectId: workspace.subjectId,
  };
  await savePreference(supabase, userId, payload);
  return payload;
}
