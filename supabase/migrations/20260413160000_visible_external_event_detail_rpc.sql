create or replace function public.fetch_visible_external_event_by_id(
  p_opportunity_id uuid
)
returns setof public.agent_opportunities
language sql
security definer
set search_path = public
as $$
  with viewer as (
    select auth.uid() as uid
  )
  select o.*
  from public.agent_opportunities o
  cross join viewer v
  where o.id = p_opportunity_id
    and o.kind = 'event'
    and (o.expires_at is null or o.expires_at > now())
    and (
      exists (
        select 1
        from public.agent_proposals p
        where p.opportunity_id = o.id
          and p.target_surface = 'events'
          and p.status = 'approved'
          and (p.expires_at is null or p.expires_at > now())
          and (
            (
              not exists (
                select 1
                from public.agent_proposal_audience a
                where a.proposal_id = p.id
              )
              and coalesce(array_length(p.audience_user_ids, 1), 0) = 0
            )
            or (
              v.uid is not null
              and (
                exists (
                  select 1
                  from public.agent_proposal_audience a
                  where a.proposal_id = p.id
                    and a.user_id = v.uid
                )
                or v.uid = any(p.audience_user_ids)
              )
            )
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
      )
      or (
        v.uid is not null
        and exists (
          select 1
          from public.agent_event_rsvps r
          where r.opportunity_id = o.id
            and r.user_id = v.uid
            and r.status in ('going', 'interested')
        )
      )
      or (
        v.uid is not null
        and exists (
          select 1
          from public.agent_event_rsvps r
          join public.connections c
            on c.status = 'accepted'
           and (
             (c.user_a_id = v.uid and c.user_b_id = r.user_id)
             or (c.user_b_id = v.uid and c.user_a_id = r.user_id)
           )
          where r.opportunity_id = o.id
            and r.status in ('going', 'interested')
        )
      )
    )
  limit 1;
$$;

revoke all on function public.fetch_visible_external_event_by_id(uuid) from public;
grant execute on function public.fetch_visible_external_event_by_id(uuid) to authenticated;
