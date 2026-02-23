-- Phase 5: Expo push notification infrastructure for group messages

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_user_push_tokens_updated_at
before update on public.user_push_tokens
for each row
execute function public.set_updated_at();

create index if not exists idx_user_push_tokens_user_active
  on public.user_push_tokens (user_id, is_active);

alter table public.user_push_tokens enable row level security;

create policy "user_push_tokens_select_own"
on public.user_push_tokens
for select
to authenticated
using (user_id = auth.uid());

create policy "user_push_tokens_insert_own"
on public.user_push_tokens
for insert
to authenticated
with check (user_id = auth.uid());

create policy "user_push_tokens_update_own"
on public.user_push_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "user_push_tokens_delete_own"
on public.user_push_tokens
for delete
to authenticated
using (user_id = auth.uid());
