export type RuntimeMonitorKind = 'processes' | 'workflows' | 'agents' | 'swarms' | 'applications' | 'ingestions';
export type RuntimeMonitorMode = 'root' | 'orgAdmin' | 'user';
export type RuntimeStatus = 'running' | 'sleeping' | 'high-cpu' | 'stopped' | 'zombie' | 'active' | 'queued' | 'failed' | 'cancelled';
export type RuntimeLogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';

export interface RuntimeMetric {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'purple' | 'red' | 'cyan';
  points: number[];
}

export interface RuntimeUserRow {
  id: string;
  name: string;
  cpu: string;
  memory: string;
  processes: number;
  status: RuntimeStatus;
}

export interface RuntimeProcessRow {
  id: string;
  parentId: string | null;
  userId?: string | null;
  name: string;
  icon: string;
  pid: string;
  cpu: string;
  memory: string;
  status: RuntimeStatus;
  depth: number;
}

export interface RuntimeLogRow {
  id: string;
  time: string;
  process: string;
  pid: string;
  level: RuntimeLogLevel;
  message: string;
}

export interface RuntimeMonitorInput {
  kind: RuntimeMonitorKind;
  organizationId?: string | null;
  userId?: string | null;
  first?: number | null;
  offset?: number | null;
  search?: string | null;
}

export interface RuntimeMonitorScope {
  mode: RuntimeMonitorMode;
  callerUserId: string;
  organizationId: string | null;
  visibleUserIds: string[] | null;
  scopeLabel: string;
}

export interface RuntimeMonitorPayload {
  mode: RuntimeMonitorMode;
  kind: RuntimeMonitorKind;
  scopeLabel: string;
  metrics: RuntimeMetric[];
  users: RuntimeUserRow[];
  processes: RuntimeProcessRow[];
  logs: RuntimeLogRow[];
  updatedAt: string;
  uptime: string;
}
