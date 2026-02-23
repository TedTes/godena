-- Phase 4: safe client logging for interaction_events via RPC

create or replace function public.log_interaction_event(
  p_group_id uuid,
  p_event_type public.interaction_event_type,
  p_target_id uuid,
  p_source_post_id uuid default null,
  p_source_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  if v_actor_id = p_target_id then
    return;
  end if;

  -- Guard: both users must be members of the same group.
  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor_id
  ) then
    raise exception 'actor_not_group_member';
  end if;

  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = p_target_id
  ) then
    raise exception 'target_not_group_member';
  end if;

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
    p_group_id,
    p_event_type,
    v_actor_id,
    p_target_id,
    p_source_post_id,
    p_source_event_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_interaction_event(
  uuid,
  public.interaction_event_type,
  uuid,
  uuid,
  uuid,
  jsonb
) from public;

grant execute on function public.log_interaction_event(
  uuid,
  public.interaction_event_type,
  uuid,
  uuid,
  uuid,
  jsonb
) to authenticated;
