// @ts-nocheck

export const SUPPORTED_SOURCES = ["eventbrite", "meetup", "ticketmaster", "ics", "reddit", "weather", "manual"];

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function boolOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
}

function toIso(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function slugify(value: string | null) {
  if (!value) return null;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function coalesce(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return value;
  }
  return null;
}

function inferKind(source: string, raw: Record<string, unknown>) {
  if (source === "weather") return "context";
  if (typeof raw.entity_kind === "string") {
    if (raw.entity_kind === "group") return "group";
    if (raw.entity_kind === "venue") return "venue";
    if (raw.entity_kind === "context") return "context";
  }
  return "event";
}

function inferCategory(raw: Record<string, unknown>) {
  const sourceValue = cleanText(
    coalesce(raw.category, raw.segment_name, raw.group_category, raw.topic, raw.theme, raw.activity)
  );
  if (!sourceValue) return null;
  const normalized = sourceValue.toLowerCase();
  if (/(run|hike|trail|outdoor)/.test(normalized)) return "outdoors";
  if (/(cook|food|coffee|drink|brunch|dinner)/.test(normalized)) return "food_drink";
  if (/(career|network|founder|startup|professional|business)/.test(normalized)) return "professional";
  if (/(language|speak|conversation)/.test(normalized)) return "language";
  if (/(faith|church|bible|mosque|temple)/.test(normalized)) return "faith";
  if (/(culture|art|music|dance|community|festival)/.test(normalized)) return "culture";
  return sourceValue.toLowerCase();
}

export function normalizeSourceRecord(source: string, raw: Record<string, unknown>, defaults: Record<string, unknown> = {}) {
  const normalizedSource = source.toLowerCase();
  if (!SUPPORTED_SOURCES.includes(normalizedSource)) {
    throw new Error(`unsupported_source:${source}`);
  }

  const kind = inferKind(normalizedSource, raw);
  const title = cleanText(
    coalesce(raw.title, raw.name, raw.summary, raw.headline, raw.event_name, raw.group_name)
  );
  const startsAt = toIso(coalesce(raw.start_at, raw.starts_at, raw.start_time, raw.local_date_time, raw.datetime_utc));
  const endsAt = toIso(coalesce(raw.end_at, raw.ends_at, raw.end_time));
  const city = cleanText(coalesce(raw.city, raw.location_city, defaults.city));
  const country = cleanText(coalesce(raw.country, raw.location_country, defaults.country));
  const venueName = cleanText(coalesce(raw.venue_name, raw.venue, raw.location_name));
  const lat = numberOrNull(coalesce(raw.lat, raw.latitude));
  const lng = numberOrNull(coalesce(raw.lng, raw.longitude));

  const normalized = {
    kind,
    source: normalizedSource,
    source_record_id: String(
      coalesce(raw.source_id, raw.id, raw.uid, raw.url, `${title ?? "untitled"}:${startsAt ?? "na"}`)
    ),
    source_url: cleanText(coalesce(raw.source_url, raw.url, raw.link)),
    title,
    summary: cleanText(coalesce(raw.summary, raw.description, raw.snippet, raw.body)),
    category: inferCategory(raw),
    image_url: cleanText(coalesce(raw.image_url, raw.image, raw.logo)),
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: cleanText(coalesce(raw.timezone, raw.tz, defaults.timezone)),
    venue_name: venueName,
    city,
    country,
    lat,
    lng,
    is_free: boolOrNull(coalesce(raw.is_free, raw.free)),
    price_min: numberOrNull(coalesce(raw.price_min, raw.price, raw.lowest_price)),
    organizer_name: cleanText(coalesce(raw.organizer_name, raw.organizer, raw.host_name)),
    organizer_source_id: cleanText(coalesce(raw.organizer_source_id, raw.organizer_id, raw.host_id)),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag) => typeof tag === "string") : [],
    metadata: {
      source_type: cleanText(coalesce(raw.source_type, raw.type)),
      raw_city_text: cleanText(coalesce(raw.city_name, raw.location)),
    },
  };

  if (!normalized.title && kind !== "context") return null;
  if (kind === "event" && !normalized.starts_at) return null;
  return normalized;
}

export function computeTrustScore(source: string, normalized: Record<string, unknown>) {
  let score = 0;
  const evidence: Record<string, unknown> = {};

  if (source === "eventbrite" || source === "meetup" || source === "ticketmaster") {
    score += 45;
    evidence.source_tier = "high";
  } else if (source === "ics" || source === "manual") {
    score += 30;
    evidence.source_tier = "medium";
  } else if (source === "reddit") {
    score += 10;
    evidence.source_tier = "bootstrap_only";
  } else if (source === "weather") {
    score += 20;
    evidence.source_tier = "passive_context";
  }

  if (normalized.organizer_name) score += 10;
  if (normalized.venue_name) score += 8;
  if (normalized.city) score += 7;
  if (normalized.source_url) score += 8;
  if (normalized.image_url) score += 4;
  if (normalized.summary && String(normalized.summary).length >= 80) score += 6;
  if (normalized.starts_at) {
    const startMs = new Date(String(normalized.starts_at)).getTime();
    const diffDays = (startMs - Date.now()) / 86400000;
    if (diffDays >= -1 && diffDays <= 45) score += 10;
    evidence.days_until_start = Math.round(diffDays);
  }

  let spamRisk = 0;
  const title = String(normalized.title ?? "").toLowerCase();
  const summary = String(normalized.summary ?? "").toLowerCase();
  if (/free money|crypto|guaranteed|dm me|telegram/.test(`${title} ${summary}`)) spamRisk += 25;
  if (!normalized.source_url && !normalized.organizer_name) spamRisk += 12;
  if (!normalized.city && !normalized.venue_name) spamRisk += 8;

  const capped = Math.max(0, Math.min(100, score - spamRisk));
  return {
    overall_score: capped,
    source_confidence: Math.max(0, Math.min(100, score)),
    organizer_confidence: normalized.organizer_name ? 75 : 25,
    freshness_score: normalized.starts_at ? 80 : 20,
    spam_risk_score: spamRisk,
    evidence,
  };
}

export function canonicalOpportunityKey(normalized: Record<string, unknown>) {
  const city = slugify(cleanText(normalized.city) ?? "global");
  const venue = slugify(cleanText(normalized.venue_name));
  const title = slugify(cleanText(normalized.title) ?? cleanText(normalized.summary) ?? "untitled");
  const kind = cleanText(normalized.kind) ?? "event";
  const startsAt = cleanText(normalized.starts_at);
  const day = startsAt ? startsAt.slice(0, 10) : "undated";
  return [kind, city, venue, title, day].filter(Boolean).join(":");
}

export function buildOpportunityFromNormalized(
  normalized: Record<string, unknown>,
  externalRecordId: string,
  metadataOverrides: Record<string, unknown> = {},
) {
  return {
    kind: normalized.kind === "group" ? "group" : normalized.kind === "context" ? "event" : normalized.kind,
    title: normalized.title ?? "Untitled",
    summary: normalized.summary ?? null,
    city: normalized.city ?? null,
    country: normalized.country ?? null,
    starts_at: normalized.starts_at ?? null,
    ends_at: normalized.ends_at ?? null,
    timezone: normalized.timezone ?? null,
    venue_name: normalized.venue_name ?? null,
    lat: normalized.lat ?? null,
    lng: normalized.lng ?? null,
    canonical_key: canonicalOpportunityKey(normalized),
    primary_external_record_id: externalRecordId,
    feature_snapshot: {
      category: normalized.category ?? null,
      tags: normalized.tags ?? [],
      source: normalized.source,
      source_record_id: normalized.source_record_id ?? null,
      image_url: normalized.image_url ?? null,
      price_min: normalized.price_min ?? null,
      is_free: normalized.is_free ?? null,
    },
    metadata: {
      source_url: normalized.source_url ?? null,
      organizer_name: normalized.organizer_name ?? null,
      organizer_source_id: normalized.organizer_source_id ?? null,
      source_metadata: normalized.metadata ?? {},
      ...metadataOverrides,
    },
    expires_at: normalized.ends_at ?? normalized.starts_at ?? null,
  };
}

export function approvalPolicyForOpportunity(kind: string, trustScore: number) {
  if (kind === "introduction") {
    return {
      approval_policy: "manual_only",
      target_surface: "connections",
      approval_required: true,
      initial_status: "draft",
    };
  }

  if (kind === "group") {
    return {
      approval_policy: "organizer_confirm",
      target_surface: "groups",
      approval_required: true,
      initial_status: "draft",
    };
  }

  if (trustScore >= 70) {
    return {
      approval_policy: "auto_suggest",
      target_surface: "events",
      approval_required: false,
      initial_status: "approved",
    };
  }

  return {
    approval_policy: "organizer_confirm",
    target_surface: "events",
    approval_required: true,
    initial_status: "draft",
  };
}

export function buildSuggestionReasons(
  opportunity: Record<string, unknown>,
  trustScore: number,
  context: Record<string, unknown> = {},
) {
  const reasons = [];
  const city = cleanText(opportunity.city);
  const featureSnapshot = typeof opportunity.feature_snapshot === "object" && opportunity.feature_snapshot
    ? opportunity.feature_snapshot as Record<string, unknown>
    : {};
  const category = cleanText(featureSnapshot.category);
  const isFree = featureSnapshot.is_free === true;
  const audienceSize = typeof context.audience_size === "number" ? context.audience_size : 0;
  const affinityUsers = typeof context.affinity_user_count === "number" ? context.affinity_user_count : 0;
  const socialGoing = typeof context.social_going_count === "number" ? context.social_going_count : 0;
  const socialInterested = typeof context.social_interested_count === "number" ? context.social_interested_count : 0;
  const startsAt = cleanText(opportunity.starts_at);
  const daysUntil = startsAt ? Math.round((new Date(startsAt).getTime() - Date.now()) / 86400000) : null;

  if (affinityUsers > 0 && category) {
    reasons.push({
      reason_code: "community_affinity",
      reason_label: "Matches your community activity",
      reason_detail: `Aligned with ${affinityUsers} member${affinityUsers === 1 ? "" : "s"} active in ${category.replace(/_/g, " ")}.`,
      sort_order: 1,
      evidence: { affinity_users: affinityUsers, category },
    });
  } else if (city) {
    reasons.push({
      reason_code: "same_city",
      reason_label: "Same city",
      reason_detail: `Timed for ${city}.`,
      sort_order: 1,
      evidence: { city },
    });
  }

  if (socialGoing > 0 || socialInterested > 0) {
    const attendeeCount = socialGoing + socialInterested;
    reasons.push({
      reason_code: "social_proof",
      reason_label: socialGoing > 0 ? "People are already going" : "Already drawing interest",
      reason_detail: `${attendeeCount} member${attendeeCount === 1 ? "" : "s"} already marked going or interested.`,
      sort_order: 2,
      evidence: { social_going: socialGoing, social_interested: socialInterested },
    });
  } else if (category) {
    reasons.push({
      reason_code: "category_fit",
      reason_label: "Interest fit",
      reason_detail: `Tagged under ${category.replace(/_/g, " ")}.`,
      sort_order: 2,
      evidence: { category },
    });
  }

  if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 7) {
    reasons.push({
      reason_code: "soon",
      reason_label: "Happening soon",
      reason_detail: daysUntil === 0 ? "Scheduled for today." : `Starts within ${daysUntil} day${daysUntil === 1 ? "" : "s"}.`,
      sort_order: 3,
      evidence: { days_until: daysUntil },
    });
  }

  if (isFree) {
    reasons.push({
      reason_code: "low_friction",
      reason_label: "Low-friction plan",
      reason_detail: "Free to attend.",
      sort_order: 4,
      evidence: { is_free: true },
    });
  }

  if (trustScore >= 65 || audienceSize === 0) {
    reasons.push({
      reason_code: "trust_score",
      reason_label: "Trust-screened source",
      reason_detail: `Source quality score ${Math.round(trustScore)}/100.`,
      sort_order: 5,
      evidence: { trust_score: trustScore },
    });
  }

  return reasons;
}

export function buildRankingFeatures(
  opportunity: Record<string, unknown>,
  trustScore: number,
  context: Record<string, unknown> = {},
) {
  const startsAt = cleanText(opportunity.starts_at);
  const startMs = startsAt ? new Date(startsAt).getTime() : null;
  const daysUntil = startMs ? (startMs - Date.now()) / 86400000 : null;
  const recencyScore = daysUntil === null
    ? 20
    : daysUntil < -1
      ? 0
      : daysUntil <= 14
        ? 90
        : daysUntil <= 45
          ? 70
          : 45;

  const featureSnapshot = typeof opportunity.feature_snapshot === "object" && opportunity.feature_snapshot
    ? opportunity.feature_snapshot as Record<string, unknown>
    : {};
  const audienceSize = typeof context.audience_size === "number" ? context.audience_size : 0;
  const affinityUsers = typeof context.affinity_user_count === "number" ? context.affinity_user_count : 0;
  const socialGoing = typeof context.social_going_count === "number" ? context.social_going_count : 0;
  const socialInterested = typeof context.social_interested_count === "number" ? context.social_interested_count : 0;
  const audienceScore = affinityUsers > 0
    ? Math.min(100, 30 + affinityUsers * 5)
    : audienceSize > 0
      ? Math.min(70, 20 + audienceSize * 2)
      : 0;
  const socialScore = Math.min(100, socialGoing * 18 + socialInterested * 10);
  const personalizationScore = Math.round(audienceScore * 0.6 + socialScore * 0.4);

  return {
    trust_score: trustScore,
    recency_score: recencyScore,
    audience_score: audienceScore,
    social_score: socialScore,
    personalization_score: personalizationScore,
    city_present: Boolean(opportunity.city),
    venue_present: Boolean(opportunity.venue_name),
    audience_size: audienceSize,
    affinity_user_count: affinityUsers,
    social_going_count: socialGoing,
    social_interested_count: socialInterested,
    category: featureSnapshot.category ?? null,
    source: featureSnapshot.source ?? null,
    score_total: Math.round(trustScore * 0.35 + recencyScore * 0.25 + audienceScore * 0.2 + socialScore * 0.2),
  };
}
