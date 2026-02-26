import { supabase } from '../supabase';
import { resolveProfilePhotoUrl } from './photoUrls';

export type PendingConnection = {
  id: string;
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'pending' | 'accepted' | 'passed' | 'unmatched' | 'closed';
  activity_suggested: string | null;
  responded_a_at: string | null;
  responded_b_at: string | null;
  revealed_at: string;
};

export type ProfileMini = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  birth_date: string | null;
};

export type GroupMini = {
  id: string;
  name: string;
  category: string;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchPendingConnections(userId: string) {
  return supabase
    .from('connections')
    .select('id, group_id, user_a_id, user_b_id, status, activity_suggested, responded_a_at, responded_b_at, revealed_at')
    .eq('status', 'pending')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('revealed_at', { ascending: false })
    .limit(5);
}

export async function fetchProfiles(userIds: string[]) {
  if (userIds.length === 0) return { data: [], error: null };
  const res = await supabase.rpc('get_connection_profiles', { p_user_ids: userIds });
  if (res.error || !res.data) return res;

  const mapped = await Promise.all(
    (res.data as ProfileMini[]).map(async (row) => ({
      ...row,
      avatar_url: await resolveProfilePhotoUrl(row.avatar_url),
    }))
  );

  return { data: mapped, error: null };
}

export async function fetchGroups(groupIds: string[]) {
  if (groupIds.length === 0) return { data: [], error: null };
  return supabase
    .from('groups')
    .select('id, name, category')
    .in('id', groupIds);
}

export async function fetchConnectionById(connectionId: string) {
  return supabase
    .from('connections')
    .select('id, group_id, user_a_id, user_b_id, status, activity_suggested, responded_a_at, responded_b_at, revealed_at')
    .eq('id', connectionId)
    .maybeSingle();
}

export async function updateConnectionDecision(
  connection: PendingConnection,
  userId: string,
  decision: 'accept' | 'pass'
) {
  const now = new Date().toISOString();
  const isA = connection.user_a_id === userId;
  const respondedField = isA ? 'responded_a_at' : 'responded_b_at';

  if (decision === 'pass') {
    return supabase
      .from('connections')
      .update({
        status: 'passed',
        [respondedField]: now,
      })
      .eq('id', connection.id)
      .select('id, group_id, user_a_id, user_b_id, status, activity_suggested, responded_a_at, responded_b_at, revealed_at')
      .single();
  }

  const nextRespondedA = isA ? now : connection.responded_a_at;
  const nextRespondedB = isA ? connection.responded_b_at : now;
  const bothAccepted = !!nextRespondedA && !!nextRespondedB;

  return supabase
    .from('connections')
    .update({
      status: bothAccepted ? 'accepted' : 'pending',
      [respondedField]: now,
    })
    .eq('id', connection.id)
    .select('id, group_id, user_a_id, user_b_id, status, activity_suggested, responded_a_at, responded_b_at, revealed_at')
    .single();
}
