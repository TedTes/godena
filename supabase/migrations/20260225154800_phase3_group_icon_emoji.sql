-- Phase 3: group icon consistency + user-editable icon
alter table public.groups
  add column if not exists icon_emoji text;
