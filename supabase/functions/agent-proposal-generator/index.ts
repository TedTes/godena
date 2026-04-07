// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  approvalPolicyForOpportunity,
  buildRankingFeatures,
  buildSuggestionReasons,
} from "../_shared/agent_pipeline.ts";

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
    const body = await req.json().catch(() => ({}));
    const city = typeof body.city === "string" ? body.city : null;
    const limit = Math.max(1, Math.min(Number(body.limit ?? 50), 200));
    const opportunityIds = Array.isArray(body.opportunity_ids) ? body.opportunity_ids : null;
    const audienceUserIds = Array.isArray(body.audience_user_ids) ? body.audience_user_ids : [];

    let query = client
      .from("agent_opportunities")
      .select(`
        id,
        kind,
        title,
        summary,
        city,
        country,
        starts_at,
        ends_at,
        timezone,
        venue_name,
        feature_snapshot,
        metadata,
        primary_external_record_id
      `)
      .order("starts_at", { ascending: true })
      .limit(limit);

    if (city) query = query.ilike("city", `%${city}%`);
    if (opportunityIds?.length) query = query.in("id", opportunityIds);

    const { data: opportunities, error } = await query;
    if (error) throw error;

    let created = 0;
    let updated = 0;

    for (const opportunity of opportunities ?? []) {
      let trustScore = 0;
      if (opportunity.primary_external_record_id) {
        const { data: trustRow } = await client
          .from("agent_trust_scores")
          .select("overall_score")
          .eq("external_record_id", opportunity.primary_external_record_id)
          .maybeSingle();
        trustScore = Number(trustRow?.overall_score ?? 0);
      }
      const policy = approvalPolicyForOpportunity(opportunity.kind, trustScore);
      const { data: existingProposal } = await client
        .from("agent_proposals")
        .select("id")
        .eq("opportunity_id", opportunity.id)
        .eq("target_surface", policy.target_surface)
        .maybeSingle();

      let views = 0;
      let clicks = 0;
      let dismisses = 0;
      let ignores = 0;
      if (existingProposal?.id) {
        const { data: feedbackRows } = await client
          .from("agent_feedback_events")
          .select("event_type")
          .eq("proposal_id", existingProposal.id);

        for (const row of feedbackRows ?? []) {
          if (row.event_type === "viewed") views += 1;
          if (row.event_type === "clicked") clicks += 1;
          if (row.event_type === "dismissed") dismisses += 1;
          if (row.event_type === "ignored") ignores += 1;
        }
      }

      const rankingFeatures = buildRankingFeatures(opportunity, trustScore);
      const engagementBoost = Math.min(12, clicks * 4);
      const dismissalPenalty = Math.min(18, dismisses * 6 + ignores * 4);
      const overservedPenalty = views >= 8 && clicks === 0 ? 8 : 0;
      const adjustedScore = Math.max(
        0,
        Math.min(
          100,
          Number(rankingFeatures.score_total ?? 0) + engagementBoost - dismissalPenalty - overservedPenalty,
        ),
      );
      const reasons = buildSuggestionReasons(opportunity, trustScore);

      const proposal = {
        opportunity_id: opportunity.id,
        proposal_kind: opportunity.kind,
        status: policy.initial_status,
        approval_policy: policy.approval_policy,
        target_surface: policy.target_surface,
        city: opportunity.city ?? null,
        audience_user_ids:
          opportunity.kind === "introduction" &&
          Array.isArray(opportunity.metadata?.candidate_user_ids)
            ? opportunity.metadata.candidate_user_ids
            : audienceUserIds,
        title: opportunity.title,
        body: opportunity.summary ?? null,
        rationale: {
          generated_by: "agent-proposal-generator",
          trust_score: trustScore,
          policy,
          feedback_summary: {
            views,
            clicks,
            dismisses,
            ignores,
          },
        },
        ranking_features: rankingFeatures,
        model_version: "rules-v1",
        confidence_score: adjustedScore,
        approval_required: policy.approval_required,
        expires_at: opportunity.ends_at ?? opportunity.starts_at ?? null,
      };

      const { data: proposalRow, error: proposalError } = await client
        .from("agent_proposals")
        .upsert(proposal, { onConflict: "opportunity_id,target_surface" })
        .select("id")
        .single();
      if (proposalError || !proposalRow) throw proposalError ?? new Error("proposal_upsert_failed");

      const { data: existingReasons } = await client
        .from("agent_suggestion_reasons")
        .select("id")
        .eq("proposal_id", proposalRow.id);

      if ((existingReasons?.length ?? 0) > 0) {
        await client.from("agent_suggestion_reasons").delete().eq("proposal_id", proposalRow.id);
        updated += 1;
      } else {
        created += 1;
      }

      if (reasons.length > 0) {
        await client.from("agent_suggestion_reasons").insert(
          reasons.map((reason) => ({
            proposal_id: proposalRow.id,
            user_id: audienceUserIds.length === 1 ? audienceUserIds[0] : null,
            ...reason,
          }))
        );
      }
    }

    return jsonResponse({
      ok: true,
      created,
      updated,
      scanned: opportunities?.length ?? 0,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
