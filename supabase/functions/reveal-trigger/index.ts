// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  is_open_to_connections: boolean;
  is_premium: boolean;
};

type ConnectionRow = {
  id: string;
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status?: string;
};

type GroupRow = {
  id: string;
  name: string;
};

type PushTokenRow = {
  user_id: string;
  expo_push_token: string;
};

function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function pairKey(groupId: string, a: string, b: string) {
  const [u1, u2] = pairOrder(a, b);
  return `${groupId}:${u1}:${u2}`;
}

function ageFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

function acceptsGender(preferred: string[] | null | undefined, targetGender: string | null | undefined) {
  if (!preferred || preferred.length === 0) return true;
  if (!targetGender) return false;
  return preferred.includes(targetGender);
}

function acceptsAge(minAge: number | null, maxAge: number | null, targetAge: number | null) {
  if (minAge == null && maxAge == null) return true;
  if (targetAge == null) return false;
  if (minAge != null && targetAge < minAge) return false;
  if (maxAge != null && targetAge > maxAge) return false;
  return true;
}

function preferencesMatch(a: ProfileRow, b: ProfileRow) {
  const ageA = ageFromBirthDate(a.birth_date);
  const ageB = ageFromBirthDate(b.birth_date);

  const aAcceptsB = acceptsGender(a.preferred_genders, b.gender)
    && acceptsAge(a.preferred_age_min, a.preferred_age_max, ageB);
  const bAcceptsA = acceptsGender(b.preferred_genders, a.gender)
    && acceptsAge(b.preferred_age_min, b.preferred_age_max, ageA);

  return aAcceptsB && bAcceptsA;
}

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
        JSON.stringify({ ok: true, candidates_scanned: 0, inserted: 0 }),
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
        .select("user_id, full_name, gender, preferred_genders, preferred_age_min, preferred_age_max, birth_date, is_open_to_connections, is_premium")
        .in("user_id", userIds),
      client
        .from("connections")
        .select("id, group_id, user_a_id, user_b_id, status")
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

    const openMembershipSet = new Set(memberships.map((m) => `${m.group_id}:${m.user_id}`));
    const profileByUser = new Map<string, ProfileRow>();
    for (const p of profiles) profileByUser.set(p.user_id, p);
    const connectedSet = new Set(connections.map((c) => pairKey(c.group_id, c.user_a_id, c.user_b_id)));
    const usersWithPending = new Set<string>();
    for (const c of connections) {
      if (c.status === "pending") {
        usersWithPending.add(c.user_a_id);
        usersWithPending.add(c.user_b_id);
      }
    }

    const toInsert: Array<{
      group_id: string;
      user_a_id: string;
      user_b_id: string;
      status: "pending";
      activity_suggested: string;
    }> = [];

    const scoredQueue = scores
      .map((s) => {
        const pa = profileByUser.get(s.user_a_id);
        const pb = profileByUser.get(s.user_b_id);
        const premiumCount = Number(!!pa?.is_premium) + Number(!!pb?.is_premium);
        const queueScore = Number(s.score) + premiumCount * premiumPriorityBonus;
        return { ...s, queueScore };
      })
      .sort((a, b) => b.queueScore - a.queueScore || Number(b.score) - Number(a.score));

    for (const s of scoredQueue) {
      if (!openMembershipSet.has(`${s.group_id}:${s.user_a_id}`)) continue;
      if (!openMembershipSet.has(`${s.group_id}:${s.user_b_id}`)) continue;
      if (connectedSet.has(pairKey(s.group_id, s.user_a_id, s.user_b_id))) continue;
      if (usersWithPending.has(s.user_a_id) || usersWithPending.has(s.user_b_id)) continue;

      const pa = profileByUser.get(s.user_a_id);
      const pb = profileByUser.get(s.user_b_id);
      if (!pa || !pb) continue;
      if (!preferencesMatch(pa, pb)) continue;

      toInsert.push({
        group_id: s.group_id,
        user_a_id: s.user_a_id,
        user_b_id: s.user_b_id,
        status: "pending",
        activity_suggested: "Meet through a shared group activity this week.",
      });
      // Prevent multiple pending rows in same run for the same user.
      usersWithPending.add(s.user_a_id);
      usersWithPending.add(s.user_b_id);
    }

    if (toInsert.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          candidates_scanned: scores.length,
          eligible: 0,
          inserted: 0,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { data: insertedRows, error: insertErr } = await client
      .from("connections")
      .upsert(toInsert, { onConflict: "group_id,user_a_id,user_b_id", ignoreDuplicates: true })
      .select("id, group_id, user_a_id, user_b_id, status, revealed_at");

    if (insertErr) throw insertErr;

    const inserted = insertedRows ?? [];

    // Send contextual push notification to both participants.
    // (No-op when tokens are missing)
    let pushed = 0;
    if (inserted.length > 0) {
      const insertedGroupIds = Array.from(new Set(inserted.map((r) => r.group_id)));
      const insertedUserIds = Array.from(
        new Set(inserted.flatMap((r) => [r.user_a_id, r.user_b_id])),
      );

      const [groupsRes, profilesRes, tokensRes] = await Promise.all([
        client.from("groups").select("id, name").in("id", insertedGroupIds),
        client.from("profiles").select("user_id, full_name").in("user_id", insertedUserIds),
        client
          .from("user_push_tokens")
          .select("user_id, expo_push_token")
          .eq("is_active", true)
          .in("user_id", insertedUserIds),
      ]);
      if (groupsRes.error) throw groupsRes.error;
      if (profilesRes.error) throw profilesRes.error;
      if (tokensRes.error) throw tokensRes.error;

      const groupById = new Map<string, GroupRow>();
      for (const g of (groupsRes.data ?? []) as GroupRow[]) groupById.set(g.id, g);

      const nameByUserId = new Map<string, string>();
      for (const p of (profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null }>) {
        nameByUserId.set(p.user_id, p.full_name || "Someone");
      }

      const tokensByUserId = new Map<string, string[]>();
      for (const t of (tokensRes.data ?? []) as PushTokenRow[]) {
        const arr = tokensByUserId.get(t.user_id) ?? [];
        arr.push(t.expo_push_token);
        tokensByUserId.set(t.user_id, arr);
      }

      const pushPayloads: Array<Record<string, unknown>> = [];

      for (const c of inserted) {
        const groupName = groupById.get(c.group_id)?.name || "Your group";
        const nameA = nameByUserId.get(c.user_a_id) || "Someone";
        const nameB = nameByUserId.get(c.user_b_id) || "Someone";

        const userATokens = tokensByUserId.get(c.user_a_id) ?? [];
        for (const to of userATokens) {
          pushPayloads.push({
            to,
            sound: "default",
            title: `✨ New introduction in ${groupName}`,
            body: `You and ${nameB} were introduced based on your shared activity.`,
            data: { type: "reveal_pending", connection_id: c.id, group_id: c.group_id },
          });
        }

        const userBTokens = tokensByUserId.get(c.user_b_id) ?? [];
        for (const to of userBTokens) {
          pushPayloads.push({
            to,
            sound: "default",
            title: `✨ New introduction in ${groupName}`,
            body: `You and ${nameA} were introduced based on your shared activity.`,
            data: { type: "reveal_pending", connection_id: c.id, group_id: c.group_id },
          });
        }
      }

      if (pushPayloads.length > 0) {
        const expoResp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(pushPayloads),
        });
        if (expoResp.ok) pushed = pushPayloads.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        reveal_threshold: revealThreshold,
        lookback_days: lookbackDays,
        premium_priority_bonus: premiumPriorityBonus,
        candidates_scanned: scores.length,
        eligible: toInsert.length,
        inserted: inserted.length,
        pushed_notifications: pushed,
        connections: inserted,
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
