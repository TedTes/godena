-- Decouple per-group openness from the global is_open_to_connections flag.
-- Group-level opt-in (group_memberships.is_open_to_connect) is now the sole
-- source of truth for reveal/mutual-detection eligibility.
-- The global flag on profiles is retained as a UI preference hint only.

drop trigger if exists guard_group_signal_against_global_open_trigger on public.group_memberships;
drop trigger if exists sync_group_signals_with_global_open_trigger on public.profiles;

drop function if exists public.guard_group_signal_against_global_open();
drop function if exists public.sync_group_signals_with_global_open();

-- Ensure openness_set_at is stamped correctly at the DB level without the
-- guard trigger. A simple BEFORE trigger handles the timestamp only.
create or replace function public.stamp_group_openness_timestamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_open_to_connect = true then
    if new.openness_set_at is null then
      new.openness_set_at := now();
    end if;
  else
    new.openness_set_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_group_openness_timestamp_trigger on public.group_memberships;
create trigger stamp_group_openness_timestamp_trigger
before insert or update of is_open_to_connect on public.group_memberships
for each row
execute function public.stamp_group_openness_timestamp();
