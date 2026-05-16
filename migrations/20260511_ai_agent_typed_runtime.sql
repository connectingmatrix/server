create extension if not exists pgcrypto;

create table if not exists public.ai_agent_permissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  permission_id text not null,
  title text not null,
  description text,
  risk text not null default 'none',
  source text not null default 'typed-runtime',
  created_at timestamptz not null default now(),
  unique(agent_id, permission_id)
);

create table if not exists public.ai_agent_capabilities (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  capability_id text not null,
  title text not null,
  description text not null,
  permission_id text,
  tool_id text,
  source text not null default 'typed-runtime',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_skills (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  skill_id text not null,
  name text not null,
  description text not null,
  instructions text not null,
  source text not null default 'typed-runtime',
  created_at timestamptz not null default now(),
  unique(agent_id, skill_id)
);

create table if not exists public.ai_agent_skill_permissions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  skill_id text not null,
  permission_id text not null,
  created_at timestamptz not null default now(),
  unique(agent_id, skill_id, permission_id)
);

create table if not exists public.ai_agent_skill_capabilities (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  skill_id text not null,
  capability_id text not null,
  created_at timestamptz not null default now(),
  unique(agent_id, skill_id, capability_id)
);

create table if not exists public.ai_agent_skill_shape_entries (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  skill_id text not null,
  direction text not null check (direction in ('input', 'output', 'artifact', 'event')),
  entry_key text not null,
  value_type text not null,
  required boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  unique(agent_id, skill_id, direction, entry_key)
);

create table if not exists public.ai_agent_skill_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  skill_id text not null,
  enabled boolean not null default true,
  config_key text,
  config_value text,
  config_value_type text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agent_workflow_bindings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  workflow_id uuid not null,
  permission_id text not null default 'workflow.execute',
  status text not null default 'active',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(agent_id, workflow_id, permission_id)
);

create table if not exists public.ai_agent_shapes (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  section text not null,
  entry_key text not null,
  value_type text not null,
  required boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  unique(agent_id, section, entry_key)
);

create table if not exists public.ai_agent_routing_rules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.ai_agents(id) on delete cascade,
  priority integer not null default 100,
  mode text not null default 'DEFAULT',
  visibility text not null default 'user',
  match_kind text not null,
  match_value text not null,
  is_internal boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_agent_memory_rules (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete cascade,
  store_kind text not null default 'clickhouse',
  namespace text not null,
  scope_type text not null default 'agent',
  retention_days integer not null default 180,
  max_memories integer not null default 2000,
  read_before_run boolean not null default true,
  write_feedback boolean not null default true,
  embedding_model text not null default 'text-embedding-3-small',
  dimensions integer not null default 1536,
  created_at timestamptz not null default now(),
  unique(agent_id, namespace)
);

create index if not exists idx_ai_agent_permissions_agent on public.ai_agent_permissions(agent_id);
create index if not exists idx_ai_agent_capabilities_agent on public.ai_agent_capabilities(agent_id);
create index if not exists idx_ai_agent_skills_agent on public.ai_agent_skills(agent_id);
create index if not exists idx_ai_agent_skill_bindings_agent on public.ai_agent_skill_bindings(agent_id);
create index if not exists idx_ai_agent_workflow_bindings_agent on public.ai_agent_workflow_bindings(agent_id);
create index if not exists idx_ai_agent_routing_rules_lookup on public.ai_agent_routing_rules(enabled, mode, visibility, priority);
create index if not exists idx_ai_agent_memory_rules_namespace on public.ai_agent_memory_rules(namespace);

insert into public.ai_agent_memory_rules(agent_id, namespace)
select id, 'agent:' || id::text from public.ai_agents
on conflict(agent_id, namespace) do nothing;

insert into public.ai_agent_routing_rules(agent_id, priority, mode, visibility, match_kind, match_value, is_internal)
select id, case when owner_type = 'system' then 200 else 50 end, 'DEFAULT', coalesce(owner_type, 'user'), 'agent_id', id::text, owner_type = 'system'
from public.ai_agents where is_active is true
on conflict do nothing;

insert into public.ai_agent_permissions(agent_id, permission_id, title, risk, source)
select null, entry.permission_id, entry.title, entry.risk, 'builtin'
from (values
  ('workflow.read', 'Read workflows', 'none'),
  ('workflow.write', 'Write workflows', 'write'),
  ('workflow.stop', 'Emergency stop workflows', 'admin'),
  ('software.generate', 'Generate software', 'write'),
  ('software.deploy', 'Deploy generated software', 'local-computer'),
  ('data.ingest', 'Ingest large data', 'large-cost'),
  ('data.transform', 'Transform analytical data', 'write'),
  ('excel.write', 'Create and edit spreadsheets', 'write'),
  ('presentation.write', 'Create presentations', 'write'),
  ('document.write', 'Create and edit documents', 'write'),
  ('pdf.process', 'Process PDF files', 'write'),
  ('chart.render', 'Render charts', 'write'),
  ('image.edit', 'Generate or edit images', 'large-cost'),
  ('openai.code_interpreter', 'Use OpenAI code interpreter', 'large-cost'),
  ('openai.file_search', 'Use OpenAI file search', 'none'),
  ('openai.web_search', 'Use OpenAI web search', 'external-network'),
  ('openai.image_generation', 'Use OpenAI image generation', 'large-cost'),
  ('openai.hosted_mcp', 'Use hosted MCP tools', 'external-network'),
  ('openai.computer_use', 'Use computer control tools', 'local-computer'),
  ('openai.shell', 'Use sandbox shell tools', 'local-computer'),
  ('openai.apply_patch', 'Use sandbox apply-patch tools', 'write'),
  ('openai.tool_namespace', 'Use namespaced SDK tool catalogs', 'none'),
  ('openai.tool_search', 'Search SDK tool catalogs', 'none'),
  ('openai.agent_as_tool', 'Call agents as tools', 'none'),
  ('openai.handoff', 'Handoff to another SDK agent', 'none'),
  ('openai.guardrail', 'Use SDK guardrails', 'none'),
  ('openai.streaming', 'Stream SDK run events', 'none'),
  ('openai.tracing', 'Trace SDK runs', 'none'),
  ('openai.session', 'Use SDK sessions', 'none'),
  ('openai.human_approval', 'Request human approval', 'none')
) as entry(permission_id, title, risk)
where not exists (select 1 from public.ai_agent_permissions p where p.agent_id is null and p.permission_id = entry.permission_id);

insert into public.ai_agent_skills(agent_id, skill_id, name, description, instructions, source)
select null, entry.skill_id, entry.name, entry.description, 'See checked-in scoped skill file for the canonical operating instructions.', 'builtin'
from (values
  ('workflow.builder.v1', 'Workflow Builder', 'Create, update, debug, execute, monitor, and stop workflows through executor-owned compile and runtime APIs.'),
  ('software.builder.v1', 'Software Builder', 'Build full-stack generated apps from requirements, UI-kit matrices, CRUD/backend contracts, PWA checks, and deployment reports.'),
  ('big-data.builder.v1', 'Big Data Builder', 'Profile large files, plan stream-safe transforms, generate analytical workflows, and publish reports, charts, or GIS outputs.'),
  ('excel.builder.v1', 'Excel Builder', 'Read, profile, repair, transform, and generate Excel workbooks through the Excel workflow node.'),
  ('presentation.builder.v1', 'Presentation Builder', 'Create PowerPoint-compatible presentation artifacts from prompts, charts, tables, and reports.'),
  ('google-doc.builder.v1', 'Google Doc Builder', 'Create, update, and export Google Docs through approved Drive and Docs adapters.'),
  ('microsoft-doc.builder.v1', 'Microsoft Doc Builder', 'Create and edit DOCX-compatible documents with typed sections, tables, and artifacts.'),
  ('chart.builder.v1', 'Chart Builder', 'Generate chart specs and artifacts through the Chart workflow node and chart catalog.'),
  ('image.editor.v1', 'Image Editor', 'Generate, edit, transform, and publish image artifacts through approved image tools.'),
  ('pdf.processor.v1', 'PDF Processor', 'Extract, split, merge, summarize, and hand off PDF document artifacts.')
) as entry(skill_id, name, description)
where not exists (select 1 from public.ai_agent_skills s where s.agent_id is null and s.skill_id = entry.skill_id);

insert into public.ai_agent_capabilities(agent_id, capability_id, title, description, permission_id, tool_id, source)
select null, entry.capability_id, entry.title, entry.description, entry.permission_id, entry.tool_id, 'builtin'
from (values
  ('workflow.builder.v1', 'Workflow Builder', 'Workflow build, debug, compile, execute, logs, queue watch, and emergency stop.', 'workflow.write', 'agent.workflow'),
  ('software.builder.v1', 'Software Builder', 'Matrix-planned generated app creation, run, host, and verification.', 'software.generate', 'agent.software.create.v2'),
  ('big-data.builder.v1', 'Big Data Builder', 'Large-data ingestion, transformation, charting, and GIS workflow generation.', 'data.transform', 'database.driver'),
  ('excel.builder.v1', 'Excel Builder', 'Excel workbook profiling, editing, and artifact generation.', 'excel.write', 'workflow.node.excel'),
  ('presentation.builder.v1', 'Presentation Builder', 'PowerPoint-compatible artifact generation.', 'presentation.write', 'workflow.node.presentation'),
  ('google-doc.builder.v1', 'Google Doc Builder', 'Google Docs creation, update, and export.', 'document.write', 'workflow.node.google-drive'),
  ('microsoft-doc.builder.v1', 'Microsoft Doc Builder', 'DOCX document generation and editing.', 'document.write', 'workflow.node.microsoft-doc'),
  ('chart.builder.v1', 'Chart Builder', 'Chart node backed chart rendering.', 'chart.render', 'workflow.node.chart'),
  ('image.editor.v1', 'Image Editor', 'Image generation and editing.', 'image.edit', 'workflow.node.image-studio-v2'),
  ('pdf.processor.v1', 'PDF Processor', 'PDF extraction and transformation.', 'pdf.process', 'workflow.node.pdf'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.code_interpreter', 'openai.code_interpreter'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.file_search', 'openai.file_search'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.web_search', 'openai.web_search'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.image_generation', 'openai.image_generation'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.hosted_mcp', 'openai.hosted_mcp'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.computer_use', 'openai.computer_use'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.shell', 'openai.shell'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.apply_patch', 'openai.apply_patch'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.tool_namespace', 'openai.tool_namespace'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.tool_search', 'openai.tool_search'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.agent_as_tool', 'openai.agent_as_tool'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.handoff', 'openai.handoff'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.guardrail', 'openai.guardrail'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.streaming', 'openai.streaming'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.tracing', 'openai.tracing'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.session', 'openai.session'),
  ('openai.sdk.tools.v1', 'OpenAI SDK Tools', 'Code interpreter, file search, web search, image generation, hosted MCP, computer use, handoffs, and approval.', 'openai.human_approval', 'openai.human_approval')
) as entry(capability_id, title, description, permission_id, tool_id)
where not exists (select 1 from public.ai_agent_capabilities c where c.agent_id is null and c.capability_id = entry.capability_id and c.tool_id = entry.tool_id);
