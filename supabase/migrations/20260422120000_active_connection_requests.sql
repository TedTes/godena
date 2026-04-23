-- Active connection requests: one user explicitly asks, the other explicitly accepts or passes.

drop trigger if exists enforce_single_pending_reveal_trigger on public.connections;
drop function if exists public.enforce_single_pending_reveal();

alter table public.connections
  add column if not exists requested_by uuid references auth.users (id) on delete set null,
  add column if not exists requested_at timestamptz not null default now();

create index if not exists idx_connections_requested_by
  on public.connections (requested_by, status, requested_at desc);

create or replace function public.request_group_connection(
  p_group_id uuid,
  p_target_user_id uuid
)
returns public.connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_user_a uuid;
  v_user_b uuid;
  v_existing public.connections;
  v_connection public.connections;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_user_id is null or p_target_user_id = v_actor then
    raise exception 'Invalid target user';
  end if;

  if not exists (
    select 1 from public.group_memberships gm
    where gm.group_id = p_group_id and gm.user_id = v_actor
  ) then
    raise exception 'You must be a group member to request a connection';
  end if;

  if not exists (
    select 1 from public.group_memberships gm
    where gm.group_id = p_group_id and gm.user_id = p_target_user_id
  ) then
    raise exception 'Target user is not in this group';
  end if;

  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_actor and b.blocked_id = p_target_user_id)
       or (b.blocker_id = p_target_user_id and b.blocked_id = v_actor)
  ) then
    raise exception 'Connection unavailable';
  end if;

  v_user_a := least(v_actor, p_target_user_id);
  v_user_b := greatest(v_actor, p_target_user_id);

  select * into v_existing
  from public.connections c
  where c.group_id = p_group_id
    and c.user_a_id = v_user_a
    and c.user_b_id = v_user_b
  limit 1;

  if found then
    if v_existing.status in ('pending', 'accepted') then
      return v_existing;
    end if;

    update public.connections
    set
      status = 'pending',
      requested_by = v_actor,
      requested_at = now(),
      activity_suggested = 'Requested from member profile',
      revealed_at = now(),
      responded_a_at = case when v_user_a = v_actor then now() else null end,
      responded_b_at = case when v_user_b = v_actor then now() else null end,
      updated_at = now()
    where id = v_existing.id
    returning * into v_connection;

    return v_connection;
  end if;

  insert into public.connections (
    group_id,
    user_a_id,
    user_b_id,
    status,
    activity_suggested,
    requested_by,
    requested_at,
    responded_a_at,
    responded_b_at
  )
  values (
    p_group_id,
    v_user_a,
    v_user_b,
    'pending',
    'Requested from member profile',
    v_actor,
    now(),
    case when v_user_a = v_actor then now() else null end,
    case when v_user_b = v_actor then now() else null end
  )
  returning * into v_connection;

  return v_connection;
end;
$$;

revoke all on function public.request_group_connection(uuid, uuid) from public;
grant execute on function public.request_group_connection(uuid, uuid) to authenticated;

create or replace function public.respond_to_connection_request(
  p_connection_id uuid,
  p_accept boolean
)
returns public.connections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_connection public.connections;
  v_next_status public.connection_status;
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_connection
  from public.connections c
  where c.id = p_connection_id
  for update;

  if not found then
    raise exception 'Connection not found';
  end if;

  if v_actor not in (v_connection.user_a_id, v_connection.user_b_id) then
    raise exception 'Forbidden';
  end if;

  if v_connection.requested_by = v_actor then
    raise exception 'Requester cannot accept their own request';
  end if;

  if v_connection.status <> 'pending' then
    return v_connection;
  end if;

  if exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = v_connection.user_a_id and b.blocked_id = v_connection.user_b_id)
       or (b.blocker_id = v_connection.user_b_id and b.blocked_id = v_connection.user_a_id)
  ) then
    raise exception 'Connection unavailable';
  end if;

  v_next_status := case when p_accept then 'accepted'::public.connection_status else 'passed'::public.connection_status end;

  update public.connections
  set
    status = v_next_status,
    responded_a_at = case when user_a_id = v_actor then now() else responded_a_at end,
    responded_b_at = case when user_b_id = v_actor then now() else responded_b_at end,
    updated_at = now()
  where id = p_connection_id
  returning * into v_connection;

  return v_connection;
end;
$$;

revoke all on function public.respond_to_connection_request(uuid, boolean) from public;
grant execute on function public.respond_to_connection_request(uuid, boolean) to authenticated;
