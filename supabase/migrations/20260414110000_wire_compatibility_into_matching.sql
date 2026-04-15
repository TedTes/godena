alter table public.agent_pipeline_settings
  add column if not exists aggregate_scores boolean not null default true,
  add column if not exists decay_scores boolean not null default true,
  add column if not exists score_aggregation_payload jsonb not null default '{}'::jsonb,
  add column if not exists score_decay_payload jsonb not null default '{}'::jsonb;

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
      'aggregate_scores', v_settings.aggregate_scores,
      'decay_scores', v_settings.decay_scores,
      'build_groups', v_settings.build_groups,
      'build_interests', v_settings.build_interests,
      'build_compatibility', v_settings.build_compatibility,
      'build_intros', v_settings.build_intros,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'sync_payload', v_settings.sync_payload,
      'score_aggregation_payload', v_settings.score_aggregation_payload,
      'score_decay_payload', v_settings.score_decay_payload,
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
      'aggregate_scores', v_settings.aggregate_scores,
      'decay_scores', v_settings.decay_scores,
      'build_groups', v_settings.build_groups,
      'build_interests', v_settings.build_interests,
      'build_compatibility', v_settings.build_compatibility,
      'build_intros', v_settings.build_intros,
      'generate_proposals', v_settings.generate_proposals,
      'run_maintenance', v_settings.run_maintenance,
      'score_aggregation_payload', coalesce(v_settings.score_aggregation_payload, '{}'::jsonb),
      'score_decay_payload', coalesce(v_settings.score_decay_payload, '{}'::jsonb),
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

create or replace function public.get_connection_reveal_context(
  p_connection_id uuid
)
returns table (
  connection_id uuid,
  interaction_score numeric,
  event_breakdown jsonb,
  compatibility_score numeric,
  compatibility_reasons jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_connection public.connections%rowtype;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_connection
  from public.connections
  where id = p_connection_id
    and (user_a_id = v_actor or user_b_id = v_actor)
  limit 1;

  if not found then
    raise exception 'connection_not_found';
  end if;

  return query
  select
    v_connection.id,
    s.score,
    coalesce(s.event_breakdown, '{}'::jsonb),
    c.score,
    coalesce(c.reasons, '[]'::jsonb)
  from (select 1) anchor
  left join public.interaction_scores s
    on s.group_id = v_connection.group_id
   and s.user_a_id = v_connection.user_a_id
   and s.user_b_id = v_connection.user_b_id
  left join public.agent_user_compatibility_scores c
    on c.user_a_id = v_connection.user_a_id
   and c.user_b_id = v_connection.user_b_id
   and c.intent in ('community_intro', 'event_companion')
   and (c.expires_at is null or c.expires_at > now())
  order by c.score desc nulls last
  limit 1;
end;
$$;

revoke all on function public.get_connection_reveal_context(uuid) from public;
grant execute on function public.get_connection_reveal_context(uuid) to authenticated;

create or replace function public.get_dating_candidates(p_limit int default 20)
returns table (
  user_id uuid,
  full_name text,
  city text,
  bio text,
  intent public.profile_intent,
  languages text[],
  birth_date date,
  avatar_url text,
  photo_urls text[],
  dating_about text,
  dating_photos text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_limit int;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 20), 100));

  return query
  with cfg as (
    select
      coalesce((select mc.reveal_threshold from public.matching_config mc where mc.id = 1), 25) as reveal_threshold,
      coalesce((select mc.lookback_days from public.matching_config mc where mc.id = 1), 30) as lookback_days
  ),
  me as (
    select
      p.user_id,
      p.gender,
      p.intent,
      p.birth_date,
      dp.is_enabled,
      pref.preferred_genders,
      pref.preferred_intents,
      pref.preferred_age_min,
      pref.preferred_age_max,
      pref.is_globally_visible
    from public.profiles p
    left join public.dating_profiles dp on dp.user_id = p.user_id
    left join public.dating_preferences pref on pref.user_id = p.user_id
    where p.user_id = v_actor
    limit 1
  ),
  base_candidates as (
    select
      p.user_id,
      p.full_name,
      p.city,
      p.bio,
      p.intent,
      p.languages,
      p.birth_date,
      p.avatar_url,
      p.photo_urls,
      p.last_active_at,
      p.created_at,
      dp.about as dating_about,
      dp.photos as dating_photos
    from public.profiles p
    join public.dating_profiles dp on dp.user_id = p.user_id and dp.is_enabled = true
    left join public.dating_preferences pref_t on pref_t.user_id = p.user_id
    join me on true
    where p.user_id <> v_actor
      and coalesce(me.is_enabled, false) = true
      and coalesce(me.is_globally_visible, true) = true
      and coalesce(pref_t.is_globally_visible, true) = true
      and (coalesce(array_length(me.preferred_genders, 1), 0) = 0 or p.gender = any (me.preferred_genders))
      and (coalesce(array_length(me.preferred_intents, 1), 0) = 0 or p.intent = any (me.preferred_intents))
      and (me.preferred_age_min is null or p.birth_date is null or extract(year from age(current_date, p.birth_date))::int >= me.preferred_age_min)
      and (me.preferred_age_max is null or p.birth_date is null or extract(year from age(current_date, p.birth_date))::int <= me.preferred_age_max)
      and (coalesce(array_length(pref_t.preferred_genders, 1), 0) = 0 or me.gender = any (pref_t.preferred_genders))
      and (coalesce(array_length(pref_t.preferred_intents, 1), 0) = 0 or me.intent = any (pref_t.preferred_intents))
      and (pref_t.preferred_age_min is null or me.birth_date is null or extract(year from age(current_date, me.birth_date))::int >= pref_t.preferred_age_min)
      and (pref_t.preferred_age_max is null or me.birth_date is null or extract(year from age(current_date, me.birth_date))::int <= pref_t.preferred_age_max)
      and not exists (
        select 1
        from public.dating_swipes ds
        where ds.swiper_id = v_actor
          and ds.target_id = p.user_id
      )
      and not exists (
        select 1
        from public.dating_matches m
        where (m.user_a_id = least(v_actor, p.user_id) and m.user_b_id = greatest(v_actor, p.user_id))
          and m.status in ('matched', 'blocked', 'unmatched')
      )
      and not exists (
        select 1
        from public.blocked_users b
        where (b.blocker_id = v_actor and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_actor)
      )
      and not exists (
        select 1
        from public.reports r
        where (r.reporter_id = v_actor and r.reported_user_id = p.user_id)
           or (r.reporter_id = p.user_id and r.reported_user_id = v_actor)
      )
  ),
  scored as (
    select
      case when s.user_a_id = v_actor then s.user_b_id else s.user_a_id end as candidate_user_id,
      sum(s.score)::double precision as interaction_score,
      max(s.last_interaction_at) as last_interaction_at
    from public.interaction_scores s
    join cfg on true
    where (s.user_a_id = v_actor or s.user_b_id = v_actor)
      and s.last_interaction_at >= now() - (cfg.lookback_days || ' days')::interval
    group by 1
  ),
  compatibility as (
    select
      case when c.user_a_id = v_actor then c.user_b_id else c.user_a_id end as candidate_user_id,
      max(c.score)::double precision as compatibility_score
    from public.agent_user_compatibility_scores c
    where c.intent = 'dating'
      and (c.expires_at is null or c.expires_at > now())
      and (c.user_a_id = v_actor or c.user_b_id = v_actor)
    group by 1
  ),
  niche_overlap as (
    select
      candidate.niche_user_id as candidate_user_id,
      count(*)::int as shared_niche_count
    from public.agent_user_selected_niches mine
    join (
      select user_id as niche_user_id, niche_key
      from public.agent_user_selected_niches
      where user_id <> v_actor
    ) candidate on candidate.niche_key = mine.niche_key
    where mine.user_id = v_actor
    group by candidate.niche_user_id
  ),
  ranked as (
    select
      bc.*,
      coalesce(c.compatibility_score, 0) as compatibility_score,
      coalesce(s.interaction_score, 0) as interaction_score,
      s.last_interaction_at,
      coalesce(n.shared_niche_count, 0) as shared_niche_count
    from base_candidates bc
    left join compatibility c on c.candidate_user_id = bc.user_id
    left join scored s on s.candidate_user_id = bc.user_id
    left join niche_overlap n on n.candidate_user_id = bc.user_id
  )
  select
    r.user_id,
    r.full_name,
    r.city,
    r.bio,
    r.intent,
    r.languages,
    r.birth_date,
    r.avatar_url,
    r.photo_urls,
    r.dating_about,
    r.dating_photos
  from ranked r
  order by
    r.compatibility_score desc nulls last,
    r.interaction_score desc nulls last,
    r.shared_niche_count desc,
    r.last_interaction_at desc nulls last,
    r.last_active_at desc nulls last,
    case when r.compatibility_score = 0 and r.interaction_score = 0 and r.shared_niche_count = 0 then random() else 0 end,
    r.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_dating_candidates(int) from public;
grant execute on function public.get_dating_candidates(int) to authenticated;
