import { BadRequestError } from 'routing-controllers';
import { toSafeString } from 'giga-ai-helper';
import { toGraphqlChatQueryPayload } from '@connectingmatrix/chat/services/chat/io/graphql-payload';
import { queryChat } from '@connectingmatrix/chat/services/chat/read/query-chat';
import { chatScopeInput } from './chat';
import { jsonProp, limit, schema, stringProp } from './common';
import type { GigaMcpToolGroup } from './common';

const prompts = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => toSafeString(item))
        .filter(Boolean)
        .slice(0, 20)
    : [];

export const promptSuiteMcpTools: GigaMcpToolGroup = {
  handlers: {
    'giga.run_querychat_prompt_suite': async (context, args) => {
      const suite = prompts(args.prompts);
      if (!suite.length) throw new BadRequestError('prompts are required.');
      const results = [];
      for (const prompt of suite) {
        const payload = toGraphqlChatQueryPayload(
          await queryChat({
            supabase: context.supabase,
            request: context.request,
            message: prompt,
            scope: chatScopeInput(args.scope) as any,
            topK: Number(args.topK) || undefined,
            chatExecutionMode: toSafeString(args.chatExecutionMode || args.chat_execution_mode) || undefined,
          }),
        );
        results.push({
          prompt,
          answer: payload.answer?.markdown || '',
          sourceCount: payload.sources?.length || 0,
          sources: (payload.sources || []).slice(0, limit(args.sourceLimit, 5)),
          debug: payload.debug || null,
        });
      }
      return { count: results.length, results };
    },
  },
  tools: [
    {
      name: 'giga.run_querychat_prompt_suite',
      description: 'Run a bounded QueryChat prompt suite and return answer/source/debug summaries.',
      inputSchema: schema(
        {
          prompts: jsonProp('Prompt strings, max 20'),
          scope: jsonProp('Chat scope'),
          topK: jsonProp('Top K'),
          sourceLimit: jsonProp('Sources per prompt'),
          chatExecutionMode: stringProp('wait or async'),
        },
        ['prompts'],
      ),
    },
  ],
};
