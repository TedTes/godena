import { supabase } from '../supabase';
import { resolveProfilePhotoUrl } from './photoUrls';

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchGroup(groupId: string) {
  return supabase
    .from('groups')
    .select('id, name, description, category, icon_emoji, city, is_virtual, member_count')
    .eq('id', groupId)
    .maybeSingle();
}

export async function updateGroupIcon(groupId: string, iconEmoji: string) {
  return supabase
    .from('groups')
    .update({ icon_emoji: iconEmoji })
    .eq('id', groupId)
    .select('id, icon_emoji')
    .single();
}

export async function fetchMembership(groupId: string, userId: string) {
  return supabase
    .from('group_memberships')
    .select('role, is_open_to_connect')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function fetchMembers(groupId: string) {
  return supabase.rpc('get_group_members', { p_group_id: groupId });
}

export async function fetchUpcomingEvents(groupId: string) {
  // Keep a small grace window to avoid timezone/input edge-cases hiding newly created events.
  const cutoffIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  return supabase
    .from('group_events')
    .select('id, title, description, starts_at, location_name, is_virtual, created_by')
    .eq('group_id', groupId)
    .gte('starts_at', cutoffIso)
    .order('starts_at', { ascending: true })
    .limit(20);
}

export async function fetchGroupPosts(groupId: string) {
  return supabase
    .from('group_posts')
    .select('id, author_id, content, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(20);
}

export async function fetchPostReactions(postIds: string[]) {
  if (postIds.length === 0) return { data: [], error: null };
  return supabase
    .from('group_post_reactions')
    .select('post_id, reaction, user_id')
    .in('post_id', postIds);
}

export async function fetchEventRsvps(eventIds: string[]) {
  if (eventIds.length === 0) return { data: [], error: null };
  return supabase
    .from('event_rsvps')
    .select('event_id, user_id, status, attended_at')
    .in('event_id', eventIds);
}

export async function fetchProfilesByUserIds(userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null };
  const res = await supabase
    .from('profiles')
    .select('user_id, full_name, avatar_url')
    .in('user_id', userIds);

  if (res.error || !res.data) return res;

  const mapped = await Promise.all(
    res.data.map(async (row) => ({
      ...row,
      avatar_url: await resolveProfilePhotoUrl(row.avatar_url),
    }))
  );

  return { data: mapped, error: null };
}

export async function createGroupPost(groupId: string, userId: string, content: string) {
  return supabase
    .from('group_posts')
    .insert({ group_id: groupId, author_id: userId, content })
    .select('id, author_id, content, created_at')
    .single();
}

export async function deletePostReaction(postId: string, userId: string, reaction: string) {
  return supabase
    .from('group_post_reactions')
    .delete()
    .eq('post_id', postId)
    .eq('user_id', userId)
    .eq('reaction', reaction);
}

export async function insertPostReaction(postId: string, userId: string, reaction: string) {
  return supabase
    .from('group_post_reactions')
    .insert({ post_id: postId, user_id: userId, reaction });
}

export async function logInteractionEvent(
  groupId: string,
  eventType: 'post_reaction' | 'same_event_rsvp' | 'same_event_attendance',
  targetId: string,
  sourcePostId?: string,
  sourceEventId?: string,
  metadata?: Record<string, unknown>
) {
  return supabase.rpc('log_interaction_event', {
    p_group_id: groupId,
    p_event_type: eventType,
    p_target_id: targetId,
    p_source_post_id: sourcePostId ?? null,
    p_source_event_id: sourceEventId ?? null,
    p_metadata: metadata ?? {},
  });
}

export async function setOpenSignal(groupId: string, userId: string, isOpen: boolean) {
  const payload = isOpen
    ? { is_open_to_connect: true, openness_set_at: new Date().toISOString() }
    : { is_open_to_connect: false };

  return supabase
    .from('group_memberships')
    .update(payload)
    .eq('group_id', groupId)
    .eq('user_id', userId);
}

export async function joinGroup(groupId: string, userId: string) {
  return supabase
    .from('group_memberships')
    .upsert({ group_id: groupId, user_id: userId }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
}

export async function createGroupEvent(
  groupId: string,
  userId: string,
  title: string,
  description: string,
  startsAtIso: string,
  isVirtual: boolean,
  locationName: string | null
) {
  return supabase
    .from('group_events')
    .insert({
      group_id: groupId,
      created_by: userId,
      title,
      description,
      starts_at: startsAtIso,
      location_name: isVirtual ? null : locationName,
      is_virtual: isVirtual,
    })
    .select('id, title, description, starts_at, location_name, is_virtual, created_by')
    .single();
}

export async function upsertEventRsvp(
  eventId: string,
  userId: string,
  status: 'going' | 'interested' | 'not_going'
) {
  return supabase
    .from('event_rsvps')
    .upsert({ event_id: eventId, user_id: userId, status, attended_at: null }, { onConflict: 'event_id,user_id' })
    .select('event_id, user_id, status, attended_at')
    .single();
}

export async function markEventAttended(eventId: string, userId: string) {
  return supabase
    .from('event_rsvps')
    .update({ attended_at: new Date().toISOString() })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .select('event_id, user_id, status, attended_at')
    .single();
}
