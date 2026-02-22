-- Phase 1 schema foundation for Godena MVP
-- Core objects only (RLS policies in next migration)

create extension if not exists pgcrypto;

create type public.profile_intent as enum ('friendship', 'dating', 'long_term', 'marriage');
create type public.gender as enum ('woman', 'man', 'non_binary', 'prefer_not_to_say');
create type public.group_role as enum ('member', 'organizer', 'moderator');
create type public.group_category as enum (
  'outdoors',
  'food_drink',
  'professional',
  'language',
  'faith',
  'culture',
  'other'
);
create type public.rsvp_status as enum ('going', 'interested', 'not_going');
create type public.interaction_event_type as enum (
  'chat_reply',
  'post_reaction',
  'same_event_attendance',
  'same_event_rsvp',
  'mention'
);
create type public.connection_status as enum ('pending', 'accepted', 'passed', 'unmatched', 'closed');
create type public.report_target_type as enum ('user', 'group', 'post', 'group_message', 'connection_message');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  birth_date date,
  gender public.gender not null default 'prefer_not_to_say',
  preferred_genders public.gender[] not null default '{}',
  preferred_age_min int,
  preferred_age_max int,
  bio text,
  photo_urls text[] not null default '{}',
  ethnicity text,
  religion text,
  languages text[] not null default '{}',
  intent public.profile_intent not null default 'dating',
  city text,
  country text,
  is_open_to_connections boolean not null default true,
  is_premium boolean not null default false,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_age_range_check
    check (
      preferred_age_min is null
      or preferred_age_max is null
      or preferred_age_min <= preferred_age_max
    )
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category public.group_category not null default 'other',
  city text,
  country text,
  is_virtual boolean not null default false,
  cover_image_url text,
  created_by uuid not null references auth.users (id) on delete restrict,
  member_count int not null default 0,
  next_event_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.group_role not null default 'member',
  is_open_to_connect boolean not null default false,
  openness_set_at timestamptz,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.group_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction)
);

create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete restrict,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_name text,
  location_address text,
  is_virtual boolean not null default false,
  attendance_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_events_time_check check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.group_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  attended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.interaction_events (
  id bigserial primary key,
  group_id uuid not null references public.groups (id) on delete cascade,
  event_type public.interaction_event_type not null,
  actor_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  source_post_id uuid references public.group_posts (id) on delete set null,
  source_event_id uuid references public.group_events (id) on delete set null,
  source_group_message_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint interaction_events_not_self check (actor_id <> target_id)
);

create table if not exists public.interaction_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  score numeric(10,2) not null default 0,
  event_breakdown jsonb not null default '{}'::jsonb,
  last_interaction_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_scores_pair_order check (user_a_id < user_b_id),
  constraint interaction_scores_not_self check (user_a_id <> user_b_id),
  unique (group_id, user_a_id, user_b_id)
);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete restrict,
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  status public.connection_status not null default 'pending',
  activity_suggested text,
  revealed_at timestamptz not null default now(),
  responded_a_at timestamptz,
  responded_b_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connections_pair_order check (user_a_id < user_b_id),
  constraint connections_not_self check (user_a_id <> user_b_id),
  unique (group_id, user_a_id, user_b_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  sent_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.interaction_events
  add constraint interaction_events_group_message_fk
  foreign key (source_group_message_id)
  references public.group_messages (id)
  on delete set null;

create table if not exists public.connection_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connections (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_user_id uuid references auth.users (id) on delete set null,
  target_type public.report_target_type not null,
  target_id uuid,
  reason text not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.matching_config (
  id int primary key default 1,
  reveal_threshold numeric(10,2) not null default 25,
  lookback_days int not null default 30,
  decay_percent_per_week numeric(5,2) not null default 20,
  weight_same_event_attendance numeric(10,2) not null default 10,
  weight_chat_reply numeric(10,2) not null default 8,
  weight_post_reaction numeric(10,2) not null default 5,
  weight_same_event_rsvp numeric(10,2) not null default 4,
  weight_mention numeric(10,2) not null default 3,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matching_config_singleton check (id = 1)
);

insert into public.matching_config (id)
values (1)
on conflict (id) do nothing;

-- Updated-at triggers
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger set_group_memberships_updated_at
before update on public.group_memberships
for each row execute function public.set_updated_at();

create trigger set_group_posts_updated_at
before update on public.group_posts
for each row execute function public.set_updated_at();

create trigger set_group_events_updated_at
before update on public.group_events
for each row execute function public.set_updated_at();

create trigger set_event_rsvps_updated_at
before update on public.event_rsvps
for each row execute function public.set_updated_at();

create trigger set_interaction_scores_updated_at
before update on public.interaction_scores
for each row execute function public.set_updated_at();

create trigger set_connections_updated_at
before update on public.connections
for each row execute function public.set_updated_at();

create trigger set_group_messages_updated_at
before update on public.group_messages
for each row execute function public.set_updated_at();

create trigger set_connection_messages_updated_at
before update on public.connection_messages
for each row execute function public.set_updated_at();

create trigger set_reports_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger set_matching_config_updated_at
before update on public.matching_config
for each row execute function public.set_updated_at();

-- Enforce one active reveal ("pending") per user at a time.
create or replace function public.enforce_single_pending_reveal()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'pending' then
    if exists (
      select 1
      from public.connections c
      where c.id <> new.id
        and c.status = 'pending'
        and (
          new.user_a_id in (c.user_a_id, c.user_b_id)
          or new.user_b_id in (c.user_a_id, c.user_b_id)
        )
    ) then
      raise exception 'User already has an active pending reveal';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_single_pending_reveal_trigger
before insert or update of status, user_a_id, user_b_id
on public.connections
for each row
execute function public.enforce_single_pending_reveal();

-- Query performance indexes
create index if not exists idx_profiles_city on public.profiles (city);
create index if not exists idx_profiles_last_active on public.profiles (last_active_at desc);

create index if not exists idx_groups_city_category on public.groups (city, category);
create index if not exists idx_groups_created_by on public.groups (created_by);
create index if not exists idx_groups_next_event on public.groups (next_event_at);

create index if not exists idx_group_memberships_user on public.group_memberships (user_id);
create index if not exists idx_group_memberships_open
  on public.group_memberships (group_id, is_open_to_connect)
  where is_open_to_connect = true;

create index if not exists idx_group_posts_group_created_at
  on public.group_posts (group_id, created_at desc);

create index if not exists idx_group_events_group_starts_at
  on public.group_events (group_id, starts_at);

create index if not exists idx_event_rsvps_user on public.event_rsvps (user_id, status);

create index if not exists idx_interaction_events_group_occurred_at
  on public.interaction_events (group_id, occurred_at desc);
create index if not exists idx_interaction_events_actor_target
  on public.interaction_events (group_id, actor_id, target_id, occurred_at desc);

create index if not exists idx_interaction_scores_group_score
  on public.interaction_scores (group_id, score desc);
create index if not exists idx_interaction_scores_last_interaction
  on public.interaction_scores (last_interaction_at desc);

create index if not exists idx_connections_status_revealed
  on public.connections (status, revealed_at desc);
create index if not exists idx_connections_user_a on public.connections (user_a_id, status);
create index if not exists idx_connections_user_b on public.connections (user_b_id, status);

create index if not exists idx_group_messages_group_sent_at
  on public.group_messages (group_id, sent_at desc);

create index if not exists idx_connection_messages_connection_sent_at
  on public.connection_messages (connection_id, sent_at desc);

create index if not exists idx_reports_status_created_at
  on public.reports (status, created_at desc);

create index if not exists idx_blocked_users_blocked on public.blocked_users (blocked_id);
