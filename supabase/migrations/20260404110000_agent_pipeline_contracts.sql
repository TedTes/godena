-- Agent pipeline contract foundation.
-- This creates canonical records for normalized source entities, trust scores,
-- opportunities, proposals, and human-readable suggestion reasons.

create type public.external_entity_kind as enum (
  'event',
  'group',
  'venue',
  'context'
);

create type public.opportunity_kind as enum (
  'event',
  'group',
  'introduction'
);

create type public.proposal_status as enum (
  'draft',
  'approved',
  'rejected',
  'published',
  'expired'
);

create type public.approval_policy as enum (
  'auto_suggest',
  'organizer_confirm',
  'manual_only'
);

create type public.suggestion_target_surface as enum (
  'home',
  'groups',
  'events',
  'connections',
  'profile'
);

create table if not exists public.agent_external_records (
  id uuid primary key default gen_random_uuid(),
  kind public.external_entity_kind not null,
  source text not null,
  source_record_id text not null,
  ingestion_run_key text,
  fetched_at timestamptz not null default now(),
  source_updated_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  normalized_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_record_id)
);

create table if not exists public.agent_trust_scores (
  id uuid primary key default gen_random_uuid(),
  external_record_id uuid not null references public.agent_external_records (id) on delete cascade,
  overall_score numeric(5,2) not null default 0,
  scoring_version text not null default 'v1',
  source_confidence numeric(5,2) not null default 0,
  organizer_confidence numeric(5,2) not null default 0,
  freshness_score numeric(5,2) not null default 0,
  spam_risk_score numeric(5,2) not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_record_id)
);

create table if not exists public.agent_opportunities (
  id uuid primary key default gen_random_uuid(),
  kind public.opportunity_kind not null,
  title text not null,
  summary text,
  city text,
  country text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  lat numeric,
  lng numeric,
  canonical_key text,
  primary_external_record_id uuid references public.agent_external_records (id) on delete set null,
  feature_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_opportunity_sources (
  opportunity_id uuid not null references public.agent_opportunities (id) on delete cascade,
  external_record_id uuid not null references public.agent_external_records (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (opportunity_id, external_record_id)
);

create table if not exists public.agent_proposals (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.agent_opportunities (id) on delete set null,
  proposal_kind public.opportunity_kind not null,
  status public.proposal_status not null default 'draft',
  approval_policy public.approval_policy not null,
  target_surface public.suggestion_target_surface not null,
  city text,
  audience_user_ids uuid[] not null default '{}',
  audience_group_ids uuid[] not null default '{}',
  title text not null,
  body text,
  rationale jsonb not null default '{}'::jsonb,
  ranking_features jsonb not null default '{}'::jsonb,
  model_version text not null default 'rules-v1',
  confidence_score numeric(5,2) not null default 0,
  approval_required boolean not null default false,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users (id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_suggestion_reasons (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.agent_proposals (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  reason_code text not null,
  reason_label text not null,
  reason_detail text,
  evidence jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_external_records_kind_source
  on public.agent_external_records (kind, source, fetched_at desc);

create index if not exists idx_agent_trust_scores_overall
  on public.agent_trust_scores (overall_score desc);

create index if not exists idx_agent_opportunities_kind_city_start
  on public.agent_opportunities (kind, city, starts_at);

create unique index if not exists idx_agent_opportunities_canonical_key
  on public.agent_opportunities (canonical_key)
  where canonical_key is not null;

create index if not exists idx_agent_proposals_status_surface
  on public.agent_proposals (status, target_surface, created_at desc);

create index if not exists idx_agent_proposals_audience_users
  on public.agent_proposals using gin (audience_user_ids);

create index if not exists idx_agent_proposals_audience_groups
  on public.agent_proposals using gin (audience_group_ids);

create index if not exists idx_agent_suggestion_reasons_proposal_user
  on public.agent_suggestion_reasons (proposal_id, user_id, sort_order);

drop trigger if exists trg_agent_external_records_updated_at on public.agent_external_records;
create trigger trg_agent_external_records_updated_at
before update on public.agent_external_records
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_trust_scores_updated_at on public.agent_trust_scores;
create trigger trg_agent_trust_scores_updated_at
before update on public.agent_trust_scores
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_opportunities_updated_at on public.agent_opportunities;
create trigger trg_agent_opportunities_updated_at
before update on public.agent_opportunities
for each row execute function public.set_updated_at();

drop trigger if exists trg_agent_proposals_updated_at on public.agent_proposals;
create trigger trg_agent_proposals_updated_at
before update on public.agent_proposals
for each row execute function public.set_updated_at();

alter table public.agent_external_records enable row level security;
alter table public.agent_trust_scores enable row level security;
alter table public.agent_opportunities enable row level security;
alter table public.agent_opportunity_sources enable row level security;
alter table public.agent_proposals enable row level security;
alter table public.agent_suggestion_reasons enable row level security;

create policy "agent_external_records_select_authenticated"
on public.agent_external_records
for select
to authenticated
using (true);

create policy "agent_trust_scores_select_authenticated"
on public.agent_trust_scores
for select
to authenticated
using (true);

create policy "agent_opportunities_select_authenticated"
on public.agent_opportunities
for select
to authenticated
using (true);

create policy "agent_opportunity_sources_select_authenticated"
on public.agent_opportunity_sources
for select
to authenticated
using (true);

create policy "agent_proposals_select_authenticated"
on public.agent_proposals
for select
to authenticated
using (true);

create policy "agent_suggestion_reasons_select_authenticated"
on public.agent_suggestion_reasons
for select
to authenticated
using (true);
