create or replace function public.submit_dating_swipe(
  p_target_id uuid,
  p_decision public.dating_swipe_decision
)
returns table (
  target_id uuid,
  matched boolean,
  match_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_match_id uuid;
  v_recent_swipe_count int;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_id is null or p_target_id = v_actor then
    raise exception 'invalid_target';
  end if;

  select count(*)::int into v_recent_swipe_count
  from public.dating_swipes ds
  where ds.swiper_id = v_actor
    and ds.created_at >= now() - interval '30 seconds';

  if v_recent_swipe_count >= 25 then
    raise exception 'rate_limited';
  end if;

  if not exists (
    select 1
    from public.dating_profiles dp
    where dp.user_id = v_actor
      and dp.is_enabled = true
  ) then
    return query select p_target_id, false, null::uuid;
    return;
  end if;

  if not exists (
    select 1
    from public.dating_profiles dp
    where dp.user_id = p_target_id
      and dp.is_enabled = true
  ) then
    return query select p_target_id, false, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.blocked_users b
    where (b.blocker_id = v_actor and b.blocked_id = p_target_id)
       or (b.blocker_id = p_target_id and b.blocked_id = v_actor)
  ) then
    return query select p_target_id, false, null::uuid;
    return;
  end if;

  if exists (
    select 1
    from public.reports r
    where (r.reporter_id = v_actor and r.reported_user_id = p_target_id)
       or (r.reporter_id = p_target_id and r.reported_user_id = v_actor)
  ) then
    return query select p_target_id, false, null::uuid;
    return;
  end if;

  insert into public.dating_swipes (swiper_id, target_id, decision, created_at)
  values (v_actor, p_target_id, p_decision, now())
  on conflict (swiper_id, target_id)
  do update set
    decision = excluded.decision,
    created_at = excluded.created_at;

  if p_decision in ('like', 'super_like')
     and exists (
       select 1
       from public.dating_swipes s
       where s.swiper_id = p_target_id
         and s.target_id = v_actor
         and s.decision in ('like', 'super_like')
     )
  then
    insert into public.dating_matches (user_a_id, user_b_id, status, matched_at, unmatched_at)
    values (least(v_actor, p_target_id), greatest(v_actor, p_target_id), 'matched', now(), null)
    on conflict (user_a_id, user_b_id)
    do update set
      status = 'matched',
      matched_at = now(),
      unmatched_at = null
    returning id into v_match_id;

    return query select p_target_id, true, v_match_id;
    return;
  end if;

  return query select p_target_id, false, null::uuid;
end;
$$;

revoke all on function public.submit_dating_swipe(uuid, public.dating_swipe_decision) from public;
grant execute on function public.submit_dating_swipe(uuid, public.dating_swipe_decision) to authenticated;
