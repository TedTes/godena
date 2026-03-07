-- Independent dating domain tables (separate from group/event matching).

create type public.dating_swipe_decision as enum ('pass', 'like', 'super_like');
create type public.dating_match_status as enum ('matched', 'unmatched', 'blocked', 'expired');

create table if not exists public.dating_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_enabled boolean not null default false,
  about text,
  prompts jsonb not null default '[]'::jsonb,
  photos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dating_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferred_genders public.gender[] not null default '{}',
  preferred_intents public.profile_intent[] not null default '{}',
  preferred_age_min int,
  preferred_age_max int,
  distance_km int,
  is_globally_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dating_preferences_age_range_check
    check (
      preferred_age_min is null
      or preferred_age_max is null
      or preferred_age_min <= preferred_age_max
    ),
  constraint dating_preferences_distance_check
    check (distance_km is null or distance_km > 0)
);

create table if not exists public.dating_swipes (
  id uuid primary key default gen_random_uuid(),
  swiper_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  decision public.dating_swipe_decision not null,
  created_at timestamptz not null default now(),
  constraint dating_swipes_not_self check (swiper_id <> target_id),
  unique (swiper_id, target_id)
);

create table if not exists public.dating_matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  status public.dating_match_status not null default 'matched',
  matched_at timestamptz not null default now(),
  unmatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dating_matches_pair_order check (user_a_id < user_b_id),
  constraint dating_matches_not_self check (user_a_id <> user_b_id),
  unique (user_a_id, user_b_id)
);

create index if not exists idx_dating_profiles_enabled
  on public.dating_profiles (is_enabled)
  where is_enabled = true;

create index if not exists idx_dating_swipes_swiper_created
  on public.dating_swipes (swiper_id, created_at desc);

create index if not exists idx_dating_swipes_target_decision
  on public.dating_swipes (target_id, decision, created_at desc);

create index if not exists idx_dating_matches_user_a_status
  on public.dating_matches (user_a_id, status, matched_at desc);

create index if not exists idx_dating_matches_user_b_status
  on public.dating_matches (user_b_id, status, matched_at desc);

drop trigger if exists trg_dating_profiles_updated_at on public.dating_profiles;
create trigger trg_dating_profiles_updated_at
before update on public.dating_profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_dating_preferences_updated_at on public.dating_preferences;
create trigger trg_dating_preferences_updated_at
before update on public.dating_preferences
for each row execute function public.set_updated_at();

drop trigger if exists trg_dating_matches_updated_at on public.dating_matches;
create trigger trg_dating_matches_updated_at
before update on public.dating_matches
for each row execute function public.set_updated_at();

alter table public.dating_profiles enable row level security;
alter table public.dating_preferences enable row level security;
alter table public.dating_swipes enable row level security;
alter table public.dating_matches enable row level security;

create policy "dating_profiles_select_own"
on public.dating_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "dating_profiles_insert_own"
on public.dating_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "dating_profiles_update_own"
on public.dating_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "dating_preferences_select_own"
on public.dating_preferences
for select
to authenticated
using (auth.uid() = user_id);

create policy "dating_preferences_insert_own"
on public.dating_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "dating_preferences_update_own"
on public.dating_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "dating_swipes_select_participant"
on public.dating_swipes
for select
to authenticated
using (auth.uid() in (swiper_id, target_id));

create policy "dating_swipes_insert_own"
on public.dating_swipes
for insert
to authenticated
with check (auth.uid() = swiper_id);

create policy "dating_swipes_update_own"
on public.dating_swipes
for update
to authenticated
using (auth.uid() = swiper_id)
with check (auth.uid() = swiper_id);

create policy "dating_matches_select_participant"
on public.dating_matches
for select
to authenticated
using (auth.uid() in (user_a_id, user_b_id));

