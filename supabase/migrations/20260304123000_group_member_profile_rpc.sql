-- Group-scoped member profile read.
-- Only users who belong to the same group can fetch a member profile.

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
