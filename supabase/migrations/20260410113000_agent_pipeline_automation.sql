-- End-to-end automation for the agent pipeline.
-- Stores runtime sync scope separately from pure source definitions,
-- and schedules the orchestrator to run on a cadence.

create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault;

create table if not exists public.agent_pipeline_settings (
  key text primary key default 'default',
  enabled boolean not null default true,
  cron_schedule text not null default '*/30 * * * *',
  orchestrator_url text not null default 'https://dlsqlduijmyogdwzsvzn.supabase.co/functions/v1/agent-orchestrator',
  internal_secret_vault_name text not null default 'agent_internal_function_secret',
  run_scout boolean not null default true,
  build_groups boolean not null default true,
  build_intros boolean not null default true,
  build_interests boolean not null default true,
  generate_proposals boolean not null default true,
  run_maintenance boolean not null default true,
  sync_payload jsonb not null default jsonb_build_object(
    'scope',
    jsonb_build_object(
      'city', 'Toronto',
      'country', 'CA',
      'radius', 35,
      'unit', 'km',
      'window_days_ahead', 30,
      'page_size', 100,
      'sort', 'date,asc'
    )
  ),
  group_payload jsonb not null default '{}'::jsonb,
  intro_payload jsonb not null default '{}'::jsonb,
  interest_payload jsonb not null default '{}'::jsonb,
  proposal_payload jsonb not null default jsonb_build_object(
    'city', 'Toronto',
    'limit', 200
  ),
  maintenance_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_pipeline_settings_singleton_key
    check (key = 'default')
);

create index if not exists idx_agent_pipeline_settings_enabled
  on public.agent_pipeline_settings (enabled);

drop trigger if exists trg_agent_pipeline_settings_updated_at on public.agent_pipeline_settings;
create trigger trg_agent_pipeline_settings_updated_at
before update on public.agent_pipeline_settings
for each row execute function public.set_updated_at();

alter table public.agent_pipeline_settings enable row level security;

drop policy if exists "agent_pipeline_settings_select_authenticated" on public.agent_pipeline_settings;
create policy "agent_pipeline_settings_select_authenticated"
on public.agent_pipeline_settings
for select
to authenticated
using (true);

create or replace function public.invoke_agent_orchestrator()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.agent_pipeline_settings%rowtype;
  v_internal_secret text;
  v_request_id bigint;
begin
  select *
  into v_settings
  from public.agent_pipeline_settings
  where key = 'default';

  if not found or not v_settings.enabled then
    return null;
  end if;

  select decrypted_secret
  into v_internal_secret
  from vault.decrypted_secrets
  where name = v_settings.internal_secret_vault_name
  limit 1;

  if coalesce(v_internal_secret, '') = '' then
    raise exception 'Missing vault secret for agent pipeline: %', v_settings.internal_secret_vault_name;
  end if;

  select net.http_post(
    url := v_settings.orchestrator_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret
    ),
    body := jsonb_build_object(
      'run_scout', v_settings.run_scout,
      'build_groups', v_settings.build_groups,
      'build_intros', v_settings.build_intros,
      'build_interests', v_settings.build_interests,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'sync_payload', v_settings.sync_payload,
      'group_payload', v_settings.group_payload,
      'intro_payload', v_settings.intro_payload,
      'interest_payload', v_settings.interest_payload,
      'proposal_payload', v_settings.proposal_payload,
      'maintenance_payload', v_settings.maintenance_payload
    )
  )
  into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.reschedule_agent_pipeline_job()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.agent_pipeline_settings%rowtype;
  v_job record;
begin
  select *
  into v_settings
  from public.agent_pipeline_settings
  where key = 'default';

  for v_job in
    select jobid
    from cron.job
    where jobname = 'agent-orchestrator-pipeline'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  if v_settings.enabled then
    perform cron.schedule(
      'agent-orchestrator-pipeline',
      v_settings.cron_schedule,
      'select public.invoke_agent_orchestrator();'
    );
  end if;
end;
$$;

create or replace function public.trg_reschedule_agent_pipeline_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reschedule_agent_pipeline_job();
  return new;
end;
$$;

drop trigger if exists trg_reschedule_agent_pipeline_job on public.agent_pipeline_settings;
create trigger trg_reschedule_agent_pipeline_job
after insert or update
on public.agent_pipeline_settings
for each row execute function public.trg_reschedule_agent_pipeline_job();

insert into public.agent_pipeline_settings (key)
values ('default')
on conflict (key) do nothing;

select public.reschedule_agent_pipeline_job();
