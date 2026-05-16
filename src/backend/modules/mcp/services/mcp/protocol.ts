import { compactActionValue } from '@connectingmatrix/chat/services/chat/runtime/action-value';

export type McpRequest = {
  id?: string | number | null;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
};

export type McpTool = {
  annotations?: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  name: string;
};

export const jsonResult = (id: McpRequest['id'], result: unknown) => ({
  id: id ?? null,
  jsonrpc: '2.0',
  result,
});

export const jsonError = (id: McpRequest['id'], code: number, message: string) => ({
  error: { code, message },
  id: id ?? null,
  jsonrpc: '2.0',
});

export const toolContent = (value: unknown) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(compactActionValue(value), null, 2) }],
});

export const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: true,
});
