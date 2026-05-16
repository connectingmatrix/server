export type McpCapability = {
  id: string;
  kind: 'tool' | 'resource' | 'prompt';
  server: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
type McpServer = {
  id: string;
  listTools?: () => Promise<Array<Record<string, unknown>>>;
  listResources?: () => Promise<Array<Record<string, unknown>>>;
  listPrompts?: () => Promise<Array<Record<string, unknown>>>;
  executeTool?: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  readResource?: (uri: string) => Promise<unknown>;
  getPrompt?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};
const registry = new Map<string, McpServer>();
const text = (value: unknown): string => String(value ?? '').trim();
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
export const registerMcpServer = (server: McpServer): void => {
  if (!server.id) throw new Error('MCP server requires id.');
  registry.set(server.id, server);
};
const capabilityFrom = (server: string, kind: McpCapability['kind'], row: Record<string, unknown>): McpCapability => {
  const name = text(row.name || row.id || row.uri || row.title);
  return {
    id: `mcp.${server}.${kind}.${name}`,
    kind,
    server,
    name,
    description: text(row.description || row.title || name),
    inputSchema: record(row.inputSchema || row.schema),
    metadata: row,
  };
};
export const listMcpCapabilities = async (_input: Record<string, unknown> = {}) => {
  const capabilities: McpCapability[] = [];
  for (const server of registry.values()) {
    for (const row of (await server.listTools?.()) || []) capabilities.push(capabilityFrom(server.id, 'tool', row));
    for (const row of (await server.listResources?.()) || []) capabilities.push(capabilityFrom(server.id, 'resource', row));
    for (const row of (await server.listPrompts?.()) || []) capabilities.push(capabilityFrom(server.id, 'prompt', row));
  }
  return { summary: `Fetched ${capabilities.length} MCP capability/capabilities.`, capabilities };
};
export const executeMcpCapability = async (input: Record<string, unknown>) => {
  const serverId = text(input.server || input.serverId || input.server_id);
  const kind = text(input.kind || input.type || 'tool') as McpCapability['kind'];
  const name = text(input.name || input.tool || input.resource || input.prompt || input.uri);
  const server = registry.get(serverId);
  if (!server) throw new Error(`MCP server ${serverId} is not registered.`);
  if (kind === 'tool')
    return { summary: `Executed MCP tool ${name}.`, data: await server.executeTool?.(name, record(input.input || input.args || input.payload)) };
  if (kind === 'resource') return { summary: `Read MCP resource ${name}.`, data: await server.readResource?.(name) };
  if (kind === 'prompt') return { summary: `Fetched MCP prompt ${name}.`, data: await server.getPrompt?.(name, record(input.args || input.input)) };
  throw new Error(`Unsupported MCP capability kind: ${kind}.`);
};
