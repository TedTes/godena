// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EVENTBRITE_API_KEY = Deno.env.get("EVENTBRITE_API_KEY")!;

const DEFAULT_LIMIT = 50;
const MAX_PAGES = 20;
const RETRY_DELAYS_MS = [500, 1200, 2500, 5000];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= RETRY_DELAYS_MS.length) return res;
    const wait = RETRY_DELAYS_MS[attempt];
    await sleep(wait);
    return fetchWithBackoff(url, init, attempt + 1);
  }
  return res;
}

function toIsoMaybe(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeEventbrite(event: any) {
  const venue = event.venue ?? {};
  const address = venue.address ?? {};
  const organizer = event.organizer ?? {};

  const startUtc = toIsoMaybe(event.start?.utc);
  const endUtc = toIsoMaybe(event.end?.utc);

  return {
    source: "eventbrite",
    source_id: String(event.id),
    source_url: event.url ?? null,
    title: event.name?.text ?? "Untitled event",
    description: event.description?.text ?? null,
    category: event.category_id ?? null,
    image_url: event.logo?.url ?? null,
    start_at: startUtc ?? new Date().toISOString(),
    end_at: endUtc,
    timezone: event.start?.timezone ?? event.start?.timezone ?? null,
    venue_name: venue.name ?? null,
    city: address.city ?? null,
    country: address.country ?? null,
    lat: venue.latitude ? Number(venue.latitude) : null,
    lng: venue.longitude ? Number(venue.longitude) : null,
    is_free: event.is_free ?? null,
    price_min: null,
    organizer_name: organizer.name ?? null,
    organizer_source_id: organizer.id ? String(organizer.id) : null,
    is_native: false,
    organizer_claimed: false,
    claimed_by: null,
    is_archived: false,
    archived_at: null,
  };
}

async function fetchEventbritePage(params: URLSearchParams) {
  const url = `https://www.eventbriteapi.com/v3/events/search/?${params.toString()}`;
  const res = await fetchWithBackoff(url, {
    headers: {
      Authorization: `Bearer ${EVENTBRITE_API_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Eventbrite API error ${res.status}: ${text}`);
  }
  return await res.json();
}

async function upsertInChunks(client: ReturnType<typeof createClient>, rows: any[], chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await client
      .from("external_events")
      .upsert(chunk, { onConflict: "source,source_id" });
    if (error) throw error;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret) {
      const provided = req.headers.get("x-internal-secret");
      if (provided !== internalSecret) {
        return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
      }
    }

    const body = await req.json().catch(() => ({}));
    const city = String(body.city ?? "Toronto");
    const radiusKm = Number(body.radius_km ?? 50);
    const categories = Array.isArray(body.categories) ? body.categories : [];
    const fromDate = body.start_date ?? null; // YYYY-MM-DD

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const params = new URLSearchParams();
    params.set("location.address", city);
    params.set("location.within", `${radiusKm}km`);
    params.set("expand", "venue,organizer");
    params.set("page", "1");
    params.set("page_size", String(DEFAULT_LIMIT));
    if (fromDate) params.set("start_date.range_start", `${fromDate}T00:00:00Z`);
    if (categories.length > 0) params.set("categories", categories.join(","));

    const allRows: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      params.set("page", String(page));
      const payload = await fetchEventbritePage(params);
      const events = payload.events ?? [];

      for (const ev of events) {
        allRows.push(normalizeEventbrite(ev));
      }

      const pagination = payload.pagination ?? {};
      hasMore = Boolean(pagination.has_more_items);
      page += 1;
    }

    if (allRows.length > 0) {
      await upsertInChunks(client, allRows);
    }

    // Archive past events (end_at before now)
    const nowIso = new Date().toISOString();
    const { error: archiveError } = await client
      .from("external_events")
      .update({ is_archived: true, archived_at: nowIso })
      .lt("end_at", nowIso)
      .eq("is_archived", false);
    if (archiveError) throw archiveError;

    return jsonResponse({ ok: true, imported: allRows.length, pageCount: page - 1 });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err?.message ?? err) }, 500);
  }
});
