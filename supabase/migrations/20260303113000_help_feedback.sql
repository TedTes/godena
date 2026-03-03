-- Help & feedback submissions from authenticated users.
create table if not exists public.help_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('bug', 'feedback', 'account', 'billing', 'other')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.help_feedback enable row level security;

drop policy if exists "help_feedback_select_own" on public.help_feedback;
create policy "help_feedback_select_own"
on public.help_feedback
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "help_feedback_insert_own" on public.help_feedback;
create policy "help_feedback_insert_own"
on public.help_feedback
for insert
to authenticated
with check (user_id = auth.uid());

drop trigger if exists set_help_feedback_updated_at on public.help_feedback;
create trigger set_help_feedback_updated_at
before update on public.help_feedback
for each row execute function public.set_updated_at();

