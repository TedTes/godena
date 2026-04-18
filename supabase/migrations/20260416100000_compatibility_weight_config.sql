alter table public.matching_config
  add column if not exists compatibility_weights jsonb;

update public.matching_config
set compatibility_weights = coalesce(
  compatibility_weights,
  jsonb_build_object(
    'same_city', 8,
    'shared_niche', 14,
    'shared_niche_max', 28,
    'shared_group', 12,
    'shared_group_max', 24,
    'shared_event', 14,
    'shared_event_max', 28,
    'companion_event', 34,
    'companion_event_max', 34,
    'language', 6,
    'language_max', 12,
    'interaction_multiplier', 0.4,
    'interaction_max', 20,
    'intent_fit', 8,
    'blocked_penalty', 100,
    'reported_penalty', 100,
    'dating_intent_mismatch_penalty', 30
  )
)
where id = 1;

alter table public.matching_config
  alter column compatibility_weights set default jsonb_build_object(
    'same_city', 8,
    'shared_niche', 14,
    'shared_niche_max', 28,
    'shared_group', 12,
    'shared_group_max', 24,
    'shared_event', 14,
    'shared_event_max', 28,
    'companion_event', 34,
    'companion_event_max', 34,
    'language', 6,
    'language_max', 12,
    'interaction_multiplier', 0.4,
    'interaction_max', 20,
    'intent_fit', 8,
    'blocked_penalty', 100,
    'reported_penalty', 100,
    'dating_intent_mismatch_penalty', 30
  ),
  alter column compatibility_weights set not null;
