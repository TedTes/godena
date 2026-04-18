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
  weights?: Partial<CompatibilityWeights>;
};

export type CompatibilityWeights = {
  sameCity: number;
  sharedNiche: number;
  sharedNicheMax: number;
  sharedGroup: number;
  sharedGroupMax: number;
  sharedEvent: number;
  sharedEventMax: number;
  companionEvent: number;
  companionEventMax: number;
  language: number;
  languageMax: number;
  interactionMultiplier: number;
  interactionMax: number;
  intentFit: number;
  blockedPenalty: number;
  reportedPenalty: number;
  datingIntentMismatchPenalty: number;
};

export const DEFAULT_COMPATIBILITY_WEIGHTS: CompatibilityWeights = {
  sameCity: 8,
  sharedNiche: 14,
  sharedNicheMax: 28,
  sharedGroup: 12,
  sharedGroupMax: 24,
  sharedEvent: 14,
  sharedEventMax: 28,
  companionEvent: 34,
  companionEventMax: 34,
  language: 6,
  languageMax: 12,
  interactionMultiplier: 0.4,
  interactionMax: 20,
  intentFit: 8,
  blockedPenalty: 100,
  reportedPenalty: 100,
  datingIntentMismatchPenalty: 30,
};

const WEIGHT_KEY_ALIASES: Record<string, keyof CompatibilityWeights> = {
  same_city: "sameCity",
  shared_niche: "sharedNiche",
  shared_niche_max: "sharedNicheMax",
  shared_group: "sharedGroup",
  shared_group_max: "sharedGroupMax",
  shared_event: "sharedEvent",
  shared_event_max: "sharedEventMax",
  companion_event: "companionEvent",
  companion_event_max: "companionEventMax",
  language: "language",
  language_max: "languageMax",
  interaction_multiplier: "interactionMultiplier",
  interaction_max: "interactionMax",
  intent_fit: "intentFit",
  blocked_penalty: "blockedPenalty",
  reported_penalty: "reportedPenalty",
  dating_intent_mismatch_penalty: "datingIntentMismatchPenalty",
};

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isString(value: string | null): value is string {
  return value !== null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeCompatibilityWeights(value: unknown): CompatibilityWeights {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_COMPATIBILITY_WEIGHTS;

  const weights = { ...DEFAULT_COMPATIBILITY_WEIGHTS };
  const input = value as Record<string, unknown>;
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey in weights
      ? rawKey as keyof CompatibilityWeights
      : WEIGHT_KEY_ALIASES[rawKey];
    if (!key) continue;
    const parsed = positiveNumber(rawValue);
    if (parsed !== null) weights[key] = parsed;
  }

  return weights;
}

function pushReason(
  reasons: CompatibilityReason[],
  code: string,
  label: string,
  weight: number,
  evidence: Record<string, unknown> = {},
) {
  if (weight <= 0) return;
  reasons.push({ code, label, weight, evidence });
}

function pushPenalty(
  penalties: CompatibilityPenalty[],
  code: string,
  label: string,
  weight: number,
  evidence: Record<string, unknown> = {},
) {
  if (weight <= 0) return;
  penalties.push({ code, label, weight, evidence });
}

function intentCompatible(intentA: string | null, intentB: string | null, targetIntent: string): boolean {
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
  const weights = normalizeCompatibilityWeights(input.weights);
  const reasons: CompatibilityReason[] = [];
  const penalties: CompatibilityPenalty[] = [];
  const profileA = input.profileA ?? {};
  const profileB = input.profileB ?? {};
  const cityA = cleanString(profileA.city);
  const cityB = cleanString(profileB.city);
  const intentA = cleanString(profileA.intent);
  const intentB = cleanString(profileB.intent);
  const languagesA = stringArray(profileA.languages).map(cleanString).filter(isString);
  const languagesB = stringArray(profileB.languages).map(cleanString).filter(isString);
  const languageOverlap = input.languageOverlap?.length
    ? input.languageOverlap
    : languagesA.filter((language) => languagesB.includes(language));

  if (input.blocked) pushPenalty(penalties, "blocked_pair", "One user blocked the other", weights.blockedPenalty);
  if (input.reported) pushPenalty(penalties, "reported_pair", "One user reported the other", weights.reportedPenalty);

  const sharedNiches = input.sharedNiches ?? [];
  const sharedGroups = input.sharedGroups ?? [];
  const sharedEvents = input.sharedEvents ?? [];
  const companionEvents = input.companionEvents ?? [];

  pushReason(reasons, "same_city", "Same city", cityA && cityA === cityB ? weights.sameCity : 0, { city: cityA });
  pushReason(reasons, "shared_niches", "Shared interests", Math.min(weights.sharedNicheMax, sharedNiches.length * weights.sharedNiche), { niches: sharedNiches });
  pushReason(reasons, "shared_groups", "Shared groups", Math.min(weights.sharedGroupMax, sharedGroups.length * weights.sharedGroup), { group_ids: sharedGroups });
  pushReason(reasons, "shared_event_interest", "Interested in the same events", Math.min(weights.sharedEventMax, sharedEvents.length * weights.sharedEvent), { event_ids: sharedEvents });
  pushReason(reasons, "event_companion_request", "Both asked for company", Math.min(weights.companionEventMax, companionEvents.length * weights.companionEvent), { event_ids: companionEvents });
  pushReason(reasons, "language_overlap", "Shared language", Math.min(weights.languageMax, languageOverlap.length * weights.language), { languages: languageOverlap });
  pushReason(reasons, "interaction_history", "Existing interaction signal", Math.min(weights.interactionMax, Math.max(0, Number(input.interactionScore ?? 0)) * weights.interactionMultiplier), {
    interaction_score: input.interactionScore ?? 0,
  });
  pushReason(
    reasons,
    "intent_fit",
    "Compatible intent",
    intentCompatible(intentA, intentB, input.intent) ? weights.intentFit : 0,
    { intent_a: intentA, intent_b: intentB, target_intent: input.intent },
  );

  if (!intentCompatible(intentA, intentB, input.intent) && input.intent === "dating") {
    pushPenalty(penalties, "intent_mismatch", "Dating intent does not match", weights.datingIntentMismatchPenalty, { intent_a: intentA, intent_b: intentB });
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
