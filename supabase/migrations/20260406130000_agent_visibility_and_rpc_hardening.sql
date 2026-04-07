create or replace function public.fetch_visible_agent_proposals(
  p_surface public.suggestion_target_surface default null,
  p_city text default null,
  p_limit integer default 25
)
returns setof public.agent_proposals
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  )
  select p.*
  from public.agent_proposals p
  cross join viewer v
  left join public.agent_opportunities o on o.id = p.opportunity_id
  where p.status = 'approved'
    and (p.expires_at is null or p.expires_at > now())
    and (o.id is null or o.expires_at is null or o.expires_at > now())
    and (p_surface is null or p.target_surface = p_surface)
    and (
      p_city is null
      or p_city = ''
      or coalesce(p.city, '') ilike '%' || p_city || '%'
    )
    and (
      coalesce(array_length(p.audience_user_ids, 1), 0) = 0
      or (v.uid is not null and v.uid = any(p.audience_user_ids))
    )
    and not exists (
      select 1
      from public.agent_feedback_events f
      where f.proposal_id = p.id
        and f.event_type in ('dismissed', 'ignored')
        and (
          (v.uid is not null and f.user_id = v.uid)
          or (v.uid is null and f.user_id is null)
        )
    )
  order by p.confidence_score desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.fetch_visible_agent_proposals(public.suggestion_target_surface, text, integer) from public;
grant execute on function public.fetch_visible_agent_proposals(public.suggestion_target_surface, text, integer) to authenticated;

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
  v_proposal public.agent_proposals;
begin
  v_user_id := auth.uid();

  select *
  into v_proposal
  from public.agent_proposals
  where id = p_proposal_id;

  if not found then
    raise exception 'proposal_not_found';
  end if;

  if v_proposal.status not in ('approved', 'published') then
    raise exception 'proposal_not_visible';
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at <= now() then
    raise exception 'proposal_expired';
  end if;

  if coalesce(array_length(v_proposal.audience_user_ids, 1), 0) > 0
     and (v_user_id is null or not (v_user_id = any(v_proposal.audience_user_ids))) then
    raise exception 'not_allowed';
  end if;

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

create or replace function public.create_agent_intro_connection(
  p_proposal_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_proposal record;
  v_opportunity record;
  v_candidate_ids uuid[];
  v_group_id uuid;
  v_user_a uuid;
  v_user_b uuid;
  v_existing_id uuid;
  v_connection_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into v_proposal
  from public.agent_proposals
  where id = p_proposal_id;

  if not found then
    raise exception 'proposal_not_found';
  end if;

  if v_proposal.target_surface <> 'connections' then
    raise exception 'invalid_proposal_surface';
  end if;

  if v_proposal.status <> 'approved' then
    raise exception 'proposal_not_approved';
  end if;

  if v_proposal.expires_at is not null and v_proposal.expires_at <= now() then
    raise exception 'proposal_expired';
  end if;

  if coalesce(array_length(v_proposal.audience_user_ids, 1), 0) > 0
     and not (v_actor_id = any(v_proposal.audience_user_ids)) then
    raise exception 'not_allowed';
  end if;

  select *
  into v_opportunity
  from public.agent_opportunities
  where id = v_proposal.opportunity_id;

  if not found then
    raise exception 'opportunity_not_found';
  end if;

  if v_opportunity.expires_at is not null and v_opportunity.expires_at <= now() then
    raise exception 'opportunity_expired';
  end if;

  v_candidate_ids := array(
    select jsonb_array_elements_text(coalesce(v_opportunity.metadata->'candidate_user_ids', '[]'::jsonb))::uuid
  );
  if coalesce(array_length(v_candidate_ids, 1), 0) <> 2 then
    raise exception 'invalid_candidate_pair';
  end if;

  if not (v_actor_id = any(v_candidate_ids)) then
    raise exception 'not_allowed';
  end if;

  v_group_id := nullif(v_opportunity.metadata->>'anchor_group_id', '')::uuid;
  if v_group_id is null then
    raise exception 'missing_anchor_group';
  end if;

  v_user_a := least(v_candidate_ids[1], v_candidate_ids[2]);
  v_user_b := greatest(v_candidate_ids[1], v_candidate_ids[2]);

  select id
  into v_existing_id
  from public.connections
  where group_id = v_group_id
    and user_a_id = v_user_a
    and user_b_id = v_user_b
  limit 1;

  if v_existing_id is not null then
    update public.agent_proposals
    set status = 'published',
        published_at = coalesce(published_at, now())
    where id = p_proposal_id;
    return v_existing_id;
  end if;

  insert into public.connections (
    group_id,
    user_a_id,
    user_b_id,
    status,
    activity_suggested,
    revealed_at,
    responded_a_at,
    responded_b_at
  )
  values (
    v_group_id,
    v_user_a,
    v_user_b,
    'pending',
    coalesce(v_opportunity.summary, 'A warm introduction suggested from your shared activity.'),
    now(),
    case when v_actor_id = v_user_a then now() else null end,
    case when v_actor_id = v_user_b then now() else null end
  )
  returning id into v_connection_id;

  update public.agent_proposals
  set status = 'published',
      published_at = coalesce(published_at, now())
  where id = p_proposal_id;

  return v_connection_id;
end;
$$;

revoke all on function public.create_agent_intro_connection(uuid) from public;
grant execute on function public.create_agent_intro_connection(uuid) to authenticated;
