// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  pairKey,
  preferencesMatch,
} from "../_shared/matching.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ScoreRow = {
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  score: number;
  last_interaction_at: string | null;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  is_open_to_connect: boolean;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  gender: string;
  preferred_genders: string[] | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  birth_date: string | null;
  is_premium: boolean;
};

type ConnectionRow = {
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status: string;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret) {
      const provided = req.headers.get("x-internal-secret");
      if (provided !== internalSecret) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 });
      }
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: cfg, error: cfgErr } = await client
      .from("matching_config")
      .select("reveal_threshold, lookback_days, premium_priority_bonus")
      .eq("id", 1)
      .single();
    if (cfgErr || !cfg) throw cfgErr ?? new Error("missing matching_config");

    const revealThreshold = Number(cfg.reveal_threshold ?? 25);
    const lookbackDays = Number(cfg.lookback_days ?? 30);
    const premiumPriorityBonus = Number(cfg.premium_priority_bonus ?? 3);
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: scoreRows, error: scoreErr } = await client
      .from("interaction_scores")
      .select("group_id, user_a_id, user_b_id, score, last_interaction_at")
      .gte("score", revealThreshold)
      .gte("last_interaction_at", cutoff)
      .order("score", { ascending: false })
      .limit(50000);
    if (scoreErr) throw scoreErr;

    const scores = (scoreRows ?? []) as ScoreRow[];
    if (scores.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          candidates_scanned: 0,
          eligible_pairs: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const groupIds = Array.from(new Set(scores.map((s) => s.group_id)));
    const userIds = Array.from(new Set(scores.flatMap((s) => [s.user_a_id, s.user_b_id])));

    const [membershipsRes, profilesRes, connectionsRes] = await Promise.all([
      client
        .from("group_memberships")
        .select("group_id, user_id, is_open_to_connect")
        .in("group_id", groupIds)
        .in("user_id", userIds)
        .eq("is_open_to_connect", true),
      client
        .from("profiles")
        .select("user_id, full_name, gender, preferred_genders, preferred_age_min, preferred_age_max, birth_date, is_premium")
        .in("user_id", userIds),
      client
        .from("connections")
        .select("group_id, user_a_id, user_b_id, status")
        .in("group_id", groupIds)
        .in("user_a_id", userIds)
        .in("user_b_id", userIds),
    ]);

    if (membershipsRes.error) throw membershipsRes.error;
    if (profilesRes.error) throw profilesRes.error;
    if (connectionsRes.error) throw connectionsRes.error;

    const memberships = (membershipsRes.data ?? []) as MembershipRow[];
    const profiles = (profilesRes.data ?? []) as ProfileRow[];
    const connections = (connectionsRes.data ?? []) as ConnectionRow[];

    const openMembershipSet = new Set(
      memberships.map((m) => `${m.group_id}:${m.user_id}`),
    );

    const profileByUser = new Map<string, ProfileRow>();
    for (const p of profiles) profileByUser.set(p.user_id, p);

    const connectedSet = new Set(
      connections.map((c) => pairKey(c.group_id, c.user_a_id, c.user_b_id)),
    );

    const eligible: Array<{
      group_id: string;
      user_a_id: string;
      user_b_id: string;
      score: number;
      last_interaction_at: string | null;
      name_a: string | null;
      name_b: string | null;
      reason: string;
    }> = [];

    const scoredQueue = scores
      .map((row) => {
        const pa = profileByUser.get(row.user_a_id);
        const pb = profileByUser.get(row.user_b_id);
        const premiumCount = Number(!!pa?.is_premium) + Number(!!pb?.is_premium);
        const queueScore = Number(row.score) + premiumCount * premiumPriorityBonus;
        return { ...row, queueScore };
      })
      .sort((a, b) => b.queueScore - a.queueScore || Number(b.score) - Number(a.score));

    for (const row of scoredQueue) {
      const { group_id, user_a_id, user_b_id } = row;
      if (!openMembershipSet.has(`${group_id}:${user_a_id}`)) continue;
      if (!openMembershipSet.has(`${group_id}:${user_b_id}`)) continue;
      if (connectedSet.has(pairKey(group_id, user_a_id, user_b_id))) continue;

      const profileA = profileByUser.get(user_a_id);
      const profileB = profileByUser.get(user_b_id);
      if (!profileA || !profileB) continue;
      if (!preferencesMatch(profileA, profileB)) continue;

      eligible.push({
        group_id,
        user_a_id,
        user_b_id,
        score: Number(row.score),
        last_interaction_at: row.last_interaction_at,
        name_a: profileA.full_name,
        name_b: profileB.full_name,
        reason: "mutual_open + preference_match + score_threshold + no_existing_connection",
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reveal_threshold: revealThreshold,
        lookback_days: lookbackDays,
        premium_priority_bonus: premiumPriorityBonus,
        candidates_scanned: scores.length,
        eligible_count: eligible.length,
        eligible_pairs: eligible,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
