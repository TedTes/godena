// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  normalizeKey,
  opportunityContextKeyMap,
} from "../_shared/agent_pipeline.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NICHE_CATEGORY_MAP: Record<string, string[]> = {
  live_music: ["culture"],
  sports: ["sports"],
  books_ideas: ["culture"],
  arts_culture: ["culture"],
  food_drink: ["food_drink"],
  outdoors: ["outdoors"],
  wellness: ["wellness"],
  faith_community: ["faith"],
  volunteering: ["community"],
  founders_careers: ["professional"],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function normalizeInterestCategory(value: unknown) {
  const normalized = normalizeKey(value);
  if (!normalized) return null;

  if (
    normalized.includes("music") ||
    normalized.includes("concert") ||
    normalized.includes("arts") ||
    normalized.includes("theatre") ||
    normalized.includes("theater") ||
    normalized.includes("comedy") ||
    normalized.includes("dance") ||
    normalized.includes("culture")
  ) return "culture";
  if (normalized.includes("sport")) return "sports";
  if (normalized.includes("food") || normalized.includes("drink") || normalized.includes("coffee")) return "food_drink";
  if (normalized.includes("outdoor") || normalized.includes("hiking") || normalized.includes("run")) return "outdoors";
  if (normalized.includes("health") || normalized.includes("wellness") || normalized.includes("fitness")) return "wellness";
  if (normalized.includes("faith") || normalized.includes("religion") || normalized.includes("church")) return "faith";
  if (normalized.includes("business") || normalized.includes("career") || normalized.includes("professional")) return "professional";
  if (normalized.includes("community") || normalized.includes("family") || normalized.includes("miscellaneous")) return "community";

  return normalized;
}

function addScore(
  bucket: Map<string, { score: number; evidence: Record<string, number> }>,
  interestType: "category" | "niche" | "context",
  interestKey: string | null,
  delta: number,
  evidenceKey: string,
) {
  if (!interestKey || !Number.isFinite(delta) || delta === 0) return;
  const key = `${interestType}:${interestKey}`;
  const current = bucket.get(key) ?? { score: 0, evidence: {} };
  current.score += delta;
  current.evidence[evidenceKey] = (current.evidence[evidenceKey] ?? 0) + delta;
  bucket.set(key, current);
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

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const userIds = Array.isArray(body.user_ids) ? body.user_ids.filter((value) => typeof value === "string") : [];
    const cityFilter = typeof body.city === "string" ? body.city.trim().toLowerCase() : null;

    let profileQuery = client
      .from("profiles")
      .select("user_id, city, languages, religion, intent");

    if (userIds.length > 0) {
      profileQuery = profileQuery.in("user_id", userIds);
    }

    const { data: profileRows, error: profileError } = await profileQuery;
    if (profileError) throw profileError;

    const filteredProfiles = ((profileRows ?? []) as Array<{
      user_id: string;
      city: string | null;
      languages: string[] | null;
      religion: string | null;
      intent: string | null;
    }>).filter((profile) => {
      if (!cityFilter) return true;
      const city = typeof profile.city === "string" ? profile.city.trim().toLowerCase() : null;
      return city ? city.includes(cityFilter) : false;
    });

    const scopedUserIds = filteredProfiles.map((profile) => profile.user_id);
    if (scopedUserIds.length === 0) {
      return jsonResponse({ ok: true, scanned_users: 0, interest_rows_upserted: 0, deleted_rows: 0 });
    }

    const [
      selectedNichesRes,
      membershipsRes,
      groupRowsRes,
      eventRsvpsRes,
      groupEventsRes,
      agentEventRsvpsRes,
      agentOpportunitiesRes,
      feedbackRes,
      feedbackProposalsRes,
    ] = await Promise.all([
      client.from("agent_user_selected_niches").select("user_id, niche_key").in("user_id", scopedUserIds),
      client.from("group_memberships").select("group_id, user_id").in("user_id", scopedUserIds),
      client.from("groups").select("id, category, city"),
      client.from("event_rsvps").select("event_id, user_id, status, attended_at").in("user_id", scopedUserIds),
      client.from("group_events").select("id, group_id"),
      client.from("agent_event_rsvps").select("opportunity_id, user_id, status").in("user_id", scopedUserIds),
      client.from("agent_opportunities").select("id, title, city, venue_name, feature_snapshot").eq("kind", "event"),
      client.from("agent_feedback_events").select("proposal_id, user_id, event_type, metadata").in("user_id", scopedUserIds),
      client.from("agent_proposals").select("id, opportunity_id"),
    ]);

    const groupById = new Map(((groupRowsRes.data ?? []) as Array<{ id: string; category: string | null; city: string | null }>).map((group) => [group.id, group]));
    const groupEventById = new Map(((groupEventsRes.data ?? []) as Array<{ id: string; group_id: string }>).map((event) => [event.id, event]));
    const opportunityById = new Map(((agentOpportunitiesRes.data ?? []) as Array<{
      id: string;
      title: string | null;
      city: string | null;
      venue_name: string | null;
      feature_snapshot: Record<string, unknown> | null;
    }>).map((opportunity) => [opportunity.id, opportunity]));
    const proposalToOpportunityId = new Map(((feedbackProposalsRes.data ?? []) as Array<{ id: string; opportunity_id: string | null }>).map((proposal) => [proposal.id, proposal.opportunity_id]));
    const scoreBuckets = new Map<string, Map<string, { score: number; evidence: Record<string, number> }>>();

    for (const userId of scopedUserIds) {
      scoreBuckets.set(userId, new Map());
    }

    for (const profile of filteredProfiles) {
      const bucket = scoreBuckets.get(profile.user_id)!;
      const city = normalizeKey(profile.city);
      if (city) addScore(bucket, "context", `city:${city}`, 8, "profile_city");
      if (Array.isArray(profile.languages) && profile.languages.length > 0) {
        addScore(bucket, "category", "language", 10, "profile_languages");
      }
      if (normalizeKey(profile.religion)) {
        addScore(bucket, "category", "faith", 10, "profile_religion");
      }
      const intent = normalizeKey(profile.intent);
      if (intent) addScore(bucket, "context", `intent:${intent}`, 4, "profile_intent");
    }

    for (const row of (selectedNichesRes.data ?? []) as Array<{ user_id: string; niche_key: string }>) {
      const bucket = scoreBuckets.get(row.user_id);
      if (!bucket) continue;
      const nicheKey = normalizeKey(row.niche_key);
      addScore(bucket, "niche", nicheKey, 30, "selected_niche");
      for (const categoryKey of NICHE_CATEGORY_MAP[nicheKey ?? ""] ?? []) {
        addScore(bucket, "category", normalizeKey(categoryKey), 18, "selected_niche_category");
      }
    }

    for (const membership of (membershipsRes.data ?? []) as Array<{ group_id: string; user_id: string }>) {
      const bucket = scoreBuckets.get(membership.user_id);
      const group = groupById.get(membership.group_id);
      if (!bucket || !group) continue;
      addScore(bucket, "category", normalizeKey(group.category), 16, "group_membership");
      const groupCity = normalizeKey(group.city);
      if (groupCity) addScore(bucket, "context", `city:${groupCity}`, 3, "group_city");
    }

    for (const row of (eventRsvpsRes.data ?? []) as Array<{ event_id: string; user_id: string; status: string; attended_at: string | null }>) {
      const bucket = scoreBuckets.get(row.user_id);
      const groupEvent = groupEventById.get(row.event_id);
      const group = groupEvent ? groupById.get(groupEvent.group_id) : null;
      if (!bucket || !group) continue;
      const category = normalizeKey(group.category);
      if (row.status === "going") addScore(bucket, "category", category, 12, "group_event_going");
      if (row.status === "interested") addScore(bucket, "category", category, 8, "group_event_interested");
      if (row.attended_at) addScore(bucket, "category", category, 16, "group_event_attended");
    }

    for (const row of (agentEventRsvpsRes.data ?? []) as Array<{ opportunity_id: string; user_id: string; status: string }>) {
      const bucket = scoreBuckets.get(row.user_id);
      const opportunity = opportunityById.get(row.opportunity_id);
      if (!bucket || !opportunity) continue;
      const category = normalizeInterestCategory(opportunity.feature_snapshot?.category);
      const contexts = opportunityContextKeyMap(opportunity);
      if (row.status === "going") {
        addScore(bucket, "category", category, 14, "external_event_going");
        addScore(bucket, "context", contexts.source, 3, "external_event_going_source");
        addScore(bucket, "context", contexts.venue, 4, "external_event_going_venue");
        addScore(bucket, "context", contexts.title, 2, "external_event_going_title");
      }
      if (row.status === "interested") {
        addScore(bucket, "category", category, 10, "external_event_interested");
        addScore(bucket, "context", contexts.source, 2, "external_event_interested_source");
        addScore(bucket, "context", contexts.venue, 2, "external_event_interested_venue");
        addScore(bucket, "context", contexts.title, 1, "external_event_interested_title");
      }
      if (row.status === "not_going") {
        addScore(bucket, "category", category, -12, "external_event_not_going");
        addScore(bucket, "context", contexts.source, -3, "external_event_not_going_source");
        addScore(bucket, "context", contexts.venue, -6, "external_event_not_going_venue");
        addScore(bucket, "context", contexts.title, -8, "external_event_not_going_title");
      }
    }

    for (const row of (feedbackRes.data ?? []) as Array<{
      proposal_id: string;
      user_id: string;
      event_type: string;
      metadata: Record<string, unknown> | null;
    }>) {
      const bucket = scoreBuckets.get(row.user_id);
      const opportunityId = proposalToOpportunityId.get(row.proposal_id);
      const opportunity = opportunityId ? opportunityById.get(opportunityId) : null;
      if (!bucket || !opportunity) continue;
      const category = normalizeInterestCategory(opportunity.feature_snapshot?.category);
      const contexts = opportunityContextKeyMap(opportunity);
      if (row.event_type === "clicked") {
        addScore(bucket, "category", category, 8, "proposal_clicked");
        addScore(bucket, "context", contexts.source, 1, "proposal_clicked_source");
      }
      if (row.event_type === "rsvped_event") {
        addScore(bucket, "category", category, 18, "proposal_rsvped");
        addScore(bucket, "context", contexts.source, 3, "proposal_rsvped_source");
        addScore(bucket, "context", contexts.venue, 4, "proposal_rsvped_venue");
        addScore(bucket, "context", contexts.title, 2, "proposal_rsvped_title");
      }
      if (row.event_type === "joined_group") addScore(bucket, "category", category, 14, "proposal_joined_group");
      if (row.event_type === "dismissed") {
        addScore(bucket, "category", category, -12, "proposal_dismissed");
        addScore(bucket, "context", contexts.venue, -4, "proposal_dismissed_venue");
        addScore(bucket, "context", contexts.title, -5, "proposal_dismissed_title");
      }
      if (row.event_type === "ignored") {
        addScore(bucket, "category", category, -18, "proposal_ignored");
        addScore(bucket, "context", contexts.source, -4, "proposal_ignored_source");
        addScore(bucket, "context", contexts.venue, -10, "proposal_ignored_venue");
        addScore(bucket, "context", contexts.title, -12, "proposal_ignored_title");
      }
    }

    const upsertRows = [];
    for (const [userId, bucket] of scoreBuckets.entries()) {
      for (const [compositeKey, payload] of bucket.entries()) {
        const [interestType, ...interestKeyParts] = compositeKey.split(":");
        const interestKey = interestKeyParts.join(":");
        const score = Math.max(-100, Math.min(100, Math.round(payload.score * 100) / 100));
        if (Math.abs(score) < 1) continue;
        upsertRows.push({
          user_id: userId,
          interest_type: interestType,
          interest_key: interestKey,
          score,
          evidence: {
            breakdown: payload.evidence,
            last_built_at: new Date().toISOString(),
          },
        });
      }
    }

    const { data: replacedCount, error: replaceError } = await client.rpc(
      "replace_agent_user_interest_profiles",
      {
        p_user_ids: scopedUserIds,
        p_rows: upsertRows,
      },
    );
    if (replaceError) throw replaceError;

    return jsonResponse({
      ok: true,
      scanned_users: scopedUserIds.length,
      interest_rows_upserted: Number(replacedCount ?? upsertRows.length),
      deleted_rows: scopedUserIds.length,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
