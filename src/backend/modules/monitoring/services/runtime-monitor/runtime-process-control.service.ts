import { BadRequestError } from 'routing-controllers';
import { resolveRuntimeMonitorScope } from './runtime-monitor.scope';
import {
  cancelIngestionProcess,
  readIngestionJobById,
  readIngestionJobByProcessId,
  readIngestionJobLogs,
  type IngestionJobSnapshot,
  type RuntimeProcessControlMode,
} from './runtime-process.registry';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type { RuntimeMonitorInput } from './runtime-monitor.types';

export type RuntimeMonitorProcessControlPayload = {
  accepted: boolean;
  processId: string;
  ingestionJobId: string | null;
  status: string;
  message: string;
};

export type IngestionJobReadPayload = {
  job: IngestionJobSnapshot;
  logs: ReturnType<typeof readIngestionJobLogs>;
};

const hasAccess = (scope: Awaited<ReturnType<typeof resolveRuntimeMonitorScope>>, job: IngestionJobSnapshot) => {
  if (scope.mode === 'root' && !scope.visibleUserIds) return true;
  if (!scope.visibleUserIds?.length) return scope.callerUserId === job.userId;
  return scope.visibleUserIds.includes(job.userId);
};

const scopeInput: RuntimeMonitorInput = {
  kind: 'ingestions',
  organizationId: null,
  userId: null,
  first: 1,
  offset: 0,
  search: null,
};

export async function readIngestionJob(context: GraphqlResolverContext, ingestionJobId: string): Promise<IngestionJobReadPayload> {
  const scope = await resolveRuntimeMonitorScope(context, scopeInput);
  const job = readIngestionJobById(ingestionJobId);
  if (!job) throw new BadRequestError('Ingestion job not found.');
  if (!hasAccess(scope, job)) throw new BadRequestError('Access denied for ingestion job.');
  return { job, logs: readIngestionJobLogs(ingestionJobId) };
}

export async function controlRuntimeProcess(
  context: GraphqlResolverContext,
  processId: string,
  mode: RuntimeProcessControlMode,
): Promise<RuntimeMonitorProcessControlPayload> {
  const scope = await resolveRuntimeMonitorScope(context, scopeInput);
  const job = readIngestionJobByProcessId(processId);
  if (!job) throw new BadRequestError('Runtime process not found or not controllable.');
  if (!hasAccess(scope, job)) throw new BadRequestError('Access denied for runtime process.');
  const snapshot = await cancelIngestionProcess(processId, mode);
  return {
    accepted: true,
    processId,
    ingestionJobId: snapshot.ingestionJobId,
    status: snapshot.status,
    message: mode === 'kill' ? 'Process killed.' : 'Process stopped.',
  };
}
