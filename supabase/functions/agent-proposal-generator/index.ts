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

function fallbackProposalExpiry(opportunity: {
  kind: string;
  starts_at?: string | null;
  ends_at?: string | null;
  expires_at?: string | null;
}) {
  if (opportunity.expires_at) return opportunity.expires_at;
  if (opportunity.ends_at) return opportunity.ends_at;
  if (opportunity.starts_at) return opportunity.starts_at;

  const now = Date.now();
  const ttlDays = opportunity.kind === "group" ? 21 : opportunity.kind === "introduction" ? 7 : 14;
  return new Date(now + ttlDays * 24 * 60 * 60 * 1000).toISOString();
}

function normalizeCategory(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function normalizeCity(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
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
        expires_at,
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

    const categories = Array.from(
      new Set(
        (opportunities ?? [])
          .map((opportunity) =>
            typeof opportunity.feature_snapshot?.category === "string" && opportunity.feature_snapshot.category.trim().length > 0
              ? opportunity.feature_snapshot.category.trim()
              : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );
    const cities = Array.from(
      new Set(
        (opportunities ?? [])
          .map((opportunity) =>
            typeof opportunity.city === "string" && opportunity.city.trim().length > 0
              ? opportunity.city.trim()
              : null
          )
          .filter((value): value is string => Boolean(value))
      )
    );

    const { data: candidateGroups } = categories.length > 0 && cities.length > 0
      ? await client
          .from("groups")
          .select("id, category, city")
          .in("category", categories)
          .in("city", cities)
      : { data: [] };

    const relevantGroupIds = Array.from(new Set((candidateGroups ?? []).map((group) => group.id)));
    const { data: relevantMemberships } = relevantGroupIds.length > 0
      ? await client
          .from("group_memberships")
          .select("group_id, user_id")
          .in("group_id", relevantGroupIds)
      : { data: [] };

    const groupRows = (candidateGroups ?? []) as Array<{ id: string; category: string | null; city: string | null }>;
    const membershipRows = (relevantMemberships ?? []) as Array<{ group_id: string; user_id: string }>;
    const groupById = new Map(groupRows.map((group) => [group.id, group]));
    const audienceByCityCategory = new Map<string, Set<string>>();

    for (const membership of membershipRows) {
      const group = groupById.get(membership.group_id);
      if (!group) continue;
      const groupCategory = normalizeCategory(group.category);
      const groupCity = normalizeCity(group.city);
      if (!groupCategory || !groupCity) continue;
      const key = `${groupCity}:${groupCategory}`;
      if (!audienceByCityCategory.has(key)) {
        audienceByCityCategory.set(key, new Set());
      }
      audienceByCityCategory.get(key)?.add(membership.user_id);
    }

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

      const opportunityCategory = normalizeCategory(opportunity.feature_snapshot?.category);
      const opportunityCity = normalizeCity(opportunity.city);
      const affinityAudience =
        opportunity.kind === "event" && opportunityCategory && opportunityCity
          ? Array.from(audienceByCityCategory.get(`${opportunityCity}:${opportunityCategory}`) ?? [])
          : [];

      const { data: socialRows } = opportunity.kind === "event"
        ? await client
            .from("agent_event_rsvps")
            .select("user_id, status")
            .eq("opportunity_id", opportunity.id)
            .in("status", ["going", "interested"])
        : { data: [] };

      let socialGoing = 0;
      let socialInterested = 0;
      for (const row of socialRows ?? []) {
        if (row.status === "going") socialGoing += 1;
        if (row.status === "interested") socialInterested += 1;
      }

      const computedAudienceUserIds = Array.from(
        new Set(
          opportunity.kind === "event"
            ? [
                ...affinityAudience,
                ...((socialRows ?? []).map((row) => row.user_id).filter(Boolean)),
                ...audienceUserIds,
              ]
            : opportunity.kind === "introduction" &&
              Array.isArray(opportunity.metadata?.candidate_user_ids)
                ? opportunity.metadata.candidate_user_ids
                : audienceUserIds
        )
      );

      const rankingContext = {
        audience_size: computedAudienceUserIds.length,
        affinity_user_count: affinityAudience.length,
        social_going_count: socialGoing,
        social_interested_count: socialInterested,
      };

      const rankingFeatures = buildRankingFeatures(opportunity, trustScore, rankingContext);
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
      const reasons = buildSuggestionReasons(opportunity, trustScore, rankingContext);

      const personalizationScore = Number(rankingFeatures.personalization_score ?? 0);
      const hasMeaningfulAudience = computedAudienceUserIds.length >= 3;
      const hasSocialProof = socialGoing + socialInterested >= 2;
      const eventAutoSuggestEligible =
        opportunity.kind !== "event" ||
        (
          adjustedScore >= 68 &&
          personalizationScore >= 18 &&
          (hasMeaningfulAudience || hasSocialProof)
        );

      const finalPolicy =
        opportunity.kind === "event" && !eventAutoSuggestEligible
          ? {
              ...policy,
              approval_policy: "organizer_confirm",
              approval_required: true,
              initial_status: "draft",
            }
          : policy;

      const proposal = {
        opportunity_id: opportunity.id,
        proposal_kind: opportunity.kind,
        status: finalPolicy.initial_status,
        approval_policy: finalPolicy.approval_policy,
        target_surface: finalPolicy.target_surface,
        city: opportunity.city ?? null,
        audience_user_ids: computedAudienceUserIds,
        title: opportunity.title,
        body: opportunity.summary ?? null,
        rationale: {
          generated_by: "agent-proposal-generator",
          trust_score: trustScore,
          policy: finalPolicy,
          personalization: rankingContext,
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
        approval_required: finalPolicy.approval_required,
        expires_at: fallbackProposalExpiry(opportunity),
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
            user_id: computedAudienceUserIds.length === 1 ? computedAudienceUserIds[0] : null,
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
