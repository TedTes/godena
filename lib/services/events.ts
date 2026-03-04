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

export async function fetchEventById(eventId: string) {
  return supabase
    .from('group_events')
    .select('id, group_id, title, description, starts_at, location_name, is_virtual, created_by')
    .eq('id', eventId)
    .maybeSingle();
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
