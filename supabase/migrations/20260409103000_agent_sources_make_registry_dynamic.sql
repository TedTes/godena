alter table public.agent_sources
  drop constraint if exists agent_sources_source_type_check;

alter table public.agent_sources
  drop constraint if exists agent_sources_locator_type_check;

alter table public.agent_sources
  add constraint agent_sources_source_type_format_check
  check (
    char_length(trim(source_type)) > 0
    and source_type ~ '^[a-z][a-z0-9_:-]{1,63}$'
  );

alter table public.agent_sources
  add constraint agent_sources_locator_type_format_check
  check (
    char_length(trim(locator_type)) > 0
    and locator_type ~ '^[a-z][a-z0-9_:-]{1,63}$'
  );
