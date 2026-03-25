-- Ensure external RSVP logging can insert memberships + interaction events under RLS

create or replace function public.log_external_event_rsvp(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_group_id uuid;
  v_target_id uuid;
begin
  perform set_config('row_security', 'off', true);

  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select external_group_id into v_group_id
  from public.matching_config
  where id = 1;

  if v_group_id is null then
    raise exception 'missing_external_group_id';
  end if;

  -- Ensure actor is a member of the external group
  insert into public.group_memberships (
    group_id,
    user_id,
    role,
    is_open_to_connect,
    openness_set_at
  )
  values (
    v_group_id,
    v_actor_id,
    'member',
    true,
    now()
  )
  on conflict (group_id, user_id) do update
  set
    is_open_to_connect = true,
    openness_set_at = coalesce(public.group_memberships.openness_set_at, now()),
    updated_at = now();

  for v_target_id in
    select distinct r.user_id
    from public.external_event_rsvps r
    where r.event_id = p_event_id
      and r.user_id <> v_actor_id
      and r.status in ('going', 'interested')
  loop
    -- Ensure target is also a member of the external group
    insert into public.group_memberships (
      group_id,
      user_id,
      role,
      is_open_to_connect,
      openness_set_at
    )
    values (
      v_group_id,
      v_target_id,
      'member',
      true,
      now()
    )
    on conflict (group_id, user_id) do update
    set
      is_open_to_connect = true,
      openness_set_at = coalesce(public.group_memberships.openness_set_at, now()),
      updated_at = now();

    insert into public.interaction_events (
      group_id,
      event_type,
      actor_id,
      target_id,
      source_post_id,
      source_event_id,
      metadata
    )
    values (
      v_group_id,
      'same_event_rsvp',
      v_actor_id,
      v_target_id,
      null,
      null,
      jsonb_build_object('external_event_id', p_event_id)
    );
  end loop;
end;
$$;

revoke all on function public.log_external_event_rsvp(uuid) from public;
grant execute on function public.log_external_event_rsvp(uuid) to authenticated;
