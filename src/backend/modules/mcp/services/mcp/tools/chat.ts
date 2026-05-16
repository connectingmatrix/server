import { toSafeString } from 'giga-ai-helper';
import { toGraphqlChatQueryPayload } from '@connectingmatrix/chat/services/chat/io/graphql-payload';
import { ChatShareEntity } from '@connectingmatrix/orm/repositories/entities';
import { fetchChatMessages } from '@connectingmatrix/chat/services/chat/read/fetch-chat-messages';
import { fetchChatSession } from '@connectingmatrix/chat/services/chat/auth/get-chat-session';
import { listChatSessions } from '@connectingmatrix/chat/services/chat/auth/list-chat-sessions';
import { queryChat } from '@connectingmatrix/chat/services/chat/read/query-chat';
import { inputRecord, jsonProp, limit, schema, stringList, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';

export const chatScopeInput = (value: unknown) => {
  const scope = inputRecord(value);
  return scope.type && scope.id
    ? { type: toSafeString(scope.type).toLowerCase() as any, id: toSafeString(scope.id), organizationId: toSafeString(scope.organizationId) || null }
    : null;
};

export const chatMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.query_chat': async (context, args) =>
      toGraphqlChatQueryPayload(
        await queryChat({
          supabase: context.supabase,
          request: context.request,
          chatId: toSafeString(args.chatId) || undefined,
          message: toSafeString(args.message),
          scope: chatScopeInput(args.scope) as any,
          topK: Number(args.topK) || undefined,
          tagSlugs: stringList(args.tagSlugs),
          subjectQuery: toSafeString(args.subjectQuery) || undefined,
          systemPrompt: toSafeString(args.systemPrompt) || undefined,
          agentId: toSafeString(args.agentId || args.agent_id || args.selectedAgentId || args.selected_agent_id) || undefined,
          attachments: Array.isArray(args.attachments) ? (args.attachments as any) : undefined,
          chatExecutionMode: toSafeString(args.chatExecutionMode || args.chat_execution_mode) || undefined,
        }),
      ),
    'giga.list_chat_sessions': (context, args) =>
      listChatSessions(context.supabase, { scope: chatScopeInput(args.scope) as any, limit: limit(args.limit), offset: Number(args.offset) || 0 }),
    'giga.get_chat_session': (context, args) =>
      fetchChatSession(context.supabase, { chatId: toSafeString(args.chatId) || undefined, scope: chatScopeInput(args.scope) as any }),
    'giga.list_chat_messages': (context, args) =>
      fetchChatMessages(context.supabase, { chatId: toSafeString(args.chatId), limit: limit(args.limit), offset: Number(args.offset) || 0 }),
    'giga.publish_chat_share': (context, args) => ChatShareEntity.publishByChatId(context.supabase, toSafeString(args.chatId)),
    'giga.revoke_chat_share': (context, args) => ChatShareEntity.revokeByChatIdScoped(context.supabase, toSafeString(args.chatId)),
    'giga.get_chat_share': (context, args) =>
      toSafeString(args.shareToken)
        ? ChatShareEntity.loadPublicByTokenScoped(context.supabase, toSafeString(args.shareToken))
        : ChatShareEntity.loadByChatIdScoped(context.supabase, toSafeString(args.chatId)),
  },
  tools: [
    {
      name: 'giga.query_chat',
      description: 'Run QueryChat against a Giga scope and return bounded answer/debug/source metadata.',
      inputSchema: schema(
        {
          message: stringProp('Prompt'),
          chatId: stringProp('Chat id'),
          scope: jsonProp('Chat scope'),
          topK: jsonProp('Top K'),
          tagSlugs: jsonProp('Tag slugs'),
          subjectQuery: stringProp('Subject query'),
          attachments: jsonProp('Chat attachment metadata or small base64 files'),
          chatExecutionMode: stringProp('wait or async'),
          agentId: stringProp('Selected saved AI agent id'),
        },
        ['message'],
      ),
    },
    {
      name: 'giga.list_chat_sessions',
      description: 'List chat sessions visible to the user.',
      inputSchema: schema({ scope: jsonProp('Chat scope'), limit: jsonProp('Max 100'), offset: jsonProp('Offset') }),
    },
    {
      name: 'giga.get_chat_session',
      description: 'Read one chat session by id or scope.',
      inputSchema: schema({ chatId: stringProp('Chat id'), scope: jsonProp('Chat scope') }),
    },
    {
      name: 'giga.list_chat_messages',
      description: 'List chat messages in a visible session.',
      inputSchema: schema({ chatId: stringProp('Chat id'), limit: jsonProp('Max 100'), offset: jsonProp('Offset') }, ['chatId']),
    },
    {
      name: 'giga.publish_chat_share',
      description: 'Publish or refresh a share token for a chat session.',
      inputSchema: schema({ chatId: stringProp('Chat id') }, ['chatId']),
    },
    {
      name: 'giga.revoke_chat_share',
      description: 'Revoke the current share token for a chat session.',
      inputSchema: schema({ chatId: stringProp('Chat id') }, ['chatId']),
    },
    {
      name: 'giga.get_chat_share',
      description: 'Read an active chat share by chat id or public token.',
      inputSchema: schema({ chatId: stringProp('Chat id'), shareToken: stringProp('Share token') }),
    },
  ],
};
