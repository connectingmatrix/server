import { entityFieldResolvers } from './contracts/entity-field-resolvers';
import { createMetadataEntityResolvers } from './integration/metadata-entity-resolvers';
import { slashCommandResolvers } from './integration/slash-command-resolvers';
import { workflowRuntimeResolvers } from './integration/workflow-runtime-resolvers';
import { advancedAgentOsResolvers } from './integration/advanced-agent-os-resolvers';
import { agentUiChatResolvers } from './integration/agent-ui-chat-resolvers';
import { agentAppLiveResolvers } from './integration/agent-app-live-resolvers';
import { aiAgentResolvers } from './integration/ai-agent-resolvers';
import { aiAgentProjectResolvers } from './integration/ai-agent-project-resolvers';
import { runtimeMonitorResolvers } from './integration/runtime-monitor-resolvers';

export * from './contracts/entity-field-resolvers';
export * from './integration/metadata-entity-resolvers';
export * from './integration/entity-dataloaders';
export * from './integration/slash-command-resolvers';
export * from './integration/workflow-runtime-resolvers';
export * from './integration/advanced-agent-os-resolvers';
export * from './integration/agent-ui-chat-resolvers';
export * from './integration/agent-app-live-resolvers';
export * from './integration/ai-agent-resolvers';
export * from './integration/ai-agent-project-resolvers';
export * from './integration/runtime-monitor-resolvers';

const mergeResolverGroup = (...groups: Array<Record<string, Record<string, unknown>>>): Record<string, Record<string, unknown>> => {
  const output: Record<string, Record<string, unknown>> = {};
  for (const group of groups)
    for (const [typeName, resolvers] of Object.entries(group || {})) output[typeName] = { ...(output[typeName] || {}), ...(resolvers || {}) };
  return output;
};

const resolverGroup = (value: unknown): Record<string, Record<string, unknown>> => value as Record<string, Record<string, unknown>>;

export const entityBackedGraphqlResolvers = mergeResolverGroup(
  resolverGroup(createMetadataEntityResolvers()),
  resolverGroup(entityFieldResolvers),
  resolverGroup(slashCommandResolvers),
  resolverGroup(workflowRuntimeResolvers),
  resolverGroup(advancedAgentOsResolvers),
  resolverGroup(agentUiChatResolvers),
  resolverGroup(agentAppLiveResolvers),
  resolverGroup(aiAgentResolvers),
  resolverGroup(aiAgentProjectResolvers),
  resolverGroup(runtimeMonitorResolvers),
);
