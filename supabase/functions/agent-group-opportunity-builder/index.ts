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

function labelizeCategory(category: string | null) {
  if (!category) return "Community";
  switch (category) {
    case "food_drink": return "Food & Drink";
    case "outdoors": return "Outdoors";
    case "professional": return "Professional";
    case "language": return "Language";
    case "faith": return "Faith";
    case "culture": return "Culture";
    default:
      return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
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
    const cityFilter = typeof body.city === "string" ? body.city : null;
    const minEvents = Math.max(2, Math.min(Number(body.min_events ?? 2), 10));

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let query = client
      .from("agent_opportunities")
      .select("id, title, city, starts_at, feature_snapshot, metadata")
      .eq("kind", "event");

    if (cityFilter) query = query.ilike("city", `%${cityFilter}%`);

    const { data: eventRows, error } = await query;
    if (error) throw error;

    const clusters = new Map<string, {
      city: string;
      category: string;
      events: Array<{ id: string; title: string; starts_at: string | null }>;
    }>();

    for (const row of eventRows ?? []) {
      const featureSnapshot = (row.feature_snapshot ?? {}) as Record<string, unknown>;
      const category = typeof featureSnapshot.category === "string" ? featureSnapshot.category : null;
      const city = typeof row.city === "string" && row.city.trim().length > 0 ? row.city.trim() : null;
      if (!category || !city) continue;
      const key = `${city.toLowerCase()}:${category}`;
      const current = clusters.get(key) ?? { city, category, events: [] };
      current.events.push({ id: row.id, title: row.title, starts_at: row.starts_at });
      clusters.set(key, current);
    }

    let createdOrUpdated = 0;
    for (const cluster of clusters.values()) {
      if (cluster.events.length < minEvents) continue;

      const categoryLabel = labelizeCategory(cluster.category);
      const title = `${cluster.city} ${categoryLabel}`;
      const summary =
        `${cluster.events.length} upcoming ${categoryLabel.toLowerCase()} opportunities suggest enough momentum to start a dedicated group in ${cluster.city}.`;
      const canonicalKey = `group-proposal:${cluster.city.toLowerCase()}:${cluster.category}`;

      const { error: upsertError } = await client
        .from("agent_opportunities")
        .upsert({
          kind: "group",
          title,
          summary,
          city: cluster.city,
          country: null,
          canonical_key: canonicalKey,
          feature_snapshot: {
            category: cluster.category,
            event_count: cluster.events.length,
          },
          metadata: {
            derived_from_event_ids: cluster.events.map((event) => event.id),
            seed_titles: cluster.events.slice(0, 5).map((event) => event.title),
          },
        }, { onConflict: "canonical_key" });

      if (upsertError) throw upsertError;
      createdOrUpdated += 1;
    }

    return jsonResponse({
      ok: true,
      scanned_events: eventRows?.length ?? 0,
      group_opportunities_upserted: createdOrUpdated,
      min_events: minEvents,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
