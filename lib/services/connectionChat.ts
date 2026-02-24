import { supabase } from '../supabase';

export type ConnectionRow = {
  id: string;
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'pending' | 'accepted' | 'passed' | 'unmatched' | 'closed';
  activity_suggested: string | null;
  revealed_at: string;
};

export type ProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type GroupRow = {
  id: string;
  name: string;
  category: string;
};

export type ConnectionMessageRow = {
  id: string;
  connection_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  read_at: string | null;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchConnection(connectionId: string) {
  return supabase
    .from('connections')
    .select('id, group_id, user_a_id, user_b_id, status, activity_suggested, revealed_at')
    .eq('id', connectionId)
    .maybeSingle();
}

export async function fetchProfile(userId: string) {
  return supabase
    .from('profiles')
    .select('user_id, full_name, avatar_url')
    .eq('user_id', userId)
    .maybeSingle();
}

export async function fetchGroup(groupId: string) {
  return supabase
    .from('groups')
    .select('id, name, category')
    .eq('id', groupId)
    .maybeSingle();
}

export async function fetchConnectionMessages(connectionId: string) {
  return supabase
    .from('connection_messages')
    .select('id, connection_id, sender_id, content, sent_at, read_at')
    .eq('connection_id', connectionId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: true })
    .limit(300);
}

export async function insertConnectionMessage(connectionId: string, senderId: string, content: string) {
  return supabase
    .from('connection_messages')
    .insert({ connection_id: connectionId, sender_id: senderId, content })
    .select('id, connection_id, sender_id, content, sent_at, read_at')
    .single();
}

export async function markConnectionRead(connectionId: string, userId: string) {
  return supabase
    .from('connection_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('connection_id', connectionId)
    .is('read_at', null)
    .neq('sender_id', userId);
}

export function subscribeToConnectionMessages(
  connectionId: string,
  onInsert: (row: ConnectionMessageRow) => void
) {
  const channel = supabase
    .channel(`connection_messages:${connectionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'connection_messages',
        filter: `connection_id=eq.${connectionId}`,
      },
      (payload) => {
        onInsert(payload.new as ConnectionMessageRow);
      }
    )
    .subscribe();

  return channel;
}

export async function removeChannel(channel: ReturnType<typeof supabase.channel>) {
  return supabase.removeChannel(channel);
}

export async function updateConnectionStatus(
  connectionId: string,
  status: 'unmatched' | 'closed'
) {
  return supabase
    .from('connections')
    .update({ status })
    .eq('id', connectionId)
    .select('id, status')
    .single();
}

export async function blockUser(blockerId: string, blockedId: string, reason?: string) {
  return supabase
    .from('blocked_users')
    .upsert(
      {
        blocker_id: blockerId,
        blocked_id: blockedId,
        reason: reason ?? null,
      },
      { onConflict: 'blocker_id,blocked_id' }
    );
}

export async function reportUser(params: {
  reporterId: string;
  reportedUserId: string;
  connectionId: string;
  reason: string;
  details?: string;
}) {
  return supabase
    .from('reports')
    .insert({
      reporter_id: params.reporterId,
      reported_user_id: params.reportedUserId,
      target_type: 'connection_message',
      target_id: params.connectionId,
      reason: params.reason,
      details: params.details ?? null,
    });
}
