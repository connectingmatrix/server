import { randomUUID } from 'crypto';
import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { BookmarkEntity } from '@connectingmatrix/orm/repositories/entities';
import { GraphqlCustomResolverModule, getResolverAuthContext } from './base';
import type { BookmarkTargetType } from '@connectingmatrix/orm/repositories/entities/runtime/BookmarkEntity';
import type { GraphqlResolverContext } from '@giga/shared/types';

type BookmarkInput = {
  categoryId?: string | null;
  channelId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  name: string;
  postId?: string | null;
  subjectId?: string | null;
  targetId: string;
  targetType: BookmarkTargetType;
};

type BookmarksInput = {
  limit?: number | null;
  offset?: number | null;
  targetType?: BookmarkTargetType | null;
};

const requiredText = (value: string | null | undefined, label: string) => {
  const text = String(value || '').trim();
  if (!text) throw new BadRequestError(`${label} is required.`);
  return text;
};

const assertTargetShape = (input: BookmarkInput) => {
  const targetId = requiredText(input.targetId, 'Bookmark targetId');
  const channelId = input.channelId ? requiredText(input.channelId, 'Bookmark channelId') : null;
  const categoryId = input.categoryId ? requiredText(input.categoryId, 'Bookmark categoryId') : null;
  const subjectId = input.subjectId ? requiredText(input.subjectId, 'Bookmark subjectId') : null;
  const postId = input.postId ? requiredText(input.postId, 'Bookmark postId') : null;

  if (input.targetType === 'CHANNEL' && channelId !== targetId) throw new BadRequestError('CHANNEL bookmark requires channelId to match targetId.');
  if (input.targetType === 'CATEGORY' && (!channelId || categoryId !== targetId))
    throw new BadRequestError('CATEGORY bookmark requires channelId and matching categoryId.');
  if (input.targetType === 'SUBJECT' && (!channelId || !categoryId || subjectId !== targetId)) {
    throw new BadRequestError('SUBJECT bookmark requires channelId, categoryId, and matching subjectId.');
  }
  if (input.targetType === 'POST' && (!channelId || !categoryId || !subjectId || postId !== targetId)) {
    throw new BadRequestError('POST bookmark requires channelId, categoryId, subjectId, and matching postId.');
  }

  return { targetId, channelId, categoryId, subjectId, postId };
};

@Service()
export class BookmarkResolver extends GraphqlCustomResolverModule {
  @resolver('bookmarks', GraphQLOperationType.QUERY)
  async bookmarks({ input }: { input?: BookmarksInput } = {}, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const limit = Math.min(Math.max(Math.floor(Number(input?.limit ?? 50)), 1), 200);
    const offset = Math.max(Math.floor(Number(input?.offset ?? 0)), 0);
    let query = BookmarkEntity.find({ user_id: userId });
    if (input?.targetType) query = query.where({ target_type: input.targetType });
    const result = await query.orderBy('created_at', 'desc').limit(limit).offset(offset).manyWithCount();
    return { data: result.records.map((row) => row.extract()), count: result.count, limit, offset };
  }

  @resolver('createBookmark', GraphQLOperationType.MUTATION)
  async createBookmark({ input }: { input: BookmarkInput }, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const ids = assertTargetShape(input);
    const now = new Date().toISOString();
    return BookmarkEntity.create({
      id: randomUUID(),
      user_id: userId,
      target_type: input.targetType,
      target_id: ids.targetId,
      channel_id: ids.channelId,
      category_id: ids.categoryId,
      subject_id: ids.subjectId,
      post_id: ids.postId,
      name: requiredText(input.name, 'Bookmark name'),
      description: input.description ?? null,
      metadata: input.metadata ?? {},
      created_at: now,
      updated_at: now,
    });
  }

  @resolver('deleteBookmark', GraphQLOperationType.MUTATION)
  async deleteBookmark({ id }: { id: string }, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const bookmark = await BookmarkEntity.find({ id, user_id: userId }).single();
    if (!bookmark) throw new BadRequestError('Bookmark not found.');
    await bookmark.delete();
    return { message: `Bookmark ${id} deleted successfully` };
  }
}
