-- Exclude blocked users from group members, member profiles, and activity feed.

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
    and not exists (
      select 1
      from public.blocked_users bu
      where (bu.blocker_id = v_actor and bu.blocked_id = gm.user_id)
         or (bu.blocker_id = gm.user_id and bu.blocked_id = v_actor)
    )
  order by gm.joined_at desc
  limit 200;
end;
$$;

revoke all on function public.get_group_members(uuid) from public;
grant execute on function public.get_group_members(uuid) to authenticated;

create or replace function public.get_group_member_profile(
  p_group_id uuid,
  p_member_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  avatar_url text,
  bio text,
  city text,
  gender public.gender,
  intent public.profile_intent,
  languages text[],
  ethnicity text,
  religion text,
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

  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = v_actor
  ) then
    raise exception 'not_group_member';
  end if;

  if not exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = p_group_id
      and gm.user_id = p_member_id
  ) then
    raise exception 'target_not_group_member';
  end if;

  if exists (
    select 1
    from public.blocked_users bu
    where (bu.blocker_id = v_actor and bu.blocked_id = p_member_id)
       or (bu.blocker_id = p_member_id and bu.blocked_id = v_actor)
  ) then
    raise exception 'blocked_user';
  end if;

  return query
  select
    p.user_id,
    p.full_name,
    p.avatar_url,
    p.bio,
    p.city,
    p.gender,
    p.intent,
    p.languages,
    p.ethnicity,
    p.religion,
    p.birth_date
  from public.profiles p
  where p.user_id = p_member_id
    and p.deleted_at is null
  limit 1;
end;
$$;

revoke all on function public.get_group_member_profile(uuid, uuid) from public;
grant execute on function public.get_group_member_profile(uuid, uuid) to authenticated;

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
    and not exists (
      select 1
      from public.blocked_users bu
      where (bu.blocker_id = v_actor and bu.blocked_id = gp.author_id)
         or (bu.blocker_id = gp.author_id and bu.blocked_id = v_actor)
    )
  order by gp.created_at desc
  limit 5;
end;
$$;

revoke all on function public.get_group_activity_feed(uuid[]) from public;
grant execute on function public.get_group_activity_feed(uuid[]) to authenticated;
