with targets(plan_id, mode, scope) as (
  values
    ('starter-pack', 'TRIAL', 'USER'),
    ('starter-pack', 'PAID', 'USER'),
    ('pro', 'TRIAL', 'USER'),
    ('pro', 'PAID', 'USER'),
    ('business-lite', 'TRIAL', 'ORGANIZATION'),
    ('business-lite', 'PAID', 'ORGANIZATION'),
    ('business', 'TRIAL', 'ORGANIZATION'),
    ('business', 'PAID', 'ORGANIZATION'),
    ('business-lite-seat', 'PAID', 'ORGANIZATION')
)
insert into public.ai_plan_policies (plan_id, mode, scope)
select plan_id, mode, scope from targets
on conflict (plan_id, mode, scope) do nothing;

with modules(module) as (
  select unnest(array[
    'CHANNEL','CATEGORY','SUBJECT','WEBHOOK','LINKING','SHARING','POST',
    'CHANNEL_CHAT','CATEGORY_CHAT','SUBJECT_CHAT','POST_CHAT','WORKFLOW',
    'ATTACH_WORKFLOW','IMPORT_WORKFLOW_FROM_CATALOG','WORKFLOW_AI_PERMISSIONS',
    'NODE_DESIGNER','CREDENTIAL','ORG_WORKFLOWS','GLOBAL_CREDENTIALS','SHARED_SPACE'
  ])
), defaults as (
  select jsonb_object_agg(module, jsonb_build_object('create', true, 'read', true, 'update', true, 'delete', true, 'execute', true)) as permissions
  from modules
)
update public.ai_plan_policies
set permissions = defaults.permissions,
    updated_at = now()
from defaults
where permissions = '{}'::jsonb;

with limits(limit_key) as (
  select unnest(array[
    'CHANNEL_COUNT','SUBJECT_COUNT','POST_COUNT','CONCURRENT_EXECUTIONS_PER_USER',
    'WORKFLOW_EXECUTION_TIME_SECONDS','MAX_WORKFLOW_AI_CREDITS_PER_BILLING_PERIOD',
    'BUSINESS_LITE_INCLUDED_USERS','BUSINESS_LITE_MAX_TOTAL_USERS','MAX_SHARING',
    'MAX_LINKAGES','ORG_SHARED_SPACE_BYTES'
  ])
), defaults as (
  select jsonb_object_agg(limit_key, 'null'::jsonb) as limitations
  from limits
)
update public.ai_plan_policies
set limitations = defaults.limitations,
    updated_at = now()
from defaults
where limitations = '{}'::jsonb;
