-- Identity verification foundation (Stripe Identity-ready)

do $$
begin
  create type public.identity_verification_status as enum (
    'unverified',
    'pending',
    'requires_input',
    'verified',
    'failed',
    'canceled'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists verification_status public.identity_verification_status not null default 'unverified',
  add column if not exists verification_provider text,
  add column if not exists verification_submitted_at timestamptz,
  add column if not exists verified_at timestamptz;

create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,
  provider_session_id text,
  status public.identity_verification_status not null default 'pending',
  hosted_url text,
  failure_reason text,
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_session_id)
);

create index if not exists identity_verifications_user_created_idx
  on public.identity_verifications (user_id, created_at desc);

drop trigger if exists set_identity_verifications_updated_at on public.identity_verifications;
create trigger set_identity_verifications_updated_at
before update on public.identity_verifications
for each row execute function public.set_updated_at();

alter table public.identity_verifications enable row level security;

create policy "identity_verifications_select_own"
on public.identity_verifications
for select
using (auth.uid() = user_id);
