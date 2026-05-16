import { toSafeString } from 'giga-ai-helper';
import type { AgentActionRuntime } from '@giga/shared/types/contracts/agent.types';
import type { GigaMcpContext } from '../context';

const inputRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const runtimeScopeType = (value: unknown) => {
  const scope = toSafeString(value).toLowerCase();
  if (scope === 'channel' || scope === 'category' || scope === 'subject' || scope === 'post') return scope;
  return null;
};

export const actionRuntime = (context: GigaMcpContext, args: Record<string, unknown>): AgentActionRuntime => ({
  supabase: context.supabase,
  userId: context.userId || '',
  chatId: toSafeString(args.chatId),
  message: toSafeString(args.message) || 'MCP action',
  context: { scope: { subject_ids: [], post_ids: [], tag_slugs: [] }, subjects: [], posts: [], recent_chat_messages: [] },
  topK: Number(args.topK) || 10,
  request: context.request,
  resultsById: inputRecord(args.resultsById) as any,
  scopeId: toSafeString(args.scopeId) || null,
  scopeType: runtimeScopeType(args.scopeType),
});
