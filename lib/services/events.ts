import { supabase } from '../supabase';

export type EventRow = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location_name: string | null;
  is_virtual: boolean;
  created_by?: string;
};

export type ExternalEventRow = {
  id: string;
  source: string;
  source_url: string | null;
  title: string;
  description: string | null;
  category: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  is_free: boolean | null;
  price_min: number | null;
  organizer_name: string | null;
  organizer_source_id: string | null;
};

export type UnifiedEventRow = {
  id: string;
  source: 'group' | 'external';
  title: string;
  starts_at: string;
  location_name: string | null;
  is_virtual: boolean;
  category: string | null;
  city: string | null;
  source_url: string | null;
  group_id: string | null;
  group_name: string | null;
  attendee_count: number;
  my_status: 'going' | 'interested' | 'not_going' | null;
  going_user_ids: string[];
  attendee_label: string | null;
};

export type GroupRow = {
  id: string;
  name: string;
  category: string;
};

export type EventRsvpRow = {
  event_id: string;
  user_id: string;
  status: 'going' | 'interested' | 'not_going';
};

export type ExternalEventRsvpRow = {
  opportunity_id: string;
  user_id: string;
  status: 'going' | 'interested' | 'not_going';
};

export type BasicProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchMembershipGroupIds(userId: string) {
  return supabase
    .from('group_memberships')
    .select('group_id')
    .eq('user_id', userId);
}

export async function fetchEventsForGroups(groupIds: string[]) {
  if (groupIds.length === 0) return { data: [] as EventRow[], error: null };
  // Keep a small grace window to avoid timezone/input edge-cases hiding newly created events.
  const cutoffIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  return supabase
    .from('group_events')
    .select('id, group_id, title, description, starts_at, location_name, is_virtual')
    .in('group_id', groupIds)
    .gte('starts_at', cutoffIso)
    .order('starts_at', { ascending: true })
    .limit(200);
}

export async function fetchExternalEventsForCity(city: string | null) {
  // Keep a small grace window to avoid timezone/input edge-cases hiding newly created events.
  const cutoffIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const buildBase = () =>
    supabase
      .from('agent_opportunities')
      .select('id, title, summary, city, country, starts_at, ends_at, timezone, venue_name, lat, lng, feature_snapshot, metadata')
      .eq('kind', 'event')
      .gte('starts_at', cutoffIso)
      .or(`expires_at.is.null,expires_at.gte.${cutoffIso}`)
      .order('starts_at', { ascending: true })
      .limit(200);

  const trimmed = city?.trim();
  if (!trimmed) {
    return buildBase();
  }

  // Try city match first. If nothing returns, fall back to all external events.
  const cityQuery = buildBase().ilike('city', `%${trimmed}%`);
  const { data, error } = await cityQuery;
  if (error) {
    return { data: null, error };
  }
  if (data && data.length > 0) {
    return {
      data: (data as Array<{
        id: string;
        title: string;
        summary: string | null;
        city: string | null;
        country: string | null;
        starts_at: string;
        ends_at: string | null;
        timezone: string | null;
        venue_name: string | null;
        lat: number | null;
        lng: number | null;
        feature_snapshot: Record<string, unknown> | null;
        metadata: Record<string, unknown> | null;
      }>).map(mapOpportunityToExternalEventRow),
      error: null,
    };
  }
  const fallback = await buildBase();
  return {
    data: ((fallback.data ?? []) as Array<{
      id: string;
      title: string;
      summary: string | null;
      city: string | null;
      country: string | null;
      starts_at: string;
      ends_at: string | null;
      timezone: string | null;
      venue_name: string | null;
      lat: number | null;
      lng: number | null;
      feature_snapshot: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
    }>).map(mapOpportunityToExternalEventRow),
    error: fallback.error,
  };
}

export async function fetchGroupsByIds(groupIds: string[]) {
  if (groupIds.length === 0) return { data: [] as GroupRow[], error: null };
  return supabase
    .from('groups')
    .select('id, name, category')
    .in('id', groupIds);
}

export async function fetchEventRsvps(eventIds: string[]) {
  if (eventIds.length === 0) return { data: [] as EventRsvpRow[], error: null };
  return supabase
    .from('event_rsvps')
    .select('event_id, user_id, status')
    .in('event_id', eventIds);
}

export async function fetchExternalEventRsvps(eventIds: string[]) {
  if (eventIds.length === 0) return { data: [] as ExternalEventRsvpRow[], error: null };
  return supabase
    .from('agent_event_rsvps')
    .select('opportunity_id, user_id, status')
    .in('opportunity_id', eventIds);
}

export async function upsertEventRsvp(
  eventId: string,
  userId: string,
  status: 'going' | 'interested' | 'not_going'
) {
  return supabase
    .from('event_rsvps')
    .upsert({ event_id: eventId, user_id: userId, status, attended_at: null }, { onConflict: 'event_id,user_id' })
    .select('event_id, user_id, status')
    .single();
}

export async function upsertExternalEventRsvp(
  eventId: string,
  userId: string,
  status: 'going' | 'interested' | 'not_going'
) {
  const result = await supabase
    .from('agent_event_rsvps')
    .upsert({ opportunity_id: eventId, user_id: userId, status }, { onConflict: 'opportunity_id,user_id' })
    .select('opportunity_id, user_id, status')
    .single();

  if (!result.error && status !== 'not_going') {
    const { error: rpcError } = await supabase.rpc('log_agent_event_rsvp', { p_opportunity_id: eventId });
    if (rpcError) {
      // Surface RPC errors in dev to avoid silent failures
      console.warn('log_agent_event_rsvp failed', rpcError);
    }
  }

  return result;
}

export async function deleteExternalEventRsvp(eventId: string, userId: string) {
  return supabase
    .from('agent_event_rsvps')
    .delete()
    .eq('opportunity_id', eventId)
    .eq('user_id', userId);
}

export async function fetchEventById(eventId: string) {
  return supabase
    .from('group_events')
    .select('id, group_id, title, description, starts_at, location_name, is_virtual, created_by')
    .eq('id', eventId)
    .maybeSingle();
}

export async function fetchExternalEventById(eventId: string) {
  const { data, error } = await supabase
    .from('agent_opportunities')
    .select('id, title, summary, city, country, starts_at, ends_at, timezone, venue_name, lat, lng, feature_snapshot, metadata')
    .eq('kind', 'event')
    .eq('id', eventId)
    .maybeSingle();

  if (error) return { data: null, error };
  return {
    data: data ? mapOpportunityToExternalEventRow(data) : null,
    error: null,
  };
}

export async function updateEventByOwner(params: {
  eventId: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  starts_at: string;
  location_name: string | null;
  is_virtual: boolean;
}) {
  return supabase
    .from('group_events')
    .update({
      title: params.title,
      description: params.description,
      starts_at: params.starts_at,
      location_name: params.is_virtual ? null : params.location_name,
      is_virtual: params.is_virtual,
    })
    .eq('id', params.eventId)
    .eq('created_by', params.ownerUserId)
    .select('id, group_id, title, description, starts_at, location_name, is_virtual, created_by')
    .single();
}

export async function deleteEventByOwner(eventId: string, ownerUserId: string) {
  return supabase
    .from('group_events')
    .delete()
    .eq('id', eventId)
    .eq('created_by', ownerUserId);
}

export function subscribeToGroupEvents(
  groupIds: string[],
  onChange: () => void
) {
  if (groupIds.length === 0) return null;
  const filter = `group_id=in.(${groupIds.join(',')})`;
  const channel = supabase
    .channel(`group_events:${groupIds.sort().join(',')}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_events', filter },
      () => onChange()
    )
    .subscribe();

  return channel;
}

export async function removeChannel(channel: ReturnType<typeof supabase.channel>) {
  return supabase.removeChannel(channel);
}

export async function fetchGoingUserProfiles(userIds: string[]) {
  if (userIds.length === 0) return { data: [] as Array<{ user_id: string; avatar_url: string | null }>, error: null };
  return supabase
    .from('profiles')
    .select('user_id, avatar_url')
    .in('user_id', userIds);
}

export async function fetchProfilesBasic(userIds: string[]) {
  if (userIds.length === 0) return { data: [] as BasicProfileRow[], error: null };
  return supabase
    .from('profiles')
    .select('user_id, full_name, avatar_url')
    .in('user_id', userIds);
}

export async function createExternalEventChat(eventId: string): Promise<{ groupId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_agent_event_chat', { p_opportunity_id: eventId });
  if (error) return { groupId: null, error: error.message };
  return { groupId: data as string, error: null };
}

function mapOpportunityToExternalEventRow(row: {
  id: string;
  title: string;
  summary: string | null;
  city: string | null;
  country: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  venue_name: string | null;
  lat: number | null;
  lng: number | null;
  feature_snapshot: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}): ExternalEventRow {
  const featureSnapshot = row.feature_snapshot ?? {};
  const metadata = row.metadata ?? {};
  return {
    id: row.id,
    source: typeof featureSnapshot.source === 'string' ? featureSnapshot.source : 'external',
    source_url: typeof metadata.source_url === 'string' ? metadata.source_url : null,
    title: row.title,
    description: row.summary,
    category: typeof featureSnapshot.category === 'string' ? featureSnapshot.category : null,
    start_at: row.starts_at,
    end_at: row.ends_at,
    timezone: row.timezone,
    venue_name: row.venue_name,
    city: row.city,
    country: row.country,
    lat: row.lat,
    lng: row.lng,
    is_free: typeof featureSnapshot.is_free === 'boolean' ? featureSnapshot.is_free : null,
    price_min: typeof featureSnapshot.price_min === 'number' ? featureSnapshot.price_min : null,
    organizer_name: typeof metadata.organizer_name === 'string' ? metadata.organizer_name : null,
    organizer_source_id: typeof metadata.organizer_source_id === 'string' ? metadata.organizer_source_id : null,
  };
}

export async function fetchUnifiedEventsForUser(userId: string, city: string | null) {
  const { data: membershipRows, error: membershipError } = await fetchMembershipGroupIds(userId);
  if (membershipError) return { data: null, error: membershipError };

  const groupIds = Array.from(
    new Set(((membershipRows ?? []) as Array<{ group_id: string }>).map((m) => m.group_id))
  );

  const [eventsRes, groupsRes, externalRes] = await Promise.all([
    groupIds.length > 0 ? fetchEventsForGroups(groupIds) : Promise.resolve({ data: [] as EventRow[], error: null }),
    groupIds.length > 0 ? fetchGroupsByIds(groupIds) : Promise.resolve({ data: [] as GroupRow[], error: null }),
    fetchExternalEventsForCity(city),
  ]);

  if (eventsRes.error) return { data: null, error: eventsRes.error };
  if (groupsRes.error) return { data: null, error: groupsRes.error };
  if (externalRes.error) return { data: null, error: externalRes.error };

  const eventRows = (eventsRes.data ?? []) as EventRow[];
  const groupRows = (groupsRes.data ?? []) as GroupRow[];
  const externalRows = (externalRes.data ?? []) as ExternalEventRow[];

  const eventIds = eventRows.map((e) => e.id);
  const externalIds = externalRows.map((e) => e.id);

  const [rsvpRes, externalRsvpRes] = await Promise.all([
    fetchEventRsvps(eventIds),
    fetchExternalEventRsvps(externalIds),
  ]);
  if (rsvpRes.error) return { data: null, error: rsvpRes.error };
  if (externalRsvpRes.error) return { data: null, error: externalRsvpRes.error };

  const rsvps = (rsvpRes.data ?? []) as EventRsvpRow[];
  const externalRsvps = (externalRsvpRes.data ?? []) as ExternalEventRsvpRow[];

  const myRsvpByEvent = new Map(
    rsvps.filter((r) => r.user_id === userId).map((r) => [r.event_id, r.status])
  );
  const myExternalRsvpByEvent = new Map(
    externalRsvps.filter((r) => r.user_id === userId).map((r) => [r.opportunity_id, r.status])
  );

  const goingCountByEvent: Record<string, number> = {};
  const goingUserIdsByEvent: Record<string, string[]> = {};
  for (const r of rsvps) {
    if (r.status === 'going') {
      goingCountByEvent[r.event_id] = (goingCountByEvent[r.event_id] ?? 0) + 1;
      if (!goingUserIdsByEvent[r.event_id]) goingUserIdsByEvent[r.event_id] = [];
      if (goingUserIdsByEvent[r.event_id].length < 3) goingUserIdsByEvent[r.event_id].push(r.user_id);
    }
  }

  const externalGoingCountByEvent: Record<string, number> = {};
  const externalGoingUserIdsByEvent: Record<string, string[]> = {};
  for (const r of externalRsvps) {
    if (r.status === 'going') {
      externalGoingCountByEvent[r.opportunity_id] = (externalGoingCountByEvent[r.opportunity_id] ?? 0) + 1;
      if (!externalGoingUserIdsByEvent[r.opportunity_id]) externalGoingUserIdsByEvent[r.opportunity_id] = [];
      if (externalGoingUserIdsByEvent[r.opportunity_id].length < 2) {
        externalGoingUserIdsByEvent[r.opportunity_id].push(r.user_id);
      }
    }
  }

  const externalTopUserIds = Array.from(new Set(Object.values(externalGoingUserIdsByEvent).flat()));
  const externalProfileMap: Record<string, { full_name: string | null }> = {};
  if (externalTopUserIds.length > 0) {
    const { data: basicProfiles } = await fetchProfilesBasic(externalTopUserIds);
    for (const p of (basicProfiles ?? [])) {
      externalProfileMap[p.user_id] = { full_name: p.full_name ?? null };
    }
  }

  const buildAttendeeLabel = (eventId: string) => {
    const count = externalGoingCountByEvent[eventId] ?? 0;
    if (count === 0) return null;
    const topIds = externalGoingUserIdsByEvent[eventId] ?? [];
    const names = topIds
      .map((id) => externalProfileMap[id]?.full_name)
      .filter((v): v is string => Boolean(v));
    if (names.length === 0) {
      return count === 1 ? '1 person going' : `${count} people going`;
    }
    if (count === 1) return `${names[0] ?? 'Someone'} is going`;
    if (count === 2) {
      const a = names[0] ?? 'Someone';
      const b = names[1] ?? 'someone';
      return `${a} and ${b} are going`;
    }
    const a = names[0] ?? 'Someone';
    const b = names[1] ?? 'someone';
    return `${a}, ${b} and ${count - 2} others are going`;
  };

  const groupById = new Map(groupRows.map((g) => [g.id, g]));

  const unified: UnifiedEventRow[] = [
    ...eventRows.map((e) => {
      const g = groupById.get(e.group_id);
      return {
        id: e.id,
        source: 'group' as const,
        title: e.title,
        starts_at: e.starts_at,
        location_name: e.location_name,
        is_virtual: e.is_virtual ?? false,
        category: g?.category ?? null,
        city: null,
        source_url: null,
        group_id: e.group_id,
        group_name: g?.name ?? 'Group',
        attendee_count: goingCountByEvent[e.id] ?? 0,
        my_status: (myRsvpByEvent.get(e.id) ?? null) as UnifiedEventRow['my_status'],
        going_user_ids: goingUserIdsByEvent[e.id] ?? [],
        attendee_label: null,
      };
    }),
    ...externalRows.map((e) => ({
      id: e.id,
      source: 'external' as const,
      title: e.title,
      starts_at: e.start_at,
      location_name: e.venue_name || e.city || null,
      is_virtual: false,
      category: e.category ?? null,
      city: e.city ?? null,
      source_url: e.source_url,
      group_id: null,
      group_name: e.city ?? 'Local event',
      attendee_count: externalGoingCountByEvent[e.id] ?? 0,
      my_status: (myExternalRsvpByEvent.get(e.id) ?? null) as UnifiedEventRow['my_status'],
      going_user_ids: [],
      attendee_label: buildAttendeeLabel(e.id),
    })),
  ];

  unified.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  return { data: unified, error: null };
}
