import { supabase } from '../supabase';
import { resolveProfilePhotoUrl } from './photoUrls';

export type BlockedUserRow = {
  blocked_id: string;
  reason: string | null;
  created_at: string;
};

export type ReportRow = {
  id: string;
  target_type: 'user' | 'group' | 'post' | 'group_message' | 'connection_message';
  reason: string;
  details: string | null;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
};

export type BlockedProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

export async function fetchBlockedUsers(userId: string) {
  return supabase
    .from('blocked_users')
    .select('blocked_id, reason, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
}

export async function fetchProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) return { data: [] as BlockedProfile[], error: null };
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

export async function unblockUser(userId: string, blockedId: string) {
  return supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedId);
}

export async function fetchMyReports(userId: string) {
  return supabase
    .from('reports')
    .select('id, target_type, reason, details, status, created_at')
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);
}

