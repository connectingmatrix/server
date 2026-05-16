create table if not exists public.ai_plan_policies (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null,
  mode text not null check (mode in ('PAID', 'TRIAL')),
  scope text not null check (scope in ('USER', 'ORGANIZATION')),
  permissions jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '{}'::jsonb,
  node_restrictions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, mode, scope)
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."User"(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete cascade,
  event_type text not null,
  units integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.ai_plan_policies (plan_id, mode, scope)
values
  ('starter-pack', 'TRIAL', 'USER'),
  ('starter-pack', 'PAID', 'USER'),
  ('pro', 'TRIAL', 'USER'),
  ('pro', 'PAID', 'USER'),
  ('business-lite', 'TRIAL', 'ORGANIZATION'),
  ('business-lite', 'PAID', 'ORGANIZATION'),
  ('business-lite-seat', 'PAID', 'ORGANIZATION')
on conflict (plan_id, mode, scope) do nothing;

create or replace function public.read_effective_ai_policy(p_user_id uuid, p_organization_id uuid default null)
returns table(
  plan_id text,
  mode text,
  scope text,
  permissions jsonb,
  limitations jsonb,
  node_restrictions jsonb,
  permission_rows jsonb,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  business_lite_seat_count integer,
  purchased_seat_count integer
)
language sql
stable
as $$
with org_row as (
  select id, metadata, billing_status
  from public.organizations
  where id = p_organization_id and is_active = true
), user_subscription as (
  select *
  from public."Subscription"
  where "subscribedBy" = p_user_id and "paymentSource" like 'STRIPE:user:%'
  order by coalesce("startDate", "createdAt") desc nulls last, "createdAt" desc
  limit 1
), org_base as (
  select *
  from public."Subscription"
  where p_organization_id is not null and "paymentSource" like 'STRIPE:organization:' || p_organization_id::text || ':%'
    and split_part("paymentSource", ':', 4) in ('business-lite', 'business')
  order by coalesce("startDate", "createdAt") desc nulls last, "createdAt" desc
  limit 1
), resolved as (
  select
    case when p_organization_id is null then split_part(us."paymentSource", ':', 3) else coalesce(split_part(ob."paymentSource", ':', 4), nullif(orow.metadata->'billing'->>'currentPlanId', '')) end as resolved_plan_id,
    case
      when p_organization_id is null and split_part(us."paymentSource", ':', 4) = 'trialing' then 'TRIAL'
      when p_organization_id is null and us.id is not null then 'PAID'
      when p_organization_id is not null and split_part(ob."paymentSource", ':', 5) = 'trialing' then 'TRIAL'
      when p_organization_id is not null and ob.id is not null then 'PAID'
      when p_organization_id is not null and coalesce(orow.metadata->'billing'->>'trialEndsAt', '') <> '' and now() <= (orow.metadata->'billing'->>'trialEndsAt')::timestamptz then 'TRIAL'
      else null
    end as resolved_mode,
    case when p_organization_id is null then 'USER' else 'ORGANIZATION' end as resolved_scope,
    case when p_organization_id is null then coalesce(us."startDate", us."createdAt") else coalesce(ob."startDate", ob."createdAt") end as resolved_start,
    case when p_organization_id is null then coalesce(us."expiresAt", us."nextBillingDate") else coalesce(ob."expiresAt", ob."nextBillingDate", nullif(orow.metadata->'billing'->>'trialEndsAt', '')::timestamptz) end as resolved_end,
    case when p_organization_id is null then 0 else greatest(coalesce((orow.metadata->'billing'->>'purchasedSeatCount')::integer, 0) - 1, 0) end as resolved_seat_addons,
    case when p_organization_id is null then 0 else coalesce((orow.metadata->'billing'->>'purchasedSeatCount')::integer, 0) end as resolved_purchased_seats
  from user_subscription us
  full join org_base ob on true
  full join org_row orow on true
), permission_data as (
  select coalesce(jsonb_agg(to_jsonb(permission_row)), '[]'::jsonb) as rows
  from (
    select *
    from public.ai_permissions
    where p_organization_id is not null and organization_id = p_organization_id and (scope = 'ORGANIZATION' or (scope = 'ORGANIZATION_MEMBER' and user_id = p_user_id))
    union all
    select *
    from public.ai_permissions
    where p_organization_id is null and organization_id is null and user_id = p_user_id and scope = 'USER'
  ) permission_row
), addon_row as (
  select limitations
  from public.ai_plan_policies
  where plan_id = 'business-lite-seat' and mode = 'PAID' and scope = 'ORGANIZATION'
)
select
  resolved.resolved_plan_id,
  resolved.resolved_mode,
  resolved.resolved_scope,
  coalesce(policy.permissions, '{}'::jsonb),
  case
    when resolved.resolved_plan_id = 'business-lite' and resolved.resolved_scope = 'ORGANIZATION' and resolved.resolved_seat_addons > 0 then
      jsonb_set(
        jsonb_set(
          coalesce(policy.limitations, '{}'::jsonb),
          '{BUSINESS_LITE_INCLUDED_USERS}',
          to_jsonb(coalesce((policy.limitations->>'BUSINESS_LITE_INCLUDED_USERS')::integer, 0) + coalesce((addon_row.limitations->>'BUSINESS_LITE_INCLUDED_USERS')::integer, 0) * resolved.resolved_seat_addons)
        ),
        '{BUSINESS_LITE_MAX_TOTAL_USERS}',
        to_jsonb(coalesce((policy.limitations->>'BUSINESS_LITE_MAX_TOTAL_USERS')::integer, 0) + coalesce((addon_row.limitations->>'BUSINESS_LITE_MAX_TOTAL_USERS')::integer, 0) * resolved.resolved_seat_addons)
      )
    else coalesce(policy.limitations, '{}'::jsonb)
  end,
  coalesce(policy.node_restrictions, '[]'::jsonb),
  permission_data.rows,
  resolved.resolved_start,
  resolved.resolved_end,
  resolved.resolved_seat_addons,
  resolved.resolved_purchased_seats
from resolved
left join public.ai_plan_policies policy
  on policy.plan_id = resolved.resolved_plan_id and policy.mode = resolved.resolved_mode and policy.scope = resolved.resolved_scope
cross join permission_data
left join addon_row on true;
$$;
