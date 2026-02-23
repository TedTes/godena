// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ConfigRow = {
  lookback_days: number;
  weight_same_event_attendance: number;
  weight_chat_reply: number;
  weight_post_reaction: number;
  weight_same_event_rsvp: number;
  weight_mention: number;
};

type InteractionEventRow = {
  group_id: string;
  event_type: "chat_reply" | "post_reaction" | "same_event_attendance" | "same_event_rsvp" | "mention";
  actor_id: string;
  target_id: string;
  occurred_at: string;
};

type Aggregate = {
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  score: number;
  last_interaction_at: string;
  counts: Record<string, number>;
  weighted: Record<string, number>;
};

function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function eventWeight(eventType: InteractionEventRow["event_type"], cfg: ConfigRow) {
  switch (eventType) {
    case "same_event_attendance":
      return Number(cfg.weight_same_event_attendance ?? 10);
    case "chat_reply":
      return Number(cfg.weight_chat_reply ?? 8);
    case "post_reaction":
      return Number(cfg.weight_post_reaction ?? 5);
    case "same_event_rsvp":
      return Number(cfg.weight_same_event_rsvp ?? 4);
    case "mention":
      return Number(cfg.weight_mention ?? 3);
    default:
      return 0;
  }
}

function toBreakdownJson(agg: Aggregate) {
  return {
    counts: agg.counts,
    weighted: agg.weighted,
    total_score: Number(agg.score.toFixed(2)),
  };
}

async function upsertInChunks(client: ReturnType<typeof createClient>, rows: any[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client
      .from("interaction_scores")
      .upsert(chunk, { onConflict: "group_id,user_a_id,user_b_id" });
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: configRow, error: configError } = await client
      .from("matching_config")
      .select(
        "lookback_days, weight_same_event_attendance, weight_chat_reply, weight_post_reaction, weight_same_event_rsvp, weight_mention",
      )
      .eq("id", 1)
      .single();
    if (configError || !configRow) throw configError ?? new Error("missing matching_config");

    const cfg = configRow as ConfigRow;
    const lookbackDays = Number(cfg.lookback_days ?? 30);
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    const { data: events, error: eventsError } = await client
      .from("interaction_events")
      .select("group_id, event_type, actor_id, target_id, occurred_at")
      .gte("occurred_at", cutoff)
      .order("occurred_at", { ascending: true })
      .limit(50000);
    if (eventsError) throw eventsError;

    const rows = (events ?? []) as InteractionEventRow[];
    const map = new Map<string, Aggregate>();

    for (const ev of rows) {
      if (ev.actor_id === ev.target_id) continue;
      const weight = eventWeight(ev.event_type, cfg);
      if (weight <= 0) continue;

      const [userA, userB] = pairOrder(ev.actor_id, ev.target_id);
      const key = `${ev.group_id}:${userA}:${userB}`;
      const current = map.get(key);

      if (!current) {
        map.set(key, {
          group_id: ev.group_id,
          user_a_id: userA,
          user_b_id: userB,
          score: weight,
          last_interaction_at: ev.occurred_at,
          counts: { [ev.event_type]: 1 },
          weighted: { [ev.event_type]: weight },
        });
        continue;
      }

      current.score += weight;
      current.counts[ev.event_type] = (current.counts[ev.event_type] ?? 0) + 1;
      current.weighted[ev.event_type] = (current.weighted[ev.event_type] ?? 0) + weight;
      if (new Date(ev.occurred_at).getTime() > new Date(current.last_interaction_at).getTime()) {
        current.last_interaction_at = ev.occurred_at;
      }
    }

    const upsertRows = Array.from(map.values()).map((agg) => ({
      group_id: agg.group_id,
      user_a_id: agg.user_a_id,
      user_b_id: agg.user_b_id,
      score: Number(agg.score.toFixed(2)),
      event_breakdown: toBreakdownJson(agg),
      last_interaction_at: agg.last_interaction_at,
    }));

    if (upsertRows.length > 0) {
      await upsertInChunks(client, upsertRows, 500);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lookback_days: lookbackDays,
        events_scanned: rows.length,
        score_rows_upserted: upsertRows.length,
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
