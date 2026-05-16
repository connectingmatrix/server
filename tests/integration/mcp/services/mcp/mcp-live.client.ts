import { randomUUID } from 'node:crypto';
import type { LiveSession } from '@connectingmatrix/chat/services/chat/__tests__/chat-giga-live.fixture';

export async function mcpRaw(session: LiveSession, method: string, params: Record<string, unknown>, authorized = true) {
  const response = await fetch(session.url.replace('/api/v2/graphql', '/api/v2/mcp'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorized ? { authorization: `Bearer ${session.sessionHeader}` } : {}),
    },
    body: JSON.stringify({ id: randomUUID(), jsonrpc: '2.0', method, params }),
  });
  return response.json() as Promise<any>;
}

export async function mcpCall<T = any>(session: LiveSession, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const body = await mcpRaw(session, 'tools/call', { name, arguments: args });
  if (body.error) throw new Error(body.error.message);
  return JSON.parse(String(body.result?.content?.[0]?.text || 'null'));
}
