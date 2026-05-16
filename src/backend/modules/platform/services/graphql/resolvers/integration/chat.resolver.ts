import { GraphQLOperationType, resolver } from '@connectingmatrix/graphql-parser';
import { AICheckSlugAvailabilityArgs, AIFetchUserTreeArgs, GraphqlResolverContext } from '@giga/shared/types';
import { BadRequestError } from 'routing-controllers';
import { Service } from 'typedi';
import { runNamedGraphqlCache } from '@giga/shared/cache';
import { getCurrentUserIdOrThrow } from '@giga/shared/lib/helper';
import { executeForChat } from '@connectingmatrix/chat/services/chat/runtime/execute-for-chat';
import { queueAttachmentIngestion, queuePostIngestion } from '@giga/tree/services/post/runtime/async-ingestion';
import { retrieveChunks } from '@connectingmatrix/chat/services/chat/runtime/retrieve-chunks';
import { fetchChatMessages } from '@connectingmatrix/chat/services/chat/read/fetch-chat-messages';
import { toGraphqlChatQueryPayload } from '@connectingmatrix/chat/services/chat/io/graphql-payload';
import { fetchChatSession } from '@connectingmatrix/chat/services/chat/auth/get-chat-session';
import { listChatSessions } from '@connectingmatrix/chat/services/chat/auth/list-chat-sessions';
import { confirmChatAction } from '@connectingmatrix/chat/services/chat/runtime/confirm-chat-action';
import { ensureSession as ensureChatSession } from '@connectingmatrix/chat/services/chat/runtime/persistence';
import { queryChat } from '@connectingmatrix/chat/services/chat/read/query-chat';
import { resolveChatScopeContext } from '@connectingmatrix/chat/services/chat/auth/scope';
import { readRecentSessionScope } from '@connectingmatrix/chat/services/chat/auth/session-scope';
import { sendChatToRoom } from '@connectingmatrix/chat/services/chat/runtime/send-to-room';
import { ChatScope } from '@connectingmatrix/chat/services/chat/contracts/types';
import { fetchUserTree } from '@giga/tree/services/giga/tree/read/fetchUserTree';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { assertBillingExecutionAccess, ChatEntity, ChatShareEntity, UsageEventEntity } from '@connectingmatrix/orm/repositories/entities';
import { SupabaseClientAdmin } from '@giga/general/decorators/integration/supabase-admin-client';
import { checkSlugAvailability } from '@giga/general/services/giga/runtime/check-slug-availability';
import { getResolverAuthContext, GraphqlCustomResolverModule } from './base';
import type { AgentExecuteArgs, AgentIngestAttachmentArgs, AgentIngestPostArgs, AgentRetrieveArgs } from '@giga/shared/types/contracts/agent.types';
import type {
  ChatMessagesArgs,
  ChatConfirmArgs,
  GetOrCreateChatArgs,
  ChatQueryArgs,
  ChatSendArgs,
  ChatSessionArgs,
  ChatSessionsArgs,
  ChatSessionRow,
  ChatShareByChatIdArgs,
  ChatShareLookupArgs,
  ChatSharePublishArgs,
  ChatShareRevokeArgs,
  ChatShareDbRecord,
  ChatShareSnapshot,
} from '@giga/shared/types/contracts/chat.types';

function readScopedSession(session: ChatSessionRow) {
  const snapshot = session.scope_snapshot && typeof session.scope_snapshot === 'object' ? session.scope_snapshot : null;
  const organizationId = String(snapshot?.organizationId || '').trim();
  if (!session.scope_type || !session.scope_id) return null;
  return {
    type: session.scope_type,
    id: session.scope_id,
    organizationId: organizationId || null,
  };
}

function readChatScope(session: ChatShareSnapshot['scope']) {
  if (!session) return null;
  return {
    type: String(session.type || '').toUpperCase(),
    id: session.id,
    organizationId: session.organizationId || null,
  };
}

function readChatSharePayload(record: ChatShareDbRecord) {
  const snapshot = record.snapshot as ChatShareSnapshot;
  return {
    chatId: record.chat_id,
    shareToken: record.share_token,
    publishedAt: record.published_at,
    revokedAt: record.revoked_at,
    snapshot: {
      chatId: snapshot.chatId,
      title: snapshot.title,
      scope: readChatScope(snapshot.scope),
      publishedAt: snapshot.publishedAt,
      messages: snapshot.messages,
    },
  };
}

@Service()
export class ChatResolver extends GraphqlCustomResolverModule {
  @resolver('chatQuery', GraphQLOperationType.MUTATION)
  async chatQuery(
    {
      input: {
        agentId,
        agent_id,
        attachments,
        chat_mode,
        chat_execution_mode,
        chat_id,
        message,
        scope,
        tag_slugs,
        subject_query,
        top_k,
        system_prompt,
        session_metadata,
        workflow_id,
        swarm_id,
      },
    }: ChatQueryArgs,
    context: GraphqlResolverContext,
  ) {
    const backendScope: ChatScope | null = scope
      ? {
          type: scope.type.toLowerCase() as ChatScope['type'],
          id: scope.id,
          organizationId: scope.organizationId ?? null,
        }
      : null;
    if (
      backendScope &&
      backendScope.type !== 'channel' &&
      backendScope.type !== 'category' &&
      backendScope.type !== 'subject' &&
      backendScope.type !== 'post' &&
      backendScope.type !== 'temporary'
    ) {
      throw new BadRequestError('Invalid chat scope type.');
    }

    const result = await queryChat({
      supabase: context.supabase,
      request: context.request,
      chatId: chat_id || undefined,
      attachments: attachments || undefined,
      chatExecutionMode: chat_execution_mode || undefined,
      scope: backendScope,
      message,
      tagSlugs: tag_slugs || undefined,
      subjectQuery: subject_query || undefined,
      topK: top_k || undefined,
      systemPrompt: system_prompt || undefined,
      sessionMetadata: session_metadata || undefined,
      agentId: agentId || agent_id || undefined,
      chatMode: chat_mode || undefined,
      workflowId: workflow_id || undefined,
      swarmId: swarm_id || undefined,
    });

    return toGraphqlChatQueryPayload(result);
  }

  @resolver('chatSend', GraphQLOperationType.MUTATION)
  async chatSend(
    {
      input: {
        attachments,
        chat_execution_mode,
        chat_id,
        scope,
        request_id,
        message,
        tag_slugs,
        subject_query,
        top_k,
        system_prompt,
        session_metadata,
        agent_id,
        agentId,
        chat_mode,
        workflow_id,
        swarm_id,
      },
    }: ChatSendArgs,
    context: GraphqlResolverContext,
  ) {
    const { userId } = await getResolverAuthContext(context);
    const backendScope: ChatScope | null = scope
      ? {
          type: scope.type.toLowerCase() as ChatScope['type'],
          id: scope.id,
          organizationId: scope.organizationId ?? null,
        }
      : null;
    if (
      backendScope &&
      backendScope.type !== 'channel' &&
      backendScope.type !== 'category' &&
      backendScope.type !== 'subject' &&
      backendScope.type !== 'post' &&
      backendScope.type !== 'temporary'
    ) {
      throw new BadRequestError('Invalid chat scope type.');
    }

    const result = await sendChatToRoom({
      supabase: context.supabase,
      request: context.request,
      chatId: chat_id || undefined,
      attachments: attachments || undefined,
      chatExecutionMode: chat_execution_mode || undefined,
      scope: backendScope,
      requestId: request_id || undefined,
      message,
      tagSlugs: tag_slugs || undefined,
      subjectQuery: subject_query || undefined,
      topK: top_k || undefined,
      systemPrompt: system_prompt || undefined,
      sessionMetadata: session_metadata || undefined,
      agentId: agentId || agent_id || undefined,
      chatMode: chat_mode || undefined,
      workflowId: workflow_id || undefined,
      swarmId: swarm_id || undefined,
    });

    return toGraphqlChatQueryPayload(result);
  }

  @resolver('chatConfirm', GraphQLOperationType.MUTATION)
  async chatConfirm({ input: { chat_id, decision } }: ChatConfirmArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const result = await confirmChatAction({
      chatId: chat_id,
      decision,
      request: context.request,
      supabase: context.supabase,
      userId,
    });
    return toGraphqlChatQueryPayload(result);
  }

  @resolver('getOrCreateChat', GraphQLOperationType.MUTATION)
  async getOrCreateChat({ input: { chat_id, scope, session_metadata, system_prompt, title } }: GetOrCreateChatArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const backendScope: ChatScope | null = scope
      ? {
          type: scope.type.toLowerCase() as ChatScope['type'],
          id: scope.id,
          organizationId: scope.organizationId ?? null,
        }
      : null;
    if (
      backendScope &&
      backendScope.type !== 'channel' &&
      backendScope.type !== 'category' &&
      backendScope.type !== 'subject' &&
      backendScope.type !== 'post' &&
      backendScope.type !== 'temporary'
    ) {
      throw new BadRequestError('Invalid chat scope type.');
    }

    const fallbackScope = !backendScope && !chat_id ? await readRecentSessionScope(userId) : null;
    const createScope =
      backendScope ||
      (fallbackScope
        ? { type: fallbackScope.type, id: fallbackScope.id, organizationId: fallbackScope.organizationId || null }
        : { type: 'temporary' as const, id: userId, organizationId: null });
    const createScopeContext = chat_id ? null : await resolveChatScopeContext(context.supabase, userId, createScope);
    const existingSession = chat_id ? await ChatEntity.getScopedSession({ userId, chatId: chat_id }) : null;
    const ensuredSession = !chat_id
      ? await ensureChatSession(context.supabase, {
          userId,
          titleFromMessage: title || 'Matrix lane chat',
          systemPrompt: system_prompt || null,
          metadata: session_metadata || null,
          scope: createScope,
          scopeSnapshot: createScopeContext?.snapshot || null,
        })
      : null;
    const sessionRow = (chat_id ? existingSession?.extract() : ensuredSession?.session) as ChatSessionRow | null;
    if (!sessionRow) throw new BadRequestError('Chat session not found.');
    const sessionScope = sessionRow.scope || readScopedSession(sessionRow);
    return {
      ...sessionRow,
      scope: sessionScope
        ? {
            type: sessionScope.type.toUpperCase(),
            id: sessionScope.id,
            organizationId: sessionScope.organizationId ?? null,
          }
        : null,
    };
  }

  @resolver('chatSession', GraphQLOperationType.QUERY)
  async chatSession({ input: { chat_id, scope } }: ChatSessionArgs, context: GraphqlResolverContext) {
    const backendScope: ChatScope | null = scope
      ? {
          type: scope.type.toLowerCase() as ChatScope['type'],
          id: scope.id,
          organizationId: scope.organizationId ?? null,
        }
      : null;
    if (
      backendScope &&
      backendScope.type !== 'channel' &&
      backendScope.type !== 'category' &&
      backendScope.type !== 'subject' &&
      backendScope.type !== 'post' &&
      backendScope.type !== 'temporary'
    ) {
      throw new BadRequestError('Invalid chat scope type.');
    }

    const result = await fetchChatSession(context.supabase, {
      chatId: chat_id || undefined,
      scope: backendScope,
    });

    if (!result) return null;
    const session = result as ChatSessionRow;
    const sessionScope = session.scope || readScopedSession(session);

    return {
      ...session,
      scope: sessionScope
        ? {
            type: sessionScope.type.toUpperCase(),
            id: sessionScope.id,
            organizationId: sessionScope.organizationId ?? null,
          }
        : null,
    };
  }

  @resolver('chatSessions', GraphQLOperationType.QUERY)
  async chatSessions({ input }: ChatSessionsArgs = {}, context: GraphqlResolverContext) {
    const { scope, limit, offset } = input || {};
    const backendScope: ChatScope | null = scope
      ? {
          type: scope.type.toLowerCase() as ChatScope['type'],
          id: scope.id,
          organizationId: scope.organizationId ?? null,
        }
      : null;
    if (
      backendScope &&
      backendScope.type !== 'channel' &&
      backendScope.type !== 'category' &&
      backendScope.type !== 'subject' &&
      backendScope.type !== 'post' &&
      backendScope.type !== 'temporary'
    ) {
      throw new BadRequestError('Invalid chat scope type.');
    }

    const result = await listChatSessions(context.supabase, {
      scope: backendScope,
      limit: limit || undefined,
      offset: offset || undefined,
    });

    return {
      data: ((result.data ?? []) as ChatSessionRow[]).map((session) => {
        const sessionScope = session.scope || readScopedSession(session);

        return {
          ...session,
          scope: sessionScope
            ? {
                type: sessionScope.type.toUpperCase(),
                id: sessionScope.id,
                organizationId: sessionScope.organizationId ?? null,
              }
            : null,
        };
      }),
      count: result.count || 0,
      limit: result.limit || 0,
      offset: result.offset || 0,
    };
  }

  @resolver('chatMessages', GraphQLOperationType.QUERY)
  async chatMessages({ input: { chat_id, limit, offset } }: ChatMessagesArgs, context: GraphqlResolverContext) {
    const result = await fetchChatMessages(context.supabase, {
      chatId: chat_id,
      limit: limit || undefined,
      offset: offset || undefined,
    });

    return {
      data: result.data || [],
      count: result.count || 0,
      limit: result.limit || 0,
      offset: result.offset || 0,
    };
  }

  @resolver('chatShareByChatId', GraphQLOperationType.QUERY)
  async chatShareByChatId({ chatId }: ChatShareByChatIdArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const result = await ChatShareEntity.loadByChatIdScoped(context.supabase, chatId);
    return result ? readChatSharePayload(result) : null;
  }

  @resolver('chatShareByToken', GraphQLOperationType.QUERY)
  async chatShareByToken({ input: { share_token } }: ChatShareLookupArgs) {
    const result = await ChatShareEntity.loadPublicByTokenScoped(SupabaseClientAdmin(), share_token);
    return result ? readChatSharePayload(result) : null;
  }

  @resolver('chatSharePublish', GraphQLOperationType.MUTATION)
  async chatSharePublish({ input: { chat_id } }: ChatSharePublishArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const result = await ChatShareEntity.publishByChatId(context.supabase, chat_id);
    return readChatSharePayload(result);
  }

  @resolver('chatShareRevoke', GraphQLOperationType.MUTATION)
  async chatShareRevoke({ input: { chat_id } }: ChatShareRevokeArgs, context: GraphqlResolverContext) {
    await getResolverAuthContext(context);
    const result = await ChatShareEntity.revokeByChatIdScoped(context.supabase, chat_id);
    return readChatSharePayload(result);
  }

  @resolver('agentRetrieve', GraphQLOperationType.QUERY)
  async agentRetrieve(
    { input: { question, subject_id, subject_ids, post_id, post_ids, tag_slugs, subject_query, top_k } }: AgentRetrieveArgs,
    context: GraphqlResolverContext,
  ) {
    const result = await retrieveChunks(context.supabase, {
      question,
      subjectId: subject_id || undefined,
      subjectIds: subject_ids || undefined,
      postId: post_id || undefined,
      postIds: post_ids || undefined,
      tagSlugs: tag_slugs || undefined,
      subjectQuery: subject_query || undefined,
      topK: top_k || undefined,
    });

    return {
      chunks: result.chunks || [],
      query_embedding: result.queryEmbedding || [],
      subject_ids: result.subject_ids || null,
      subject_filter_applied: result.subject_filter_applied || false,
      post_ids: result.post_ids || null,
    };
  }

  @resolver('agentExecute', GraphQLOperationType.MUTATION)
  async agentExecute(
    { input: { chat_id, message, subject_id, subject_ids, post_id, post_ids, tag_slugs, subject_query, top_k, system_prompt } }: AgentExecuteArgs,
    context: GraphqlResolverContext,
  ) {
    const { userId, effectiveRoot } = await getResolverAuthContext(context);
    await assertBillingExecutionAccess(context.supabase, {
      userId,
      effectiveRoot,
    });
    const result = await executeForChat({
      supabase: context.supabase,
      userId,
      chatId: chat_id,
      message,
      request: context.request,
      subjectId: subject_id || undefined,
      subjectIds: subject_ids || undefined,
      postId: post_id || undefined,
      postIds: post_ids || undefined,
      tagSlugs: tag_slugs || undefined,
      subjectQuery: subject_query || undefined,
      topK: top_k || undefined,
      systemPrompt: system_prompt || null,
    });
    await UsageEventEntity.recordPolicyUsage({
      target: 'agent.execute',
      metadata: { chatId: chat_id || null },
      userId,
    });

    return result;
  }

  @resolver('agentIngestPost', GraphQLOperationType.MUTATION)
  async agentIngestPost({ input: { post_id, replace_existing, chunk_size, chunk_overlap } }: AgentIngestPostArgs, context: GraphqlResolverContext) {
    const { userId } = await getResolverAuthContext(context);
    const job = queuePostIngestion({
      supabase: context.supabase,
      userId,
      post: {
        postId: post_id,
        replaceExisting: replace_existing || undefined,
        chunkSize: chunk_size || undefined,
        chunkOverlap: chunk_overlap || undefined,
      },
    });

    return {
      accepted: job.accepted,
      ingestion_job_id: job.ingestionJobId,
      process_id: job.processId,
      status: job.status,
      source: { source_kind: 'post', post_id, attachment_id: null, subject_id: null },
      source_kind: 'post',
      total_chunks: 0,
      inserted_chunks: 0,
      deleted_chunks: 0,
      source_hash: null,
    };
  }

  @resolver('agentIngestAttachment', GraphQLOperationType.MUTATION)
  async agentIngestAttachment(
    { input: { attachment_id, replace_existing, chunk_size, chunk_overlap } }: AgentIngestAttachmentArgs,
    context: GraphqlResolverContext,
  ) {
    const { userId } = await getResolverAuthContext(context);
    const job = queueAttachmentIngestion({
      supabase: context.supabase,
      userId,
      attachment: {
        attachmentId: attachment_id,
        replaceExisting: replace_existing || undefined,
        chunkSize: chunk_size || undefined,
        chunkOverlap: chunk_overlap || undefined,
      },
    });

    return {
      accepted: job.accepted,
      ingestion_job_id: job.ingestionJobId,
      process_id: job.processId,
      status: job.status,
      source: { source_kind: 'attachment', post_id: null, attachment_id, subject_id: null },
      source_kind: 'attachment',
      total_chunks: 0,
      inserted_chunks: 0,
      deleted_chunks: 0,
      source_hash: null,
    };
  }

  @resolver('aiFetchUserTree', GraphQLOperationType.QUERY)
  async aiFetchUserTree({ input }: AIFetchUserTreeArgs, context: GraphqlResolverContext) {
    const organizationId = input.organizationId ?? null;
    const { userId } = await getResolverAuthContext(context);
    const treeInput = TreeGraphEntity.parseTreeFetchInput({
      rootId: input.rootId || undefined,
      rootType: input.rootType || undefined,
      depth: input.depth ?? null,
      includeCounts: input.includeCounts,
      includeGlobal: input.includeGlobal,
      includePosts: input.includePosts,
      first: input.first ?? null,
      offset: input.offset ?? null,
      organizationId,
      nowIso: input.nowIso || undefined,
    });
    return runNamedGraphqlCache({
      operationName: 'aiFetchUserTree',
      read: () =>
        fetchUserTree(context.supabase, {
          userPermissionsId: userId,
          rootId: treeInput.rootId || undefined,
          rootType: treeInput.rootType || undefined,
          depth: treeInput.depth ?? null,
          includeCounts: treeInput.includeCounts === true,
          includeGlobal: treeInput.includeGlobal,
          includePosts: treeInput.includePosts !== false,
          first: input.first ?? null,
          offset: input.offset ?? null,
          organizationId: treeInput.organizationId || null,
          nowIso: treeInput.nowIso || undefined,
        }),
      userId,
      variables: {
        input: {
          includeGlobal: input.includeGlobal,
          includeCounts: input.includeCounts,
          includePosts: input.includePosts,
          first: input.first ?? null,
          offset: input.offset ?? null,
          depth: input.depth ?? null,
          nowIso: input.nowIso || null,
          organizationId,
          rootId: input.rootId || null,
          rootType: input.rootType || null,
        },
      },
    });
  }

  @resolver('gigaCheckSlugAvailability', GraphQLOperationType.QUERY)
  async gigaCheckSlugAvailability({ input }: AICheckSlugAvailabilityArgs, context: GraphqlResolverContext) {
    const userId = await getCurrentUserIdOrThrow(context.supabase);
    return checkSlugAvailability({
      slug: input.slug,
      scope: input.scope,
      createdBy: input.scope === 'USER' ? userId : null,
    });
  }
}
