import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import {
  AiAttachmentRecord,
  AiPostRecord,
  AiPostsBySubjectsArgs,
  AILinkPostToSubjectArgs,
  AIUpdatePostArgs,
  CreateAiPostArgs,
  DeleteAiPostArgs,
  GraphqlResolverContext,
} from '@giga/shared/types';
import { Service } from 'typedi';
import { PostEntity } from '@connectingmatrix/orm/repositories/entities/tree/Post';
import { getPostsBySubjectIds } from '@giga/tree/services/post/get-posts-by-subject-ids';
import { requirePostWrite, requireSubjectWrite } from '../auth/tree-access';
import { connection, getResolverAuthContext, GraphqlCustomResolverModule } from './base';

@Service()
export class PostResolver extends GraphqlCustomResolverModule {
  @resolver('aiReadPost', GraphQLOperationType.QUERY)
  async aiReadPost({ input }: { input: { id: string } }, context: GraphqlResolverContext): Promise<AiPostRecord | null> {
    await getResolverAuthContext(context);
    const id = String(input.id || '').trim();
    if (!id) return null;
    const row = await PostEntity.single(id);
    if (!row) return null;
    const post = row.extract() as AiPostRecord;
    return {
      ...post,
      ai_attachmentsCollection: connection(
        (post.ai_attachments || []).map(
          (attachment): AiAttachmentRecord => ({
            ...attachment,
          }),
        ),
      ),
    };
  }

  @resolver('aiReadAttachments', GraphQLOperationType.QUERY)
  async aiReadAttachments(
    { input }: { input: { post_id: string; attachment_id?: string | null } },
    context: GraphqlResolverContext,
  ): Promise<AiAttachmentRecord[]> {
    await getResolverAuthContext(context);
    const postId = String(input.post_id || '').trim();
    if (!postId) return [];
    const attachments = await PostEntity.load(postId).attachments.list(undefined, { orderBy: 'created_at', ascending: true });
    const attachmentId = String(input.attachment_id || '').trim();
    return attachments
      .filter((row) => !attachmentId || String(row.id || '') === attachmentId)
      .map(
        (row): AiAttachmentRecord => ({
          ...(row.extract() as AiAttachmentRecord),
        }),
      );
  }

  @resolver('aiUpdatePost', GraphQLOperationType.MUTATION)
  async aiUpdatePost({ input }: AIUpdatePostArgs, context: GraphqlResolverContext): Promise<AiPostRecord | null> {
    const id = String(input?.id || '').trim();
    if (!id) throw new Error('Post id is required.');
    await requirePostWrite(context, id);
    if (input.subject_id !== undefined) await requireSubjectWrite(context, String(input.subject_id || ''));
    const result = await PostEntity.load(id).update({
      ...(input.subject_id !== undefined ? { subject_id: input.subject_id } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.narrative !== undefined ? { narrative: input.narrative } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Record<string, unknown> } : {}),
    });
    return result.extract() as AiPostRecord;
  }

  @resolver('deleteAiPost', GraphQLOperationType.MUTATION)
  async deleteAiPost({ id }: DeleteAiPostArgs, context: GraphqlResolverContext) {
    const post = await requirePostWrite(context, id);
    await post.delete();
    return {
      message: `Post ${id} deleted successfully`,
    };
  }

  @resolver('aiLinkPostToSubject', GraphQLOperationType.MUTATION)
  async aiLinkPostToSubject({ input }: AILinkPostToSubjectArgs, context: GraphqlResolverContext): Promise<AiPostRecord | null> {
    await requirePostWrite(context, input.post_id);
    await requireSubjectWrite(context, input.subject_id);
    const post = await PostEntity.load(input.post_id).update({ subject_id: input.subject_id });
    return post.extract() as AiPostRecord;
  }

  @resolver('createAiPost', GraphQLOperationType.MUTATION)
  async createAiPost(
    { input: { subject_id, title, narrative, metadata }, files }: CreateAiPostArgs,
    context: GraphqlResolverContext,
  ): Promise<AiPostRecord | null> {
    await requireSubjectWrite(context, subject_id);
    void files;
    const createdPost = (
      await PostEntity.create({
        subject_id,
        title,
        narrative: narrative || null,
        metadata: (metadata as Record<string, unknown>) || {},
      })
    ).extract() as AiPostRecord | null;
    if (!createdPost) return null;

    return {
      ...createdPost,
      ai_attachmentsCollection: connection([] as AiAttachmentRecord[]),
    };
  }

  @resolver('aiPostsBySubjects', GraphQLOperationType.QUERY)
  async aiPostsBySubjects({ input: { subject_id, subject_ids } }: AiPostsBySubjectsArgs, context: GraphqlResolverContext): Promise<AiPostRecord[]> {
    const subjectIds = Array.from(new Set([subject_id || undefined, ...(subject_ids || [])])).filter(
      (value): value is string => typeof value === 'string',
    );

    const result = await getPostsBySubjectIds(context.supabase, subjectIds);
    if (result?.error) throw result.error;

    return ((result?.data ?? []) as AiPostRecord[]).map((post) => ({
      ...post,
      ai_attachmentsCollection: connection(
        (post.ai_attachments ?? []).map(
          (attachment): AiAttachmentRecord => ({
            ...attachment,
          }),
        ),
      ),
    }));
  }
}
