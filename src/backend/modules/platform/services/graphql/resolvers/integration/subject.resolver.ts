import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import {
  AIAttachSubjectToGraphArgs,
  AIAttachUserPermissionsArgs,
  AILinkSubjectToCategoryArgs,
  AIUpdateSubjectArgs,
  AiSubjectRecord,
  AiSubjectTagRecord,
  CreateAiSubjectArgs,
  DeleteAiSubjectArgs,
  GraphqlResolverContext,
  ResolveSubjectsArgs,
} from '@giga/shared/types';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { invalidateGraphqlCache } from '@giga/shared/cache';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { CategoryEntity } from '@connectingmatrix/orm/repositories/entities/tree/Category';
import { SubjectEntity } from '@connectingmatrix/orm/repositories/entities/tree/Subject';
import { resolveSubjectIds } from '@giga/tree/services/giga/tree/subject/resolve-subject-ids';
import { GRAPH_LABELS, GRAPH_RELATIONS, type DataRecord } from '@giga/shared/types/contracts/graph.types';
import { attachUserPermissions } from '@giga/general/services/giga/auth/attach-user-permissions';
import { requireCategoryWrite, requireSubjectWrite } from '../auth/tree-access';
import { connection, getResolverAuthContext, GraphqlCustomResolverModule } from './base';

@Service()
export class SubjectResolver extends GraphqlCustomResolverModule {
  @resolver('aiUpdateSubject', GraphQLOperationType.MUTATION)
  async aiUpdateSubject({ input }: AIUpdateSubjectArgs, context: GraphqlResolverContext): Promise<AiSubjectRecord | null> {
    await getResolverAuthContext(context);
    const id = String(input?.id || '').trim();
    if (!id) throw new Error('Subject id is required.');
    await requireSubjectWrite(context, id);
    const result = await SubjectEntity.load(id).update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata as Record<string, unknown> } : {}),
    });
    invalidateGraphqlCache(['tree:']);
    return result.extract() as AiSubjectRecord;
  }

  @resolver('createAiSubject', GraphQLOperationType.MUTATION)
  async createAiSubject(
    { input: { name, categoryId, parentSubjectId, description, metadata, summary } }: CreateAiSubjectArgs,
    context: GraphqlResolverContext,
  ): Promise<AiSubjectRecord | null> {
    await getResolverAuthContext(context);
    if (Boolean(categoryId) === Boolean(parentSubjectId)) {
      throw new BadRequestError('Exactly one subject parent is required.');
    }
    if (categoryId) await requireCategoryWrite(context, categoryId);
    if (parentSubjectId) await requireSubjectWrite(context, parentSubjectId);
    const payload = { name, description: description || null, metadata: (metadata || {}) as Record<string, unknown>, summary: summary || null };
    const created = categoryId
      ? await CategoryEntity.load(categoryId).subjects.create(payload)
      : await SubjectEntity.load(String(parentSubjectId || '')).subjects.create(payload);
    const createdSubject = created.extract() as AiSubjectRecord | null;
    if (!createdSubject) return null;

    invalidateGraphqlCache(['tree:']);

    return {
      ...createdSubject,
      ai_subject_tagsCollection: connection(
        (createdSubject.ai_subject_tags ?? []).map(
          (row): AiSubjectTagRecord => ({
            subject_id: createdSubject.id || null,
            tag_id: row.tag_id || row.ai_tags?.id || null,
            created_at: row.created_at || null,
            ai_tags: row.ai_tags || null,
          }),
        ),
      ),
    };
  }

  @resolver('resolveSubjects', GraphQLOperationType.QUERY)
  async resolveSubjects({ input }: ResolveSubjectsArgs = {}, context: GraphqlResolverContext) {
    const { subject_id, subject_ids, tag_slugs, subject_query } = input || {};
    const resolved = await resolveSubjectIds(context.supabase, {
      subjectId: subject_id || undefined,
      subjectIds: subject_ids || undefined,
      tagSlugs: tag_slugs || undefined,
      subjectQuery: subject_query || undefined,
    });

    return {
      subject_ids: resolved.subjectIds || null,
      filter_applied: resolved.filterApplied,
    };
  }

  @resolver('deleteAiSubject', GraphQLOperationType.MUTATION)
  async deleteAiSubject({ id }: DeleteAiSubjectArgs, context: GraphqlResolverContext) {
    const subject = await requireSubjectWrite(context, id);
    if (!subject) {
      return {
        message: `No subject found for id ${id}`,
      };
    }
    await subject.delete();

    invalidateGraphqlCache(['tree:']);

    return {
      message: `Subject ${id} deleted successfully`,
    };
  }

  @resolver('aiAttachSubjectToGraph', GraphQLOperationType.MUTATION)
  async aiAttachSubjectToGraph({ input }: AIAttachSubjectToGraphArgs, context: GraphqlResolverContext) {
    return this.aiAttachSubjectNode(
      {
        input: {
          subjectId: input.subjectId,
          categoryId: input.categoryId || null,
          parentSubjectId: null,
        },
      },
      context,
    );
  }

  @resolver('aiAttachSubjectNode', GraphQLOperationType.MUTATION)
  async aiAttachSubjectNode(
    { input }: { input: { subjectId: string; categoryId?: string | null; parentSubjectId?: string | null } },
    context: GraphqlResolverContext,
  ) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    void effectiveRoot;
    const graph = new GraphEntity({
      type: GRAPH_LABELS.subjectRef,
      data: { id: input.subjectId, supabaseId: input.subjectId } as DataRecord,
    });
    const payload = await graph.attachSubjectToGraph({
      categoryId: input.categoryId || null,
      parentSubjectId: input.parentSubjectId || null,
      attachedByUserPermissionsId: userId,
      createdByUserPermissionsId: userId,
    });
    const subject = await SubjectEntity.single(payload.subjectId);

    invalidateGraphqlCache(['tree:']);

    return {
      categoryId: payload.categoryId || input.categoryId,
      parentSubjectId: payload.parentSubjectId || input.parentSubjectId || null,
      subjectId: payload.subjectId,
      category: null,
      subject: subject ? (subject.extract() as AiSubjectRecord) : null,
    };
  }

  @resolver('aiAttachUserPermissions', GraphQLOperationType.MUTATION)
  async aiAttachUserPermissions({ input }: AIAttachUserPermissionsArgs, context: GraphqlResolverContext) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    if (input.userPermissionsType.toUpperCase() === 'ORGANIZATION' && !effectiveRoot) {
      throw new BadRequestError('Only root users can attach organization-scoped permissions.');
    }
    const payload = await attachUserPermissions({
      ...input,
      permissions: {
        ...input.permissions,
        grantedByUserPermissionsId: userId,
      },
      userPermissionsId: userId,
    });
    return {
      ...payload,
      userPermissions: null,
      resource: null,
    };
  }

  @resolver('aiLinkSubjectToCategory', GraphQLOperationType.MUTATION)
  async aiLinkSubjectToCategory({ input }: AILinkSubjectToCategoryArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    await requireCategoryWrite(context, input.categoryId);
    await requireSubjectWrite(context, input.subjectId);
    const graph = new GraphEntity({
      type: GRAPH_LABELS.category,
      data: { id: input.categoryId } as DataRecord,
    });
    const result = await graph.linkSubjectToCategory({
      subjectId: input.subjectId,
      attachedByUserPermissionsId: input.attachedByUserPermissionsId || userId,
      createdByUserPermissionsId: userId,
    });
    invalidateGraphqlCache(['tree:']);
    return result;
  }

  @resolver('aiUnlinkSubjectFromCategory', GraphQLOperationType.MUTATION)
  async aiUnlinkSubjectFromCategory({ input }: { input: { subjectId: string; categoryId: string } }, context: GraphqlResolverContext) {
    await requireCategoryWrite(context, input.categoryId);
    await requireSubjectWrite(context, input.subjectId);
    const category = new GraphEntity({ type: GRAPH_LABELS.category, data: { id: input.categoryId } as DataRecord });
    const subject = new GraphEntity({ type: GRAPH_LABELS.subjectRef, data: { id: input.subjectId } as DataRecord });
    const deletedCount = await category.deleteRelation(subject, { relation: GRAPH_RELATIONS.links, direction: 'out' });
    invalidateGraphqlCache(['tree:']);
    return {
      categoryId: input.categoryId,
      subjectId: input.subjectId,
      deletedCount,
    };
  }
}
