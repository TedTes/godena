-- User-selected niches + derived interest profiles for recommendation targeting.

create table if not exists public.agent_user_selected_niches (
  user_id uuid not null references auth.users (id) on delete cascade,
  niche_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, niche_key),
  constraint agent_user_selected_niches_niche_key_format
    check (niche_key ~ '^[a-z0-9_:-]+$')
);

create table if not exists public.agent_user_interest_profiles (
  user_id uuid not null references auth.users (id) on delete cascade,
  interest_type text not null,
  interest_key text not null,
  score numeric(6,2) not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, interest_type, interest_key),
  constraint agent_user_interest_profiles_interest_type_check
    check (interest_type in ('category', 'niche', 'context')),
  constraint agent_user_interest_profiles_interest_key_format
    check (interest_key ~ '^[a-z0-9_:-]+$')
);

create index if not exists idx_agent_user_interest_profiles_interest
  on public.agent_user_interest_profiles (interest_type, interest_key, score desc);

create index if not exists idx_agent_user_interest_profiles_user
  on public.agent_user_interest_profiles (user_id, interest_type, score desc);

drop trigger if exists trg_agent_user_selected_niches_updated_at on public.agent_user_selected_niches;
create trigger trg_agent_user_selected_niches_updated_at
before update on public.agent_user_selected_niches
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_user_interest_profiles_updated_at on public.agent_user_interest_profiles;
create trigger trg_agent_user_interest_profiles_updated_at
before update on public.agent_user_interest_profiles
for each row execute function public.set_updated_at();

alter table public.agent_user_selected_niches enable row level security;
alter table public.agent_user_interest_profiles enable row level security;

create policy "agent_user_selected_niches_select_own"
on public.agent_user_selected_niches
for select
to authenticated
using (auth.uid() = user_id);

create policy "agent_user_selected_niches_insert_own"
on public.agent_user_selected_niches
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "agent_user_selected_niches_update_own"
on public.agent_user_selected_niches
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "agent_user_selected_niches_delete_own"
on public.agent_user_selected_niches
for delete
to authenticated
using (auth.uid() = user_id);

create policy "agent_user_interest_profiles_select_own"
on public.agent_user_interest_profiles
for select
to authenticated
using (auth.uid() = user_id);
