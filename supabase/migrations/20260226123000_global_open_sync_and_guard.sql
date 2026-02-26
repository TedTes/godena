-- Keep global openness and per-group openness in sync.

create or replace function public.sync_group_signals_with_global_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_open_to_connections = false then
    update public.group_memberships
    set is_open_to_connect = false,
        openness_set_at = null
    where user_id = new.user_id
      and is_open_to_connect = true;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_group_signals_with_global_open_trigger on public.profiles;
create trigger sync_group_signals_with_global_open_trigger
after insert or update of is_open_to_connections on public.profiles
for each row
execute function public.sync_group_signals_with_global_open();


create or replace function public.guard_group_signal_against_global_open()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_open boolean;
begin
  if new.is_open_to_connect = true then
    select p.is_open_to_connections
    into v_global_open
    from public.profiles p
    where p.user_id = new.user_id;

    if coalesce(v_global_open, false) = false then
      raise exception 'global_open_disabled';
    end if;

    if new.openness_set_at is null then
      new.openness_set_at := now();
    end if;
  else
    new.openness_set_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_group_signal_against_global_open_trigger on public.group_memberships;
create trigger guard_group_signal_against_global_open_trigger
before insert or update of is_open_to_connect on public.group_memberships
for each row
execute function public.guard_group_signal_against_global_open();
