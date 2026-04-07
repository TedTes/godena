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

  select *
  into v_opportunity
  from public.agent_opportunities
  where id = v_proposal.opportunity_id;

  if not found then
    raise exception 'opportunity_not_found';
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

  return v_connection_id;
end;
$$;

revoke all on function public.create_agent_intro_connection(uuid) from public;
grant execute on function public.create_agent_intro_connection(uuid) to authenticated;
