create or replace function public.log_agent_feedback_event(
  p_proposal_id uuid,
  p_event_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.agent_feedback_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing public.agent_feedback_events;
  v_cooldown interval;
  v_row public.agent_feedback_events;
begin
  v_user_id := auth.uid();

  v_cooldown := case p_event_type
    when 'viewed' then interval '6 hours'
    when 'clicked' then interval '10 minutes'
    when 'dismissed' then interval '7 days'
    when 'ignored' then interval '14 days'
    else interval '0 seconds'
  end;

  if v_cooldown > interval '0 seconds' then
    select *
    into v_existing
    from public.agent_feedback_events
    where proposal_id = p_proposal_id
      and event_type = p_event_type
      and (
        (v_user_id is not null and user_id = v_user_id)
        or (v_user_id is null and user_id is null)
      )
      and occurred_at >= now() - v_cooldown
    order by occurred_at desc
    limit 1;

    if found then
      return v_existing;
    end if;
  end if;

  insert into public.agent_feedback_events (
    proposal_id,
    user_id,
    event_type,
    metadata
  )
  values (
    p_proposal_id,
    v_user_id,
    p_event_type,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.log_agent_feedback_event(uuid, text, jsonb) from public;
grant execute on function public.log_agent_feedback_event(uuid, text, jsonb) to authenticated;
