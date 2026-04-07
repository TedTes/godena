// @ts-nocheck
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
    const runScout = body.run_scout !== false;
    const buildGroups = body.build_groups !== false;
    const buildIntros = body.build_intros !== false;
    const generateProposals = body.generate_proposals !== false;

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

    return jsonResponse({ ok: true, results });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
