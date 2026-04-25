create or replace function public.mark_connection_messages_read(
  p_connection_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.connections c
    where c.id = p_connection_id
      and c.status = 'accepted'
      and v_user_id in (c.user_a_id, c.user_b_id)
  ) then
    raise exception 'connection_not_available';
  end if;

  update public.connection_messages
  set read_at = now()
  where connection_id = p_connection_id
    and read_at is null
    and sender_id <> v_user_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.mark_connection_messages_read(uuid) from public;
grant execute on function public.mark_connection_messages_read(uuid) to authenticated;
