-- RSVPs for external events (imported)

create table if not exists public.external_event_rsvps (
  event_id uuid not null references public.external_events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists idx_external_event_rsvps_event
  on public.external_event_rsvps (event_id, status);

create index if not exists idx_external_event_rsvps_user
  on public.external_event_rsvps (user_id, status);

drop trigger if exists trg_external_event_rsvps_updated_at on public.external_event_rsvps;
create trigger trg_external_event_rsvps_updated_at
before update on public.external_event_rsvps
for each row execute function public.set_updated_at();

alter table public.external_event_rsvps enable row level security;

create policy "external_event_rsvps_select_authenticated"
on public.external_event_rsvps
for select
to authenticated
using (true);

create policy "external_event_rsvps_insert_own"
on public.external_event_rsvps
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "external_event_rsvps_update_own"
on public.external_event_rsvps
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "external_event_rsvps_delete_own"
on public.external_event_rsvps
for delete
to authenticated
using (auth.uid() = user_id);
