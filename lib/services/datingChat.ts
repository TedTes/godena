import { supabase } from '../supabase';

export type DatingMatchRow = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'matched' | 'unmatched' | 'blocked' | 'expired';
  matched_at: string;
};

export type DatingMessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
  read_at: string | null;
};

export type DatingProfileMini = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export async function fetchDatingMatch(matchId: string) {
  return supabase
    .from('dating_matches')
    .select('id, user_a_id, user_b_id, status, matched_at')
    .eq('id', matchId)
    .maybeSingle();
}

export async function fetchDatingCounterpartProfile(userId: string) {
  const res = await supabase.rpc('get_dating_match_profiles', { p_user_ids: [userId] });
  if (res.error || !res.data) return { data: null, error: res.error };
  const row = (res.data as DatingProfileMini[])[0] ?? null;
  return { data: row, error: null };
}

export async function fetchDatingMessages(matchId: string) {
  return supabase
    .from('dating_messages')
    .select('id, match_id, sender_id, content, sent_at, read_at')
    .eq('match_id', matchId)
    .is('deleted_at', null)
    .order('sent_at', { ascending: true })
    .limit(300);
}

export async function insertDatingMessage(matchId: string, senderId: string, content: string) {
  return supabase
    .from('dating_messages')
    .insert({ match_id: matchId, sender_id: senderId, content })
    .select('id, match_id, sender_id, content, sent_at, read_at')
    .single();
}

export async function markDatingRead(matchId: string, userId: string) {
  return supabase
    .from('dating_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .is('read_at', null)
    .neq('sender_id', userId);
}

export function subscribeToDatingMessages(
  matchId: string,
  onInsert: (row: DatingMessageRow) => void,
  onStatus?: (status: string) => void
) {
  const channel = supabase
    .channel(`dating_messages:${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'dating_messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        onInsert(payload.new as DatingMessageRow);
      }
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return channel;
}

export async function updateDatingMatchStatus(
  matchId: string,
  status: 'unmatched' | 'blocked'
) {
  const patch =
    status === 'unmatched'
      ? { status, unmatched_at: new Date().toISOString() }
      : { status };

  return supabase
    .from('dating_matches')
    .update(patch)
    .eq('id', matchId)
    .select('id, status')
    .single();
}

export async function reportDatingUser(params: {
  reporterId: string;
  reportedUserId: string;
  matchId: string;
  reason: string;
  details?: string;
}) {
  return supabase
    .from('reports')
    .insert({
      reporter_id: params.reporterId,
      reported_user_id: params.reportedUserId,
      target_type: 'user',
      target_id: params.matchId,
      reason: params.reason,
      details: params.details ?? null,
    });
}
