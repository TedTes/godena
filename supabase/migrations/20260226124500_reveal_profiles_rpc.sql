-- Allow reveal/connections UI to read counterpart profile basics via secured RPC.

create or replace function public.get_connection_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  birth_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  return query
  select p.user_id, p.full_name, p.avatar_url, p.birth_date
  from public.profiles p
  where p.user_id = any (p_user_ids)
    and (
      p.user_id = v_actor
      or exists (
        select 1
        from public.connections c
        where (c.user_a_id = v_actor and c.user_b_id = p.user_id)
           or (c.user_b_id = v_actor and c.user_a_id = p.user_id)
      )
    );
end;
$$;

revoke all on function public.get_connection_profiles(uuid[]) from public;
grant execute on function public.get_connection_profiles(uuid[]) to authenticated;
