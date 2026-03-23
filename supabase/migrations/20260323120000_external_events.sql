-- External events imported from third-party sources (Eventbrite, Meetup, iCal, etc.)

create table if not exists public.external_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text not null,
  source_url text,
  title text not null,
  description text,
  category text,
  image_url text,
  start_at timestamptz not null,
  end_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  country text,
  lat numeric,
  lng numeric,
  is_free boolean,
  price_min numeric,
  organizer_name text,
  organizer_source_id text,
  is_native boolean not null default false,
  organizer_claimed boolean not null default false,
  claimed_by uuid references auth.users (id) on delete set null,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists idx_external_events_start_at
  on public.external_events (start_at);

create index if not exists idx_external_events_active_start
  on public.external_events (is_archived, start_at);

create index if not exists idx_external_events_city_start
  on public.external_events (city, start_at);

drop trigger if exists trg_external_events_updated_at on public.external_events;
create trigger trg_external_events_updated_at
before update on public.external_events
for each row execute function public.set_updated_at();

alter table public.external_events enable row level security;

create policy "external_events_select_authenticated"
on public.external_events
for select
to authenticated
using (true);
