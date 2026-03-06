alter table public.profiles
  add column if not exists dating_mode_enabled boolean not null default false;
