// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RETRY_DELAYS_MS = [500, 1200, 2500, 5000];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function parseAllowList(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function assertOperatorAccess(req: Request) {
  const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
  const providedInternalSecret = req.headers.get("x-internal-secret");
  if (internalSecret && providedInternalSecret === internalSecret) {
    return { mode: "internal_secret" as const, user: null };
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new Error("Unauthorized");

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");

  const allowedEmails = parseAllowList(Deno.env.get("AGENT_OPERATOR_EMAILS"));
  const allowedUserIds = parseAllowList(Deno.env.get("AGENT_OPERATOR_USER_IDS"));
  const userId = data.user.id.toLowerCase();
  const email = (data.user.email ?? "").toLowerCase();
  const isAllowed =
    allowedUserIds.has(userId) ||
    (email.length > 0 && allowedEmails.has(email));

  if (!isAllowed) throw new Error("Forbidden");

  return {
    mode: "allowlisted_user" as const,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithBackoff(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= RETRY_DELAYS_MS.length) return res;
    await sleep(RETRY_DELAYS_MS[attempt]);
    return fetchWithBackoff(url, init, attempt + 1);
  }
  return res;
}

function ensureRecord(value: unknown) {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function ensureString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coalesceString(...values: unknown[]) {
  for (const value of values) {
    const text = ensureString(value);
    if (text) return text;
  }
  return null;
}

function parseDateValue(raw: string) {
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
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function unfoldLines(ics: string) {
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

async function invokeScout(body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-event-scout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "x-internal-secret": Deno.env.get("INTERNAL_FUNCTION_SECRET") ?? "",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`agent-event-scout_failed:${json?.error ?? res.statusText}`);
  }
  return json;
}

function readSecretByName(secretName: string | null) {
  if (!secretName) return null;
  return Deno.env.get(secretName) ?? null;
}

function mergeScope(globalScope: Record<string, unknown>, sourceConfig: Record<string, unknown>) {
  const sourceScope = ensureRecord(sourceConfig.scope);
  return {
    city: coalesceString(globalScope.city, sourceScope.city),
    country: coalesceString(globalScope.country, sourceScope.country),
    category: coalesceString(globalScope.category, sourceScope.category),
    timezone: coalesceString(globalScope.timezone, sourceScope.timezone),
    radius: Number(globalScope.radius ?? sourceScope.radius ?? 25),
    unit: coalesceString(globalScope.unit, sourceScope.unit) ?? "km",
    pageSize: Number(globalScope.page_size ?? sourceScope.page_size ?? 50),
    windowDaysAhead: Number(globalScope.window_days_ahead ?? sourceScope.window_days_ahead ?? 30),
    keyword: coalesceString(globalScope.keyword, sourceScope.keyword),
    locale: coalesceString(globalScope.locale, sourceScope.locale) ?? "*",
    sort: coalesceString(globalScope.sort, sourceScope.sort) ?? "date,asc",
  };
}

async function fetchIcsRecords(sourceRow: Record<string, unknown>, scope: Record<string, unknown>) {
  const res = await fetchWithBackoff(String(sourceRow.locator), {
    headers: {
      "User-Agent": "godena-source-sync/1.0",
      Accept: "text/calendar, text/plain, */*",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ics_fetch_error:${res.status}:${text}`);
  }
  const text = await res.text();
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("text/calendar") && !text.includes("BEGIN:VCALENDAR")) {
    throw new Error(`ics_invalid_content_type:${contentType}`);
  }
  const events = parseIcsEvents(text);
  const sourceConfig = ensureRecord(sourceRow.config);
  const rows = [];
  for (const ev of events) {
    const startAt = parseDateValue(ev.DTSTART);
    if (!startAt) continue;
    rows.push({
      id: `${sourceRow.id}:${ev.UID || ev.SUMMARY || startAt}`,
      title: ev.SUMMARY || "Untitled event",
      summary: unescapeIcsText(ev.DESCRIPTION),
      start_at: startAt,
      end_at: parseDateValue(ev.DTEND),
      timezone: ev.__timezone || scope.timezone || null,
      venue_name: unescapeIcsText(ev.LOCATION),
      city: scope.city ?? null,
      country: scope.country ?? null,
      category: scope.category || sourceConfig.category || sourceRow.name || null,
      url: ev.URL || String(sourceRow.locator),
      organizer_name: coalesceString(sourceConfig.organizer_name, sourceRow.name),
    });
  }
  return rows;
}

async function fetchTicketmasterRecords(sourceRow: Record<string, unknown>, scope: Record<string, unknown>) {
  const sourceConfig = ensureRecord(sourceRow.config);
  const auth = ensureRecord(sourceConfig.auth);
  const referencedApiKey = readSecretByName(
    coalesceString(auth.secret_name, auth.key_secret_name, auth.api_key_env),
  );
  const inlineApiKey = ensureString(sourceConfig.api_key) || null;
  const apiKey = referencedApiKey ?? inlineApiKey ?? null;
  if (!apiKey) {
    throw new Error("ticketmaster_missing_api_key");
  }

  const url = new URL(String(sourceRow.locator));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("size", String(Math.max(1, Math.min(Number(scope.pageSize ?? 50), 200))));
  url.searchParams.set("sort", String(scope.sort ?? "date,asc"));
  url.searchParams.set("locale", String(scope.locale ?? "*"));
  if (scope.city) url.searchParams.set("city", String(scope.city));
  if (scope.country) url.searchParams.set("countryCode", String(scope.country));
  if (scope.keyword) url.searchParams.set("keyword", String(scope.keyword));
  if (scope.radius) {
    url.searchParams.set("radius", String(scope.radius));
    url.searchParams.set("unit", String(scope.unit ?? "km"));
  }
  const start = new Date();
  const end = new Date(start.getTime() + Number(scope.windowDaysAhead ?? 30) * 24 * 60 * 60 * 1000);
  url.searchParams.set("startDateTime", start.toISOString().replace(/\.\d{3}Z$/, "Z"));
  url.searchParams.set("endDateTime", end.toISOString().replace(/\.\d{3}Z$/, "Z"));

  const res = await fetchWithBackoff(url.toString(), {
    headers: {
      "User-Agent": "godena-source-sync/1.0",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ticketmaster_fetch_error:${res.status}:${text}`);
  }
  const json = await res.json();
  const events = json?._embedded?.events ?? [];
  return events.map((event: Record<string, unknown>) => {
    const dates = ensureRecord(event.dates);
    const start = ensureRecord(dates.start);
    const embedded = ensureRecord(event._embedded);
    const venues = Array.isArray(embedded.venues) ? embedded.venues : [];
    const venue = ensureRecord(venues[0]);
    const classifications = Array.isArray(event.classifications) ? event.classifications : [];
    const classification = ensureRecord(classifications[0]);
    const segment = ensureRecord(classification.segment);
    const genre = ensureRecord(classification.genre);

    return {
      id: coalesceString(event.id, event.url, event.name, start.dateTime) ?? crypto.randomUUID(),
      title: coalesceString(event.name) ?? "Untitled event",
      summary: coalesceString(event.info, event.pleaseNote),
      start_at: coalesceString(start.dateTime, start.localDate),
      end_at: null,
      timezone: coalesceString(start.timezone),
      venue_name: coalesceString(venue.name),
      city: coalesceString(ensureRecord(venue.city).name, scope.city),
      country: coalesceString(ensureRecord(ensureRecord(venue.country)).countryCode, scope.country),
      category: coalesceString(segment.name, genre.name, scope.category),
      url: coalesceString(event.url),
      image_url: Array.isArray(event.images) && event.images.length > 0 ? coalesceString(ensureRecord(event.images[0]).url) : null,
      organizer_name: "Ticketmaster",
      source_type: "ticketmaster",
    };
  }).filter((row: Record<string, unknown>) => typeof row.start_at === "string");
}

async function fetchSourceRecords(sourceRow: Record<string, unknown>, globalScope: Record<string, unknown>) {
  const sourceType = String(sourceRow.source_type ?? "").toLowerCase();
  const locatorType = String(sourceRow.locator_type ?? "").toLowerCase();
  const scope = mergeScope(globalScope, ensureRecord(sourceRow.config));

  if (sourceType === "ics" || locatorType === "ics") {
    return {
      source: "ics",
      defaults: {
        city: scope.city ?? null,
        country: scope.country ?? null,
        timezone: scope.timezone ?? null,
      },
      records: await fetchIcsRecords(sourceRow, scope),
    };
  }

  if (sourceType === "ticketmaster") {
    return {
      source: "ticketmaster",
      defaults: {
        city: scope.city ?? null,
        country: scope.country ?? null,
        timezone: scope.timezone ?? null,
      },
      records: await fetchTicketmasterRecords(sourceRow, scope),
    };
  }

  throw new Error(`unsupported_source_adapter:${sourceType || locatorType}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const access = await assertOperatorAccess(req);
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const sourceIds = Array.isArray(body.source_ids) ? body.source_ids.filter((v) => typeof v === "string" && v.trim()) : [];
    const sourceType = ensureString(body.source_type).toLowerCase() || null;
    const globalScope = ensureRecord(body.scope);

    let query = client
      .from("agent_sources")
      .select("id, name, enabled, source_type, locator_type, locator, trust_tier, config")
      .eq("enabled", true)
      .order("created_at", { ascending: true });

    if (sourceIds.length > 0) query = query.in("id", sourceIds);
    if (sourceType) query = query.eq("source_type", sourceType);

    const { data: sources, error } = await query;
    if (error) throw error;

    const results = [];
    let processed = 0;
    let totalFetched = 0;
    let totalNormalized = 0;
    let totalOpportunities = 0;

    for (const sourceRow of sources ?? []) {
      try {
        const fetched = await fetchSourceRecords(sourceRow, globalScope);
        const runKey = `source-sync:${sourceRow.id}:${Date.now()}`;
        const scoutResult = await invokeScout({
          source: fetched.source,
          city: typeof fetched.defaults.city === "string" ? fetched.defaults.city : null,
          run_key: runKey,
          defaults: fetched.defaults,
          records: fetched.records,
        });

        results.push({
          source_id: sourceRow.id,
          source_type: sourceRow.source_type,
          status: "completed",
          fetched: fetched.records.length,
          normalized: scoutResult.normalized ?? 0,
          opportunities_upserted: scoutResult.opportunities_upserted ?? 0,
          run_key: scoutResult.run_key ?? runKey,
        });
        processed += 1;
        totalFetched += fetched.records.length;
        totalNormalized += Number(scoutResult.normalized ?? 0);
        totalOpportunities += Number(scoutResult.opportunities_upserted ?? 0);
      } catch (sourceError) {
        results.push({
          source_id: sourceRow.id,
          source_type: sourceRow.source_type,
          status: "failed",
          error: sourceError instanceof Error ? sourceError.message : "Unknown error",
        });
      }
    }

    return jsonResponse({
      ok: true,
      access,
      processed_sources: processed,
      requested_sources: sources?.length ?? 0,
      fetched_records: totalFetched,
      normalized_records: totalNormalized,
      opportunities_upserted: totalOpportunities,
      results,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden") ? 401 : 500,
    );
  }
});
