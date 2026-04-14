// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pairOrder } from "../_shared/compatibility.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isoDaysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
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
    const minScore = Math.max(10, Math.min(Number(body.min_score ?? 25), 100));
    const minCompatibilityScore = Math.max(0, Math.min(Number(body.compatibility_min_score ?? 45), 100));
    const cityFilter = typeof body.city === "string" ? body.city : null;

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: scoreRows, error } = await client
      .from("interaction_scores")
      .select("group_id, user_a_id, user_b_id, score, last_interaction_at")
      .gte("score", minScore)
      .order("score", { ascending: false })
      .limit(100);
    if (error) throw error;

    const userIds = Array.from(new Set((scoreRows ?? []).flatMap((row) => [row.user_a_id, row.user_b_id])));
    const groupIds = Array.from(new Set((scoreRows ?? []).map((row) => row.group_id)));

    const [{ data: profileRows }, { data: groupRows }] = await Promise.all([
      userIds.length
        ? client.from("profiles").select("user_id, full_name, city").in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      groupIds.length
        ? client.from("groups").select("id, name, city").in("id", groupIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profileByUser = new Map((profileRows ?? []).map((row) => [row.user_id, row]));
    const groupById = new Map((groupRows ?? []).map((row) => [row.id, row]));
    const { data: existingIntroConnections } = groupIds.length && userIds.length
      ? await client
          .from("connections")
          .select("group_id, user_a_id, user_b_id")
          .in("group_id", groupIds)
          .in("user_a_id", userIds)
          .in("user_b_id", userIds)
      : { data: [] };
    const existingIntroConnectionKeys = new Set(
      (existingIntroConnections ?? []).map((row) => `${row.group_id}:${row.user_a_id}:${row.user_b_id}`),
    );

    let upserted = 0;
    for (const row of scoreRows ?? []) {
      const profileA = profileByUser.get(row.user_a_id);
      const profileB = profileByUser.get(row.user_b_id);
      const group = groupById.get(row.group_id);
      if (!profileA || !profileB || !group) continue;
      if (cityFilter && group.city && !group.city.toLowerCase().includes(cityFilter.toLowerCase())) continue;
      if (existingIntroConnectionKeys.has(`${row.group_id}:${row.user_a_id}:${row.user_b_id}`)) continue;

      const canonicalKey = `intro:${row.group_id}:${row.user_a_id}:${row.user_b_id}`;
      const title = `${profileA.full_name ?? 'Someone'} and ${profileB.full_name ?? 'someone'} could connect`;
      const summary = `Strong shared activity in ${group.name} suggests a warm introduction may make sense.`;

      const { error: upsertError } = await client
        .from("agent_opportunities")
        .upsert({
          kind: "introduction",
          title,
          summary,
          city: group.city ?? profileA.city ?? profileB.city ?? null,
          canonical_key: canonicalKey,
          feature_snapshot: {
            score: row.score,
            last_interaction_at: row.last_interaction_at,
          },
          metadata: {
            candidate_user_ids: [row.user_a_id, row.user_b_id],
            anchor_group_id: row.group_id,
            anchor_group_name: group.name,
          },
          expires_at: isoDaysFromNow(7),
        }, { onConflict: "canonical_key" });
      if (upsertError) throw upsertError;
      upserted += 1;
    }

    const { data: companionRows, error: companionError } = await client
      .from("agent_event_companion_requests")
      .select("opportunity_id, user_id, created_at")
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(200);
    if (companionError) throw companionError;

    const companionUserIds = Array.from(new Set((companionRows ?? []).map((row) => row.user_id).filter(Boolean)));
    const companionOpportunityIds = Array.from(new Set((companionRows ?? []).map((row) => row.opportunity_id).filter(Boolean)));
    const [{ data: companionProfiles }, { data: companionEvents }, { data: matchingConfigRows }] = await Promise.all([
      companionUserIds.length
        ? client.from("profiles").select("user_id, full_name, city").in("user_id", companionUserIds)
        : Promise.resolve({ data: [] }),
      companionOpportunityIds.length
        ? client.from("agent_opportunities").select("id, title, summary, city, starts_at, expires_at").in("id", companionOpportunityIds)
        : Promise.resolve({ data: [] }),
      client.from("matching_config").select("external_group_id").eq("id", 1).maybeSingle(),
    ]);

    const externalGroupId = matchingConfigRows?.external_group_id ?? null;
    const { data: companionCompatibilityRows } = companionUserIds.length
      ? await client
          .from("agent_user_compatibility_scores")
          .select("user_a_id, user_b_id, score, reasons, reason_codes, feature_snapshot, expires_at")
          .eq("intent", "event_companion")
          .gte("score", minCompatibilityScore)
          .in("user_a_id", companionUserIds)
          .in("user_b_id", companionUserIds)
      : { data: [] };
    const companionCompatibilityByPair = new Map(
      ((companionCompatibilityRows ?? []) as Array<{
        user_a_id: string;
        user_b_id: string;
        score: number;
        reasons: unknown[];
        reason_codes: string[];
        feature_snapshot: Record<string, unknown>;
        expires_at: string | null;
      }>)
        .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > Date.now())
        .map((row) => [`${row.user_a_id}:${row.user_b_id}`, row]),
    );
    const { data: existingCompanionConnections } = externalGroupId && companionUserIds.length
      ? await client
          .from("connections")
          .select("user_a_id, user_b_id")
          .eq("group_id", externalGroupId)
          .in("user_a_id", companionUserIds)
          .in("user_b_id", companionUserIds)
      : { data: [] };
    const existingCompanionConnectionPairs = new Set(
      (existingCompanionConnections ?? []).map((row) => `${row.user_a_id}:${row.user_b_id}`),
    );
    const companionProfileByUser = new Map((companionProfiles ?? []).map((row) => [row.user_id, row]));
    const companionEventById = new Map((companionEvents ?? []).map((row) => [row.id, row]));
    const companionRowsByEvent = new Map<string, Array<{ opportunity_id: string; user_id: string; created_at: string }>>();
    for (const row of companionRows ?? []) {
      const rows = companionRowsByEvent.get(row.opportunity_id) ?? [];
      rows.push(row);
      companionRowsByEvent.set(row.opportunity_id, rows);
    }

    let companionIntroOpportunitiesUpserted = 0;
    if (externalGroupId) {
      for (const [opportunityId, rows] of companionRowsByEvent.entries()) {
        const event = companionEventById.get(opportunityId);
        if (!event) continue;
        if (cityFilter && event.city && !event.city.toLowerCase().includes(cityFilter.toLowerCase())) continue;
        if (event.expires_at && new Date(event.expires_at).getTime() <= Date.now()) continue;

        for (let i = 0; i < rows.length; i += 1) {
          for (let j = i + 1; j < rows.length; j += 1) {
            const [userA, userB] = pairOrder(rows[i].user_id, rows[j].user_id);
            const profileA = companionProfileByUser.get(userA);
            const profileB = companionProfileByUser.get(userB);
            if (!profileA || !profileB) continue;
            if (existingCompanionConnectionPairs.has(`${userA}:${userB}`)) continue;
            const compatibility = companionCompatibilityByPair.get(`${userA}:${userB}`);
            if (!compatibility) continue;

            const canonicalKey = `intro:event_companion:${opportunityId}:${userA}:${userB}`;
            const title = `${profileA.full_name ?? "Someone"} and ${profileB.full_name ?? "someone"} both want company`;
            const summary = `You both asked for company around ${event.title}. This could be an easy, event-based warm intro.`;

            const { error: upsertError } = await client
              .from("agent_opportunities")
              .upsert({
                kind: "introduction",
                title,
                summary,
                city: event.city ?? profileA.city ?? profileB.city ?? null,
                canonical_key: canonicalKey,
                feature_snapshot: {
                  source: "event_companion_request",
                  event_id: opportunityId,
                  event_title: event.title,
                  compatibility_score: compatibility.score,
                  compatibility_reason_codes: compatibility.reason_codes ?? [],
                },
                metadata: {
                  candidate_user_ids: [userA, userB],
                  anchor_group_id: externalGroupId,
                  anchor_group_name: "Local event companion",
                  anchor_event_id: opportunityId,
                  anchor_event_title: event.title,
                  compatibility_reasons: compatibility.reasons ?? [],
                  compatibility_features: compatibility.feature_snapshot ?? {},
                },
                expires_at: event.starts_at ?? isoDaysFromNow(7),
              }, { onConflict: "canonical_key" });
            if (upsertError) throw upsertError;
            companionIntroOpportunitiesUpserted += 1;
          }
        }
      }
    }

    return jsonResponse({
      ok: true,
      scanned_scores: scoreRows?.length ?? 0,
      intro_opportunities_upserted: upserted,
      companion_requests_scanned: companionRows?.length ?? 0,
      companion_intro_opportunities_upserted: companionIntroOpportunitiesUpserted,
      compatibility_min_score: minCompatibilityScore,
      min_score: minScore,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
