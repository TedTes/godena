-- Replace external_events with opportunity-based event entities.

insert into public.agent_opportunities (
  kind,
  title,
  summary,
  city,
  country,
  starts_at,
  ends_at,
  timezone,
  venue_name,
  lat,
  lng,
  canonical_key,
  primary_external_record_id,
  feature_snapshot,
  metadata,
  expires_at
)
select
  'event'::public.opportunity_kind,
  e.title,
  e.description,
  e.city,
  e.country,
  e.start_at,
  e.end_at,
  e.timezone,
  e.venue_name,
  e.lat,
  e.lng,
  'legacy-external-event:' || e.id::text,
  null,
  jsonb_build_object(
    'category', e.category,
    'tags', '[]'::jsonb,
    'source', e.source,
    'source_record_id', e.source_id,
    'image_url', e.image_url,
    'price_min', e.price_min,
    'is_free', e.is_free
  ),
  jsonb_build_object(
    'source_url', e.source_url,
    'organizer_name', e.organizer_name,
    'organizer_source_id', e.organizer_source_id,
    'external_event_id', e.id
  ),
  coalesce(e.end_at, e.start_at)
from public.external_events e
left join public.agent_opportunities o
  on o.metadata->>'external_event_id' = e.id::text
where o.id is null;

create table if not exists public.agent_event_rsvps (
  opportunity_id uuid not null references public.agent_opportunities (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (opportunity_id, user_id)
);

insert into public.agent_event_rsvps (opportunity_id, user_id, status, created_at, updated_at)
select
  o.id,
  r.user_id,
  r.status,
  r.created_at,
  r.updated_at
from public.external_event_rsvps r
join public.agent_opportunities o
  on o.metadata->>'external_event_id' = r.event_id::text
on conflict (opportunity_id, user_id) do update
set
  status = excluded.status,
  updated_at = excluded.updated_at;

create index if not exists idx_agent_event_rsvps_opportunity
  on public.agent_event_rsvps (opportunity_id, status);

create index if not exists idx_agent_event_rsvps_user
  on public.agent_event_rsvps (user_id, status);

drop trigger if exists trg_agent_event_rsvps_updated_at on public.agent_event_rsvps;
create trigger trg_agent_event_rsvps_updated_at
before update on public.agent_event_rsvps
for each row execute function public.set_updated_at();

alter table public.agent_event_rsvps enable row level security;

create policy "agent_event_rsvps_select_authenticated"
on public.agent_event_rsvps
for select
to authenticated
using (true);

create policy "agent_event_rsvps_insert_own"
on public.agent_event_rsvps
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "agent_event_rsvps_update_own"
on public.agent_event_rsvps
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "agent_event_rsvps_delete_own"
on public.agent_event_rsvps
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.agent_event_groups (
  opportunity_id uuid not null references public.agent_opportunities (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, group_id)
);

insert into public.agent_event_groups (opportunity_id, group_id, created_at)
select
  o.id,
  g.group_id,
  now()
from public.external_event_groups g
join public.agent_opportunities o
  on o.metadata->>'external_event_id' = g.event_id::text
on conflict (opportunity_id, group_id) do nothing;

alter table public.agent_event_groups enable row level security;

create policy "agent_event_groups_select_authenticated"
on public.agent_event_groups
for select
to authenticated
using (true);

create or replace function public.log_agent_event_rsvp(
  p_opportunity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_group_id uuid;
  v_target_id uuid;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'not_authenticated';
  end if;

  select external_group_id into v_group_id
  from public.matching_config
  where id = 1;

  if v_group_id is null then
    raise exception 'missing_external_group_id';
  end if;

  insert into public.group_memberships (
    group_id,
    user_id,
    role,
    is_open_to_connect,
    openness_set_at
  )
  values (
    v_group_id,
    v_actor_id,
    'member',
    true,
    now()
  )
  on conflict (group_id, user_id) do update
  set
    is_open_to_connect = true,
    openness_set_at = coalesce(public.group_memberships.openness_set_at, now()),
    updated_at = now();

  for v_target_id in
    select distinct r.user_id
    from public.agent_event_rsvps r
    where r.opportunity_id = p_opportunity_id
      and r.user_id <> v_actor_id
      and r.status in ('going', 'interested')
  loop
    insert into public.group_memberships (
      group_id,
      user_id,
      role,
      is_open_to_connect,
      openness_set_at
    )
    values (
      v_group_id,
      v_target_id,
      'member',
      true,
      now()
    )
    on conflict (group_id, user_id) do update
    set
      is_open_to_connect = true,
      openness_set_at = coalesce(public.group_memberships.openness_set_at, now()),
      updated_at = now();

    insert into public.interaction_events (
      group_id,
      event_type,
      actor_id,
      target_id,
      source_post_id,
      source_event_id,
      metadata
    )
    values (
      v_group_id,
      'same_event_rsvp',
      v_actor_id,
      v_target_id,
      null,
      p_opportunity_id,
      jsonb_build_object('opportunity_id', p_opportunity_id)
    )
    on conflict do nothing;
  end loop;
end;
$$;

revoke all on function public.log_agent_event_rsvp(uuid) from public;
grant execute on function public.log_agent_event_rsvp(uuid) to authenticated;

create or replace function public.create_agent_event_chat(
  p_opportunity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid;
  v_event       record;
  v_group_id    uuid;
  v_category    public.group_category;
  v_going_uid   uuid;
  v_date_label  text;
  v_short_title text;
  v_chat_name   text;
begin
  perform set_config('row_security', 'off', true);

  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;

  select
    id,
    title,
    summary,
    city,
    country,
    starts_at,
    coalesce(feature_snapshot->>'category', 'other') as category
  into v_event
  from public.agent_opportunities
  where id = p_opportunity_id
    and kind = 'event';

  if not found then
    raise exception 'event_not_found';
  end if;

  select group_id into v_group_id
  from public.agent_event_groups
  where opportunity_id = p_opportunity_id;

  if v_group_id is not null then
    insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
    values (v_group_id, v_caller_id, 'member', true, now())
    on conflict (group_id, user_id) do nothing;

    return v_group_id;
  end if;

  v_category := case v_event.category
    when 'outdoors'     then 'outdoors'::public.group_category
    when 'food_drink'   then 'food_drink'::public.group_category
    when 'professional' then 'professional'::public.group_category
    when 'language'     then 'language'::public.group_category
    when 'faith'        then 'faith'::public.group_category
    when 'culture'      then 'culture'::public.group_category
    else 'other'::public.group_category
  end;

  v_date_label := to_char(coalesce(v_event.starts_at, now()), 'Mon DD');
  v_short_title := case when length(v_event.title) > 28 then left(v_event.title, 28) || '…' else v_event.title end;
  v_chat_name := '📅 ' || v_short_title || ' · ' || v_date_label;

  insert into public.groups (
    name,
    description,
    category,
    city,
    country,
    is_virtual,
    created_by
  )
  values (
    v_chat_name,
    'Auto-generated chat for attendees of ' || v_event.title,
    v_category,
    v_event.city,
    v_event.country,
    true,
    v_caller_id
  )
  returning id into v_group_id;

  insert into public.agent_event_groups (opportunity_id, group_id)
  values (p_opportunity_id, v_group_id)
  on conflict (opportunity_id, group_id) do nothing;

  for v_going_uid in
    select user_id
    from public.agent_event_rsvps
    where opportunity_id = p_opportunity_id
      and status = 'going'
  loop
    insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
    values (v_group_id, v_going_uid, 'member', true, now())
    on conflict (group_id, user_id) do nothing;
  end loop;

  insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
  values (v_group_id, v_caller_id, 'member', true, now())
  on conflict (group_id, user_id) do nothing;

  insert into public.group_messages (group_id, sender_id, content)
  values (
    v_group_id,
    v_caller_id,
    '👋 Hey! You''re all going to ' || v_event.title || ' on ' || v_date_label || '. Say hi to your fellow attendees!'
  );

  return v_group_id;
end;
$$;

revoke all on function public.create_agent_event_chat(uuid) from public;
grant execute on function public.create_agent_event_chat(uuid) to authenticated;

drop function if exists public.create_external_event_chat(uuid);
drop function if exists public.log_external_event_rsvp(uuid);

drop table if exists public.external_event_groups;
drop table if exists public.external_event_rsvps;
drop table if exists public.external_events;
