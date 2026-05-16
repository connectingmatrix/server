create extension if not exists pgcrypto;

create table if not exists ai_agent_projects (
  id uuid primary key,
  agent_id uuid null references ai_agents(id) on delete set null,
  owner_type text not null default 'user',
  owner_id uuid null,
  organization_id uuid null,
  chat_id uuid null,
  name text not null,
  slug text not null,
  description text null,
  project_kind text not null default 'react-vite',
  status text not null default 'draft',
  stack jsonb not null default '{}'::jsonb,
  architecture jsonb not null default '{}'::jsonb,
  files jsonb not null default '[]'::jsonb,
  database_manifest jsonb not null default '{}'::jsonb,
  runtime_manifest jsonb not null default '{}'::jsonb,
  last_run jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_deployments (
  id uuid primary key,
  project_id uuid not null references ai_agent_projects(id) on delete cascade,
  agent_id uuid null references ai_agents(id) on delete set null,
  deployment_kind text not null default 'sandbox',
  status text not null default 'queued',
  url text null,
  local_runner_id uuid null,
  build_log jsonb not null default '[]'::jsonb,
  runtime_state jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_runner_hosts (
  id uuid primary key,
  owner_type text not null default 'user',
  owner_id uuid null,
  organization_id uuid null,
  host_name text not null,
  status text not null default 'pairing',
  port integer null,
  pairing_token_hash text null,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_runner_jobs (
  id uuid primary key,
  runner_host_id uuid not null references ai_agent_runner_hosts(id) on delete cascade,
  project_id uuid null references ai_agent_projects(id) on delete set null,
  job_kind text not null default 'command',
  status text not null default 'waiting_for_approval',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  logs jsonb not null default '[]'::jsonb,
  risk text not null default 'local-computer',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz null,
  completed_at timestamptz null
);

create table if not exists ai_agent_feedback (
  id uuid primary key,
  agent_id uuid null references ai_agents(id) on delete set null,
  run_id uuid null references ai_agent_runs(id) on delete set null,
  session_id uuid null references ai_agents_sessions(id) on delete set null,
  user_id uuid null,
  rating numeric null,
  feedback text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists ai_agent_swarms add column if not exists agent_id uuid;
alter table if exists ai_agent_swarms add column if not exists organization_id uuid;
alter table if exists ai_agent_swarms add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists ai_agent_swarm_workers add column if not exists "index" integer null;
alter table if exists ai_agent_swarm_workers add column if not exists artifacts jsonb not null default '[]'::jsonb;
alter table if exists ai_agent_swarm_workers add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists ai_agent_swarm_workers add column if not exists updated_at timestamptz null;

create table if not exists ai_agent_task_graphs (
  id uuid primary key,
  agent_id uuid null references ai_agents(id) on delete set null,
  session_id uuid null references ai_agents_sessions(id) on delete set null,
  chat_id uuid null,
  owner_type text not null default 'user',
  owner_id uuid null,
  organization_id uuid null,
  goal text not null,
  mode text not null default 'chat',
  status text not null default 'running',
  graph jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_task_steps (
  id uuid primary key,
  task_graph_id uuid not null references ai_agent_task_graphs(id) on delete cascade,
  title text not null,
  description text null,
  status text not null default 'pending',
  owner_role text null,
  depends_on jsonb not null default '[]'::jsonb,
  tool_hints jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  risk text not null default 'none',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_code_system_files (
  id uuid primary key,
  project_id uuid not null references ai_agent_projects(id) on delete cascade,
  path text not null,
  file_kind text null,
  content text not null,
  checksum text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, path)
);

create table if not exists ai_agent_runner_job_logs (
  id uuid primary key,
  runner_job_id uuid not null references ai_agent_runner_jobs(id) on delete cascade,
  level text not null default 'info',
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists ai_agent_gis_operations (
  id uuid primary key,
  agent_id uuid null references ai_agents(id) on delete set null,
  chat_id uuid null,
  operation_kind text not null,
  spec jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  artifact_uri text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_agent_image_operations (
  id uuid primary key,
  agent_id uuid null references ai_agents(id) on delete set null,
  chat_id uuid null,
  operation_kind text not null,
  spec jsonb not null default '{}'::jsonb,
  status text not null default 'created',
  artifact_uri text null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agent_task_graphs_agent_id_idx on ai_agent_task_graphs(agent_id);
create index if not exists ai_agent_task_graphs_owner_idx on ai_agent_task_graphs(owner_type, owner_id);
create index if not exists ai_agent_task_steps_graph_idx on ai_agent_task_steps(task_graph_id);
create index if not exists ai_agent_runner_job_logs_job_idx on ai_agent_runner_job_logs(runner_job_id);
