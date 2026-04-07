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

async function invoke(functionName: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
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
    throw new Error(`${functionName}_failed:${json?.error ?? res.statusText}`);
  }
  return json;
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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const access = await assertOperatorAccess(req);

    const body = await req.json().catch(() => ({}));
    const runScout = body.run_scout !== false;
    const buildGroups = body.build_groups !== false;
    const buildIntros = body.build_intros !== false;
    const generateProposals = body.generate_proposals !== false;
    const runMaintenance = body.run_maintenance !== false;

    const results: Record<string, unknown> = {};

    if (runScout) {
      results.scout = await invoke("agent-event-scout", body.scout_payload ?? {});
    }
    if (buildGroups) {
      results.group_builder = await invoke("agent-group-opportunity-builder", body.group_payload ?? {});
    }
    if (buildIntros) {
      results.intro_builder = await invoke("agent-intro-opportunity-builder", body.intro_payload ?? {});
    }
    if (generateProposals) {
      results.proposals = await invoke("agent-proposal-generator", body.proposal_payload ?? {});
    }
    if (runMaintenance) {
      results.maintenance = await invoke("agent-maintenance", body.maintenance_payload ?? {});
    }

    return jsonResponse({ ok: true, access, results });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden") ? 401 : 500,
    );
  }
});
