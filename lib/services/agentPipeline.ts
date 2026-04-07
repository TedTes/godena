import { supabase } from '../supabase';
import type {
  AgentFeedbackEvent,
  AgentOpportunity,
  AgentProposal,
  AgentSuggestionReason,
} from './agentContracts';
import { AGENT_PROPOSAL_SELECT } from './agentContracts';

export async function fetchAgentOpportunities(params?: {
  kind?: 'event' | 'group' | 'introduction';
  city?: string | null;
  limit?: number;
}) {
  let query = supabase
    .from('agent_opportunities')
    .select('id, kind, title, summary, city, country, starts_at, ends_at, timezone, venue_name, lat, lng, canonical_key, primary_external_record_id, feature_snapshot, metadata, expires_at, created_at, updated_at')
    .order('starts_at', { ascending: true })
    .limit(params?.limit ?? 50);

  if (params?.kind) query = query.eq('kind', params.kind);
  if (params?.city?.trim()) query = query.ilike('city', `%${params.city.trim()}%`);

  return query;
}

export async function fetchAgentProposals(params?: {
  surface?: 'home' | 'groups' | 'events' | 'connections' | 'profile';
  status?: 'draft' | 'approved' | 'rejected' | 'published' | 'expired';
  city?: string | null;
  limit?: number;
}) {
  let query = supabase
    .from('agent_proposals')
    .select(AGENT_PROPOSAL_SELECT)
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 50);

  if (params?.surface) query = query.eq('target_surface', params.surface);
  if (params?.status) query = query.eq('status', params.status);
  if (params?.city?.trim()) query = query.ilike('city', `%${params.city.trim()}%`);

  return query;
}

export async function fetchVisibleAgentProposals(params?: {
  surface?: 'home' | 'groups' | 'events' | 'connections' | 'profile';
  city?: string | null;
  limit?: number;
}) {
  let query = supabase
    .from('agent_proposals')
    .select(AGENT_PROPOSAL_SELECT)
    .in('status', ['approved', 'published'])
    .order('confidence_score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(params?.limit ?? 25);

  if (params?.surface) query = query.eq('target_surface', params.surface);
  if (params?.city?.trim()) query = query.ilike('city', `%${params.city.trim()}%`);

  return query;
}

export type AgentEventSuggestion = {
  proposalId: string;
  title: string;
  body: string | null;
  city: string | null;
  confidenceScore: number;
  startsAt: string | null;
  venueName: string | null;
  externalEventId: string | null;
  sourceUrl: string | null;
  reasons: Array<{
    id: string;
    label: string;
    detail: string | null;
  }>;
};

export type AgentGroupSuggestion = {
  proposalId: string;
  title: string;
  body: string | null;
  city: string | null;
  confidenceScore: number;
  category: string | null;
  derivedEventCount: number;
};

export type AgentIntroSuggestion = {
  proposalId: string;
  title: string;
  body: string | null;
  city: string | null;
  confidenceScore: number;
  groupName: string | null;
  candidateUserIds: string[];
};

export async function fetchAgentEventSuggestions(params?: {
  city?: string | null;
  userId?: string | null;
  limit?: number;
}): Promise<{ data: AgentEventSuggestion[] | null; error: Error | null }> {
  const { data: proposals, error: proposalError } = await fetchVisibleAgentProposals({
    surface: 'events',
    city: params?.city ?? null,
    limit: params?.limit ?? 8,
  });

  if (proposalError) {
    return { data: null, error: new Error(proposalError.message) };
  }

  const initialRows = (proposals ?? []) as Array<{
    id: string;
    opportunity_id: string | null;
    title: string;
    body: string | null;
    city: string | null;
    confidence_score: number;
  }>;
  let rows = initialRows;

  if (params?.userId && initialRows.length > 0) {
    const proposalIds = initialRows.map((row) => row.id);
    const { data: feedbackRows, error: feedbackError } = await supabase
      .from('agent_feedback_events')
      .select('proposal_id, event_type, user_id')
      .eq('user_id', params.userId)
      .in('proposal_id', proposalIds)
      .in('event_type', ['dismissed', 'ignored']);

    if (feedbackError) {
      return { data: null, error: new Error(feedbackError.message) };
    }

    const hiddenProposalIds = new Set(
      (((feedbackRows ?? []) as Array<{ proposal_id: string; event_type: string }>))
        .map((row) => row.proposal_id)
    );
    rows = initialRows.filter((row) => !hiddenProposalIds.has(row.id));
  }

  const opportunityIds = rows.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value));

  const { data: opportunities, error: opportunityError } = opportunityIds.length
    ? await supabase
        .from('agent_opportunities')
        .select('id, starts_at, venue_name, metadata')
        .in('id', opportunityIds)
    : { data: [], error: null };

  if (opportunityError) {
    return { data: null, error: new Error(opportunityError.message) };
  }

  const opportunityById = new Map(
    (((opportunities ?? []) as Array<{ id: string; starts_at: string | null; venue_name: string | null; metadata: Record<string, unknown> | null }>)
      .map((row) => [row.id, row]))
  );

  const reasonsByProposal = new Map<string, AgentEventSuggestion['reasons']>();
  await Promise.all(
    rows.map(async (row) => {
      const { data: reasons } = await fetchSuggestionReasons(row.id, params?.userId ?? null);
      reasonsByProposal.set(
        row.id,
        (((reasons ?? []) as Array<{ id: string; reason_label: string; reason_detail: string | null }>)
          .map((reason) => ({
            id: reason.id,
            label: reason.reason_label,
            detail: reason.reason_detail,
          })))
      );
    })
  );

  return {
    data: rows.map((row) => {
      const opportunity = row.opportunity_id ? opportunityById.get(row.opportunity_id) : null;
      const metadata = (opportunity?.metadata ?? {}) as Record<string, unknown>;
      return {
        proposalId: row.id,
        title: row.title,
        body: row.body,
        city: row.city,
        confidenceScore: row.confidence_score,
        startsAt: opportunity?.starts_at ?? null,
        venueName: opportunity?.venue_name ?? null,
        externalEventId: typeof metadata.external_event_id === 'string' ? metadata.external_event_id : null,
        sourceUrl: typeof metadata.source_url === 'string' ? metadata.source_url : null,
        reasons: reasonsByProposal.get(row.id) ?? [],
      };
    }),
    error: null,
  };
}

export async function fetchSuggestionReasons(proposalId: string, userId?: string | null) {
  let query = supabase
    .from('agent_suggestion_reasons')
    .select('id, proposal_id, user_id, reason_code, reason_label, reason_detail, evidence, sort_order, created_at')
    .eq('proposal_id', proposalId)
    .order('sort_order', { ascending: true });

  if (userId) query = query.or(`user_id.is.null,user_id.eq.${userId}`);

  return query;
}

export async function fetchAgentIntroSuggestions(params: {
  userId: string;
  limit?: number;
}): Promise<{ data: AgentIntroSuggestion[] | null; error: Error | null }> {
  const { data: proposals, error: proposalError } = await fetchVisibleAgentProposals({
    surface: 'connections',
    limit: params.limit ?? 10,
  });

  if (proposalError) {
    return { data: null, error: new Error(proposalError.message) };
  }

  const rows = ((proposals ?? []) as Array<{
    id: string;
    opportunity_id: string | null;
    title: string;
    body: string | null;
    city: string | null;
    confidence_score: number;
    audience_user_ids: string[] | null;
  }>).filter((row) => (row.audience_user_ids ?? []).includes(params.userId));

  const opportunityIds = rows.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value));
  const { data: opportunities, error: opportunityError } = opportunityIds.length
    ? await supabase
        .from('agent_opportunities')
        .select('id, metadata')
        .in('id', opportunityIds)
    : { data: [], error: null };

  if (opportunityError) {
    return { data: null, error: new Error(opportunityError.message) };
  }

  const metadataById = new Map(
    (((opportunities ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>)
      .map((row) => [row.id, row.metadata ?? {}]))
  );

  return {
    data: rows.map((row) => {
      const metadata = row.opportunity_id ? (metadataById.get(row.opportunity_id) ?? {}) : {};
      const candidateUserIds = Array.isArray(metadata.candidate_user_ids)
        ? metadata.candidate_user_ids.filter((value): value is string => typeof value === 'string')
        : [];
      return {
        proposalId: row.id,
        title: row.title,
        body: row.body,
        city: row.city,
        confidenceScore: row.confidence_score,
        groupName: typeof metadata.anchor_group_name === 'string' ? metadata.anchor_group_name : null,
        candidateUserIds,
      };
    }),
    error: null,
  };
}

export async function fetchAgentGroupSuggestions(params?: {
  city?: string | null;
  userId?: string | null;
  limit?: number;
}): Promise<{ data: AgentGroupSuggestion[] | null; error: Error | null }> {
  const { data: proposals, error: proposalError } = await fetchVisibleAgentProposals({
    surface: 'groups',
    city: params?.city ?? null,
    limit: params?.limit ?? 8,
  });

  if (proposalError) {
    return { data: null, error: new Error(proposalError.message) };
  }

  const rows = (proposals ?? []) as Array<{
    id: string;
    opportunity_id: string | null;
    title: string;
    body: string | null;
    city: string | null;
    confidence_score: number;
  }>;

  const opportunityIds = rows.map((row) => row.opportunity_id).filter((value): value is string => Boolean(value));
  const { data: opportunities, error: opportunityError } = opportunityIds.length
    ? await supabase
        .from('agent_opportunities')
        .select('id, feature_snapshot')
        .in('id', opportunityIds)
    : { data: [], error: null };

  if (opportunityError) {
    return { data: null, error: new Error(opportunityError.message) };
  }

  const opportunityById = new Map(
    (((opportunities ?? []) as Array<{ id: string; feature_snapshot: Record<string, unknown> | null }>)
      .map((row) => [row.id, row.feature_snapshot ?? {}]))
  );

  return {
    data: rows.map((row) => {
      const featureSnapshot = row.opportunity_id ? opportunityById.get(row.opportunity_id) ?? {} : {};
      return {
        proposalId: row.id,
        title: row.title,
        body: row.body,
        city: row.city,
        confidenceScore: row.confidence_score,
        category: typeof featureSnapshot.category === 'string' ? featureSnapshot.category : null,
        derivedEventCount: typeof featureSnapshot.event_count === 'number' ? featureSnapshot.event_count : 0,
      };
    }),
    error: null,
  };
}

export async function updateAgentProposalStatus(params: {
  proposalId: string;
  status: 'approved' | 'rejected' | 'published';
  actorUserId: string;
  rejectionReason?: string;
}) {
  const patch =
    params.status === 'approved'
      ? { status: 'approved', approved_by: params.actorUserId, approved_at: new Date().toISOString() }
      : params.status === 'published'
        ? { status: 'published', published_at: new Date().toISOString() }
        : {
            status: 'rejected',
            rejected_by: params.actorUserId,
            rejected_at: new Date().toISOString(),
            rejection_reason: params.rejectionReason ?? null,
          };

  return supabase
    .from('agent_proposals')
    .update(patch)
    .eq('id', params.proposalId)
    .select(AGENT_PROPOSAL_SELECT)
    .single();
}

export async function createAgentIntroConnection(proposalId: string) {
  return supabase.rpc('create_agent_intro_connection', {
    p_proposal_id: proposalId,
  });
}

export async function logAgentFeedbackEvent(params: {
  proposalId: string;
  userId?: string | null;
  eventType:
    | 'viewed'
    | 'clicked'
    | 'dismissed'
    | 'joined_group'
    | 'rsvped_event'
    | 'accepted_intro'
    | 'ignored';
  metadata?: Record<string, unknown>;
}) {
  return supabase.rpc('log_agent_feedback_event', {
    p_proposal_id: params.proposalId,
    p_event_type: params.eventType,
    p_metadata: params.metadata ?? {},
  });
}

export type AgentOpportunityRow = AgentOpportunity;
export type AgentProposalRow = AgentProposal;
export type AgentSuggestionReasonRow = AgentSuggestionReason;
export type AgentFeedbackEventRow = AgentFeedbackEvent;
