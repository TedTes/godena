-- Shared-group social proof for external event cards, plus RSVP-gated
-- temporary event chats.

create or replace function public.fetch_agent_event_shared_group_social_proof(
  p_opportunity_ids uuid[],
  p_limit_per_event int default 3
)
returns table (
  opportunity_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  total_count int
)
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  ),
  my_groups as (
    select gm.group_id
    from public.group_memberships gm
    join viewer v on v.uid = gm.user_id
  ),
  shared_group_users as (
    select distinct gm.user_id
    from public.group_memberships gm
    join my_groups mg on mg.group_id = gm.group_id
    join viewer v on v.uid is not null and gm.user_id <> v.uid
  ),
  matching_rsvps as (
    select
      r.opportunity_id,
      r.user_id,
      r.updated_at,
      count(*) over (partition by r.opportunity_id)::int as total_count,
      row_number() over (
        partition by r.opportunity_id
        order by r.updated_at desc, r.user_id
      ) as rn
    from public.agent_event_rsvps r
    join shared_group_users sgu on sgu.user_id = r.user_id
    join viewer v on v.uid is not null
    where r.opportunity_id = any(coalesce(p_opportunity_ids, '{}'::uuid[]))
      and r.status = 'going'
      and not exists (
        select 1
        from public.blocked_users b
        where (b.blocker_id = v.uid and b.blocked_id = r.user_id)
           or (b.blocker_id = r.user_id and b.blocked_id = v.uid)
      )
  )
  select
    mr.opportunity_id,
    mr.user_id,
    p.full_name,
    p.avatar_url,
    mr.total_count
  from matching_rsvps mr
  left join public.profiles p on p.user_id = mr.user_id
  where mr.rn <= greatest(1, least(coalesce(p_limit_per_event, 3), 8))
  order by mr.opportunity_id, mr.rn;
$$;

revoke all on function public.fetch_agent_event_shared_group_social_proof(uuid[], int) from public;
grant execute on function public.fetch_agent_event_shared_group_social_proof(uuid[], int) to authenticated;

create or replace function public.archive_expired_agent_event_chats()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_archived_count int := 0;
begin
  perform set_config('row_security', 'off', true);

  update public.groups g
  set is_active = false,
      updated_at = now()
  from public.agent_event_groups aeg
  join public.agent_opportunities o on o.id = aeg.opportunity_id
  where aeg.group_id = g.id
    and g.is_active = true
    and coalesce(o.ends_at, o.starts_at, o.expires_at) is not null
    and coalesce(o.ends_at, o.starts_at, o.expires_at) <= now() - interval '24 hours';

  get diagnostics v_archived_count = row_count;
  return v_archived_count;
end;
$$;

revoke all on function public.archive_expired_agent_event_chats() from public;
grant execute on function public.archive_expired_agent_event_chats() to authenticated;

create or replace function public.create_agent_event_chat(
  p_opportunity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid;
  v_event       record;
  v_group_id    uuid;
  v_category    public.group_category;
  v_rsvp_uid    uuid;
  v_date_label  text;
  v_short_title text;
  v_chat_name   text;
  v_chat_expires_at timestamptz;
begin
  perform set_config('row_security', 'off', true);
  perform public.archive_expired_agent_event_chats();

  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;

  select
    id,
    title,
    summary,
    city,
    country,
    starts_at,
    ends_at,
    expires_at,
    coalesce(feature_snapshot->>'category', 'other') as category
  into v_event
  from public.agent_opportunities
  where id = p_opportunity_id
    and kind = 'event';

  if not found then
    raise exception 'event_not_found';
  end if;

  v_chat_expires_at := coalesce(v_event.ends_at, v_event.starts_at, v_event.expires_at);
  if v_chat_expires_at is not null and v_chat_expires_at <= now() - interval '24 hours' then
    raise exception 'event_chat_archived';
  end if;

  if not exists (
    select 1
    from public.agent_event_rsvps r
    where r.opportunity_id = p_opportunity_id
      and r.user_id = v_caller_id
      and r.status in ('going', 'interested')
  ) then
    raise exception 'rsvp_required';
  end if;

  select group_id into v_group_id
  from public.agent_event_groups
  where opportunity_id = p_opportunity_id
  limit 1;

  if v_group_id is not null then
    update public.groups
    set is_active = true,
        updated_at = now()
    where id = v_group_id
      and is_active = false
      and (v_chat_expires_at is null or v_chat_expires_at > now() - interval '24 hours');

    delete from public.group_memberships gm
    where gm.group_id = v_group_id
      and not exists (
        select 1
        from public.agent_event_rsvps r
        where r.opportunity_id = p_opportunity_id
          and r.user_id = gm.user_id
          and r.status in ('going', 'interested')
      );

    for v_rsvp_uid in
      select user_id
      from public.agent_event_rsvps
      where opportunity_id = p_opportunity_id
        and status in ('going', 'interested')
    loop
      insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
      values (v_group_id, v_rsvp_uid, 'member', true, now())
      on conflict (group_id, user_id) do nothing;
    end loop;

    return v_group_id;
  end if;

  v_category := case v_event.category
    when 'outdoors'     then 'outdoors'::public.group_category
    when 'food_drink'   then 'food_drink'::public.group_category
    when 'professional' then 'professional'::public.group_category
    when 'language'     then 'language'::public.group_category
    when 'faith'        then 'faith'::public.group_category
    when 'culture'      then 'culture'::public.group_category
    else 'other'::public.group_category
  end;

  v_date_label := to_char(coalesce(v_event.starts_at, now()), 'Mon DD');
  v_short_title := case when length(v_event.title) > 28 then left(v_event.title, 28) || '...' else v_event.title end;
  v_chat_name := 'Event chat: ' || v_short_title || ' - ' || v_date_label;

  insert into public.groups (
    name,
    description,
    category,
    city,
    country,
    is_virtual,
    created_by
  )
  values (
    v_chat_name,
    'Temporary attendee thread for ' || v_event.title || '. It archives 24 hours after the event.',
    v_category,
    v_event.city,
    v_event.country,
    true,
    v_caller_id
  )
  returning id into v_group_id;

  insert into public.agent_event_groups (opportunity_id, group_id)
  values (p_opportunity_id, v_group_id)
  on conflict (opportunity_id, group_id) do nothing;

  for v_rsvp_uid in
    select user_id
    from public.agent_event_rsvps
    where opportunity_id = p_opportunity_id
      and status in ('going', 'interested')
  loop
    insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
    values (v_group_id, v_rsvp_uid, 'member', true, now())
    on conflict (group_id, user_id) do nothing;
  end loop;

  insert into public.group_messages (group_id, sender_id, content)
  values (
    v_group_id,
    v_caller_id,
    'Anyone want to meet up beforehand?'
  );

  return v_group_id;
end;
$$;

revoke all on function public.create_agent_event_chat(uuid) from public;
grant execute on function public.create_agent_event_chat(uuid) to authenticated;

drop policy if exists "group_messages_insert_own_if_member" on public.group_messages;
create policy "group_messages_insert_own_if_member"
on public.group_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.group_memberships gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = group_messages.group_id
      and gm.user_id = auth.uid()
      and g.is_active = true
  )
);
