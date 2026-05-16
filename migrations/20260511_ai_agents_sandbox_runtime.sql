alter table if exists public.ai_agents
  add column if not exists runtime_kind text not null default 'openai_agents_sdk_sandbox',
  add column if not exists sandbox_config jsonb not null default '{"client":"local","network":"sandbox"}'::jsonb,
  add column if not exists capabilities jsonb not null default '[]'::jsonb,
  add column if not exists skills jsonb not null default '[]'::jsonb,
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists manifest jsonb not null default '{}'::jsonb,
  add column if not exists shape jsonb not null default '{}'::jsonb,
  add column if not exists skill_bindings jsonb not null default '[]'::jsonb,
  add column if not exists permission_policy jsonb not null default '{"allow":[],"deny":[],"requireConfirmation":[]}'::jsonb;

update public.ai_agents
set
  runtime_kind = 'openai_agents_sdk_sandbox',
  sandbox_config = case when sandbox_config = '{}'::jsonb then '{"client":"local","network":"sandbox"}'::jsonb else sandbox_config end,
  manifest = case
    when manifest = '{}'::jsonb then jsonb_build_object(
      'version', 'giga.agent.manifest/v1',
      'agentId', id,
      'name', name,
      'modelId', model_id,
      'skills', skills,
      'capabilities', capabilities,
      'permissions', permissions,
      'toolIds', coalesce(tool_policy->'allowedTools', '[]'::jsonb),
      'memoryNamespace', concat('agent:', id),
      'entries', '{}'::jsonb,
      'metadata', jsonb_build_object('source', 'ai_agents_sandbox_runtime_migration')
    )
    else manifest
  end,
  shape = case when shape = '{}'::jsonb then jsonb_build_object('input', '{}'::jsonb, 'output', output_contract, 'artifacts', '{}'::jsonb, 'events', '{}'::jsonb, 'confirmation', guardrails, 'metadata', '{}'::jsonb) else shape end;

create index if not exists ai_agents_runtime_kind_idx on public.ai_agents(runtime_kind);
create index if not exists ai_agents_skills_gin_idx on public.ai_agents using gin(skills);
create index if not exists ai_agents_capabilities_gin_idx on public.ai_agents using gin(capabilities);
create index if not exists ai_agents_permissions_gin_idx on public.ai_agents using gin(permissions);
