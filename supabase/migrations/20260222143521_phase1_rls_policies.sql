-- Phase 1 RLS policies
-- Principle: authenticated users can access only what they own
-- or what they are entitled to via shared group/connection membership.

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_post_reactions enable row level security;
alter table public.group_events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.interaction_events enable row level security;
alter table public.interaction_scores enable row level security;
alter table public.connections enable row level security;
alter table public.group_messages enable row level security;
alter table public.connection_messages enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.matching_config enable row level security;

-- Profiles
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Groups (discoverable by authenticated users)
create policy "groups_select_authenticated"
on public.groups
for select
to authenticated
using (true);

create policy "groups_insert_authenticated"
on public.groups
for insert
to authenticated
with check (created_by = auth.uid());

create policy "groups_update_creator"
on public.groups
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "groups_delete_creator"
on public.groups
for delete
to authenticated
using (created_by = auth.uid());

-- Group memberships
create policy "group_memberships_select_group_member"
on public.group_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_memberships.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_memberships_insert_self"
on public.group_memberships
for insert
to authenticated
with check (user_id = auth.uid());

create policy "group_memberships_update_self"
on public.group_memberships
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "group_memberships_delete_self"
on public.group_memberships
for delete
to authenticated
using (user_id = auth.uid());

-- Group posts
create policy "group_posts_select_if_member"
on public.group_posts
for select
to authenticated
using (
  exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_posts.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_posts_insert_if_member"
on public.group_posts
for insert
to authenticated
with check (
  author_id = auth.uid()
  and exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_posts.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_posts_update_own"
on public.group_posts
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

create policy "group_posts_delete_own"
on public.group_posts
for delete
to authenticated
using (author_id = auth.uid());

-- Group post reactions
create policy "group_post_reactions_select_if_member"
on public.group_post_reactions
for select
to authenticated
using (
  exists (
    select 1
    from public.group_posts gp
    join public.group_memberships gm on gm.group_id = gp.group_id
    where gp.id = group_post_reactions.post_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_post_reactions_insert_own_if_member"
on public.group_post_reactions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_posts gp
    join public.group_memberships gm on gm.group_id = gp.group_id
    where gp.id = group_post_reactions.post_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_post_reactions_delete_own"
on public.group_post_reactions
for delete
to authenticated
using (user_id = auth.uid());

-- Group events
create policy "group_events_select_if_member"
on public.group_events
for select
to authenticated
using (
  exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_events.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_events_insert_if_member"
on public.group_events
for insert
to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_events.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_events_update_creator"
on public.group_events
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

create policy "group_events_delete_creator"
on public.group_events
for delete
to authenticated
using (created_by = auth.uid());

-- Event RSVPs
create policy "event_rsvps_select_if_group_member"
on public.event_rsvps
for select
to authenticated
using (
  exists (
    select 1
    from public.group_events ge
    join public.group_memberships gm on gm.group_id = ge.group_id
    where ge.id = event_rsvps.event_id
      and gm.user_id = auth.uid()
  )
);

create policy "event_rsvps_insert_own_if_group_member"
on public.event_rsvps
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.group_events ge
    join public.group_memberships gm on gm.group_id = ge.group_id
    where ge.id = event_rsvps.event_id
      and gm.user_id = auth.uid()
  )
);

create policy "event_rsvps_update_own"
on public.event_rsvps
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "event_rsvps_delete_own"
on public.event_rsvps
for delete
to authenticated
using (user_id = auth.uid());

-- Interaction events/scores are internal (edge functions/service role only)
-- Intentionally no authenticated policies.

-- Connections
create policy "connections_select_participant"
on public.connections
for select
to authenticated
using (auth.uid() in (user_a_id, user_b_id));

create policy "connections_update_participant"
on public.connections
for update
to authenticated
using (auth.uid() in (user_a_id, user_b_id))
with check (auth.uid() in (user_a_id, user_b_id));

-- Group messages
create policy "group_messages_select_if_member"
on public.group_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_messages.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_messages_insert_own_if_member"
on public.group_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from public.group_memberships gm
    where gm.group_id = group_messages.group_id
      and gm.user_id = auth.uid()
  )
);

create policy "group_messages_update_own"
on public.group_messages
for update
to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create policy "group_messages_delete_own"
on public.group_messages
for delete
to authenticated
using (sender_id = auth.uid());

-- Connection messages
create policy "connection_messages_select_if_participant"
on public.connection_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.connections c
    where c.id = connection_messages.connection_id
      and auth.uid() in (c.user_a_id, c.user_b_id)
  )
);

create policy "connection_messages_insert_own_if_participant"
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
  )
);

create policy "connection_messages_update_own"
on public.connection_messages
for update
to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create policy "connection_messages_delete_own"
on public.connection_messages
for delete
to authenticated
using (sender_id = auth.uid());

-- Reports
create policy "reports_select_own"
on public.reports
for select
to authenticated
using (reporter_id = auth.uid());

create policy "reports_insert_own"
on public.reports
for insert
to authenticated
with check (reporter_id = auth.uid());

-- Blocked users
create policy "blocked_users_select_own"
on public.blocked_users
for select
to authenticated
using (blocker_id = auth.uid());

create policy "blocked_users_insert_own"
on public.blocked_users
for insert
to authenticated
with check (blocker_id = auth.uid());

create policy "blocked_users_delete_own"
on public.blocked_users
for delete
to authenticated
using (blocker_id = auth.uid());

-- Matching config: readable by authenticated users; write via service role only.
create policy "matching_config_select_authenticated"
on public.matching_config
for select
to authenticated
using (true);
