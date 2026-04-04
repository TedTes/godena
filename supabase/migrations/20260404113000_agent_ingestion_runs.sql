-- Ingestion run log for agent-backed source sync jobs.

create table if not exists public.agent_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  source text not null,
  city text,
  status text not null default 'running',
  records_received int not null default 0,
  records_normalized int not null default 0,
  records_rejected int not null default 0,
  opportunities_upserted int not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_ingestion_runs_source_started
  on public.agent_ingestion_runs (source, started_at desc);

create index if not exists idx_agent_ingestion_runs_status
  on public.agent_ingestion_runs (status, started_at desc);

drop trigger if exists trg_agent_ingestion_runs_updated_at on public.agent_ingestion_runs;
create trigger trg_agent_ingestion_runs_updated_at
before update on public.agent_ingestion_runs
for each row execute function public.set_updated_at();

alter table public.agent_ingestion_runs enable row level security;

create policy "agent_ingestion_runs_select_authenticated"
on public.agent_ingestion_runs
for select
to authenticated
using (true);
