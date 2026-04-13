create table if not exists public.agent_event_companion_requests (
  opportunity_id uuid not null references public.agent_opportunities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opportunity_id, user_id),
  constraint agent_event_companion_requests_status_check
    check (status in ('active', 'matched', 'cancelled', 'expired'))
);

create index if not exists idx_agent_event_companion_requests_status
  on public.agent_event_companion_requests (status, opportunity_id, created_at desc);

create index if not exists idx_agent_event_companion_requests_user
  on public.agent_event_companion_requests (user_id, status, created_at desc);

drop trigger if exists trg_agent_event_companion_requests_updated_at on public.agent_event_companion_requests;
create trigger trg_agent_event_companion_requests_updated_at
before update on public.agent_event_companion_requests
for each row execute function public.set_updated_at();

alter table public.agent_event_companion_requests enable row level security;

drop policy if exists "agent_event_companion_requests_select_own" on public.agent_event_companion_requests;
create policy "agent_event_companion_requests_select_own"
on public.agent_event_companion_requests
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.create_agent_event_companion_request(
  p_opportunity_id uuid
)
returns public.agent_event_companion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_event record;
  v_group_id uuid;
  v_row public.agent_event_companion_requests;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_event
  from public.fetch_visible_external_event_by_id(p_opportunity_id)
  limit 1;

  if not found then
    raise exception 'event_not_visible';
  end if;

  insert into public.agent_event_companion_requests (
    opportunity_id,
    user_id,
    status
  )
  values (
    p_opportunity_id,
    v_actor_id,
    'active'
  )
  on conflict (opportunity_id, user_id) do update
  set status = 'active',
      updated_at = now()
  returning * into v_row;

  insert into public.agent_event_rsvps (opportunity_id, user_id, status)
  values (p_opportunity_id, v_actor_id, 'interested')
  on conflict (opportunity_id, user_id) do update
  set status = case
        when public.agent_event_rsvps.status = 'going' then public.agent_event_rsvps.status
        else 'interested'::public.rsvp_status
      end,
      updated_at = now();

  select external_group_id into v_group_id
  from public.matching_config
  where id = 1;

  if v_group_id is not null then
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
    set is_open_to_connect = true,
        openness_set_at = coalesce(public.group_memberships.openness_set_at, now()),
        updated_at = now();
  end if;

  return v_row;
end;
$$;

revoke all on function public.create_agent_event_companion_request(uuid) from public;
grant execute on function public.create_agent_event_companion_request(uuid) to authenticated;

create or replace function public.cancel_agent_event_companion_request(
  p_opportunity_id uuid
)
returns public.agent_event_companion_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_row public.agent_event_companion_requests;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  update public.agent_event_companion_requests
  set status = 'cancelled',
      updated_at = now()
  where opportunity_id = p_opportunity_id
    and user_id = v_actor_id
  returning * into v_row;

  if not found then
    raise exception 'request_not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.cancel_agent_event_companion_request(uuid) from public;
grant execute on function public.cancel_agent_event_companion_request(uuid) to authenticated;
