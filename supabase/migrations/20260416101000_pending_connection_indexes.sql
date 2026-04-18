create index if not exists idx_connections_pending_user_a
  on public.connections (user_a_id)
  where status = 'pending';

create index if not exists idx_connections_pending_user_b
  on public.connections (user_b_id)
  where status = 'pending';
