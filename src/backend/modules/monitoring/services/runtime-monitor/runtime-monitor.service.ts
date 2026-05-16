import {
  AIAgentAppDeploymentEntity,
  AIAgentRunEntity,
  AIAgentSessionEntity,
  AIAgentSwarmEntity,
  AIAgentSwarmWorkerEntity,
  UserEntity,
  WorkflowEventEntity,
  WorkflowExecutionEntity,
  WorkflowLogEntity,
} from '@connectingmatrix/orm/repositories/entities';
import { GigaORM } from '@connectingmatrix/orm/orm';
import { listIngestionJobs, readIngestionJobLogs } from './runtime-process.registry';
import { resolveRuntimeMonitorScope } from './runtime-monitor.scope';
import type { GraphqlResolverContext } from '@giga/shared/types/contracts/graphql.types';
import type {
  RuntimeLogRow,
  RuntimeLogLevel,
  RuntimeMetric,
  RuntimeMonitorInput,
  RuntimeMonitorPayload,
  RuntimeProcessRow,
  RuntimeStatus,
  RuntimeUserRow,
} from './runtime-monitor.types';

type ProcessWithOwner = { row: RuntimeProcessRow; ownerUserId: string | null; createdAt: string };
const workflowExecutionFields = 'id,workflow_id,status,user_id,scope_type,scope_id,created_at,started_at';
const agentSessionFields = 'id,agent_id,status,user_id,organization_id,created_at,started_at';
const agentRunFields = 'id,agent_id,session_id,status,created_at,started_at';
const swarmFields = 'id,goal,status,created_by,owner_id,organization_id,created_at';
const swarmWorkerFields = 'id,swarm_id,role,status,created_at';
const deploymentFields = 'id,app_name,app_slug,build_id,status,user_id,organization_id,created_at';
const readText = (value?: string | null) => String(value || '').trim();
const readLower = (value?: string | null) => readText(value).toLowerCase();
const readCount = (value?: number | null, fallback = 0) => Math.max(0, Math.floor(Number(value || fallback)));
const isRunning = (status: RuntimeStatus) => status === 'running' || status === 'active' || status === 'high-cpu';
const cpuByStatus = (status: RuntimeStatus) => (status === 'running' ? '24%' : status === 'high-cpu' ? '82%' : status === 'queued' ? '5%' : '0%');
const memoryByStatus = (status: RuntimeStatus) =>
  status === 'running' ? '512MB' : status === 'high-cpu' ? '1.2GB' : status === 'queued' ? '128MB' : '64MB';

const normalizeStatus = (value?: string | null): RuntimeStatus => {
  const status = readLower(value);
  if (status.includes('high') && status.includes('cpu')) return 'high-cpu';
  if (status.includes('running') || status.includes('execut') || status.includes('processing')) return 'running';
  if (status.includes('queued') || status.includes('pending') || status.includes('planning')) return 'queued';
  if (status.includes('cancel')) return 'cancelled';
  if (status.includes('failed') || status.includes('error')) return 'failed';
  if (status.includes('sleep') || status.includes('wait')) return 'sleeping';
  if (status.includes('stopped') || status.includes('stop')) return 'stopped';
  if (status.includes('zombie')) return 'zombie';
  return 'active';
};

const normalizeLevel = (value?: string | null): RuntimeLogLevel => {
  const level = readLower(value);
  if (level.includes('error') || level.includes('fatal')) return 'ERROR';
  if (level.includes('warn')) return 'WARN';
  if (level.includes('debug') || level.includes('trace')) return 'DEBUG';
  return 'INFO';
};

const runtimeStatusFromIngestion = (value: string): RuntimeStatus => {
  if (value === 'DONE') return 'stopped';
  if (value === 'FAILED') return 'failed';
  if (value === 'CANCELLED') return 'cancelled';
  if (value === 'QUEUED') return 'queued';
  return 'running';
};

const applyWindow = <T>(rows: T[], first: number, offset: number): T[] => rows.slice(offset, offset + first);
const applySearch = <T>(rows: T[], search: string, match: (row: T) => string): T[] =>
  !search ? rows : rows.filter((row) => match(row).includes(search));
const uniqueById = <T extends { id?: string | null }>(rows: T[]): T[] =>
  Array.from(new Map(rows.map((row) => [readText(row.id), row])).values()).filter((row) => readText(row.id));
const searchLine = (...values: Array<string | null | undefined>) => values.map((value) => readLower(value)).join(' ');

async function readWorkflowRows(
  scopeOrgId: string | null,
  scopeUserIds: string[] | null,
  callerUserId: string,
  limit: number,
): Promise<WorkflowExecutionEntity[]> {
  if (!scopeOrgId && !scopeUserIds)
    return WorkflowExecutionEntity.find().select(workflowExecutionFields).orderBy('created_at', 'desc').limit(limit).many();
  if (!scopeOrgId && scopeUserIds?.length === 1)
    return WorkflowExecutionEntity.find({ user_id: scopeUserIds[0] })
      .select(workflowExecutionFields)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .many();
  if (!scopeOrgId && scopeUserIds)
    return WorkflowExecutionEntity.find()
      .whereIn('user_id', scopeUserIds)
      .select(workflowExecutionFields)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .many();
  if (!scopeOrgId)
    return WorkflowExecutionEntity.find({ user_id: callerUserId }).select(workflowExecutionFields).orderBy('created_at', 'desc').limit(limit).many();
  const byOrgScope = await WorkflowExecutionEntity.find({ scope_type: 'organization', scope_id: scopeOrgId })
    .select(workflowExecutionFields)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .many();
  const byUsers = scopeUserIds?.length
    ? await WorkflowExecutionEntity.find()
        .whereIn('user_id', scopeUserIds)
        .select(workflowExecutionFields)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .many()
    : [];
  return uniqueById([...byOrgScope, ...byUsers]);
}

async function readAgentRows(scopeOrgId: string | null, scopeUserIds: string[] | null, callerUserId: string, limit: number) {
  const sessions =
    !scopeOrgId && !scopeUserIds
      ? await AIAgentSessionEntity.find().select(agentSessionFields).orderBy('created_at', 'desc').limit(limit).many()
      : scopeOrgId
      ? await AIAgentSessionEntity.find({ organization_id: scopeOrgId }).select(agentSessionFields).orderBy('created_at', 'desc').limit(limit).many()
      : scopeUserIds?.length
      ? await AIAgentSessionEntity.find()
          .whereIn('user_id', scopeUserIds)
          .select(agentSessionFields)
          .orderBy('created_at', 'desc')
          .limit(limit)
          .many()
      : await AIAgentSessionEntity.find({ user_id: callerUserId }).select(agentSessionFields).orderBy('created_at', 'desc').limit(limit).many();
  const sessionIds = sessions.map((row) => readText(row.id)).filter(Boolean);
  const runs =
    !scopeOrgId && !scopeUserIds
      ? await AIAgentRunEntity.find().select(agentRunFields).orderBy('created_at', 'desc').limit(limit).many()
      : sessionIds.length
      ? await AIAgentRunEntity.find().whereIn('session_id', sessionIds).select(agentRunFields).orderBy('created_at', 'desc').limit(limit).many()
      : [];
  return { sessions, runs };
}

async function readSwarmRows(scopeOrgId: string | null, scopeUserIds: string[] | null, callerUserId: string, limit: number) {
  const swarms =
    !scopeOrgId && !scopeUserIds
      ? await AIAgentSwarmEntity.find().select(swarmFields).orderBy('created_at', 'desc').limit(limit).many()
      : scopeOrgId
      ? uniqueById([
          ...(await AIAgentSwarmEntity.find({ organization_id: scopeOrgId }).select(swarmFields).orderBy('created_at', 'desc').limit(limit).many()),
          ...(scopeUserIds?.length
            ? await AIAgentSwarmEntity.find()
                .whereIn('created_by', scopeUserIds)
                .select(swarmFields)
                .orderBy('created_at', 'desc')
                .limit(limit)
                .many()
            : []),
        ])
      : scopeUserIds?.length
      ? uniqueById([
          ...(await AIAgentSwarmEntity.find()
            .whereIn('created_by', scopeUserIds)
            .select(swarmFields)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .many()),
          ...(await AIAgentSwarmEntity.find()
            .whereIn('owner_id', scopeUserIds)
            .select(swarmFields)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .many()),
        ])
      : uniqueById([
          ...(await AIAgentSwarmEntity.find({ created_by: callerUserId }).select(swarmFields).orderBy('created_at', 'desc').limit(limit).many()),
          ...(await AIAgentSwarmEntity.find({ owner_id: callerUserId }).select(swarmFields).orderBy('created_at', 'desc').limit(limit).many()),
        ]);
  const swarmIds = swarms.map((row) => readText(row.id)).filter(Boolean);
  const workers = swarmIds.length
    ? await AIAgentSwarmWorkerEntity.find()
        .whereIn('swarm_id', swarmIds)
        .select(swarmWorkerFields)
        .orderBy('created_at', 'desc')
        .limit(limit * 3)
        .many()
    : [];
  return { swarms, workers };
}

async function readDeploymentRows(scopeOrgId: string | null, scopeUserIds: string[] | null, callerUserId: string, limit: number) {
  if (!scopeOrgId && !scopeUserIds)
    return AIAgentAppDeploymentEntity.find().select(deploymentFields).orderBy('created_at', 'desc').limit(limit).many();
  if (scopeOrgId)
    return uniqueById([
      ...(await AIAgentAppDeploymentEntity.find({ organization_id: scopeOrgId })
        .select(deploymentFields)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .many()),
      ...(scopeUserIds?.length
        ? await AIAgentAppDeploymentEntity.find()
            .whereIn('user_id', scopeUserIds)
            .select(deploymentFields)
            .orderBy('created_at', 'desc')
            .limit(limit)
            .many()
        : []),
    ]);
  if (scopeUserIds?.length)
    return AIAgentAppDeploymentEntity.find()
      .whereIn('user_id', scopeUserIds)
      .select(deploymentFields)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .many();
  return AIAgentAppDeploymentEntity.find({ user_id: callerUserId }).select(deploymentFields).orderBy('created_at', 'desc').limit(limit).many();
}

export async function readRuntimeMonitor(ctx: GraphqlResolverContext, input: RuntimeMonitorInput): Promise<RuntimeMonitorPayload> {
  const scope = await resolveRuntimeMonitorScope(ctx, input);
  const first = Math.min(200, readCount(input.first, 50));
  const offset = readCount(input.offset, 0);
  const limit = Math.max(first + offset + 25, 50);
  const search = readLower(input.search);
  return GigaORM.run({ caller: { id: 'runtime-monitor-service', type: 'root' } }, async () => {
    const now = new Date();
    const includeWorkflows = input.kind === 'processes' || input.kind === 'workflows';
    const includeAgents = input.kind === 'processes' || input.kind === 'agents';
    const includeSwarms = input.kind === 'processes' || input.kind === 'swarms';
    const includeApplications = input.kind === 'processes' || input.kind === 'applications';
    const includeIngestions = input.kind === 'processes' || input.kind === 'agents' || input.kind === 'ingestions';
    const [workflows, agents, swarms, applications] = await Promise.all([
      includeWorkflows ? readWorkflowRows(scope.organizationId, scope.visibleUserIds, scope.callerUserId, limit) : Promise.resolve([]),
      includeAgents
        ? readAgentRows(scope.organizationId, scope.visibleUserIds, scope.callerUserId, limit)
        : Promise.resolve({ sessions: [], runs: [] }),
      includeSwarms
        ? readSwarmRows(scope.organizationId, scope.visibleUserIds, scope.callerUserId, limit)
        : Promise.resolve({ swarms: [], workers: [] }),
      includeApplications ? readDeploymentRows(scope.organizationId, scope.visibleUserIds, scope.callerUserId, limit) : Promise.resolve([]),
    ]);

    const workflowProcesses: ProcessWithOwner[] = workflows.map((row) => {
      const status = normalizeStatus(row.status);
      return {
        row: {
          id: `workflow:${readText(row.id)}`,
          parentId: null,
          userId: readText(row.user_id) || null,
          name: `Workflow ${readText(row.workflow_id) || readText(row.id)}`,
          icon: 'workflow',
          pid: readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: 0,
        },
        ownerUserId: readText(row.user_id) || null,
        createdAt: readText(row.created_at) || readText(row.started_at) || now.toISOString(),
      };
    });
    const sessionProcesses: ProcessWithOwner[] = agents.sessions.map((row) => {
      const status = normalizeStatus(row.status);
      return {
        row: {
          id: `agent-session:${readText(row.id)}`,
          parentId: null,
          userId: readText(row.user_id) || null,
          name: `Agent Session ${readText(row.agent_id) || readText(row.id)}`,
          icon: 'agent-session',
          pid: readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: 0,
        },
        ownerUserId: readText(row.user_id) || null,
        createdAt: readText(row.created_at) || readText(row.started_at) || now.toISOString(),
      };
    });
    const runProcesses: ProcessWithOwner[] = agents.runs.map((row) => {
      const status = normalizeStatus(row.status);
      const sessionId = readText(row.session_id);
      return {
        row: {
          id: `agent-run:${readText(row.id)}`,
          parentId: sessionId ? `agent-session:${sessionId}` : null,
          userId: null,
          name: `Agent Run ${readText(row.agent_id) || readText(row.id)}`,
          icon: 'agent-run',
          pid: readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: sessionId ? 1 : 0,
        },
        ownerUserId: null,
        createdAt: readText(row.created_at) || readText(row.started_at) || now.toISOString(),
      };
    });
    const swarmProcesses: ProcessWithOwner[] = swarms.swarms.map((row) => {
      const status = normalizeStatus(row.status);
      return {
        row: {
          id: `swarm:${readText(row.id)}`,
          parentId: null,
          userId: readText(row.created_by) || readText(row.owner_id) || null,
          name: `Swarm ${readText(row.goal) || readText(row.id)}`,
          icon: 'swarm',
          pid: readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: 0,
        },
        ownerUserId: readText(row.created_by) || readText(row.owner_id) || null,
        createdAt: readText(row.created_at) || now.toISOString(),
      };
    });
    const swarmWorkerProcesses: ProcessWithOwner[] = swarms.workers.map((row) => {
      const status = normalizeStatus(row.status);
      return {
        row: {
          id: `swarm-worker:${readText(row.id)}`,
          parentId: `swarm:${readText(row.swarm_id)}`,
          userId: null,
          name: `Swarm Worker ${readText(row.role) || readText(row.id)}`,
          icon: 'swarm-worker',
          pid: readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: 1,
        },
        ownerUserId: null,
        createdAt: readText(row.created_at) || now.toISOString(),
      };
    });
    const applicationProcesses: ProcessWithOwner[] = applications.map((row) => {
      const status = normalizeStatus(row.status);
      return {
        row: {
          id: `application:${readText(row.id)}`,
          parentId: null,
          userId: readText(row.user_id) || null,
          name: readText(row.app_name) || readText(row.app_slug) || readText(row.id),
          icon: 'application',
          pid: readText(row.build_id) || readText(row.id),
          cpu: cpuByStatus(status),
          memory: memoryByStatus(status),
          status,
          depth: 0,
        },
        ownerUserId: readText(row.user_id) || null,
        createdAt: readText(row.created_at) || now.toISOString(),
      };
    });
    const ingestionRecords = includeIngestions
      ? listIngestionJobs().filter((row) => {
          if (scope.mode === 'root' && !scope.visibleUserIds) return true;
          if (!scope.visibleUserIds) return row.userId === scope.callerUserId;
          return scope.visibleUserIds.includes(row.userId);
        })
      : [];
    const ingestionProcesses: ProcessWithOwner[] = ingestionRecords.map((row) => {
      const status = runtimeStatusFromIngestion(row.status);
      const parentId = row.parentScopeId ? `post:${row.parentScopeId}` : null;
      return {
        row: {
          id: `ingestion:${row.ingestionJobId}`,
          parentId,
          userId: row.userId,
          name: `Agent Ingestion ${row.ingestionJobId}`,
          icon: 'ingestion',
          pid: row.processId,
          cpu: `${Math.round(row.cpu)}%`,
          memory: `${Math.round(row.ramMb)}MB`,
          status,
          depth: 0,
        },
        ownerUserId: row.userId,
        createdAt: row.createdAt,
      };
    });
    const ingestionLogs = ingestionRecords
      .flatMap((row) => readIngestionJobLogs(row.ingestionJobId))
      .map(
        (row): RuntimeLogRow => ({
          id: `ingestion-log:${row.ingestionJobId}:${row.iteration}`,
          time: row.timestamp,
          process: `ingestion:${row.ingestionJobId}`,
          pid: row.processId,
          level: row.level,
          message: row.message,
        }),
      );

    const executionIds = workflows.map((row) => readText(row.id)).filter(Boolean);
    const workflowLogs = executionIds.length
      ? await WorkflowLogEntity.find()
          .whereIn('workflow_execution_id', executionIds)
          .orderBy('created_at', 'desc')
          .limit(limit * 2)
          .many()
      : [];
    const workflowEvents = executionIds.length
      ? await WorkflowEventEntity.find()
          .whereIn('workflow_execution_id', executionIds)
          .orderBy('created_at', 'desc')
          .limit(limit * 2)
          .many()
      : [];
    const logs = [
      ...workflowLogs.map(
        (row): RuntimeLogRow => ({
          id: `log:${readText(row.id)}`,
          time: readText(row.created_at) || now.toISOString(),
          process: `workflow:${readText(row.workflow_execution_id)}`,
          pid: readText(row.workflow_execution_id),
          level: normalizeLevel(row.level),
          message: readText(row.message) || 'Workflow log',
        }),
      ),
      ...workflowEvents.map(
        (row): RuntimeLogRow => ({
          id: `event:${readText(row.id)}`,
          time: readText(row.created_at) || now.toISOString(),
          process: `workflow:${readText(row.workflow_execution_id)}`,
          pid: readText(row.workflow_execution_id),
          level: 'INFO',
          message: readText(row.event_type) || 'Workflow event',
        }),
      ),
      ...ingestionLogs,
    ].sort((a, b) => readText(b.time).localeCompare(readText(a.time)));

    const allProcesses = [
      ...workflowProcesses,
      ...sessionProcesses,
      ...runProcesses,
      ...swarmProcesses,
      ...swarmWorkerProcesses,
      ...applicationProcesses,
      ...ingestionProcesses,
    ];
    const kindProcesses =
      input.kind === 'workflows'
        ? workflowProcesses
        : input.kind === 'agents'
        ? [...sessionProcesses, ...runProcesses, ...ingestionProcesses]
        : input.kind === 'swarms'
        ? [...swarmProcesses, ...swarmWorkerProcesses]
        : input.kind === 'applications'
        ? applicationProcesses
        : input.kind === 'ingestions'
        ? ingestionProcesses
        : allProcesses;
    const filteredProcesses = applySearch(kindProcesses, search, (entry) =>
      searchLine(entry.row.id, entry.row.name, entry.row.pid, entry.row.status),
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const filteredLogs = applySearch(logs, search, (row) => searchLine(row.id, row.process, row.pid, row.level, row.message));

    const processUsers = Array.from(new Set(filteredProcesses.map((entry) => readText(entry.ownerUserId)).filter(Boolean)));
    const scopedUserIds = scope.visibleUserIds?.length ? scope.visibleUserIds : [];
    const queryUserIds = scope.mode === 'root' && !scope.visibleUserIds ? [] : Array.from(new Set([...processUsers, ...scopedUserIds]));
    const users =
      scope.mode === 'root' && !scope.visibleUserIds
        ? await UserEntity.find().select('id,name,firstName,lastName,username,email').orderBy('createdAt', 'desc').limit(limit).many()
        : queryUserIds.length
        ? await UserEntity.find().whereIn('id', queryUserIds).select('id,name,firstName,lastName,username,email').many()
        : [];
    const processCountByUser = filteredProcesses.reduce<Record<string, number>>((state, entry) => {
      const id = readText(entry.ownerUserId);
      if (!id) return state;
      state[id] = (state[id] || 0) + 1;
      return state;
    }, {});
    const userRowsAll: RuntimeUserRow[] = users.map((row) => {
      const userId = readText(row.id);
      const running = processCountByUser[userId] || 0;
      const status: RuntimeStatus = running > 0 ? 'running' : 'sleeping';
      return {
        id: userId,
        name:
          readText(row.name) ||
          `${readText(row.firstName)} ${readText(row.lastName)}`.trim() ||
          readText(row.username) ||
          readText(row.email) ||
          userId,
        cpu: running > 0 ? '18%' : '1%',
        memory: running > 0 ? '420MB' : '96MB',
        processes: running,
        status,
      };
    });
    const userRows = applyWindow(
      applySearch(userRowsAll, search, (row) => searchLine(row.id, row.name, row.status)),
      first,
      offset,
    );
    const processes = applyWindow(
      filteredProcesses.map((entry) => entry.row),
      first,
      offset,
    );
    const logRows = applyWindow(filteredLogs, first, offset);
    const oldest = filteredProcesses.reduce((value, row) => (!value || row.createdAt < value ? row.createdAt : value), '');
    const uptimeMs = oldest ? Math.max(0, now.getTime() - new Date(oldest).getTime()) : 0;
    const uptimeHours = Math.floor(uptimeMs / 3_600_000);
    const uptimeMinutes = Math.floor((uptimeMs % 3_600_000) / 60_000);
    const metrics: RuntimeMetric[] = [
      {
        label:
          input.kind === 'workflows'
            ? 'Running Workflows'
            : input.kind === 'agents'
            ? 'Running Agents'
            : input.kind === 'swarms'
            ? 'Running Swarms'
            : input.kind === 'applications'
            ? 'Hosted Applications'
            : input.kind === 'ingestions'
            ? 'Ingestion Jobs'
            : 'Total Processes',
        value: String(filteredProcesses.length),
        tone: 'blue',
        points: [0, filteredProcesses.length / 2, filteredProcesses.length],
      },
      { label: 'Visible Users', value: String(userRowsAll.length), tone: 'green', points: [0, userRowsAll.length / 2, userRowsAll.length] },
      {
        label: 'Running',
        value: String(filteredProcesses.filter((entry) => isRunning(entry.row.status)).length),
        tone: 'cyan',
        points: [0, 1, filteredProcesses.filter((entry) => isRunning(entry.row.status)).length],
      },
      {
        label: 'Failures',
        value: String(filteredProcesses.filter((entry) => entry.row.status === 'failed').length),
        tone: 'red',
        points: [0, 0, filteredProcesses.filter((entry) => entry.row.status === 'failed').length],
      },
      { label: 'Logs', value: String(filteredLogs.length), tone: 'purple', points: [0, filteredLogs.length / 3, filteredLogs.length] },
    ];

    return {
      mode: scope.mode,
      kind: input.kind,
      scopeLabel: scope.scopeLabel,
      metrics,
      users: userRows,
      processes,
      logs: logRows,
      updatedAt: now.toISOString(),
      uptime: `${uptimeHours}h ${uptimeMinutes}m`,
    };
  });
}
