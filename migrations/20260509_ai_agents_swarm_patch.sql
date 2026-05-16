-- R18 persisted AI Agent swarm support.
create extension if not exists pgcrypto;

create table if not exists ai_agent_swarms (
  id uuid primary key default gen_random_uuid(),
  manager_agent_id uuid references ai_agents(id) on delete set null,
  chat_id uuid,
  workflow_id uuid,
  workflow_execution_id uuid,
  owner_type text not null default 'user' check (owner_type in ('user','organization','global','system')),
  owner_id uuid,
  status text not null default 'planning' check (status in ('planning','waiting_for_user','running','completed','failed','cancelled')),
  goal text not null,
  plan jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  requires_confirmation boolean not null default true,
  confirmed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists ai_agent_swarm_workers (
  id uuid primary key default gen_random_uuid(),
  swarm_id uuid not null references ai_agent_swarms(id) on delete cascade,
  role text not null,
  agent_id uuid references ai_agents(id) on delete set null,
  workflow_id uuid,
  task text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists ai_agent_swarms_owner_idx on ai_agent_swarms(owner_type, owner_id, status);
create index if not exists ai_agent_swarm_workers_swarm_idx on ai_agent_swarm_workers(swarm_id, status);
