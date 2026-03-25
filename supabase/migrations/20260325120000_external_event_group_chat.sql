-- Link external events to auto-created group chats

create table if not exists public.external_event_groups (
  event_id  uuid not null references public.external_events (id) on delete cascade,
  group_id  uuid not null references public.groups (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id),
  unique (group_id)
);

alter table public.external_event_groups enable row level security;

create policy "external_event_groups_select_authenticated"
on public.external_event_groups
for select
to authenticated
using (true);

-- RPC: find-or-create a group chat for an external event
-- Returns the group_id (existing or newly created).
create or replace function public.create_external_event_chat(
  p_event_id uuid
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
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    raise exception 'not_authenticated';
  end if;

  -- Fetch the external event
  select id, title, description, category, city, country
  into v_event
  from public.external_events
  where id = p_event_id;

  if not found then
    raise exception 'event_not_found';
  end if;

  -- Return existing group if already created
  select group_id into v_group_id
  from public.external_event_groups
  where event_id = p_event_id;

  if v_group_id is not null then
    -- Ensure caller is a member (they may have RSVP'd after the group was created)
    insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
    values (v_group_id, v_caller_id, 'member', true, now())
    on conflict (group_id, user_id) do nothing;

    return v_group_id;
  end if;

  -- Map external event category to group_category enum (best-effort)
  v_category := case v_event.category
    when 'outdoors'     then 'outdoors'::public.group_category
    when 'food_drink'   then 'food_drink'::public.group_category
    when 'professional' then 'professional'::public.group_category
    when 'language'     then 'language'::public.group_category
    when 'faith'        then 'faith'::public.group_category
    when 'culture'      then 'culture'::public.group_category
    else 'other'::public.group_category
  end;

  -- Create the group
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
    v_event.title || ' — Attendees',
    'Auto-generated chat for attendees of ' || v_event.title,
    v_category,
    v_event.city,
    v_event.country,
    true,
    v_caller_id
  )
  returning id into v_group_id;

  -- Record the mapping
  insert into public.external_event_groups (event_id, group_id)
  values (p_event_id, v_group_id);

  -- Add all going RSVPs as members
  for v_going_uid in
    select user_id
    from public.external_event_rsvps
    where event_id = p_event_id
      and status = 'going'
  loop
    insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
    values (
      v_group_id,
      v_going_uid,
      'member',
      true,
      now()
    )
    on conflict (group_id, user_id) do nothing;
  end loop;

  -- Ensure caller is a member even if they haven't RSVP'd yet
  insert into public.group_memberships (group_id, user_id, role, is_open_to_connect, openness_set_at)
  values (v_group_id, v_caller_id, 'member', true, now())
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

revoke all on function public.create_external_event_chat(uuid) from public;
grant execute on function public.create_external_event_chat(uuid) to authenticated;
