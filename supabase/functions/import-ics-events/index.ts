// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_LIMIT = 500;
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

function unfoldLines(ics: string) {
  // RFC 5545 line folding: CRLF followed by space or tab
  return ics.replace(/\r?\n[ \t]/g, "");
}

function unescapeIcsText(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .replace(/\\/g, "");
}

function toIsoMaybe(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseDateValue(raw: string) {
  // Handles: YYYYMMDD, YYYYMMDDTHHmmssZ, YYYYMMDDTHHmmss, YYYYMMDDTHHmmss±HHMM
  if (!raw) return null;
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    return `${y}-${m}-${d}T00:00:00Z`;
  }
  if (/^\d{8}T\d{6}Z$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
  }
  if (/^\d{8}T\d{6}[+-]\d{4}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    const sign = raw.slice(15, 16);
    const offH = raw.slice(16, 18);
    const offM = raw.slice(18, 20);
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${offH}:${offM}`;
    return toIsoMaybe(iso);
  }
  if (/^\d{8}T\d{6}$/.test(raw)) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const hh = raw.slice(9, 11);
    const mm = raw.slice(11, 13);
    const ss = raw.slice(13, 15);
    // Treat as UTC when timezone isn't provided.
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}Z`;
  }
  return toIsoMaybe(raw);
}

function parseIcsEvents(icsText: string) {
  const text = unfoldLines(icsText);
  const blocks = text.split("BEGIN:VEVENT").slice(1);
  const events = [];
  for (const blk of blocks) {
    const body = blk.split("END:VEVENT")[0];
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const ev: Record<string, string> = {};
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const keyPart = line.slice(0, idx);
      const val = line.slice(idx + 1);
      const [rawKey, ...params] = keyPart.split(";");
      const key = rawKey.toUpperCase();
      ev[key] = val;
      if (key === "DTSTART" || key === "DTEND") {
        for (const p of params) {
          if (p.toUpperCase().startsWith("TZID=")) {
            ev.__timezone = p.split("=")[1];
          }
        }
      }
    }
    if (!ev.UID && !ev.SUMMARY) continue;
    events.push(ev);
  }
  return events;
}

function normalizeIcsEvent(ev: Record<string, string>, feed: any) {
  const startRaw = ev.DTSTART;
  const endRaw = ev.DTEND;
  const start_at = parseDateValue(startRaw);
  if (!start_at) return null;
  const end_at = parseDateValue(endRaw);
  const sourceId = `${feed.id || feed.url}:${ev.UID || ev.SUMMARY || start_at}`;

  return {
    source: "ics",
    source_id: sourceId,
    source_url: ev.URL || feed.url || null,
    title: ev.SUMMARY || "Untitled event",
    description: unescapeIcsText(ev.DESCRIPTION),
    category: feed.category || feed.name || null,
    image_url: null,
    start_at,
    end_at,
    timezone: ev.__timezone || feed.timezone || null,
    venue_name: unescapeIcsText(ev.LOCATION),
    city: feed.city || null,
    country: feed.country || null,
    lat: null,
    lng: null,
    is_free: null,
    price_min: null,
    organizer_name: feed.organizer_name || null,
    organizer_source_id: null,
    is_native: false,
    organizer_claimed: false,
    claimed_by: null,
    is_archived: false,
    archived_at: null,
  };
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

const DEFAULT_FEEDS = [
  {
    id: "guelph-city",
    name: "City of Guelph",
    url: "https://events.guelph.ca/events/month/?hide_subsequent_recurrences=1&ical=1",
    city: "Guelph",
    country: "CA",
    category: "community",
  },
];

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
    const feeds = Array.isArray(body.feeds) && body.feeds.length > 0 ? body.feeds : DEFAULT_FEEDS;
    const limit = Number(body.limit ?? DEFAULT_LIMIT);

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const allRows: any[] = [];
    for (const feed of feeds) {
      const res = await fetchWithBackoff(feed.url, {
        headers: {
          "User-Agent": "godena-import/1.0",
          Accept: "text/calendar, text/plain, */*",
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ICS fetch error ${res.status} for ${feed.url}: ${text}`);
      }
      const text = await res.text();
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/calendar") && !text.includes("BEGIN:VCALENDAR")) {
        const preview = text.slice(0, 200);
        throw new Error(`ICS fetch error for ${feed.url}: unexpected content-type ${contentType}. Body preview: ${preview}`);
      }
      const events = parseIcsEvents(text);
      for (const ev of events) {
        const row = normalizeIcsEvent(ev, feed);
        if (row) {
          allRows.push(row);
        }
        if (allRows.length >= limit) break;
      }
      if (allRows.length >= limit) break;
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

    return jsonResponse({ ok: true, imported: allRows.length, feedCount: feeds.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err?.message ?? err) }, 500);
  }
});
