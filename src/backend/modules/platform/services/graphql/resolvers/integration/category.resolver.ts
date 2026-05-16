import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { AICreateCategoryArgs, AIUpdateCategoryArgs, DeleteAiCategoryArgs, GraphqlResolverContext } from '@giga/shared/types';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { invalidateGraphqlCache } from '@giga/shared/cache';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { ChannelEntity, CategoryEntity } from '@connectingmatrix/orm/repositories/entities';
import { GRAPH_RELATIONS, type DataRecord } from '@giga/shared/types/contracts/graph.types';
import { requireCategoryWrite, requireChannelWrite } from '../auth/tree-access';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';

@Service()
export class CategoryResolver extends GraphqlCustomResolverModule {
  @resolver('aiUpdateCategory', GraphQLOperationType.MUTATION)
  async aiUpdateCategory({ input }: AIUpdateCategoryArgs, context: GraphqlResolverContext) {
    const id = String(input?.id || '').trim();
    if (!id) throw new Error('Category id is required.');
    await requireCategoryWrite(context, id);
    const result = await CategoryEntity.load(id).update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.image !== undefined ? { image: input.image } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date().toISOString(),
    });
    invalidateGraphqlCache(['tree:']);
    return result;
  }

  @resolver('aiCreateCategory', GraphQLOperationType.MUTATION)
  async aiCreateCategory({ input }: AICreateCategoryArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    if (Boolean(input.parentChannelId) === Boolean(input.parentCategoryId)) {
      throw new BadRequestError('Exactly one category parent is required.');
    }
    if (input.parentCategoryId) await requireCategoryWrite(context, input.parentCategoryId);
    if (input.parentChannelId) await requireChannelWrite(context, input.parentChannelId);
    const categoryPayload = { ...input.category, createdBy: userId };
    const result = input.parentCategoryId
      ? await (CategoryEntity.load(input.parentCategoryId).categories as any).create(categoryPayload)
      : input.parentChannelId
      ? await (ChannelEntity.load(input.parentChannelId).categories as any).create(categoryPayload)
      : null;
    if (!result) throw new BadRequestError('Exactly one category parent is required.');
    invalidateGraphqlCache(['tree:']);
    return { category: result };
  }

  @resolver('deleteAiCategory', GraphQLOperationType.MUTATION)
  async deleteAiCategory({ id }: DeleteAiCategoryArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    await requireCategoryWrite(context, id);
    const category = CategoryEntity.load(id) as unknown as CategoryEntity;
    const deleted = await category.deleteOwnedBranch({ supabase: context.supabase, userPermissionsId: userId });

    if (!deleted?.deleted) {
      return {
        message: `No category found for id ${id}`,
      };
    }

    invalidateGraphqlCache(['tree:']);

    return {
      message: `Category ${id} deleted successfully`,
    };
  }

  @resolver('aiUnlinkCategoryFromChannels', GraphQLOperationType.MUTATION)
  async aiUnlinkCategoryFromChannels({ input }: { input: { categoryId: string; channelIds: string[] } }, context: GraphqlResolverContext) {
    await requireCategoryWrite(context, input.categoryId);
    const category = new GraphEntity({ type: 'Category' as any, data: { id: input.categoryId } as DataRecord });
    let deletedCount = 0;
    for (const channelId of input.channelIds || []) {
      await requireChannelWrite(context, channelId);
      const channel = new GraphEntity({ type: 'Channel' as any, data: { id: channelId } as DataRecord });
      deletedCount += await channel.deleteRelation(category, { relation: GRAPH_RELATIONS.links, direction: 'out' });
    }
    invalidateGraphqlCache(['tree:']);
    return {
      categoryId: input.categoryId,
      channelIds: input.channelIds || [],
      deletedCount,
    };
  }
}
