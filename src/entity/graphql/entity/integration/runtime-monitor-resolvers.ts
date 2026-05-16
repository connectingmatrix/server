import { controlRuntimeProcess, readIngestionJob, readRuntimeMonitor } from '@giga/process-monitoring/services/runtime-monitor';
import { EntityRequestContext } from '@connectingmatrix/orm/orm/request-entity-context';
import type { RuntimeMonitorInput } from '@giga/process-monitoring/services/runtime-monitor';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';

async function withGraphqlEntityContext<T>(context: GraphqlResolverContext, callback: () => Promise<T>): Promise<T> {
  if (EntityRequestContext.maybeCurrent()) return callback();
  return EntityRequestContext.fromRequest(
    {
      request: context.request as unknown as { headers?: Record<string, unknown> },
      supabase: context.supabase,
      requestId: String((context as { requestId?: string | null }).requestId || '').trim() || null,
    },
    callback,
  );
}

export const runtimeMonitorResolvers = {
  Query: {
    runtimeMonitor: async (_parent: unknown, args: { input: RuntimeMonitorInput }, context: GraphqlResolverContext) =>
      withGraphqlEntityContext(context, async () => readRuntimeMonitor(context, args.input)),
    ingestionJob: async (_parent: unknown, args: { input: { ingestionJobId: string } }, context: GraphqlResolverContext) =>
      withGraphqlEntityContext(context, async () => {
        const result = await readIngestionJob(context, args.input.ingestionJobId);
        return {
          ingestion_job_id: result.job.ingestionJobId,
          process_id: result.job.processId,
          user_id: result.job.userId,
          agent_id: result.job.agentId,
          parent_scope_id: result.job.parentScopeId,
          scope_type: result.job.scopeType,
          stage: result.job.stage,
          status: result.job.status,
          percent: result.job.percent,
          processed_items: result.job.processedItems,
          total_items: result.job.totalItems,
          cpu: result.job.cpu,
          ram_mb: result.job.ramMb,
          created_at: result.job.createdAt,
          updated_at: result.job.updatedAt,
          completed_at: result.job.completedAt,
          cancel_mode: result.job.cancelMode,
          logs: result.logs.map((row) => ({
            ingestion_job_id: row.ingestionJobId,
            process_id: row.processId,
            user_id: row.userId,
            agent_id: row.agentId,
            parent_scope_id: row.parentScopeId,
            scope_type: row.scopeType,
            level: row.level,
            message: row.message,
            iteration: row.iteration,
            cpu: row.cpu,
            ram_mb: row.ramMb,
            timestamp: row.timestamp,
          })),
        };
      }),
  },
  Mutation: {
    runtimeMonitorStopProcess: async (_parent: unknown, args: { processId: string }, context: GraphqlResolverContext) =>
      withGraphqlEntityContext(context, async () => controlRuntimeProcess(context, args.processId, 'stop')),
    runtimeMonitorKillProcess: async (_parent: unknown, args: { processId: string }, context: GraphqlResolverContext) =>
      withGraphqlEntityContext(context, async () => controlRuntimeProcess(context, args.processId, 'kill')),
  },
};
