-- Phase 4: secure group members read with profile fields
-- Rationale: group UI needs all members + names/avatars, while base RLS is strict.

create or replace function public.get_group_members(p_group_id uuid)
returns table (
  user_id uuid,
  role public.group_role,
  full_name text,
  avatar_url text
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

  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor
  ) then
    raise exception 'not_group_member';
  end if;

  return query
  select
    gm.user_id,
    gm.role,
    p.full_name,
    p.avatar_url
  from public.group_memberships gm
  left join public.profiles p on p.user_id = gm.user_id
  where gm.group_id = p_group_id
  order by gm.joined_at desc
  limit 200;
end;
$$;

revoke all on function public.get_group_members(uuid) from public;
grant execute on function public.get_group_members(uuid) to authenticated;
