import { deployGeneratedApp, inspectLiveGeneratedApp } from '@connectingmatrix/ai-agents/services/ai-agents/app-hosting';
import { AIAgentAppDeploymentEntity } from '@connectingmatrix/orm/repositories/entities/runtime/AIAgentAppDeploymentEntity';
import type { GeneratedAppBuildInput, GeneratedAppFile } from '@connectingmatrix/ai-agents/services/ai-agents/app-hosting/contracts/types';

type DeployAgentAppInput = {
  appName: string;
  appSlug?: string | null;
  files: GeneratedAppFile[];
  entryFile?: string | null;
  prompt?: string | null;
  chatId?: string | null;
  workflowId?: string | null;
  runId?: string | null;
  metadata?: GeneratedAppBuildInput['metadata'];
};

type InspectAgentAppInput = {
  deploymentId: string;
  liveUrl: string;
};

type GraphqlContext = {
  userId?: string | null;
  user?: { id?: string | null } | null;
};

export const agentAppLiveResolvers = {
  Query: {
    agentAppDeployment: async (_parent: unknown, args: { id: string }) => AIAgentAppDeploymentEntity.single(args.id),
  },
  Mutation: {
    deployAgentApp: async (_parent: unknown, args: { input: DeployAgentAppInput }, context: GraphqlContext) => {
      const { input } = args;
      const userId = context?.userId || context?.user?.id || null;
      const result = await deployGeneratedApp({
        appName: input.appName,
        appSlug: input.appSlug,
        files: input.files,
        entryFile: input.entryFile || 'index.html',
        sourcePrompt: input.prompt || undefined,
        chatId: input.chatId || null,
        workflowId: input.workflowId || null,
        runId: input.runId || null,
        userId,
        createdBy: userId,
        metadata: input.metadata,
      });
      return {
        id: result.deployment_id,
        appId: result.app_id,
        status: result.status,
        appName: result.manifest.appName,
        appSlug: result.manifest.appSlug,
        buildId: result.build_id,
        liveUrl: result.live_url,
        healthUrl: result.health_url,
        manifestUrl: result.manifest_url,
        manifest: result.manifest,
        inspection: result.inspection,
      };
    },
    inspectAgentApp: async (_parent: unknown, args: { input: InspectAgentAppInput }) =>
      inspectLiveGeneratedApp({ deploymentId: args.input.deploymentId, liveUrl: args.input.liveUrl }),
  },
};
