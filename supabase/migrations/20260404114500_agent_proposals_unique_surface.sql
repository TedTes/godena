create unique index if not exists idx_agent_proposals_opportunity_surface
  on public.agent_proposals (opportunity_id, target_surface);
