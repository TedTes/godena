create table if not exists public.agent_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enabled boolean not null default true,
  source_type text not null,
  locator_type text not null,
  locator text not null,
  city text,
  country text,
  category text,
  trust_tier text not null default 'medium',
  poll_interval_minutes integer not null default 360,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_status text not null default 'idle',
  last_error text,
  last_success_at timestamptz,
  last_records_fetched integer not null default 0,
  last_records_normalized integer not null default 0,
  last_opportunities_upserted integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_sources_source_type_check
    check (source_type in ('eventbrite', 'meetup', 'ics', 'rss', 'webpage', 'reddit', 'weather', 'manual')),
  constraint agent_sources_locator_type_check
    check (locator_type in ('api', 'ics', 'rss', 'webpage', 'manual')),
  constraint agent_sources_trust_tier_check
    check (trust_tier in ('high', 'medium', 'bootstrap_only', 'passive')),
  constraint agent_sources_status_check
    check (last_status in ('idle', 'running', 'completed', 'completed_with_rejections', 'failed')),
  constraint agent_sources_locator_not_blank_check
    check (char_length(trim(locator)) > 0),
  constraint agent_sources_name_not_blank_check
    check (char_length(trim(name)) > 0),
  constraint agent_sources_poll_interval_check
    check (poll_interval_minutes between 5 and 10080),
  constraint agent_sources_locator_unique unique (locator_type, locator)
);

create index if not exists idx_agent_sources_enabled_next_run
  on public.agent_sources (enabled, next_run_at);

create index if not exists idx_agent_sources_source_type
  on public.agent_sources (source_type, enabled);

create index if not exists idx_agent_sources_city
  on public.agent_sources (city, enabled);

drop trigger if exists trg_agent_sources_updated_at on public.agent_sources;
create trigger trg_agent_sources_updated_at
before update on public.agent_sources
for each row execute function public.set_updated_at();

alter table public.agent_sources enable row level security;

create policy "agent_sources_select_authenticated"
on public.agent_sources
for select
to authenticated
using (true);
