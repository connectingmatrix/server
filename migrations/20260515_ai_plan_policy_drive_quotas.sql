update public.ai_plan_policies
set limitations = jsonb_set(
      jsonb_set(
        coalesce(limitations, '{}'::jsonb),
        '{ORG_SHARED_SPACE_BYTES}',
        case when scope = 'ORGANIZATION' then to_jsonb(10737418240) else to_jsonb(0) end
      ),
      '{USER_DRIVE_BYTES}',
      case when scope = 'USER' then to_jsonb(10737418240) else to_jsonb(0) end
    ),
    updated_at = now()
where scope in ('USER', 'ORGANIZATION');
