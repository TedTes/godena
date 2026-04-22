import { supabase } from '../supabase';

export type InboxItem = {
  id: string;
  kind: 'message';
  connectionId: string;
  title: string;
  subtitle: string;
  at: string;
};

type ConnectionRow = {
  id: string;
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'pending' | 'accepted' | 'passed' | 'unmatched' | 'closed';
  revealed_at: string;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
};

type GroupRow = {
  id: string;
  name: string;
};

function toRelativeTime(iso: string) {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export async function fetchNotificationInboxItems(userId: string): Promise<InboxItem[]> {
  const { data: connectionsData } = await supabase
    .from('connections')
    .select('id, group_id, user_a_id, user_b_id, status, revealed_at')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('revealed_at', { ascending: false })
    .limit(60);

  const connections = (connectionsData ?? []) as ConnectionRow[];
  if (connections.length === 0) return [];

  const counterpartIds = Array.from(
    new Set(connections.map((c) => (c.user_a_id === userId ? c.user_b_id : c.user_a_id)))
  );
  const groupIds = Array.from(new Set(connections.map((c) => c.group_id)));
  const connectionIds = connections.map((c) => c.id);

  const [profilesRes, groupsRes, unreadRes] = await Promise.all([
    supabase.rpc('get_connection_profiles', { p_user_ids: counterpartIds }),
    supabase.from('groups').select('id, name').in('id', groupIds),
    supabase
      .from('connection_messages')
      .select('connection_id, sender_id, content, sent_at, read_at')
      .in('connection_id', connectionIds)
      .is('deleted_at', null)
      .neq('sender_id', userId)
      .is('read_at', null)
      .order('sent_at', { ascending: false }),
  ]);

  const profiles = (profilesRes.data ?? []) as ProfileRow[];
  const groups = (groupsRes.data ?? []) as GroupRow[];
  const unreadRows = (unreadRes.data ??
    []) as Array<{ connection_id: string; content: string; sent_at: string; read_at: string | null }>;

  const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const unreadByConnection = new Map<string, { count: number; latest: string; sentAt: string }>();
  for (const row of unreadRows) {
    const prev = unreadByConnection.get(row.connection_id);
    if (!prev) {
      unreadByConnection.set(row.connection_id, { count: 1, latest: row.content, sentAt: row.sent_at });
    } else {
      unreadByConnection.set(row.connection_id, { ...prev, count: prev.count + 1 });
    }
  }

  const nextItems: InboxItem[] = [];
  for (const c of connections) {
    const otherId = c.user_a_id === userId ? c.user_b_id : c.user_a_id;
    const otherName = profileByUser.get(otherId)?.full_name || 'Someone';
    const groupName = groupById.get(c.group_id)?.name || 'your group';

    const unread = unreadByConnection.get(c.id);
    if (c.status === 'accepted' && unread) {
      nextItems.push({
        id: `msg:${c.id}`,
        kind: 'message',
        connectionId: c.id,
        title: `${otherName} sent you a message`,
        subtitle: unread.latest || `${unread.count} unread message${unread.count > 1 ? 's' : ''}`,
        at: toRelativeTime(unread.sentAt),
      });
    }
  }

  nextItems.sort((a, b) => a.at.localeCompare(b.at));

  return nextItems;
}
