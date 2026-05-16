create table if not exists public.ai_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_type text not null check (target_type in ('CHANNEL', 'CATEGORY', 'SUBJECT', 'POST')),
  target_id uuid not null,
  channel_id uuid,
  category_id uuid,
  subject_id uuid,
  post_id uuid,
  name text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists ai_bookmarks_user_idx on public.ai_bookmarks(user_id);
create index if not exists ai_bookmarks_target_idx on public.ai_bookmarks(target_type, target_id);
