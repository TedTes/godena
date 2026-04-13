alter table public.agent_pipeline_settings
  add column if not exists source_refresh_enabled boolean not null default true,
  add column if not exists recommendation_refresh_enabled boolean not null default true,
  add column if not exists source_refresh_cron_schedule text not null default '0 */4 * * *',
  add column if not exists recommendation_refresh_cron_schedule text not null default '*/30 * * * *';

update public.agent_pipeline_settings
set internal_secret_vault_name = 'INTERNAL_FUNCTION_SECRET'
where internal_secret_vault_name = 'agent_internal_function_secret';

create or replace function public.agent_pipeline_internal_secret()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.agent_pipeline_settings%rowtype;
  v_internal_secret text;
begin
  select *
  into v_settings
  from public.agent_pipeline_settings
  where key = 'default';

  if not found then
    raise exception 'Missing agent_pipeline_settings row';
  end if;

  select decrypted_secret
  into v_internal_secret
  from vault.decrypted_secrets
  where name = v_settings.internal_secret_vault_name
  limit 1;

  if coalesce(v_internal_secret, '') = '' then
    raise exception 'Missing vault secret for agent pipeline: %', v_settings.internal_secret_vault_name;
  end if;

  return v_internal_secret;
end;
$$;

create or replace function public.invoke_agent_source_refresh()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.agent_pipeline_settings%rowtype;
  v_request_id bigint;
begin
  select *
  into v_settings
  from public.agent_pipeline_settings
  where key = 'default';

  if not found or not v_settings.enabled or not v_settings.source_refresh_enabled then
    return null;
  end if;

  select net.http_post(
    url := v_settings.orchestrator_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public.agent_pipeline_internal_secret()
    ),
    body := jsonb_build_object(
      'run_scout', true,
      'build_groups', false,
      'build_intros', false,
      'build_interests', false,
      'generate_proposals', false,
      'run_maintenance', false,
      'sync_payload', coalesce(v_settings.sync_payload, '{}'::jsonb)
    )
  )
  into v_request_id;

  return v_request_id;
end;
$$;

create or replace function public.invoke_agent_recommendation_refresh()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.agent_pipeline_settings%rowtype;
  v_request_id bigint;
begin
  select *
  into v_settings
  from public.agent_pipeline_settings
  where key = 'default';

  if not found or not v_settings.enabled or not v_settings.recommendation_refresh_enabled then
    return null;
  end if;

  select net.http_post(
    url := v_settings.orchestrator_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public.agent_pipeline_internal_secret()
    ),
    body := jsonb_build_object(
      'run_scout', false,
      'build_groups', v_settings.build_groups,
      'build_intros', v_settings.build_intros,
      'build_interests', v_settings.build_interests,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'group_payload', coalesce(v_settings.group_payload, '{}'::jsonb),
      'intro_payload', coalesce(v_settings.intro_payload, '{}'::jsonb),
      'interest_payload', coalesce(v_settings.interest_payload, '{}'::jsonb),
      'proposal_payload', coalesce(v_settings.proposal_payload, '{}'::jsonb),
      'maintenance_payload', coalesce(v_settings.maintenance_payload, '{}'::jsonb)
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
    where jobname in ('agent-source-refresh-pipeline', 'agent-recommendation-refresh-pipeline', 'agent-orchestrator-pipeline')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  if v_settings.enabled and v_settings.source_refresh_enabled then
    perform cron.schedule(
      'agent-source-refresh-pipeline',
      v_settings.source_refresh_cron_schedule,
      'select public.invoke_agent_source_refresh();'
    );
  end if;

  if v_settings.enabled and v_settings.recommendation_refresh_enabled then
    perform cron.schedule(
      'agent-recommendation-refresh-pipeline',
      v_settings.recommendation_refresh_cron_schedule,
      'select public.invoke_agent_recommendation_refresh();'
    );
  end if;
end;
$$;

select public.reschedule_agent_pipeline_job();

