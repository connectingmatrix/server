import { BadRequestError } from 'routing-controllers';
import { withEntityRequestContext } from '@connectingmatrix/orm/services/graphql/entity-request-context';
import { RESOLVER_ACCESS_CONFIG } from '@giga/general/services/graphql/resolver-access.config';
import { writeMcpActivityLog } from './audit';
import { executeMcpToolViaGraphql } from './graphql-proxy';
import { auditMcpTools } from './tools/audit';
import { chatActionMcpTools } from './tools/chat-actions';
import { chatMcpTools } from './tools/chat';
import { identityMcpTools } from './tools/identity';
import { nodeMcpTools } from './tools/nodes';
import { promptSuiteMcpTools } from './tools/prompt-suite';
import { sharedSpaceMcpTools } from './tools/shared-space';
import { treeMcpTools } from './tools/tree';
import { workflowMcpTools } from './tools/workflow';
import { workflowExecutionMcpTools } from './tools/workflow-execution';
import type { GigaMcpContext } from './context';
import type { McpTool } from './protocol';
import type { GigaMcpHandler, GigaMcpToolGroup } from './tools/common';

const TOOL_GROUPS: readonly GigaMcpToolGroup[] = [
  identityMcpTools,
  workflowMcpTools,
  workflowExecutionMcpTools,
  treeMcpTools,
  chatActionMcpTools,
  chatMcpTools,
  promptSuiteMcpTools,
  nodeMcpTools,
  sharedSpaceMcpTools,
  auditMcpTools,
];

function buildRegistry(groups: readonly GigaMcpToolGroup[]) {
  const handlers = new Map<string, GigaMcpHandler>();
  const tools = new Map<string, McpTool>();

  for (const group of groups) {
    for (const tool of group.tools) {
      if (tools.has(tool.name)) throw new Error(`Duplicate Giga MCP tool declaration: ${tool.name}`);
      tools.set(tool.name, tool);
    }

    for (const [name, handler] of Object.entries(group.handlers)) {
      if (handlers.has(name)) throw new Error(`Duplicate Giga MCP handler declaration: ${name}`);
      handlers.set(name, handler);
      if (!tools.has(name)) throw new Error(`Giga MCP handler has no tool declaration: ${name}`);
    }
  }

  return { handlers, tools };
}

const REGISTRY = buildRegistry(TOOL_GROUPS);

const mcpResolverAccess = RESOLVER_ACCESS_CONFIG.mcpExecuteTool;

const mcpToolAnnotations = {
  graphql: { mutation: 'mcpExecuteTool' },
  resolverAccess: {
    contextKey: mcpResolverAccess?.contextKey || null,
    hasLimitChecks: Boolean(mcpResolverAccess?.resolveLimitChecks),
    hasScopeResolver: Boolean(mcpResolverAccess?.resolveScope),
  },
};

export const GIGA_MCP_TOOLS: McpTool[] = Array.from(REGISTRY.tools.values()).map((tool) => ({
  ...tool,
  annotations: { ...(tool.annotations || {}), ...mcpToolAnnotations },
}));

export const callGigaMcpToolDirect = async (context: GigaMcpContext, name: string, args: Record<string, unknown>) => {
  const handler = REGISTRY.handlers.get(name);
  if (!handler) throw new BadRequestError(`Unknown Giga MCP tool "${name}".`);
  return withEntityRequestContext(context, args || {}, async () => {
    const result = await handler(context, args || {});
    await writeMcpActivityLog(context, name, args || {});
    return result;
  });
};

export const callGigaMcpTool = (context: GigaMcpContext, name: string, args: Record<string, unknown>) =>
  executeMcpToolViaGraphql(context, name, args || {});
