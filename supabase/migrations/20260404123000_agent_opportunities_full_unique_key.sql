drop index if exists public.idx_agent_opportunities_canonical_key;

create unique index if not exists idx_agent_opportunities_canonical_key
  on public.agent_opportunities (canonical_key);
