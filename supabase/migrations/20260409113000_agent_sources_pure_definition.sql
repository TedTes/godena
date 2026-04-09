drop index if exists idx_agent_sources_enabled_next_run;
drop index if exists idx_agent_sources_city;

alter table public.agent_sources
  drop constraint if exists agent_sources_status_check;

alter table public.agent_sources
  drop constraint if exists agent_sources_poll_interval_check;

alter table public.agent_sources
  drop column if exists city,
  drop column if exists country,
  drop column if exists category,
  drop column if exists poll_interval_minutes,
  drop column if exists next_run_at,
  drop column if exists last_run_at,
  drop column if exists last_status,
  drop column if exists last_error,
  drop column if exists last_success_at,
  drop column if exists last_records_fetched,
  drop column if exists last_records_normalized,
  drop column if exists last_opportunities_upserted;

create index if not exists idx_agent_sources_enabled
  on public.agent_sources (enabled, source_type);
