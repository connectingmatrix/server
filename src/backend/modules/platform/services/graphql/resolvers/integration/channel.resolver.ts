import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import {
  AIFetchUserTreeArgs,
  AICreateChannelArgs,
  AILinkCategoryToChannelsArgs,
  AILinkChannelArgs,
  AIMoveChannelArgs,
  AIUpdateChannelArgs,
  DeleteAiChannelArgs,
  GraphqlResolverContext,
} from '@giga/shared/types';
import { Service } from 'typedi';
import { invalidateGraphqlCache } from '@giga/shared/cache';
import { GraphEntity } from '@connectingmatrix/orm/repositories/GraphEntity';
import { ChannelEntity, GlobalEntity, OrganisationEntity, UserEntity } from '@connectingmatrix/orm/repositories/entities';
import { fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { GRAPH_RELATIONS, type DataRecord } from '@giga/shared/types/contracts/graph.types';
import { requireChannelWrite } from '../auth/tree-access';
import { getResolverAuthContext, GraphqlCustomResolverModule, requireRootUser } from './base';

@Service()
export class ChannelResolver extends GraphqlCustomResolverModule {
  @resolver('gigaFetchUserTree', GraphQLOperationType.QUERY)
  async gigaFetchUserTree({ input }: AIFetchUserTreeArgs = {}, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    return fetchUserTree(context.supabase, {
      userPermissionsId: userId,
      rootId: input?.rootId || undefined,
      rootType: input?.rootType || undefined,
      organizationId: input?.organizationId || undefined,
      depth: input?.depth ?? null,
      includeCounts: input?.includeCounts === true,
      includeGlobal: input?.includeGlobal !== false,
      includePosts: input?.includePosts !== false,
      first: input?.first ?? null,
      offset: input?.offset ?? null,
    });
  }

  @resolver('aiUpdateChannel', GraphQLOperationType.MUTATION)
  async aiUpdateChannel({ input }: AIUpdateChannelArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const id = String(input?.id || '').trim();
    if (!id) throw new Error('Channel id is required.');
    const result = await ChannelEntity.load(id).update({
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

  @resolver('aiMoveChannel', GraphQLOperationType.MUTATION)
  async aiMoveChannel({ input }: AIMoveChannelArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const mode = String(input.mode || 'MOVE')
      .trim()
      .toUpperCase();
    const graph = new GraphEntity({ type: 'Channel' as any, data: { id: input.channelId } as any });
    const payload =
      mode === 'LINK'
        ? await graph.linkChannel({
            parentChannelId: input.newParentChannelId,
            channelId: input.channelId,
          })
        : await graph.moveChannel({
            from: input.channelId,
            to: input.newParentChannelId,
          });
    const result = {
      ...payload,
      channel: null,
      newParentChannel: null,
    };
    invalidateGraphqlCache(['tree:']);
    return result;
  }

  @resolver('aiLinkChannel', GraphQLOperationType.MUTATION)
  async aiLinkChannel({ input }: AILinkChannelArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const graph = new GraphEntity({ type: 'Channel' as any, data: { id: input.parentChannelId } as any });
    const payload = await graph.linkChannel({
      parentChannelId: input.parentChannelId,
      channelId: input.channelId,
    });
    const result = {
      ...payload,
      parentChannel: null,
      channel: null,
    };
    invalidateGraphqlCache(['tree:']);
    return result;
  }

  @resolver('aiUnlinkChannel', GraphQLOperationType.MUTATION)
  async aiUnlinkChannel({ input }: { input: { parentChannelId: string; channelId: string } }, context: GraphqlResolverContext) {
    await requireChannelWrite(context, input.parentChannelId);
    await requireChannelWrite(context, input.channelId);
    const parent = new GraphEntity({ type: 'Channel' as any, data: { id: input.parentChannelId } as DataRecord });
    const child = new GraphEntity({ type: 'Channel' as any, data: { id: input.channelId } as DataRecord });
    const deletedCount = await parent.deleteRelation(child, { relation: GRAPH_RELATIONS.links, direction: 'out' });
    invalidateGraphqlCache(['tree:']);
    return {
      parentChannelId: input.parentChannelId,
      channelId: input.channelId,
      deletedCount,
    };
  }

  @resolver('aiLinkCategoryToChannels', GraphQLOperationType.MUTATION)
  async aiLinkCategoryToChannels({ input }: AILinkCategoryToChannelsArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const graph = new GraphEntity({ type: 'Category' as any, data: { id: input.categoryId } as any });
    const links = await graph.linkCategoryToChannels({
      channelIds: input.channelIds || [],
    });
    const result = {
      categoryId: input.categoryId,
      links: links.map((link) => ({
        ...link,
        channel: null,
        category: null,
      })),
      category: null,
    };
    invalidateGraphqlCache(['tree:']);
    return result;
  }

  @resolver('gigaCreateChannel', GraphQLOperationType.MUTATION)
  async gigaCreateChannel({ input }: AICreateChannelArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const channelPayload = { ...input.channel, createdBy: userId };
    const channel = input.parentChannelId
      ? await (ChannelEntity.load(input.parentChannelId).children as any).create(channelPayload)
      : input.organizationId
      ? await (OrganisationEntity.load(input.organizationId).channels as any).create(channelPayload)
      : await (UserEntity.load(userId).channels as any).create(channelPayload);
    const ownerUserPermissions = channel.organizationId ? null : UserEntity.load(userId);
    invalidateGraphqlCache(['tree:']);
    return { channel, ownerUserPermissions };
  }

  @resolver('gigaCreateGlobalChannel', GraphQLOperationType.MUTATION)
  async gigaCreateGlobalChannel({ input }: AICreateChannelArgs, context: GraphqlResolverContext) {
    await requireRootUser(context);
    const { userId } = await getResolverAuthContext(context);
    const channel = input.parentChannelId
      ? await (ChannelEntity.load(input.parentChannelId).children as any).create({ ...input.channel, createdBy: userId, isGlobal: true })
      : await (GlobalEntity.load().channels as any).create({ ...input.channel, createdBy: userId, isGlobal: true });
    invalidateGraphqlCache(['tree:']);
    return { channel };
  }

  @resolver('deleteAiChannel', GraphQLOperationType.MUTATION)
  async deleteAiChannel({ id }: DeleteAiChannelArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const channel = ChannelEntity.load(id) as unknown as ChannelEntity;
    const deleted = await channel.deleteOwnedBranch({ supabase: context.supabase, userPermissionsId: userId });

    if (!deleted.deleted) {
      return {
        message: `No channel found for id ${id}`,
      };
    }

    invalidateGraphqlCache(['tree:']);

    return {
      message: `Channel ${id} deleted successfully`,
    };
  }
}
