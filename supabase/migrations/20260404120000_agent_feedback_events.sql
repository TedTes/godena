create table if not exists public.agent_feedback_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.agent_proposals (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_feedback_events_proposal_time
  on public.agent_feedback_events (proposal_id, occurred_at desc);

create index if not exists idx_agent_feedback_events_user_time
  on public.agent_feedback_events (user_id, occurred_at desc);

alter table public.agent_feedback_events enable row level security;

create policy "agent_feedback_events_select_authenticated"
on public.agent_feedback_events
for select
to authenticated
using (true);

create policy "agent_feedback_events_insert_authenticated"
on public.agent_feedback_events
for insert
to authenticated
with check (auth.uid() = user_id or user_id is null);
