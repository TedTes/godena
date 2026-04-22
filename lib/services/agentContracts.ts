export const EXTERNAL_ENTITY_KINDS = ['event', 'group', 'venue', 'context'] as const;
export type ExternalEntityKind = (typeof EXTERNAL_ENTITY_KINDS)[number];

export const OPPORTUNITY_KINDS = ['event', 'group'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const PROPOSAL_STATUSES = ['draft', 'approved', 'rejected', 'published', 'expired'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const APPROVAL_POLICIES = ['auto_suggest', 'organizer_confirm', 'manual_only'] as const;
export type ApprovalPolicy = (typeof APPROVAL_POLICIES)[number];

export const SUGGESTION_TARGET_SURFACES = [
  'home',
  'groups',
  'events',
  'connections',
  'profile',
] as const;
export type SuggestionTargetSurface = (typeof SUGGESTION_TARGET_SURFACES)[number];

export type AgentExternalRecord = {
  id: string;
  kind: ExternalEntityKind;
  source: string;
  sourceRecordId: string;
  ingestionRunKey: string | null;
  fetchedAt: string;
  sourceUpdatedAt: string | null;
  payload: Record<string, unknown>;
  normalizedSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentTrustScore = {
  id: string;
  externalRecordId: string;
  overallScore: number;
  scoringVersion: string;
  sourceConfidence: number;
  organizerConfidence: number;
  freshnessScore: number;
  spamRiskScore: number;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type AgentOpportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  summary: string | null;
  city: string | null;
  country: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  venueName: string | null;
  lat: number | null;
  lng: number | null;
  canonicalKey: string | null;
  primaryExternalRecordId: string | null;
  featureSnapshot: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentProposal = {
  id: string;
  opportunityId: string | null;
  proposalKind: OpportunityKind;
  status: ProposalStatus;
  approvalPolicy: ApprovalPolicy;
  targetSurface: SuggestionTargetSurface;
  city: string | null;
  audienceUserIds: string[];
  audienceGroupIds: string[];
  title: string;
  body: string | null;
  rationale: Record<string, unknown>;
  rankingFeatures: Record<string, unknown>;
  modelVersion: string;
  confidenceScore: number;
  approvalRequired: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentSuggestionReason = {
  id: string;
  proposalId: string;
  userId: string | null;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail: string | null;
  evidence: Record<string, unknown>;
  sortOrder: number;
  createdAt: string;
};

export type AgentFeedbackEvent = {
  id: string;
  proposalId: string;
  userId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export const AGENT_PROPOSAL_SELECT =
  'id, opportunity_id, proposal_kind, status, approval_policy, target_surface, city, audience_user_ids, audience_group_ids, title, body, rationale, ranking_features, model_version, confidence_score, approval_required, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, published_at, expires_at, created_at, updated_at';
