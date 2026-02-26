-- Phase 4: secure group member counts for list/home UIs

create or replace function public.get_group_member_counts(p_group_ids uuid[])
returns table (
  group_id uuid,
  member_count int
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
  select
    gm.group_id,
    count(*)::int as member_count
  from public.group_memberships gm
  where gm.group_id = any (p_group_ids)
    and exists (
      select 1
      from public.group_memberships self
      where self.group_id = gm.group_id
        and self.user_id = v_actor
    )
  group by gm.group_id;
end;
$$;

revoke all on function public.get_group_member_counts(uuid[]) from public;
grant execute on function public.get_group_member_counts(uuid[]) to authenticated;
