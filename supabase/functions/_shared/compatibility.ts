// @ts-nocheck

export type CompatibilityReason = {
  code: string;
  label: string;
  weight: number;
  evidence?: Record<string, unknown>;
};

export type CompatibilityPenalty = {
  code: string;
  label: string;
  weight: number;
  evidence?: Record<string, unknown>;
};

export type CompatibilityInput = {
  intent: "friendship" | "dating" | "event_companion" | "community_intro";
  profileA?: Record<string, unknown> | null;
  profileB?: Record<string, unknown> | null;
  sharedNiches?: string[];
  sharedGroups?: string[];
  sharedEvents?: string[];
  companionEvents?: string[];
  languageOverlap?: string[];
  interactionScore?: number;
  blocked?: boolean;
  reported?: boolean;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function pushReason(reasons: CompatibilityReason[], code: string, label: string, weight: number, evidence = {}) {
  if (weight <= 0) return;
  reasons.push({ code, label, weight, evidence });
}

function pushPenalty(penalties: CompatibilityPenalty[], code: string, label: string, weight: number, evidence = {}) {
  if (weight <= 0) return;
  penalties.push({ code, label, weight, evidence });
}

function intentCompatible(intentA: string | null, intentB: string | null, targetIntent: string) {
  if (targetIntent === "event_companion" || targetIntent === "community_intro") {
    return true;
  }
  if (!intentA || !intentB) return false;
  if (targetIntent === "dating") {
    return ["dating", "long_term", "marriage"].includes(intentA) &&
      ["dating", "long_term", "marriage"].includes(intentB);
  }
  return intentA === "friendship" || intentB === "friendship";
}

export function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function compatibilityPairKey(a: string, b: string) {
  const [userA, userB] = pairOrder(a, b);
  return `${userA}:${userB}`;
}

export function computeCompatibilityScore(input: CompatibilityInput) {
  const reasons: CompatibilityReason[] = [];
  const penalties: CompatibilityPenalty[] = [];
  const profileA = input.profileA ?? {};
  const profileB = input.profileB ?? {};
  const cityA = cleanString(profileA.city);
  const cityB = cleanString(profileB.city);
  const intentA = cleanString(profileA.intent);
  const intentB = cleanString(profileB.intent);
  const languagesA = stringArray(profileA.languages).map(cleanString).filter(Boolean);
  const languagesB = stringArray(profileB.languages).map(cleanString).filter(Boolean);
  const languageOverlap = input.languageOverlap?.length
    ? input.languageOverlap
    : languagesA.filter((language) => languagesB.includes(language));

  if (input.blocked) pushPenalty(penalties, "blocked_pair", "One user blocked the other", 100);
  if (input.reported) pushPenalty(penalties, "reported_pair", "One user reported the other", 100);

  const sharedNiches = input.sharedNiches ?? [];
  const sharedGroups = input.sharedGroups ?? [];
  const sharedEvents = input.sharedEvents ?? [];
  const companionEvents = input.companionEvents ?? [];

  pushReason(reasons, "same_city", "Same city", cityA && cityA === cityB ? 8 : 0, { city: cityA });
  pushReason(reasons, "shared_niches", "Shared interests", Math.min(28, sharedNiches.length * 14), { niches: sharedNiches });
  pushReason(reasons, "shared_groups", "Shared groups", Math.min(24, sharedGroups.length * 12), { group_ids: sharedGroups });
  pushReason(reasons, "shared_event_interest", "Interested in the same events", Math.min(28, sharedEvents.length * 14), { event_ids: sharedEvents });
  pushReason(reasons, "event_companion_request", "Both asked for company", Math.min(34, companionEvents.length * 34), { event_ids: companionEvents });
  pushReason(reasons, "language_overlap", "Shared language", Math.min(12, languageOverlap.length * 6), { languages: languageOverlap });
  pushReason(reasons, "interaction_history", "Existing interaction signal", Math.min(20, Math.max(0, Number(input.interactionScore ?? 0)) * 0.4), {
    interaction_score: input.interactionScore ?? 0,
  });
  pushReason(
    reasons,
    "intent_fit",
    "Compatible intent",
    intentCompatible(intentA, intentB, input.intent) ? 8 : 0,
    { intent_a: intentA, intent_b: intentB, target_intent: input.intent },
  );

  if (!intentCompatible(intentA, intentB, input.intent) && input.intent === "dating") {
    pushPenalty(penalties, "intent_mismatch", "Dating intent does not match", 30, { intent_a: intentA, intent_b: intentB });
  }

  const rawScore = reasons.reduce((sum, reason) => sum + reason.weight, 0) -
    penalties.reduce((sum, penalty) => sum + penalty.weight, 0);
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    score,
    reasons,
    penalties,
    reason_codes: reasons.map((reason) => reason.code),
    feature_snapshot: {
      city_match: Boolean(cityA && cityA === cityB),
      intent_a: intentA,
      intent_b: intentB,
      target_intent: input.intent,
      shared_niche_count: sharedNiches.length,
      shared_group_count: sharedGroups.length,
      shared_event_count: sharedEvents.length,
      companion_event_count: companionEvents.length,
      language_overlap_count: languageOverlap.length,
      interaction_score: input.interactionScore ?? 0,
    },
  };
}
