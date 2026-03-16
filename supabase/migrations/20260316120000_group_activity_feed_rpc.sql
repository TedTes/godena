create or replace function public.get_group_activity_feed(p_group_ids uuid[])
returns table (
  post_id uuid,
  group_id uuid,
  author_id uuid,
  author_first_name text,
  content text,
  created_at timestamptz
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
    gp.id,
    gp.group_id,
    gp.author_id,
    split_part(coalesce(pr.full_name, 'A member'), ' ', 1) as author_first_name,
    gp.content,
    gp.created_at
  from public.group_posts gp
  left join public.profiles pr on pr.user_id = gp.author_id
  where gp.group_id = any(p_group_ids)
    and exists (
      select 1 from public.group_memberships gm
      where gm.group_id = gp.group_id
        and gm.user_id = v_actor
    )
  order by gp.created_at desc
  limit 5;
end;
$$;

revoke all on function public.get_group_activity_feed(uuid[]) from public;
grant execute on function public.get_group_activity_feed(uuid[]) to authenticated;
