import { randomUUID } from 'crypto';
import { emitAgentIngestionLog, emitAgentIngestionProgress, emitRuntimeEvent } from '@giga/process-monitoring/socket/runtime/event-bus';
import type { RuntimeLogLevel } from './runtime-monitor.types';

export type IngestionStatus = 'QUEUED' | 'RUNNING' | 'CHUNKED' | 'INDEXED' | 'DONE' | 'FAILED' | 'CANCELLED';
export type IngestionStage = 'queued' | 'running' | 'chunked' | 'indexed' | 'done' | 'failed' | 'cancelled';
export type RuntimeProcessScopeType = 'AGENT_INGESTION';
export type RuntimeProcessControlMode = 'stop' | 'kill';

export type IngestionLogEntry = {
  ingestionJobId: string;
  processId: string;
  userId: string;
  agentId: string | null;
  parentScopeId: string | null;
  scopeType: RuntimeProcessScopeType;
  level: RuntimeLogLevel;
  message: string;
  iteration: number;
  cpu: number;
  ramMb: number;
  timestamp: string;
};

export type IngestionJobSnapshot = {
  ingestionJobId: string;
  processId: string;
  userId: string;
  agentId: string | null;
  parentScopeId: string | null;
  scopeType: RuntimeProcessScopeType;
  stage: IngestionStage;
  status: IngestionStatus;
  percent: number;
  processedItems: number;
  totalItems: number;
  cpu: number;
  ramMb: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelMode: RuntimeProcessControlMode | null;
};

type IngestionProcessEntry = IngestionJobSnapshot & {
  logs: IngestionLogEntry[];
  abortController: AbortController;
  onCancel: ((mode: RuntimeProcessControlMode) => Promise<void>) | null;
};

export type CreateIngestionProcessInput = {
  userId: string;
  agentId?: string | null;
  parentScopeId?: string | null;
  totalItems?: number;
  onCancel?: (mode: RuntimeProcessControlMode) => Promise<void>;
};

export type UpdateIngestionProgressInput = {
  ingestionJobId: string;
  stage: IngestionStage;
  percent?: number;
  processedItems?: number;
  totalItems?: number;
  cpu?: number;
  ramMb?: number;
};

export type AppendIngestionLogInput = {
  ingestionJobId: string;
  level: RuntimeLogLevel;
  message: string;
  iteration?: number;
  cpu?: number;
  ramMb?: number;
};

const jobByIngestionId = new Map<string, IngestionProcessEntry>();
const ingestionIdByProcessId = new Map<string, string>();

const readNumber = (value: number | undefined, fallback: number) => {
  if (Number.isFinite(value)) return Math.max(0, Number(value));
  return fallback;
};
const readPercent = (value: number | undefined, fallback: number) => Math.max(0, Math.min(100, readNumber(value, fallback)));
const readIso = () => new Date().toISOString();

const statusByStage = (stage: IngestionStage): IngestionStatus => {
  if (stage === 'queued') return 'QUEUED';
  if (stage === 'running') return 'RUNNING';
  if (stage === 'chunked') return 'CHUNKED';
  if (stage === 'indexed') return 'INDEXED';
  if (stage === 'done') return 'DONE';
  if (stage === 'cancelled') return 'CANCELLED';
  return 'FAILED';
};

const isTerminal = (stage: IngestionStage) => stage === 'done' || stage === 'failed' || stage === 'cancelled';
const toLogLevel = (level: RuntimeLogLevel): 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' => level;
const toSnapshot = (entry: IngestionProcessEntry): IngestionJobSnapshot => {
  const { logs, abortController, onCancel, ...snapshot } = entry;
  return snapshot;
};

const emitProgress = (entry: IngestionProcessEntry) => {
  const payload = {
    ingestionJobId: entry.ingestionJobId,
    processId: entry.processId,
    agentId: entry.agentId,
    userId: entry.userId,
    parentScopeId: entry.parentScopeId,
    scopeType: entry.scopeType,
    stage: entry.stage,
    percent: entry.percent,
    processedItems: entry.processedItems,
    totalItems: entry.totalItems,
    cpu: entry.cpu,
    ramMb: entry.ramMb,
    timestamp: entry.updatedAt,
  };
  emitAgentIngestionProgress(payload);
  emitRuntimeEvent({
    kind: 'dataset.ingestion',
    status: entry.stage,
    processId: entry.processId,
    ingestionJobId: entry.ingestionJobId,
    scopeType: entry.scopeType,
    parentScopeId: entry.parentScopeId,
    userId: entry.userId,
    agentId: entry.agentId,
    cpu: entry.cpu,
    ramMb: entry.ramMb,
    message: `ingestion.${entry.stage}`,
    timestamp: entry.updatedAt,
  });
};

const emitLog = (entry: IngestionProcessEntry, row: IngestionLogEntry) => {
  emitAgentIngestionLog({
    ingestionJobId: row.ingestionJobId,
    processId: row.processId,
    agentId: row.agentId,
    userId: row.userId,
    parentScopeId: row.parentScopeId,
    scopeType: row.scopeType,
    level: row.level,
    message: row.message,
    iteration: row.iteration,
    cpu: row.cpu,
    ramMb: row.ramMb,
    timestamp: row.timestamp,
  });
  emitRuntimeEvent({
    kind: 'dataset.ingestion',
    status: entry.stage,
    processId: row.processId,
    ingestionJobId: row.ingestionJobId,
    scopeType: row.scopeType,
    parentScopeId: row.parentScopeId,
    userId: row.userId,
    agentId: row.agentId,
    cpu: row.cpu,
    ramMb: row.ramMb,
    logLevel: toLogLevel(row.level),
    message: row.message,
    iteration: row.iteration,
    timestamp: row.timestamp,
  });
};

const getEntry = (ingestionJobId: string) => {
  const entry = jobByIngestionId.get(ingestionJobId);
  if (!entry) throw new Error(`Ingestion job ${ingestionJobId} not found.`);
  return entry;
};

const setStage = (entry: IngestionProcessEntry, stage: IngestionStage, update: Omit<UpdateIngestionProgressInput, 'ingestionJobId' | 'stage'>) => {
  if (isTerminal(entry.stage)) return entry;
  entry.stage = stage;
  entry.status = statusByStage(stage);
  entry.percent = readPercent(update.percent, entry.percent);
  entry.processedItems = Math.floor(readNumber(update.processedItems, entry.processedItems));
  entry.totalItems = Math.floor(readNumber(update.totalItems, entry.totalItems));
  entry.cpu = readNumber(update.cpu, entry.cpu);
  entry.ramMb = readNumber(update.ramMb, entry.ramMb);
  entry.updatedAt = readIso();
  if (isTerminal(stage)) entry.completedAt = entry.updatedAt;
  emitProgress(entry);
  return entry;
};

export function createIngestionProcess(input: CreateIngestionProcessInput): IngestionJobSnapshot {
  const createdAt = readIso();
  const ingestionJobId = randomUUID();
  const processId = randomUUID();
  const entry: IngestionProcessEntry = {
    ingestionJobId,
    processId,
    userId: input.userId,
    agentId: input.agentId || null,
    parentScopeId: input.parentScopeId || null,
    scopeType: 'AGENT_INGESTION',
    stage: 'queued',
    status: 'QUEUED',
    percent: 0,
    processedItems: 0,
    totalItems: Math.floor(readNumber(input.totalItems, 0)),
    cpu: 0,
    ramMb: 0,
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    cancelMode: null,
    logs: [],
    abortController: new AbortController(),
    onCancel: input.onCancel || null,
  };
  jobByIngestionId.set(ingestionJobId, entry);
  ingestionIdByProcessId.set(processId, ingestionJobId);
  emitProgress(entry);
  return toSnapshot(entry);
}

export function markIngestionRunning(ingestionJobId: string): IngestionJobSnapshot {
  const entry = setStage(getEntry(ingestionJobId), 'running', { percent: 5 });
  return toSnapshot(entry);
}

export function updateIngestionProgress(input: UpdateIngestionProgressInput): IngestionJobSnapshot {
  const entry = setStage(getEntry(input.ingestionJobId), input.stage, input);
  return toSnapshot(entry);
}

export function appendIngestionLog(input: AppendIngestionLogInput): IngestionLogEntry {
  const entry = getEntry(input.ingestionJobId);
  const row: IngestionLogEntry = {
    ingestionJobId: entry.ingestionJobId,
    processId: entry.processId,
    userId: entry.userId,
    agentId: entry.agentId,
    parentScopeId: entry.parentScopeId,
    scopeType: entry.scopeType,
    level: input.level,
    message: input.message,
    iteration: Math.floor(readNumber(input.iteration, entry.logs.length + 1)),
    cpu: readNumber(input.cpu, entry.cpu),
    ramMb: readNumber(input.ramMb, entry.ramMb),
    timestamp: readIso(),
  };
  entry.logs.push(row);
  entry.updatedAt = row.timestamp;
  emitLog(entry, row);
  return row;
}

export async function cancelIngestionProcess(processId: string, mode: RuntimeProcessControlMode): Promise<IngestionJobSnapshot> {
  const ingestionJobId = ingestionIdByProcessId.get(processId);
  if (!ingestionJobId) throw new Error(`Process ${processId} not found.`);
  const entry = getEntry(ingestionJobId);
  if (entry.onCancel) await entry.onCancel(mode);
  entry.abortController.abort(`runtime-monitor:${mode}`);
  entry.cancelMode = mode;
  const cancelled = setStage(entry, 'cancelled', { percent: entry.percent });
  return toSnapshot(cancelled);
}

export function readIngestionJobById(ingestionJobId: string): IngestionJobSnapshot | null {
  const entry = jobByIngestionId.get(ingestionJobId);
  if (!entry) return null;
  return toSnapshot(entry);
}

export function readIngestionJobByProcessId(processId: string): IngestionJobSnapshot | null {
  const ingestionJobId = ingestionIdByProcessId.get(processId);
  if (!ingestionJobId) return null;
  return readIngestionJobById(ingestionJobId);
}

export function readIngestionJobLogs(ingestionJobId: string): IngestionLogEntry[] {
  const entry = jobByIngestionId.get(ingestionJobId);
  if (!entry) return [];
  return entry.logs.slice();
}

export function listIngestionJobs(): IngestionJobSnapshot[] {
  return Array.from(jobByIngestionId.values())
    .map((entry) => toSnapshot(entry))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readIngestionAbortSignal(ingestionJobId: string): AbortSignal {
  return getEntry(ingestionJobId).abortController.signal;
}
