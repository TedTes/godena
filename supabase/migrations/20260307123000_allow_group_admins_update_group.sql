drop policy if exists "groups_update_creator" on public.groups;

create policy "groups_update_group_admin"
on public.groups
for update
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role in ('organizer', 'moderator')
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = groups.id
      and gm.user_id = auth.uid()
      and gm.role in ('organizer', 'moderator')
  )
);
