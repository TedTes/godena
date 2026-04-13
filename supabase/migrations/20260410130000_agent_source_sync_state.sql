create table if not exists public.agent_source_sync_state (
  source_id uuid primary key references public.agent_sources (id) on delete cascade,
  poll_interval_minutes integer not null default 360,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_status text not null default 'idle',
  last_error text,
  last_success_at timestamptz,
  last_records_fetched integer not null default 0,
  last_records_normalized integer not null default 0,
  last_opportunities_upserted integer not null default 0,
  consecutive_failures integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_source_sync_state_status_check
    check (last_status in ('idle', 'running', 'completed', 'completed_with_rejections', 'failed')),
  constraint agent_source_sync_state_poll_interval_check
    check (poll_interval_minutes between 5 and 10080)
);

create index if not exists idx_agent_source_sync_state_due
  on public.agent_source_sync_state (next_run_at, source_id);

create index if not exists idx_agent_source_sync_state_status
  on public.agent_source_sync_state (last_status, next_run_at);

drop trigger if exists trg_agent_source_sync_state_updated_at on public.agent_source_sync_state;
create trigger trg_agent_source_sync_state_updated_at
before update on public.agent_source_sync_state
for each row execute function public.set_updated_at();

alter table public.agent_source_sync_state enable row level security;

drop policy if exists "agent_source_sync_state_select_authenticated" on public.agent_source_sync_state;
create policy "agent_source_sync_state_select_authenticated"
on public.agent_source_sync_state
for select
to authenticated
using (true);

insert into public.agent_source_sync_state (
  source_id,
  poll_interval_minutes,
  next_run_at,
  last_run_at,
  last_status,
  last_error,
  last_success_at,
  last_records_fetched,
  last_records_normalized,
  last_opportunities_upserted,
  created_at,
  updated_at
)
select
  s.id,
  360,
  now(),
  null,
  'idle',
  null,
  null,
  0,
  0,
  0,
  now(),
  now()
from public.agent_sources s
on conflict (source_id) do nothing;

