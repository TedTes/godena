// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const STALE_AFTER_DAYS = 14;
const MIN_SCORE_FLOOR = 0;

type ConfigRow = {
  decay_percent_per_week: number;
};

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: cfgRow, error: cfgError } = await client
      .from("matching_config")
      .select("decay_percent_per_week")
      .eq("id", 1)
      .single();
    if (cfgError || !cfgRow) throw cfgError ?? new Error("missing matching_config");

    const cfg = cfgRow as ConfigRow;
    const weeklyPercent = Number(cfg.decay_percent_per_week ?? 20);
    const weeklyFactor = Math.max(0, 1 - weeklyPercent / 100);
    const dailyFactor = Math.pow(weeklyFactor, 1 / 7);

    const staleCutoff = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data: staleRows, error: staleError } = await client
      .from("interaction_scores")
      .select("id, score, last_interaction_at")
      .lt("last_interaction_at", staleCutoff)
      .gt("score", MIN_SCORE_FLOOR)
      .limit(50000);
    if (staleError) throw staleError;

    const rows = staleRows ?? [];
    if (rows.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          stale_rows: 0,
          updated_rows: 0,
          daily_factor: Number(dailyFactor.toFixed(6)),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const updates = rows.map((row) => {
      const current = Number(row.score ?? 0);
      const decayed = Math.max(MIN_SCORE_FLOOR, current * dailyFactor);
      return {
        id: row.id,
        score: Number(decayed.toFixed(2)),
      };
    });

    const chunkSize = 500;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      const { error } = await client.from("interaction_scores").upsert(chunk, { onConflict: "id" });
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stale_rows: rows.length,
        updated_rows: updates.length,
        decay_percent_per_week: weeklyPercent,
        daily_factor: Number(dailyFactor.toFixed(6)),
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
