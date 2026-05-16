import { executeAdvancedTool, identifyAdvancedGaps, createAgentTaskGraph } from '@connectingmatrix/ai-agents/services/ai-agents/advanced';
import { readAdvancedToolRequest, type AgentWorkflowToolInput } from '@connectingmatrix/ai-agents/services/ai-agents/contracts';

type AdvancedToolMutationInput = {
  tool: string;
  operation?: string;
  input?: unknown;
  confirmed?: boolean;
};

export const advancedAgentOsResolvers = {
  Query: {
    advancedAgentGaps: async (_parent: unknown, args: { input?: AgentWorkflowToolInput | null }) => identifyAdvancedGaps(args.input || {}),
    advancedAgentTaskGraph: async (_parent: unknown, args: { input?: AgentWorkflowToolInput | null }) => createAgentTaskGraph(args.input || {}),
  },
  Mutation: {
    executeAdvancedAgentTool: async (_parent: unknown, args: { input: AdvancedToolMutationInput }) => {
      const request = readAdvancedToolRequest(args.input);
      const output = await executeAdvancedTool(request.tool, request.input);
      const outputRecord =
        output && typeof output === 'object' && !Array.isArray(output)
          ? (output as { status?: string; summary?: string; reason?: string; confirmationRequired?: boolean })
          : {};
      return {
        status: outputRecord.status || 'completed',
        summary: outputRecord.summary || outputRecord.reason || args.input.tool,
        output,
        confirmationRequired: outputRecord.status === 'confirmation_required' || outputRecord.confirmationRequired === true,
      };
    },
  },
};
