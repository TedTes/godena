-- Notification preferences stored per user profile.
alter table public.profiles
  add column if not exists notify_group_messages boolean not null default true,
  add column if not exists notify_connection_messages boolean not null default true,
  add column if not exists notify_reveals boolean not null default true,
  add column if not exists notify_events boolean not null default true,
  add column if not exists notify_marketing boolean not null default false;

