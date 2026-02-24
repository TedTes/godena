-- Phase 9 bullet 1 hardening:
-- Private 1:1 chat is only available after mutual accept.

drop policy if exists "connection_messages_select_if_participant" on public.connection_messages;
drop policy if exists "connection_messages_insert_own_if_participant" on public.connection_messages;
drop policy if exists "connection_messages_update_own" on public.connection_messages;
drop policy if exists "connection_messages_delete_own" on public.connection_messages;

create policy "connection_messages_select_if_accepted_participant"
on public.connection_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
      and c.status = 'accepted'
  )
);

create policy "connection_messages_insert_own_if_accepted_participant"
on public.connection_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
      and c.status = 'accepted'
  )
);

create policy "connection_messages_update_own_if_accepted"
on public.connection_messages
for update
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
      and c.status = 'accepted'
  )
)
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
      and c.status = 'accepted'
  )
);

create policy "connection_messages_delete_own_if_accepted"
on public.connection_messages
for delete
to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
      and c.status = 'accepted'
  )
);
