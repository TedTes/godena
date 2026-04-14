create table if not exists public.agent_user_compatibility_scores (
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  intent text not null,
  score numeric(6,2) not null default 0,
  reason_codes text[] not null default '{}',
  reasons jsonb not null default '[]'::jsonb,
  penalties jsonb not null default '[]'::jsonb,
  feature_snapshot jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 days'),
  primary key (user_a_id, user_b_id, intent),
  constraint agent_user_compatibility_scores_ordered_pair
    check (user_a_id < user_b_id),
  constraint agent_user_compatibility_scores_intent_check
    check (intent in ('friendship', 'dating', 'event_companion', 'community_intro')),
  constraint agent_user_compatibility_scores_score_range
    check (score >= 0 and score <= 100)
);

create index if not exists idx_agent_user_compatibility_scores_user_a
  on public.agent_user_compatibility_scores (user_a_id, intent, score desc);

create index if not exists idx_agent_user_compatibility_scores_user_b
  on public.agent_user_compatibility_scores (user_b_id, intent, score desc);

create index if not exists idx_agent_user_compatibility_scores_intent
  on public.agent_user_compatibility_scores (intent, score desc, expires_at);

alter table public.agent_user_compatibility_scores enable row level security;

drop policy if exists "agent_user_compatibility_scores_select_own" on public.agent_user_compatibility_scores;
create policy "agent_user_compatibility_scores_select_own"
on public.agent_user_compatibility_scores
for select
to authenticated
using (auth.uid() = user_a_id or auth.uid() = user_b_id);

alter table public.agent_pipeline_settings
  add column if not exists build_compatibility boolean not null default true,
  add column if not exists compatibility_payload jsonb not null default jsonb_build_object(
    'city', 'Toronto',
    'limit_users', 500,
    'max_pairs', 2500
  );

create or replace function public.invoke_agent_orchestrator()
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

  if not found or not v_settings.enabled then
    return null;
  end if;

  select net.http_post(
    url := v_settings.orchestrator_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', public.agent_pipeline_internal_secret()
    ),
    body := jsonb_build_object(
      'run_scout', v_settings.run_scout,
      'build_groups', v_settings.build_groups,
      'build_interests', v_settings.build_interests,
      'build_compatibility', v_settings.build_compatibility,
      'build_intros', v_settings.build_intros,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'sync_payload', v_settings.sync_payload,
      'group_payload', v_settings.group_payload,
      'interest_payload', v_settings.interest_payload,
      'compatibility_payload', v_settings.compatibility_payload,
      'intro_payload', v_settings.intro_payload,
      'proposal_payload', v_settings.proposal_payload,
      'maintenance_payload', v_settings.maintenance_payload
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
      'build_interests', v_settings.build_interests,
      'build_compatibility', v_settings.build_compatibility,
      'build_intros', v_settings.build_intros,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'group_payload', coalesce(v_settings.group_payload, '{}'::jsonb),
      'interest_payload', coalesce(v_settings.interest_payload, '{}'::jsonb),
      'compatibility_payload', coalesce(v_settings.compatibility_payload, '{}'::jsonb),
      'intro_payload', coalesce(v_settings.intro_payload, '{}'::jsonb),
      'proposal_payload', coalesce(v_settings.proposal_payload, '{}'::jsonb),
      'maintenance_payload', coalesce(v_settings.maintenance_payload, '{}'::jsonb)
    )
  )
  into v_request_id;

  return v_request_id;
end;
$$;
