import { supabase } from '../supabase';
import { resolveProfilePhotoUrl } from './photoUrls';

export type GroupChatGroup = {
  id: string;
  name: string;
  member_count: number;
  category: string;
  icon_emoji: string | null;
};

export type GroupChatMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchGroup(groupId: string) {
  return supabase
    .from('groups')
    .select('id, name, member_count, category, icon_emoji')
    .eq('id', groupId)
    .maybeSingle();
}

export async function fetchGroupMemberCount(groupId: string) {
  const { data, error } = await supabase.rpc('get_group_member_counts', { p_group_ids: [groupId] });
  if (error) return { data: null, error };
  const rows = (data as Array<{ group_id: string; member_count: number }> | null) ?? [];
  const match = rows.find((r) => r.group_id === groupId);
  return { data: match?.member_count ?? null, error: null };
}

export async function fetchGroupMessages(groupId: string) {
  return supabase
    .from('group_messages')
    .select('id, group_id, sender_id, content, sent_at')
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: true })
    .limit(200);
}

export async function fetchProfiles(userIds: string[]) {
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

export function subscribeToGroupMessages(
  groupId: string,
  onInsert: (row: GroupChatMessageRow) => void,
  onStatus?: (status: string) => void
) {
  const channel = supabase
    .channel(`group_messages:${groupId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_messages',
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        onInsert(payload.new as GroupChatMessageRow);
      }
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return channel;
}

export async function removeChannel(channel: ReturnType<typeof supabase.channel>) {
  return supabase.removeChannel(channel);
}

export async function markGroupSeen(groupId: string, userId: string) {
  return supabase
    .from('group_memberships')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', userId);
}

export async function insertGroupMessage(groupId: string, userId: string, content: string) {
  return supabase
    .from('group_messages')
    .insert({ group_id: groupId, sender_id: userId, content })
    .select('id')
    .single();
}

export async function triggerGroupMessagePush(groupId: string, messageId: string) {
  return supabase.functions.invoke('group-message-push', {
    body: { group_id: groupId, message_id: messageId },
  });
}
