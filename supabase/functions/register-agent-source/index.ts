// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TRUST_TIERS = new Set(["high", "medium", "bootstrap_only", "passive"]);
const DEFAULT_LOCATOR_TYPES = new Set(["api", "ics", "rss", "webpage", "manual"]);

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

function isIdentifierLike(value: string) {
  return /^[a-z][a-z0-9_:-]{1,63}$/i.test(value);
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

function inferLocatorTypeFromUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (path.endsWith(".ics") || url.searchParams.has("ical")) return "ics";
  if (path.endsWith(".rss") || path.endsWith(".xml") || host.includes("rss")) return "rss";
  if (host.includes("api.") || path.includes("/api/")) return "api";
  return "webpage";
}

function validateCompatibility(locatorType: string, locator: string, config: Record<string, unknown>) {
  if (locatorType === "manual") return;
  const url = parseUrl(locator);
  if ((locatorType === "api" || locatorType === "rss" || locatorType === "ics") && !/^https?:$/i.test(url.protocol)) {
    throw new Error(`Unsupported URL protocol for locator_type ${locatorType}`);
  }
  if (locatorType === "api") {
    const auth = typeof config.auth === "object" && config.auth ? config.auth as Record<string, unknown> : {};
    const hasAuthReference =
      typeof auth.secret_name === "string" ||
      typeof auth.api_key_env === "string" ||
      typeof auth.key_secret_name === "string" ||
      typeof auth.secret_secret_name === "string" ||
      typeof auth.token_secret_name === "string" ||
      typeof auth.header_name === "string" ||
      typeof config.api_key === "string";
    const allowUnauthed = config.allow_unauthenticated === true;
    if (!hasAuthReference && !allowUnauthed) {
      // Keep this permissive but explicit: API sources should either name auth or opt out.
      throw new Error("API locator requires auth reference or allow_unauthenticated=true");
    }
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

    if (!locator) {
      return jsonResponse({ ok: false, error: "Missing locator" }, 400);
    }

    const parsedInputLocator = body.locator_type === "manual" ? null : parseUrl(locator);
    const locatorType =
      ensureString(body.locator_type).toLowerCase() ||
      (parsedInputLocator ? inferLocatorTypeFromUrl(parsedInputLocator) : "manual");

    if (!isIdentifierLike(locatorType)) {
      return jsonResponse({ ok: false, error: `Invalid locator_type: ${locatorType}` }, 400);
    }

    const parsedLocator = locatorType === "manual" ? null : (parsedInputLocator ?? parseUrl(locator));
    const inferredSourceType = parsedLocator
      ? inferSourceType(locatorType, parsedLocator.hostname)
      : (DEFAULT_LOCATOR_TYPES.has(locatorType) ? locatorType : "manual");
    const sourceType = ensureString(body.source_type).toLowerCase() || inferredSourceType || locatorType;

    if (!sourceType || !isIdentifierLike(sourceType)) {
      return jsonResponse({ ok: false, error: `Invalid source_type: ${sourceType}` }, 400);
    }

    const config = typeof body.config === "object" && body.config ? body.config : {};
    validateCompatibility(locatorType, locator, config);

    const trustTier = ensureString(body.trust_tier).toLowerCase() || (
      sourceType === "eventbrite" || sourceType === "meetup"
        ? "high"
        : sourceType === "reddit"
          ? "bootstrap_only"
          : sourceType === "weather"
            ? "passive"
            : "medium"
    );

    if (!TRUST_TIERS.has(trustTier)) {
      return jsonResponse({ ok: false, error: `Unsupported trust_tier: ${trustTier}` }, 400);
    }

    const name =
      ensureString(body.name) ||
      (parsedLocator ? inferNameFromLocator(parsedLocator) : `manual-${sourceType}`);

    const enabled = body.enabled !== false;

    const row = {
      name,
      enabled,
      source_type: sourceType,
      locator_type: locatorType,
      locator,
      trust_tier: trustTier,
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
        trust_tier,
        created_by,
        created_at,
        updated_at
      `)
      .single();

    if (error || !data) {
      throw error ?? new Error("source_upsert_failed");
    }

    const { error: syncStateError } = await client
      .from("agent_source_sync_state")
      .upsert({ source_id: data.id }, { onConflict: "source_id" });

    if (syncStateError) {
      throw syncStateError;
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
