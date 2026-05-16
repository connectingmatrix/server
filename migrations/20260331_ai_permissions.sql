alter table if exists public.ai_permissions
  drop constraint if exists organization_permissions_module_check;

alter table if exists public.ai_permissions
  add constraint organization_permissions_module_check
  check (
    module in (
      'CHANNEL',
      'CATEGORY',
      'SUBJECT',
      'WEBHOOK',
      'LINKING',
      'SHARING',
      'POST',
      'CHANNEL_CHAT',
      'CATEGORY_CHAT',
      'SUBJECT_CHAT',
      'POST_CHAT',
      'WORKFLOW',
      'ATTACH_WORKFLOW',
      'IMPORT_WORKFLOW_FROM_CATALOG',
      'WORKFLOW_AI_PERMISSIONS',
      'NODE_DESIGNER',
      'CREDENTIAL',
      'ORG_WORKFLOWS',
      'GLOBAL_CREDENTIALS',
      'SHARED_SPACE'
    )
  );
