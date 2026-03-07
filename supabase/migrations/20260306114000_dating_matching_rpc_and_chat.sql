-- Dating candidate feed, swipe->match flow, and dating chat messages.

create table if not exists public.dating_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.dating_matches (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  content text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dating_messages_match_sent
  on public.dating_messages (match_id, sent_at asc);

create index if not exists idx_dating_messages_match_unread
  on public.dating_messages (match_id, read_at)
  where read_at is null and deleted_at is null;

drop trigger if exists trg_dating_messages_updated_at on public.dating_messages;
create trigger trg_dating_messages_updated_at
before update on public.dating_messages
for each row execute function public.set_updated_at();

alter table public.dating_messages enable row level security;

create policy "dating_messages_select_participant"
on public.dating_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.dating_matches dm
    where dm.id = dating_messages.match_id
      and auth.uid() in (dm.user_a_id, dm.user_b_id)
  )
);

create policy "dating_messages_insert_participant"
on public.dating_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.dating_matches dm
    where dm.id = dating_messages.match_id
      and dm.status = 'matched'
      and auth.uid() in (dm.user_a_id, dm.user_b_id)
  )
);

create policy "dating_messages_update_sender"
on public.dating_messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.dating_matches dm
    where dm.id = dating_messages.match_id
      and auth.uid() in (dm.user_a_id, dm.user_b_id)
  )
)
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.dating_matches dm
    where dm.id = dating_messages.match_id
      and auth.uid() in (dm.user_a_id, dm.user_b_id)
  )
);

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
  with me as (
    select
      p.user_id,
      p.gender,
      p.intent,
      p.birth_date,
      dp.is_enabled as dating_enabled,
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
  )
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
    dp.about as dating_about,
    dp.photos as dating_photos
  from public.profiles p
  join public.dating_profiles dp on dp.user_id = p.user_id and dp.is_enabled = true
  left join public.dating_preferences pref_t on pref_t.user_id = p.user_id
  join me on true
  where p.user_id <> v_actor
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
      from public.dating_swipes s
      where s.swiper_id = v_actor
        and s.target_id = p.user_id
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
  order by p.last_active_at desc nulls last, p.created_at desc
  limit v_limit;
end;
$$;

revoke all on function public.get_dating_candidates(int) from public;
grant execute on function public.get_dating_candidates(int) to authenticated;

create or replace function public.get_dating_match_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  birth_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select p.user_id, p.full_name, p.avatar_url, p.birth_date
  from public.profiles p
  where p.user_id = any (p_user_ids)
    and (
      p.user_id = v_actor
      or exists (
        select 1
        from public.dating_matches dm
        where dm.status = 'matched'
          and (
            (dm.user_a_id = v_actor and dm.user_b_id = p.user_id)
            or (dm.user_b_id = v_actor and dm.user_a_id = p.user_id)
          )
      )
    );
end;
$$;

revoke all on function public.get_dating_match_profiles(uuid[]) from public;
grant execute on function public.get_dating_match_profiles(uuid[]) to authenticated;

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
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_target_id is null or p_target_id = v_actor then
    raise exception 'invalid_target';
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
