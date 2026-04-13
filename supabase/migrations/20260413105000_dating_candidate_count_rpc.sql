create or replace function public.get_dating_candidate_count()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_count integer := 0;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  with me as (
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
  eligible_candidates as (
    select p.user_id
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
  )
  select count(*)::integer
  into v_count
  from eligible_candidates;

  return v_count;
end;
$$;

revoke all on function public.get_dating_candidate_count() from public;
grant execute on function public.get_dating_candidate_count() to authenticated;
