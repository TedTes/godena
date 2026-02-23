-- Phase 6 manual verification script for scoring pipeline
-- Run in Supabase SQL editor (staging/dev) with real user/group IDs.

-- 1) Replace placeholders before running:
--   :group_id
--   :user_a_id
--   :user_b_id

-- Example:
-- select '00000000-0000-0000-0000-000000000000'::uuid as group_id;

-- 2) Seed a few interaction events (same pair, same group).
insert into public.interaction_events (
  group_id, event_type, actor_id, target_id, metadata
) values
  (:group_id::uuid, 'post_reaction', :user_a_id::uuid, :user_b_id::uuid, '{"source":"manual-test"}'::jsonb),
  (:group_id::uuid, 'same_event_rsvp', :user_a_id::uuid, :user_b_id::uuid, '{"source":"manual-test"}'::jsonb),
  (:group_id::uuid, 'same_event_attendance', :user_b_id::uuid, :user_a_id::uuid, '{"source":"manual-test"}'::jsonb);

-- 3) Invoke aggregation function (HTTP trigger from SQL editor is not available directly).
--    Run this from terminal:
--    supabase functions invoke score-aggregation

-- 4) Verify score row was created/updated.
select
  group_id,
  user_a_id,
  user_b_id,
  score,
  event_breakdown,
  last_interaction_at
from public.interaction_scores
where group_id = :group_id::uuid
  and (
    (user_a_id = least(:user_a_id::uuid, :user_b_id::uuid)
      and user_b_id = greatest(:user_a_id::uuid, :user_b_id::uuid))
  );

-- 5) (Optional) Force stale row + verify decay.
-- update public.interaction_scores
-- set last_interaction_at = now() - interval '21 days'
-- where group_id = :group_id::uuid
--   and user_a_id = least(:user_a_id::uuid, :user_b_id::uuid)
--   and user_b_id = greatest(:user_a_id::uuid, :user_b_id::uuid);
--
-- Then run:
--    supabase functions invoke score-decay
--
-- Re-check:
-- select score, last_interaction_at
-- from public.interaction_scores
-- where group_id = :group_id::uuid
--   and user_a_id = least(:user_a_id::uuid, :user_b_id::uuid)
--   and user_b_id = greatest(:user_a_id::uuid, :user_b_id::uuid);
