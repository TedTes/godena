-- Phase 9: Premium billing foundation (Stripe)

alter table public.profiles
  add column if not exists stripe_customer_id text unique;

alter table public.matching_config
  add column if not exists premium_priority_bonus numeric(10,2) not null default 3,
  add column if not exists free_group_join_limit int not null default 5;

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text unique,
  provider_price_id text,
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_user_status
  on public.billing_subscriptions (user_id, status, current_period_end desc);

create unique index if not exists idx_billing_subscriptions_provider_sub
  on public.billing_subscriptions (provider_subscription_id)
  where provider_subscription_id is not null;

create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

alter table public.billing_subscriptions enable row level security;

create policy "billing_subscriptions_select_own"
on public.billing_subscriptions
for select
to authenticated
using (user_id = auth.uid());
