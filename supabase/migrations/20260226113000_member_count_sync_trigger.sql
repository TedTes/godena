-- Keep groups.member_count in sync with real memberships

create or replace function public.sync_group_member_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.groups g
    set member_count = (
      select count(*)::int
      from public.group_memberships gm
      where gm.group_id = new.group_id
    )
    where g.id = new.group_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.groups g
    set member_count = (
      select count(*)::int
      from public.group_memberships gm
      where gm.group_id = old.group_id
    )
    where g.id = old.group_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_group_member_count_on_insert on public.group_memberships;
create trigger sync_group_member_count_on_insert
after insert on public.group_memberships
for each row
execute function public.sync_group_member_count();

drop trigger if exists sync_group_member_count_on_delete on public.group_memberships;
create trigger sync_group_member_count_on_delete
after delete on public.group_memberships
for each row
execute function public.sync_group_member_count();
