-- Remove pre-launch/product areas that no longer match the active-intent direction.
-- Event ingestion, group discovery, explicit group openness, and user-initiated chat remain.

delete from public.agent_proposals
where proposal_kind = 'introduction'
   or target_surface = 'connections';

delete from public.agent_opportunities
where kind = 'introduction';

drop function if exists public.create_agent_intro_connection(uuid);
drop function if exists public.create_agent_event_companion_request(uuid);
drop function if exists public.cancel_agent_event_companion_request(uuid);
drop function if exists public.get_connection_reveal_context(uuid);

drop function if exists public.get_dating_candidate_count();
drop function if exists public.get_dating_candidates(int);
drop function if exists public.get_dating_match_profiles(uuid[]);

do $$
begin
  if to_regtype('public.dating_swipe_decision') is not null then
    execute 'drop function if exists public.submit_dating_swipe(uuid, public.dating_swipe_decision)';
  end if;
end $$;

drop table if exists public.agent_event_companion_requests cascade;
drop table if exists public.agent_user_compatibility_scores cascade;
drop table if exists public.dating_messages cascade;
drop table if exists public.dating_matches cascade;
drop table if exists public.dating_swipes cascade;
drop table if exists public.dating_preferences cascade;
drop table if exists public.dating_profiles cascade;
drop table if exists public.identity_verifications cascade;
drop table if exists public.billing_subscriptions cascade;

drop type if exists public.dating_match_status cascade;
drop type if exists public.dating_swipe_decision cascade;

alter table if exists public.notification_preferences
  drop column if exists notify_reveals;

alter table if exists public.profiles
  drop column if exists dating_mode_enabled,
  drop column if exists stripe_customer_id,
  drop column if exists is_premium;

alter table if exists public.matching_config
  drop column if exists premium_priority_bonus;

alter table if exists public.agent_pipeline_settings
  drop column if exists build_intros,
  drop column if exists intro_payload,
  drop column if exists build_compatibility,
  drop column if exists compatibility_payload,
  drop column if exists compatibility_weights;

alter table if exists public.help_feedback
  drop constraint if exists help_feedback_category_check;

alter table if exists public.help_feedback
  add constraint help_feedback_category_check
  check (category in ('bug', 'feedback', 'account', 'other'));
