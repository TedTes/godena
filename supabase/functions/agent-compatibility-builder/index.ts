// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  compatibilityPairKey,
  computeCompatibilityScore,
  normalizeCompatibilityWeights,
  pairOrder,
} from "../_shared/compatibility.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  if (!key || !value) return;
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

function addPairSignal(
  pairs: Map<string, Record<string, unknown>>,
  userA: string,
  userB: string,
  signal: "sharedNiches" | "sharedGroups" | "sharedEvents" | "companionEvents",
  value: string,
  maxPairs: number,
) {
  if (!userA || !userB || userA === userB || pairs.size >= maxPairs) return;
  const [orderedA, orderedB] = pairOrder(userA, userB);
  const key = compatibilityPairKey(orderedA, orderedB);
  const current = pairs.get(key) ?? {
    userA: orderedA,
    userB: orderedB,
    sharedNiches: new Set<string>(),
    sharedGroups: new Set<string>(),
    sharedEvents: new Set<string>(),
    companionEvents: new Set<string>(),
    interactionScore: 0,
  };
  (current[signal] as Set<string>).add(value);
  pairs.set(key, current);
}

function addBucketPairs(
  pairs: Map<string, Record<string, unknown>>,
  bucket: Map<string, Set<string>>,
  signal: "sharedNiches" | "sharedGroups" | "sharedEvents" | "companionEvents",
  maxPairs: number,
  maxUsersPerBucket = 80,
) {
  for (const [value, users] of bucket.entries()) {
    const ids = Array.from(users).slice(0, maxUsersPerBucket);
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        addPairSignal(pairs, ids[i], ids[j], signal, value, maxPairs);
        if (pairs.size >= maxPairs) return;
      }
    }
  }
}

function pairSetKey(a: string, b: string) {
  const [userA, userB] = pairOrder(a, b);
  return `${userA}:${userB}`;
}

function chunk<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) chunks.push(values.slice(i, i + size));
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret && req.headers.get("x-internal-secret") !== internalSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const cityFilter = typeof body.city === "string" ? body.city.trim().toLowerCase() : null;
    const explicitUserIds = Array.isArray(body.user_ids) ? body.user_ids.filter((value) => typeof value === "string") : [];
    const limitUsers = Math.max(10, Math.min(Number(body.limit_users ?? 500), 2000));
    const maxPairs = Math.max(50, Math.min(Number(body.max_pairs ?? 2500), 10000));
    const minScore = Math.max(0, Math.min(Number(body.min_score ?? 25), 100));

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: configRow, error: configError } = await client
      .from("matching_config")
      .select("compatibility_weights")
      .eq("id", 1)
      .maybeSingle();
    if (configError) throw configError;

    const compatibilityWeights = normalizeCompatibilityWeights(
      typeof body.compatibility_weights === "object" && body.compatibility_weights
        ? body.compatibility_weights
        : configRow?.compatibility_weights,
    );

    let profileQuery = client
      .from("profiles")
      .select("user_id, full_name, city, languages, intent, religion, gender")
      .limit(limitUsers);

    if (explicitUserIds.length > 0) {
      profileQuery = profileQuery.in("user_id", explicitUserIds);
    }
    if (cityFilter) {
      profileQuery = profileQuery.ilike("city", `%${cityFilter}%`);
    }

    const { data: profileRows, error: profileError } = await profileQuery;
    if (profileError) throw profileError;

    const profiles = (profileRows ?? []) as Array<Record<string, unknown>>;

    const scopedUserIds = profiles.map((profile) => String(profile.user_id)).filter(Boolean);
    if (scopedUserIds.length < 2) {
      return jsonResponse({ ok: true, scanned_users: scopedUserIds.length, candidate_pairs: 0, scores_upserted: 0 });
    }

    const profileByUser = new Map(profiles.map((profile) => [String(profile.user_id), profile]));
    const [
      nichesRes,
      membershipsRes,
      eventRsvpsRes,
      companionRequestsRes,
      interactionScoresRes,
      blockedRes,
      reportsRes,
    ] = await Promise.all([
      client.from("agent_user_selected_niches").select("user_id, niche_key").in("user_id", scopedUserIds),
      client.from("group_memberships").select("user_id, group_id").in("user_id", scopedUserIds),
      client
        .from("agent_event_rsvps")
        .select("user_id, opportunity_id, status")
        .in("user_id", scopedUserIds)
        .in("status", ["interested", "going"]),
      client
        .from("agent_event_companion_requests")
        .select("user_id, opportunity_id, status")
        .in("user_id", scopedUserIds)
        .eq("status", "active"),
      client
        .from("interaction_scores")
        .select("user_a_id, user_b_id, score")
        .in("user_a_id", scopedUserIds)
        .in("user_b_id", scopedUserIds),
      client
        .from("blocked_users")
        .select("blocker_id, blocked_id")
        .in("blocker_id", scopedUserIds)
        .in("blocked_id", scopedUserIds),
      client
        .from("reports")
        .select("reporter_id, reported_user_id")
        .in("reporter_id", scopedUserIds)
        .in("reported_user_id", scopedUserIds),
    ]);

    for (const result of [nichesRes, membershipsRes, eventRsvpsRes, companionRequestsRes, interactionScoresRes, blockedRes, reportsRes]) {
      if (result.error) throw result.error;
    }

    const nicheBuckets = new Map<string, Set<string>>();
    for (const row of (nichesRes.data ?? []) as Array<{ user_id: string; niche_key: string }>) {
      addToSetMap(nicheBuckets, row.niche_key, row.user_id);
    }

    const groupBuckets = new Map<string, Set<string>>();
    for (const row of (membershipsRes.data ?? []) as Array<{ user_id: string; group_id: string }>) {
      addToSetMap(groupBuckets, row.group_id, row.user_id);
    }

    const eventBuckets = new Map<string, Set<string>>();
    for (const row of (eventRsvpsRes.data ?? []) as Array<{ user_id: string; opportunity_id: string }>) {
      addToSetMap(eventBuckets, row.opportunity_id, row.user_id);
    }

    const companionBuckets = new Map<string, Set<string>>();
    for (const row of (companionRequestsRes.data ?? []) as Array<{ user_id: string; opportunity_id: string }>) {
      addToSetMap(companionBuckets, row.opportunity_id, row.user_id);
    }

    const candidatePairs = new Map<string, Record<string, unknown>>();
    addBucketPairs(candidatePairs, companionBuckets, "companionEvents", maxPairs);
    addBucketPairs(candidatePairs, eventBuckets, "sharedEvents", maxPairs);
    addBucketPairs(candidatePairs, groupBuckets, "sharedGroups", maxPairs);
    addBucketPairs(candidatePairs, nicheBuckets, "sharedNiches", maxPairs);

    for (const row of (interactionScoresRes.data ?? []) as Array<{ user_a_id: string; user_b_id: string; score: number }>) {
      if (!profileByUser.has(row.user_a_id) || !profileByUser.has(row.user_b_id) || candidatePairs.size >= maxPairs) continue;
      const [userA, userB] = pairOrder(row.user_a_id, row.user_b_id);
      const key = compatibilityPairKey(userA, userB);
      const current = candidatePairs.get(key) ?? {
        userA,
        userB,
        sharedNiches: new Set<string>(),
        sharedGroups: new Set<string>(),
        sharedEvents: new Set<string>(),
        companionEvents: new Set<string>(),
        interactionScore: 0,
      };
      current.interactionScore = Math.max(Number(current.interactionScore ?? 0), Number(row.score ?? 0));
      candidatePairs.set(key, current);
    }

    const blockedPairs = new Set(
      ((blockedRes.data ?? []) as Array<{ blocker_id: string; blocked_id: string }>)
        .map((row) => pairSetKey(row.blocker_id, row.blocked_id)),
    );
    const reportedPairs = new Set(
      ((reportsRes.data ?? []) as Array<{ reporter_id: string; reported_user_id: string }>)
        .filter((row) => row.reporter_id && row.reported_user_id)
        .map((row) => pairSetKey(row.reporter_id, row.reported_user_id)),
    );

    const rows = [];
    for (const pair of candidatePairs.values()) {
      const userA = String(pair.userA);
      const userB = String(pair.userB);
      const profileA = profileByUser.get(userA);
      const profileB = profileByUser.get(userB);
      if (!profileA || !profileB) continue;

      const sharedNiches = Array.from(pair.sharedNiches as Set<string>);
      const sharedGroups = Array.from(pair.sharedGroups as Set<string>);
      const sharedEvents = Array.from(pair.sharedEvents as Set<string>);
      const companionEvents = Array.from(pair.companionEvents as Set<string>);
      const intents = new Set<string>(["community_intro"]);
      if (companionEvents.length > 0) intents.add("event_companion");
      const profileIntentA = String(profileA.intent ?? "");
      const profileIntentB = String(profileB.intent ?? "");
      if (
        ["dating", "long_term", "marriage"].includes(profileIntentA) &&
        ["dating", "long_term", "marriage"].includes(profileIntentB)
      ) {
        intents.add("dating");
      }

      for (const intent of intents) {
        const score = computeCompatibilityScore({
          intent,
          profileA,
          profileB,
          sharedNiches,
          sharedGroups,
          sharedEvents,
          companionEvents,
          interactionScore: Number(pair.interactionScore ?? 0),
          blocked: blockedPairs.has(pairSetKey(userA, userB)),
          reported: reportedPairs.has(pairSetKey(userA, userB)),
          weights: compatibilityWeights,
        });
        if (score.score < minScore && intent !== "event_companion") continue;
        rows.push({
          user_a_id: userA,
          user_b_id: userB,
          intent,
          score: score.score,
          reason_codes: score.reason_codes,
          reasons: score.reasons,
          penalties: score.penalties,
          feature_snapshot: score.feature_snapshot,
          computed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        });
      }
    }

    let upserted = 0;
    for (const batch of chunk(rows, 500)) {
      const { error: upsertError } = await client
        .from("agent_user_compatibility_scores")
        .upsert(batch, { onConflict: "user_a_id,user_b_id,intent" });
      if (upsertError) throw upsertError;
      upserted += batch.length;
    }

    return jsonResponse({
      ok: true,
      scanned_users: scopedUserIds.length,
      candidate_pairs: candidatePairs.size,
      scores_upserted: upserted,
      min_score: minScore,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
