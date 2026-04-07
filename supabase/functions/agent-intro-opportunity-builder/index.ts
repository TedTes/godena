// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

    let upserted = 0;
    for (const row of scoreRows ?? []) {
      const profileA = profileByUser.get(row.user_a_id);
      const profileB = profileByUser.get(row.user_b_id);
      const group = groupById.get(row.group_id);
      if (!profileA || !profileB || !group) continue;
      if (cityFilter && group.city && !group.city.toLowerCase().includes(cityFilter.toLowerCase())) continue;

      const { data: existingConnection } = await client
        .from("connections")
        .select("id")
        .eq("group_id", row.group_id)
        .eq("user_a_id", row.user_a_id)
        .eq("user_b_id", row.user_b_id)
        .maybeSingle();
      if (existingConnection?.id) continue;

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
        }, { onConflict: "canonical_key" });
      if (upsertError) throw upsertError;
      upserted += 1;
    }

    return jsonResponse({
      ok: true,
      scanned_scores: scoreRows?.length ?? 0,
      intro_opportunities_upserted: upserted,
      min_score: minScore,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
