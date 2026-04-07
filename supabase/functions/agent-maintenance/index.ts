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

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (internalSecret && req.headers.get("x-internal-secret") !== internalSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const nowIso = new Date().toISOString();

    const { data: expiringOpportunities, error: opportunityError } = await client
      .from("agent_opportunities")
      .select("id")
      .or(`expires_at.lte.${nowIso},and(kind.eq.event,starts_at.lte.${nowIso})`);
    if (opportunityError) throw opportunityError;

    const opportunityIds = (expiringOpportunities ?? []).map((row) => row.id);

    let opportunitiesExpired = 0;
    if (opportunityIds.length > 0) {
      const { error: updateOpportunityError } = await client
        .from("agent_opportunities")
        .update({ expires_at: nowIso })
        .in("id", opportunityIds);
      if (updateOpportunityError) throw updateOpportunityError;
      opportunitiesExpired = opportunityIds.length;
    }

    const { data: expiringProposals, error: proposalError } = await client
      .from("agent_proposals")
      .select("id")
      .in("status", ["draft", "approved"])
      .or(`expires_at.lte.${nowIso},opportunity_id.in.(${opportunityIds.length ? opportunityIds.join(",") : "00000000-0000-0000-0000-000000000000"})`);
    if (proposalError) throw proposalError;

    const proposalIds = (expiringProposals ?? []).map((row) => row.id);

    let proposalsExpired = 0;
    if (proposalIds.length > 0) {
      const { error: updateProposalError } = await client
        .from("agent_proposals")
        .update({ status: "expired", expires_at: nowIso })
        .in("id", proposalIds);
      if (updateProposalError) throw updateProposalError;
      proposalsExpired = proposalIds.length;
    }

    return jsonResponse({
      ok: true,
      opportunities_expired: opportunitiesExpired,
      proposals_expired: proposalsExpired,
      ran_at: nowIso,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
