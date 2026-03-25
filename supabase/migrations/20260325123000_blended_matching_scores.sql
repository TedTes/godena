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
      coalesce(
        (select mc.reveal_threshold from public.matching_config mc where mc.id = 1),
        25
      ) as reveal_threshold,
      coalesce(
        (select mc.lookback_days from public.matching_config mc where mc.id = 1),
        30
      ) as lookback_days
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
      and (
        coalesce(array_length(me.preferred_genders, 1), 0) = 0
        or p.gender = any (me.preferred_genders)
      )
      and (
        coalesce(array_length(me.preferred_intents, 1), 0) = 0
        or p.intent = any (me.preferred_intents)
      )
      and (
        me.preferred_age_min is null
        or p.birth_date is null
        or extract(year from age(current_date, p.birth_date))::int >= me.preferred_age_min
      )
      and (
        me.preferred_age_max is null
        or p.birth_date is null
        or extract(year from age(current_date, p.birth_date))::int <= me.preferred_age_max
      )
      and (
        coalesce(array_length(pref_t.preferred_genders, 1), 0) = 0
        or me.gender = any (pref_t.preferred_genders)
      )
      and (
        coalesce(array_length(pref_t.preferred_intents, 1), 0) = 0
        or me.intent = any (pref_t.preferred_intents)
      )
      and (
        pref_t.preferred_age_min is null
        or me.birth_date is null
        or extract(year from age(current_date, me.birth_date))::int >= pref_t.preferred_age_min
      )
      and (
        pref_t.preferred_age_max is null
        or me.birth_date is null
        or extract(year from age(current_date, me.birth_date))::int <= pref_t.preferred_age_max
      )
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
      sum(s.score)::double precision as score,
      max(s.last_interaction_at) as last_interaction_at
    from public.interaction_scores s
    join cfg on true
    where (s.user_a_id = v_actor or s.user_b_id = v_actor)
      and s.last_interaction_at >= now() - (cfg.lookback_days || ' days')::interval
    group by 1
    having sum(s.score) >= (select reveal_threshold from cfg)
  ),
  ranked as (
    select
      bc.*,
      s.score,
      s.last_interaction_at,
      1 as source_priority
    from base_candidates bc
    join scored s on s.candidate_user_id = bc.user_id

    union all

    select
      bc.*,
      null::double precision as score,
      null::timestamptz as last_interaction_at,
      2 as source_priority
    from base_candidates bc
    where not exists (
      select 1
      from scored s
      where s.candidate_user_id = bc.user_id
    )
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
    r.source_priority asc,
    r.score desc nulls last,
    r.last_interaction_at desc nulls last,
    r.last_active_at desc nulls last,
    case when r.source_priority = 2 then random() else 0 end,
    r.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_dating_candidates(int) from public;
grant execute on function public.get_dating_candidates(int) to authenticated;
