// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SUPPORTED_SOURCE_TYPES = new Set([
  "eventbrite",
  "meetup",
  "ics",
  "rss",
  "webpage",
  "reddit",
  "weather",
  "manual",
]);

const SUPPORTED_LOCATOR_TYPES = new Set([
  "api",
  "ics",
  "rss",
  "webpage",
  "manual",
]);

const COMPATIBILITY: Record<string, string[]> = {
  eventbrite: ["api", "webpage"],
  meetup: ["api", "webpage"],
  ics: ["ics", "webpage"],
  rss: ["rss", "webpage"],
  webpage: ["webpage"],
  reddit: ["api", "webpage"],
  weather: ["api", "manual"],
  manual: ["manual"],
};

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
  if (!token) {
    throw new Error("Unauthorized");
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }

  const allowedEmails = parseAllowList(Deno.env.get("AGENT_OPERATOR_EMAILS"));
  const allowedUserIds = parseAllowList(Deno.env.get("AGENT_OPERATOR_USER_IDS"));
  const userId = data.user.id.toLowerCase();
  const email = (data.user.email ?? "").toLowerCase();

  const isAllowed =
    allowedUserIds.has(userId) ||
    (email.length > 0 && allowedEmails.has(email));

  if (!isAllowed) {
    throw new Error("Forbidden");
  }

  return {
    mode: "allowlisted_user" as const,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
    },
  };
}

function ensureString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseUrl(locator: string) {
  try {
    return new URL(locator);
  } catch {
    throw new Error("Invalid locator URL");
  }
}

function inferNameFromLocator(url: URL) {
  return url.hostname.replace(/^www\./, "");
}

function inferSourceType(locatorType: string, hostname: string) {
  const host = hostname.toLowerCase();
  if (host.includes("eventbrite")) return "eventbrite";
  if (host.includes("meetup")) return "meetup";
  if (host.includes("reddit")) return "reddit";
  if (locatorType === "ics") return "ics";
  if (locatorType === "rss") return "rss";
  if (locatorType === "manual") return "manual";
  return locatorType === "webpage" ? "webpage" : null;
}

function validateCompatibility(sourceType: string, locatorType: string) {
  const allowed = COMPATIBILITY[sourceType] ?? [];
  if (!allowed.includes(locatorType)) {
    throw new Error(`Incompatible source_type and locator_type: ${sourceType}/${locatorType}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const access = await assertOperatorAccess(req);
    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json().catch(() => ({}));
    const locator = ensureString(body.locator);
    const locatorType = ensureString(body.locator_type).toLowerCase();

    if (!locator) {
      return jsonResponse({ ok: false, error: "Missing locator" }, 400);
    }

    if (!SUPPORTED_LOCATOR_TYPES.has(locatorType)) {
      return jsonResponse({ ok: false, error: `Unsupported locator_type: ${locatorType}` }, 400);
    }

    const parsedLocator = locatorType === "manual" ? null : parseUrl(locator);
    const inferredSourceType = parsedLocator
      ? inferSourceType(locatorType, parsedLocator.hostname)
      : "manual";
    const sourceType = ensureString(body.source_type).toLowerCase() || inferredSourceType;

    if (!sourceType || !SUPPORTED_SOURCE_TYPES.has(sourceType)) {
      return jsonResponse({ ok: false, error: `Unsupported source_type: ${sourceType}` }, 400);
    }

    validateCompatibility(sourceType, locatorType);

    const trustTier = ensureString(body.trust_tier).toLowerCase() || (
      sourceType === "eventbrite" || sourceType === "meetup"
        ? "high"
        : sourceType === "reddit"
          ? "bootstrap_only"
          : sourceType === "weather"
            ? "passive"
            : "medium"
    );

    if (!["high", "medium", "bootstrap_only", "passive"].includes(trustTier)) {
      return jsonResponse({ ok: false, error: `Unsupported trust_tier: ${trustTier}` }, 400);
    }

    const pollIntervalMinutes = Math.max(
      5,
      Math.min(Number(body.poll_interval_minutes ?? 360), 10080),
    );

    const name =
      ensureString(body.name) ||
      (parsedLocator ? inferNameFromLocator(parsedLocator) : `manual-${sourceType}`);

    const city = ensureString(body.city) || null;
    const country = ensureString(body.country) || null;
    const category = ensureString(body.category) || null;
    const enabled = body.enabled !== false;
    const config = typeof body.config === "object" && body.config ? body.config : {};
    const nextRunAt =
      typeof body.next_run_at === "string" && body.next_run_at.trim().length > 0
        ? new Date(body.next_run_at).toISOString()
        : new Date().toISOString();

    const row = {
      name,
      enabled,
      source_type: sourceType,
      locator_type: locatorType,
      locator,
      city,
      country,
      category,
      trust_tier: trustTier,
      poll_interval_minutes: pollIntervalMinutes,
      next_run_at: nextRunAt,
      config,
      created_by: access.user?.id ?? null,
    };

    const { data, error } = await client
      .from("agent_sources")
      .upsert(row, { onConflict: "locator_type,locator" })
      .select(`
        id,
        name,
        enabled,
        source_type,
        locator_type,
        locator,
        city,
        country,
        category,
        trust_tier,
        poll_interval_minutes,
        next_run_at,
        last_status,
        created_by,
        created_at,
        updated_at
      `)
      .single();

    if (error || !data) {
      throw error ?? new Error("source_upsert_failed");
    }

    return jsonResponse({
      ok: true,
      source: data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" || message === "Forbidden" ? 401 : 500;
    return jsonResponse({ ok: false, error: message }, status);
  }
});
