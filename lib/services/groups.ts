import { supabase } from '../supabase';

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  city: string | null;
  is_virtual: boolean;
  member_count: number;
  next_event_at: string | null;
};

export type MembershipRow = {
  group_id: string;
  last_seen_at: string | null;
};

export type RecentGroupMessageRow = {
  group_id: string;
  sender_id: string;
  sent_at: string;
  content: string;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchGroups() {
  return supabase
    .from('groups')
    .select('id, name, description, category, city, is_virtual, member_count, next_event_at')
    .order('created_at', { ascending: false });
}

export async function fetchUserMemberships(userId: string | null) {
  if (!userId) return { data: [] as MembershipRow[], error: null };
  return supabase.from('group_memberships').select('group_id, last_seen_at').eq('user_id', userId);
}

export async function fetchRecentMessagesForGroups(groupIds: string[]) {
  if (groupIds.length === 0) return { data: [] as RecentGroupMessageRow[], error: null };
  return supabase
    .from('group_messages')
    .select('group_id, sender_id, sent_at, content')
    .in('group_id', groupIds)
    .is('deleted_at', null)
    .order('sent_at', { ascending: false })
    .limit(1200);
}

export async function joinGroup(groupId: string, userId: string) {
  return supabase
    .from('group_memberships')
    .upsert({ group_id: groupId, user_id: userId }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
}

export type CreateGroupInput = {
  userId: string;
  name: string;
  description: string | null;
  category: string;
  city: string | null;
  isVirtual: boolean;
};

export async function createGroup(input: CreateGroupInput) {
  return supabase
    .from('groups')
    .insert({
      name: input.name,
      description: input.description,
      category: input.category,
      city: input.isVirtual ? null : input.city,
      is_virtual: input.isVirtual,
      created_by: input.userId,
      member_count: 1,
    })
    .select('id, name, description, category, city, is_virtual, member_count, next_event_at')
    .single();
}

export async function upsertGroupMembership(groupId: string, userId: string, role: 'member' | 'organizer' | 'moderator' = 'member') {
  return supabase
    .from('group_memberships')
    .upsert({ group_id: groupId, user_id: userId, role }, { onConflict: 'group_id,user_id', ignoreDuplicates: true });
}
