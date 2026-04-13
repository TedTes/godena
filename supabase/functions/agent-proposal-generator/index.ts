// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  approvalPolicyForOpportunity,
  buildRankingFeatures,
  buildSuggestionReasons,
  normalizeKey,
  opportunityContextKeys,
} from "../_shared/agent_pipeline.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NICHE_CATEGORY_MAP: Record<string, string[]> = {
  live_music: ["culture"],
  sports: ["sports"],
  books_ideas: ["culture"],
  arts_culture: ["culture"],
  food_drink: ["food_drink"],
  outdoors: ["outdoors"],
  wellness: ["wellness"],
  faith_community: ["faith", "community"],
  volunteering: ["community"],
  founders_careers: ["professional"],
};

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

function normalizeInterestCategory(value: unknown) {
  const raw = normalizeCategory(value);
  if (!raw) return null;
  const normalized = raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (
    normalized.includes("music") ||
    normalized.includes("concert") ||
    normalized.includes("arts") ||
    normalized.includes("theatre") ||
    normalized.includes("theater") ||
    normalized.includes("comedy") ||
    normalized.includes("dance") ||
    normalized.includes("culture")
  ) return "culture";
  if (normalized.includes("sport")) return "sports";
  if (normalized.includes("food") || normalized.includes("drink") || normalized.includes("coffee")) return "food_drink";
  if (normalized.includes("outdoor") || normalized.includes("hiking") || normalized.includes("run")) return "outdoors";
  if (normalized.includes("health") || normalized.includes("wellness") || normalized.includes("fitness")) return "wellness";
  if (normalized.includes("faith") || normalized.includes("religion") || normalized.includes("church")) return "faith";
  if (normalized.includes("business") || normalized.includes("career") || normalized.includes("professional")) return "professional";
  if (normalized.includes("community") || normalized.includes("family") || normalized.includes("miscellaneous")) return "community";

  return normalized;
}

function hasUsableEventData(opportunity: Record<string, unknown>) {
  const metadata = typeof opportunity.metadata === "object" && opportunity.metadata
    ? opportunity.metadata as Record<string, unknown>
    : {};

  return Boolean(
    typeof opportunity.title === "string" &&
    opportunity.title.trim().length > 0 &&
    opportunity.starts_at &&
    opportunity.city &&
    (
      opportunity.venue_name ||
      typeof metadata.source_url === "string"
    ),
  );
}

function titleText(opportunity: Record<string, unknown>) {
  return typeof opportunity.title === "string" ? opportunity.title.trim().toLowerCase() : "";
}

function sourceText(opportunity: Record<string, unknown>) {
  const featureSnapshot = typeof opportunity.feature_snapshot === "object" && opportunity.feature_snapshot
    ? opportunity.feature_snapshot as Record<string, unknown>
    : {};
  return typeof featureSnapshot.source === "string" ? featureSnapshot.source.trim().toLowerCase() : "";
}

function sourceQualityFlags(opportunity: Record<string, unknown>) {
  const title = titleText(opportunity);
  const source = sourceText(opportunity);
  const flags: string[] = [];

  if (source === "ticketmaster") {
    if (/\bplus ups?\b/.test(title)) flags.push("ticketmaster_plus_up");
    if (/\bfan access\b/.test(title)) flags.push("ticketmaster_fan_access");
    if (/\bguided tours?\b|\bballpark tours?\b|\barena tours?\b|\bstadium tours?\b/.test(title)) {
      flags.push("ticketmaster_venue_tour");
    }
    if (/\bvip\b|\bpackage\b|\bupgrade\b|\badd[- ]?on\b|\bparking\b/.test(title)) {
      flags.push("ticketmaster_package_or_addon");
    }
  }

  return flags;
}

function normalizedTitleKey(opportunity: Record<string, unknown>) {
  const title = titleText(opportunity)
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title || null;
}

function repetitionQualityFlags(opportunity: Record<string, unknown>, titleOccurrenceIndex: number) {
  const title = titleText(opportunity);
  const flags: string[] = [];
  const isGeneralAdmission = /\bgeneral admission\b/.test(title);
  const titleLimit = isGeneralAdmission ? 1 : 2;

  if (isGeneralAdmission) flags.push("general_admission");
  if (titleOccurrenceIndex > titleLimit) flags.push("recurring_title_over_cap");

  return flags;
}

function qualityPenaltyForFlags(flags: string[]) {
  let penalty = 0;
  for (const flag of flags) {
    if (flag === "general_admission") penalty += 10;
    else if (flag === "recurring_title_over_cap") penalty += 24;
    else penalty += 18;
  }
  return Math.min(40, penalty);
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string) {
  if (!key || !value || key === value) return;
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
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
          .map((opportunity) => normalizeInterestCategory(opportunity.feature_snapshot?.category))
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

    const cityContexts = cities
      .map((value) => normalizeKey(value))
      .filter((value): value is string => Boolean(value))
      .map((value) => `city:${value}`);
    const opportunityContextKeysById = new Map<string, string[]>(
      (opportunities ?? []).map((opportunity) => [opportunity.id, opportunityContextKeys(opportunity)]),
    );
    const opportunityContexts = Array.from(new Set(Array.from(opportunityContextKeysById.values()).flat()));
    const contextKeys = Array.from(new Set([...cityContexts, ...opportunityContexts]));
    const { data: allInterestRows } =
      categories.length > 0 || contextKeys.length > 0
        ? await client
            .from("agent_user_interest_profiles")
            .select("user_id, interest_type, interest_key, score")
            .in("interest_type", ["category", "context"])
        : { data: [] };

    const interestRows = ((allInterestRows ?? []) as Array<{
      user_id: string;
      interest_type: string;
      interest_key: string;
      score: number;
    }>).filter((row) => {
      if (row.interest_type === "category") {
        return categories.includes(row.interest_key);
      }
      if (row.interest_type === "context") {
        return contextKeys.includes(row.interest_key);
      }
      return false;
    });

    const categoryInterestByUser = new Map<string, Map<string, number>>();
    const contextInterestByUser = new Map<string, Map<string, number>>();
    for (const row of interestRows) {
      const target = row.interest_type === "category" ? categoryInterestByUser : contextInterestByUser;
      if (!target.has(row.interest_key)) target.set(row.interest_key, new Map());
      target.get(row.interest_key)?.set(row.user_id, Number(row.score ?? 0));
    }

    const { data: selectedNicheRows } =
      categories.length > 0
        ? await client
            .from("agent_user_selected_niches")
            .select("user_id, niche_key")
        : { data: [] };

    for (const row of (selectedNicheRows ?? []) as Array<{ user_id: string; niche_key: string }>) {
      for (const category of NICHE_CATEGORY_MAP[row.niche_key] ?? []) {
        if (!categories.includes(category)) continue;
        const existing = categoryInterestByUser.get(category) ?? new Map<string, number>();
        existing.set(row.user_id, Math.max(Number(existing.get(row.user_id) ?? 0), 30));
        categoryInterestByUser.set(category, existing);
      }
    }

    const opportunityRows = opportunities ?? [];
    const opportunityIdList = opportunityRows.map((opportunity) => opportunity.id);
    const externalRecordIds = opportunityRows
      .map((opportunity) => opportunity.primary_external_record_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    const eventOpportunityIds = opportunityRows
      .filter((opportunity) => opportunity.kind === "event")
      .map((opportunity) => opportunity.id);

    const { data: trustRows } = externalRecordIds.length > 0
      ? await client
          .from("agent_trust_scores")
          .select("external_record_id, overall_score")
          .in("external_record_id", externalRecordIds)
      : { data: [] };

    const trustByExternalRecordId = new Map(
      ((trustRows ?? []) as Array<{ external_record_id: string; overall_score: number }>)
        .map((row) => [row.external_record_id, Number(row.overall_score ?? 0)]),
    );

    const policyByOpportunityId = new Map(
      opportunityRows.map((opportunity) => [
        opportunity.id,
        approvalPolicyForOpportunity(
          opportunity.kind,
          opportunity.primary_external_record_id
            ? Number(trustByExternalRecordId.get(opportunity.primary_external_record_id) ?? 0)
            : 0,
        ),
      ]),
    );

    const { data: existingProposalRows } = opportunityIdList.length > 0
      ? await client
          .from("agent_proposals")
          .select("id, opportunity_id, target_surface")
          .in("opportunity_id", opportunityIdList)
      : { data: [] };

    const existingProposalByKey = new Map(
      ((existingProposalRows ?? []) as Array<{ id: string; opportunity_id: string; target_surface: string }>)
        .map((proposal) => [`${proposal.opportunity_id}:${proposal.target_surface}`, proposal]),
    );
    const existingProposalIds = ((existingProposalRows ?? []) as Array<{ id: string }>).map((proposal) => proposal.id);

    const { data: feedbackRows } = existingProposalIds.length > 0
      ? await client
          .from("agent_feedback_events")
          .select("proposal_id, event_type")
          .in("proposal_id", existingProposalIds)
      : { data: [] };

    const feedbackByProposalId = new Map<string, { views: number; clicks: number; dismisses: number; ignores: number }>();
    for (const row of (feedbackRows ?? []) as Array<{ proposal_id: string; event_type: string }>) {
      const summary = feedbackByProposalId.get(row.proposal_id) ?? { views: 0, clicks: 0, dismisses: 0, ignores: 0 };
      if (row.event_type === "viewed") summary.views += 1;
      if (row.event_type === "clicked") summary.clicks += 1;
      if (row.event_type === "dismissed") summary.dismisses += 1;
      if (row.event_type === "ignored") summary.ignores += 1;
      feedbackByProposalId.set(row.proposal_id, summary);
    }

    const { data: socialRsvpRows } = eventOpportunityIds.length > 0
      ? await client
          .from("agent_event_rsvps")
          .select("opportunity_id, user_id, status")
          .in("opportunity_id", eventOpportunityIds)
          .in("status", ["going", "interested"])
      : { data: [] };

    const socialByOpportunityId = new Map<string, Array<{ user_id: string; status: string }>>();
    for (const row of (socialRsvpRows ?? []) as Array<{ opportunity_id: string; user_id: string; status: string }>) {
      const rows = socialByOpportunityId.get(row.opportunity_id) ?? [];
      rows.push(row);
      socialByOpportunityId.set(row.opportunity_id, rows);
    }
    const socialUserIds = Array.from(new Set(
      ((socialRsvpRows ?? []) as Array<{ user_id: string }>).map((row) => row.user_id).filter(Boolean),
    ));

    const { data: connectionRows } = socialUserIds.length > 0
      ? await client
          .from("connections")
          .select("user_a_id, user_b_id")
          .eq("status", "accepted")
          .or(`user_a_id.in.(${socialUserIds.join(",")}),user_b_id.in.(${socialUserIds.join(",")})`)
      : { data: [] };

    const connectedUsersBySocialUserId = new Map<string, Set<string>>();
    for (const row of (connectionRows ?? []) as Array<{ user_a_id: string; user_b_id: string }>) {
      if (socialUserIds.includes(row.user_a_id)) addToSetMap(connectedUsersBySocialUserId, row.user_a_id, row.user_b_id);
      if (socialUserIds.includes(row.user_b_id)) addToSetMap(connectedUsersBySocialUserId, row.user_b_id, row.user_a_id);
    }

    const { data: socialMembershipRows } = socialUserIds.length > 0
      ? await client
          .from("group_memberships")
          .select("group_id, user_id")
          .in("user_id", socialUserIds)
      : { data: [] };
    const socialGroupIds = Array.from(new Set(
      ((socialMembershipRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id).filter(Boolean),
    ));
    const { data: groupmateRows } = socialGroupIds.length > 0
      ? await client
          .from("group_memberships")
          .select("group_id, user_id")
          .in("group_id", socialGroupIds)
      : { data: [] };
    const membersByGroupId = new Map<string, Set<string>>();
    for (const row of (groupmateRows ?? []) as Array<{ group_id: string; user_id: string }>) {
      addToSetMap(membersByGroupId, row.group_id, row.user_id);
    }
    const groupmatesBySocialUserId = new Map<string, Set<string>>();
    for (const row of (socialMembershipRows ?? []) as Array<{ group_id: string; user_id: string }>) {
      for (const memberUserId of membersByGroupId.get(row.group_id) ?? []) {
        addToSetMap(groupmatesBySocialUserId, row.user_id, memberUserId);
      }
    }

    let created = 0;
    let updated = 0;
    const proposalsToUpsert = [];
    const reasonsByProposalKey = new Map<string, Array<Record<string, unknown>>>();
    const audienceByProposalKey = new Map<string, string[]>();
    const titleOccurrenceByKey = new Map<string, number>();

    for (const opportunity of opportunityRows) {
      const trustScore = opportunity.primary_external_record_id
        ? Number(trustByExternalRecordId.get(opportunity.primary_external_record_id) ?? 0)
        : 0;
      const policy = policyByOpportunityId.get(opportunity.id) ?? approvalPolicyForOpportunity(opportunity.kind, trustScore);
      const existingProposal = existingProposalByKey.get(`${opportunity.id}:${policy.target_surface}`);
      const feedbackSummary = existingProposal?.id
        ? feedbackByProposalId.get(existingProposal.id) ?? { views: 0, clicks: 0, dismisses: 0, ignores: 0 }
        : { views: 0, clicks: 0, dismisses: 0, ignores: 0 };

      const opportunityCategory = normalizeInterestCategory(opportunity.feature_snapshot?.category);
      const opportunityCity = normalizeKey(opportunity.city);

      const scoredAudience =
        opportunity.kind === "event" && opportunityCategory
            ? Array.from(categoryInterestByUser.get(opportunityCategory)?.entries() ?? [])
              .map(([userId, categoryScore]) => {
                const cityScore = opportunityCity
                  ? Number(contextInterestByUser.get(`city:${opportunityCity}`)?.get(userId) ?? 0)
                  : 0;
                const patternScore = (opportunityContextKeysById.get(opportunity.id) ?? [])
                  .reduce(
                    (sum, key) => sum + Number(contextInterestByUser.get(key)?.get(userId) ?? 0),
                    0,
                  );
                return { userId, score: categoryScore + cityScore + patternScore, categoryScore, cityScore, patternScore };
              })
              .filter((row) => row.score > 0)
              .sort((a, b) => b.score - a.score)
          : [];

      const affinityAudience = scoredAudience.map((row) => row.userId);
      const interestMatchScore =
        scoredAudience.length > 0
          ? Math.max(0, Math.min(100, Math.round((scoredAudience[0].score + Math.min(scoredAudience.length, 5) * 4))))
          : 0;

      let socialGoing = 0;
      let socialInterested = 0;
      const socialRows = socialByOpportunityId.get(opportunity.id) ?? [];
      for (const row of socialRows ?? []) {
        if (row.status === "going") socialGoing += 1;
        if (row.status === "interested") socialInterested += 1;
      }
      const connectionSocialAudience = new Set<string>();
      const groupSocialAudience = new Set<string>();
      for (const row of socialRows ?? []) {
        for (const userId of connectedUsersBySocialUserId.get(row.user_id) ?? []) {
          connectionSocialAudience.add(userId);
        }
        for (const userId of groupmatesBySocialUserId.get(row.user_id) ?? []) {
          groupSocialAudience.add(userId);
        }
      }
      const socialRsvpUserIds = socialRows.map((row) => row.user_id).filter(Boolean);
      for (const userId of socialRsvpUserIds) {
        connectionSocialAudience.delete(userId);
        groupSocialAudience.delete(userId);
      }

      const computedAudienceUserIds = Array.from(
        new Set(
          opportunity.kind === "event"
            ? [
                ...affinityAudience,
                ...socialRsvpUserIds,
                ...Array.from(connectionSocialAudience),
                ...Array.from(groupSocialAudience),
                ...audienceUserIds,
              ]
            : opportunity.kind === "introduction" &&
              Array.isArray(opportunity.metadata?.candidate_user_ids)
                ? opportunity.metadata.candidate_user_ids
                : audienceUserIds
        )
      );

      const contextMatchScore = scoredAudience.length > 0 ? scoredAudience[0].cityScore + scoredAudience[0].patternScore : 0;
      const rankingContext = {
        audience_size: computedAudienceUserIds.length,
        affinity_user_count: affinityAudience.length,
        social_going_count: socialGoing,
        social_interested_count: socialInterested,
        connection_social_user_count: connectionSocialAudience.size,
        group_social_user_count: groupSocialAudience.size,
        interest_match_score: interestMatchScore,
        context_match_score: contextMatchScore,
      };

      const titleKey = normalizedTitleKey(opportunity);
      const titleOccurrenceIndex = titleKey ? Number(titleOccurrenceByKey.get(titleKey) ?? 0) + 1 : 1;
      if (titleKey) titleOccurrenceByKey.set(titleKey, titleOccurrenceIndex);

      const rankingFeatures = buildRankingFeatures(opportunity, trustScore, rankingContext);
      const sourceFlags = sourceQualityFlags(opportunity);
      const repetitionFlags = repetitionQualityFlags(opportunity, titleOccurrenceIndex);
      const qualityFlags = Array.from(new Set([...sourceFlags, ...repetitionFlags]));
      const qualityPenalty = qualityPenaltyForFlags(qualityFlags);
      const engagementBoost = Math.min(12, feedbackSummary.clicks * 4);
      const dismissalPenalty = Math.min(18, feedbackSummary.dismisses * 6 + feedbackSummary.ignores * 4);
      const overservedPenalty = feedbackSummary.views >= 8 && feedbackSummary.clicks === 0 ? 8 : 0;
      const adjustedScore = Math.max(
        0,
        Math.min(
          100,
          Number(rankingFeatures.score_total ?? 0) + engagementBoost - dismissalPenalty - overservedPenalty - qualityPenalty,
        ),
      );
      const reasons = buildSuggestionReasons(opportunity, trustScore, rankingContext);

      const personalizationScore = Number(rankingFeatures.personalization_score ?? 0);
      const interestScore = Number(rankingFeatures.interest_match_score ?? 0);
      const trustedSource = trustScore >= 70;
      const hasStarterAudience = computedAudienceUserIds.length >= 1;
      const hasSocialProof = socialGoing + socialInterested >= 2;
      const hasAffinityMatch = affinityAudience.length >= 1;
      const hasUsableInterest = interestScore >= 15;
      const hasValidEventData = hasUsableEventData(opportunity);
      const hasBlockingQualityIssue = sourceFlags.length > 0 || repetitionFlags.includes("recurring_title_over_cap");
      const minimumAutoApprovalScore =
        hasAffinityMatch && hasUsableInterest
          ? 38
          : hasSocialProof
            ? 35
            : 50;
      const eventAutoSuggestEligible =
        opportunity.kind !== "event" ||
        (
          trustedSource &&
          hasValidEventData &&
          !hasBlockingQualityIssue &&
          hasStarterAudience &&
          adjustedScore >= minimumAutoApprovalScore &&
          (
            hasAffinityMatch ||
            hasUsableInterest ||
            personalizationScore >= 18 ||
            hasSocialProof
          )
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
      const approvalDecision = {
        event_auto_suggest_eligible: eventAutoSuggestEligible,
        trusted_source: trustedSource,
        valid_event_data: hasValidEventData,
        has_audience: hasStarterAudience,
        has_affinity_match: hasAffinityMatch,
        has_usable_interest: hasUsableInterest,
        has_social_proof: hasSocialProof,
        source_quality_flags: qualityFlags,
        quality_penalty: qualityPenalty,
        title_occurrence_index: titleOccurrenceIndex,
        title_occurrence_key: titleKey,
        adjusted_score: adjustedScore,
        minimum_score: minimumAutoApprovalScore,
      };

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
          feedback_summary: feedbackSummary,
          approval_decision: approvalDecision,
        },
        ranking_features: {
          ...rankingFeatures,
          context_match_score: contextMatchScore,
          connection_social_user_count: connectionSocialAudience.size,
          group_social_user_count: groupSocialAudience.size,
          source_quality_flags: qualityFlags,
          quality_penalty: qualityPenalty,
          title_occurrence_index: titleOccurrenceIndex,
          title_occurrence_key: titleKey,
        },
        model_version: "rules-v8",
        confidence_score: adjustedScore,
        approval_required: finalPolicy.approval_required,
        expires_at: fallbackProposalExpiry(opportunity),
      };

      proposalsToUpsert.push(proposal);
      const proposalKey = `${opportunity.id}:${finalPolicy.target_surface}`;
      audienceByProposalKey.set(proposalKey, computedAudienceUserIds);
      if (existingProposalByKey.has(proposalKey)) updated += 1;
      else created += 1;

      if (reasons.length > 0) {
        reasonsByProposalKey.set(
          proposalKey,
          reasons.map((reason) => ({
            user_id: computedAudienceUserIds.length === 1 ? computedAudienceUserIds[0] : null,
            ...reason,
          })),
        );
      }
    }

    const { data: proposalRows, error: proposalError } = proposalsToUpsert.length > 0
      ? await client
          .from("agent_proposals")
          .upsert(proposalsToUpsert, { onConflict: "opportunity_id,target_surface" })
          .select("id, opportunity_id, target_surface")
      : { data: [], error: null };

    if (proposalError) throw proposalError;

    const upsertedProposalRows = (proposalRows ?? []) as Array<{ id: string; opportunity_id: string; target_surface: string }>;
    const proposalIds = upsertedProposalRows.map((proposal) => proposal.id);

    if (proposalIds.length > 0) {
      const [deleteReasonsRes, deleteAudienceRes] = await Promise.all([
        client
          .from("agent_suggestion_reasons")
          .delete()
          .in("proposal_id", proposalIds),
        client
          .from("agent_proposal_audience")
          .delete()
          .in("proposal_id", proposalIds),
      ]);
      if (deleteReasonsRes.error) throw deleteReasonsRes.error;
      if (deleteAudienceRes.error) throw deleteAudienceRes.error;
    }

    const reasonRows = [];
    const audienceRows = [];
    for (const proposal of upsertedProposalRows) {
      const key = `${proposal.opportunity_id}:${proposal.target_surface}`;
      for (const reason of reasonsByProposalKey.get(key) ?? []) {
        reasonRows.push({
          proposal_id: proposal.id,
          ...reason,
        });
      }
      for (const userId of audienceByProposalKey.get(key) ?? []) {
        audienceRows.push({
          proposal_id: proposal.id,
          user_id: userId,
        });
      }
    }

    if (reasonRows.length > 0) {
      const { error: insertReasonsError } = await client
        .from("agent_suggestion_reasons")
        .insert(reasonRows);
      if (insertReasonsError) throw insertReasonsError;
    }

    if (audienceRows.length > 0) {
      const { error: insertAudienceError } = await client
        .from("agent_proposal_audience")
        .insert(audienceRows);
      if (insertAudienceError) throw insertAudienceError;
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
