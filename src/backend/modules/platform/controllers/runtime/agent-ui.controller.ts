import { Body, JsonController, Post, Req } from 'routing-controllers';
import { Service } from 'typedi';
import { queryChat } from '@connectingmatrix/chat/services/chat/read/query-chat';
import { createAgentChatKitClientSecret } from '@connectingmatrix/ai-agents/services/ai-agents/auth/chatkit-session';
import { SupabaseClient } from '@giga/general/decorators/integration/supabase-client';
import type { AgentChatKitSessionInput } from '@connectingmatrix/ai-agents/services/ai-agents/contracts';
import type { Request } from 'express';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => String(value ?? '').trim();

@JsonController('/agent-ui')
@Service()
export class AgentUiController {
  @Post('/chatkit/session')
  async createChatKitSession(@Req() request: Request, @Body() body: Record<string, unknown> = {}) {
    const userId = text((request as unknown as { userId?: string }).userId || record(request).userId || record(body).userId);
    return createAgentChatKitClientSecret({
      agentId: text(body.agentId) || undefined,
      chatId: text(body.chatId) || undefined,
      workflowId: text(body.workflowId) || undefined,
      userId: userId || undefined,
      metadata: body.metadata as AgentChatKitSessionInput['metadata'],
    });
  }

  @Post('/chat')
  async aiSdkChat(@Req() request: Request, @Body() body: Record<string, unknown> = {}) {
    const supabase = await SupabaseClient(request);
    const messages = Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [];
    const last = [...messages].reverse().find((message) => text(message.content));
    const message = text(body.message || last?.content || body.prompt);
    if (!message) throw new Error('message is required.');
    return queryChat({
      supabase,
      request,
      chatId: text(body.chat_id || body.chatId || body.id) || null,
      message,
      attachments: Array.isArray(body.attachments) ? (body.attachments as never) : null,
      sessionMetadata: {
        ...record(body.metadata || body.sessionMetadata),
        selected_agent_id: text(body.agent_id || body.agentId) || null,
      },
    });
  }
}
