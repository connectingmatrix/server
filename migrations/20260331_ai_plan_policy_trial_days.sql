alter table public.ai_plan_policies
add column if not exists trial_days integer;

update public.ai_plan_policies
set trial_days = case
  when plan_id = 'starter-pack' and mode = 'TRIAL' then 30
  when plan_id = 'pro' and mode = 'TRIAL' then 30
  when plan_id = 'business-lite' and mode = 'TRIAL' then 2
  else null
end
where trial_days is null;

create or replace function public.read_effective_ai_policy(p_user_id uuid, p_organization_id uuid default null)
returns table(
  plan_id text,
  mode text,
  scope text,
  permissions jsonb,
  limitations jsonb,
  node_restrictions jsonb,
  permission_rows jsonb,
  trial_days integer,
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  business_lite_seat_count integer,
  purchased_seat_count integer
)
language sql
stable
as $$
with org_row as (
  select id, metadata, billing_status from public.organizations where id = p_organization_id and is_active = true
), user_subscription as (
  select * from public."Subscription" where "subscribedBy" = p_user_id and "paymentSource" like 'STRIPE:user:%'
  order by coalesce("startDate", "createdAt") desc nulls last, "createdAt" desc limit 1
), org_base as (
  select * from public."Subscription"
  where p_organization_id is not null and "paymentSource" like 'STRIPE:organization:' || p_organization_id::text || ':%'
    and split_part("paymentSource", ':', 4) in ('business-lite', 'business')
  order by coalesce("startDate", "createdAt") desc nulls last, "createdAt" desc limit 1
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
  from user_subscription us full join org_base ob on true full join org_row orow on true
), permission_data as (
  select coalesce(jsonb_agg(to_jsonb(permission_row)), '[]'::jsonb) as rows
  from (
    select * from public.ai_permissions
    where p_organization_id is not null and organization_id = p_organization_id and (scope = 'ORGANIZATION' or (scope = 'ORGANIZATION_MEMBER' and user_id = p_user_id))
    union all
    select * from public.ai_permissions
    where p_organization_id is null and organization_id is null and user_id = p_user_id and scope = 'USER'
  ) permission_row
), addon_row as (
  select limitations from public.ai_plan_policies where plan_id = 'business-lite-seat' and mode = 'PAID' and scope = 'ORGANIZATION'
)
select
  resolved.resolved_plan_id, resolved.resolved_mode, resolved.resolved_scope, coalesce(policy.permissions, '{}'::jsonb),
  case
    when resolved.resolved_plan_id = 'business-lite' and resolved.resolved_scope = 'ORGANIZATION' and resolved.resolved_seat_addons > 0 then
      jsonb_set(jsonb_set(coalesce(policy.limitations, '{}'::jsonb), '{BUSINESS_LITE_INCLUDED_USERS}', to_jsonb(coalesce((policy.limitations->>'BUSINESS_LITE_INCLUDED_USERS')::integer, 0) + coalesce((addon_row.limitations->>'BUSINESS_LITE_INCLUDED_USERS')::integer, 0) * resolved.resolved_seat_addons)), '{BUSINESS_LITE_MAX_TOTAL_USERS}', to_jsonb(coalesce((policy.limitations->>'BUSINESS_LITE_MAX_TOTAL_USERS')::integer, 0) + coalesce((addon_row.limitations->>'BUSINESS_LITE_MAX_TOTAL_USERS')::integer, 0) * resolved.resolved_seat_addons))
    else coalesce(policy.limitations, '{}'::jsonb)
  end,
  coalesce(policy.node_restrictions, '[]'::jsonb),
  permission_data.rows,
  policy.trial_days,
  resolved.resolved_start,
  resolved.resolved_end,
  resolved.resolved_seat_addons,
  resolved.resolved_purchased_seats
from resolved
left join public.ai_plan_policies policy on policy.plan_id = resolved.resolved_plan_id and policy.mode = resolved.resolved_mode and policy.scope = resolved.resolved_scope
cross join permission_data
left join addon_row on true;
$$;
