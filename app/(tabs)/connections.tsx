import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  type ImageStyle,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';

type ConnectionRow = {
  id: string;
  group_id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'pending' | 'accepted' | 'passed' | 'unmatched' | 'closed';
  revealed_at: string;
  requested_by: string | null;
};

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  category: string;
};

type MessageRow = {
  connection_id: string;
  content: string;
  sent_at: string;
};

type ActiveConnection = {
  id: string;
  name: string;
  photo: string | null;
  groupName: string;
  groupEmoji: string;
  lastMessage: string;
  lastAt: string;
};

type PendingConnection = {
  id: string;
  name: string;
  photo: string | null;
  groupName: string;
  groupEmoji: string;
  isIncoming: boolean;
};

function groupEmoji(category?: string) {
  switch (category) {
    case 'outdoors': return '🥾';
    case 'food_drink': return '☕';
    case 'professional': return '💼';
    case 'language': return '🗣️';
    case 'faith': return '✝️';
    case 'culture': return '🎉';
    default: return '👥';
  }
}

function initialsForName(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function ProfilePhoto({
  uri,
  name,
  style,
  textStyle,
}: {
  uri?: string | null;
  name?: string | null;
  style: StyleProp<ImageStyle>;
  textStyle: StyleProp<TextStyle>;
}) {
  if (uri) {
    return <Image source={{ uri }} style={style} />;
  }

  return (
    <View style={[style as StyleProp<ViewStyle>, styles.initialsAvatar]}>
      <Text style={textStyle}>{initialsForName(name)}</Text>
    </View>
  );
}

export default function ConnectionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([]);
  const [pendingConnections, setPendingConnections] = useState<PendingConnection[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const screenFade = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        screenFade.setValue(0);

        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user.id ?? null;
        if (!uid) {
          setActiveConnections([]);
          setPendingConnections([]);
          setLoading(false);
          return;
        }

        const connectionsRes = await supabase
          .from('connections')
          .select('id, group_id, user_a_id, user_b_id, status, revealed_at, requested_by')
          .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
          .order('revealed_at', { ascending: false });

        const rows = (connectionsRes.data ?? []) as ConnectionRow[];

        const connectionCounterpartIds = rows.map((c) => (c.user_a_id === uid ? c.user_b_id : c.user_a_id));
        const counterpartIds = Array.from(new Set(connectionCounterpartIds));
        const groupIds = Array.from(new Set(rows.map((c) => c.group_id)));
        const connectionIds = rows.map((c) => c.id);

        const [connectionProfilesRes, groupsRes, messagesRes] = await Promise.all([
          counterpartIds.length > 0
            ? supabase.rpc('get_connection_profiles', { p_user_ids: counterpartIds })
            : Promise.resolve({ data: [], error: null } as any),
          groupIds.length > 0
            ? supabase.from('groups').select('id, name, category').in('id', groupIds)
            : Promise.resolve({ data: [], error: null } as any),
          connectionIds.length > 0
            ? supabase
                .from('connection_messages')
                .select('connection_id, content, sent_at')
                .in('connection_id', connectionIds)
                .is('deleted_at', null)
                .order('sent_at', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        const profileRows = ((connectionProfilesRes.data ?? []) as ProfileRow[]);
        const dedupedProfileRows = profileRows.filter(
          (row, i, arr) => arr.findIndex((p) => p.user_id === row.user_id) === i
        );

        const profiles = await Promise.all(
          dedupedProfileRows.map(async (p) => ({
            ...p,
            avatar_url: await resolveProfilePhotoUrl(p.avatar_url),
          }))
        );
        const groups = (groupsRes.data ?? []) as GroupRow[];
        const messages = (messagesRes.data ?? []) as MessageRow[];

        const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
        const groupById = new Map(groups.map((g) => [g.id, g]));
        const lastMsgByConnection = new Map<string, MessageRow>();
        for (const m of messages) {
          if (!lastMsgByConnection.has(m.connection_id)) {
            lastMsgByConnection.set(m.connection_id, m);
          }
        }

        const accepted = rows.filter((c) => c.status === 'accepted');
        const pending = rows.filter((c) => c.status === 'pending');

        const connectionCards: ActiveConnection[] = accepted.map((c) => {
          const otherId = c.user_a_id === uid ? c.user_b_id : c.user_a_id;
          const p = profileByUser.get(otherId);
          const g = groupById.get(c.group_id);
          const m = lastMsgByConnection.get(c.id);
          return {
            id: c.id,
            name: p?.full_name || 'Connection',
            photo: p?.avatar_url ?? null,
            groupName: g?.name || 'Group',
            groupEmoji: groupEmoji(g?.category),
            lastMessage: m?.content || 'No messages yet',
            lastAt: m?.sent_at ? new Date(m.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
          };
        });

        setActiveConnections(connectionCards);
        setPendingConnections(
          pending.map((c) => {
            const otherId = c.user_a_id === uid ? c.user_b_id : c.user_a_id;
            const p = profileByUser.get(otherId);
            const g = groupById.get(c.group_id);
            return {
              id: c.id,
              name: p?.full_name || 'Connection',
              photo: p?.avatar_url ?? null,
              groupName: g?.name || 'Group',
              groupEmoji: groupEmoji(g?.category),
              isIncoming: c.requested_by !== uid,
            };
          })
        );

        setLoading(false);
      };

      void load();
    }, [])
  );

  useEffect(() => {
    if (!loading) {
      Animated.timing(screenFade, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const respondToRequest = (connectionId: string, accept: boolean) => {
    if (actingId) return;
    void (async () => {
      setActingId(connectionId);
      const { error } = await supabase.rpc('respond_to_connection_request', {
        p_connection_id: connectionId,
        p_accept: accept,
      });
      setActingId(null);
      if (error) {
        Alert.alert('Could not update request', error.message);
        return;
      }
      setPendingConnections((prev) => prev.filter((c) => c.id !== connectionId));
      if (accept) {
        const accepted = pendingConnections.find((c) => c.id === connectionId);
        if (accepted) {
          setActiveConnections((prev) => [
            {
              id: accepted.id,
              name: accepted.name,
              photo: accepted.photo,
              groupName: accepted.groupName,
              groupEmoji: accepted.groupEmoji,
              lastMessage: 'No messages yet',
              lastAt: '',
            },
            ...prev,
          ]);
        }
      }
    })();
  };

  const hasAnyData = activeConnections.length > 0 || pendingConnections.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Connections</Text>
            <Text style={styles.subtitle}>Introductions &amp; conversations</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>

        ) : !hasAnyData ? (

          /* ── Empty State ── */
          <Animated.View style={[styles.emptyWrap, { opacity: screenFade }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.emptyScroll}>

              {/* Hero */}
              <View style={styles.emptyHero}>
                <View style={styles.emptyIconRing}>
                  <View style={styles.emptyIconBox}>
                    <Ionicons name="heart-outline" size={30} color={Colors.terracotta} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No introductions yet</Text>
                <Text style={styles.emptySubtext}>
                  Participate genuinely in a group. When both of you are open — we'll make a warm, mutual introduction.
                </Text>
              </View>

              {/* How it works */}
              <View style={styles.howBox}>
                <View style={styles.howTitleRow}>
                  <Ionicons name="sparkles-outline" size={14} color={Colors.terracotta} />
                  <Text style={styles.howTitle}>How introductions work</Text>
                </View>
                <View style={styles.howSteps}>
                  {[
                    'Toggle "Open" in a group you\'re active in',
                    'We look for genuine, consistent activity between open members',
                    'When both signals align — warm introduction. Always mutual.',
                  ].map((text, i) => (
                    <View key={i} style={styles.howStep}>
                      <View style={styles.howStepNumWrap}>
                        <Text style={styles.howStepNum}>{i + 1}</Text>
                        {i < 2 && <View style={styles.howStepLine} />}
                      </View>
                      <Text style={styles.howStepText}>{text}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ height: 48 }} />
            </ScrollView>
          </Animated.View>

        ) : (

          /* ── Connections Layout ── */
          <Animated.View style={[styles.contentWrap, { opacity: screenFade }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

              {/* Active connections */}
              <View style={styles.section}>
                {pendingConnections.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Requests</Text>
                    <View style={styles.connectionList}>
                      {pendingConnections.map((c) => (
                        <View key={c.id} style={styles.requestCard}>
                          <View style={styles.connPhotoWrap}>
                            <ProfilePhoto
                              uri={c.photo}
                              name={c.name}
                              style={styles.connPhoto}
                              textStyle={styles.connInitials}
                            />
                          </View>
                          <View style={styles.connInfo}>
                            <Text style={styles.connName} numberOfLines={1}>{c.name}</Text>
                            <Text style={styles.connGroup} numberOfLines={1}>{c.groupEmoji} {c.groupName}</Text>
                            <Text style={styles.requestHint}>
                              {c.isIncoming ? 'Wants to connect with you' : 'Waiting for them to accept'}
                            </Text>
                          </View>
                          {c.isIncoming ? (
                            <View style={styles.requestActions}>
                              <TouchableOpacity
                                style={styles.passBtn}
                                onPress={() => respondToRequest(c.id, false)}
                                disabled={actingId === c.id}
                              >
                                <Ionicons name="close" size={17} color={Colors.brownMid} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.acceptBtn}
                                onPress={() => respondToRequest(c.id, true)}
                                disabled={actingId === c.id}
                              >
                                {actingId === c.id ? (
                                  <ActivityIndicator size="small" color={Colors.white} />
                                ) : (
                                  <Ionicons name="checkmark" size={17} color={Colors.white} />
                                )}
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {activeConnections.length > 0 && (
                  <Text style={styles.sectionLabel}>Conversations</Text>
                )}
                <View style={styles.connectionList}>
                  {activeConnections.length > 0 ? (
                    activeConnections.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.connectionCard}
                        onPress={() => router.push(`/chat/${c.id}`)}
                        activeOpacity={0.82}
                      >
                        <View style={styles.connPhotoWrap}>
                          <ProfilePhoto
                            uri={c.photo}
                            name={c.name}
                            style={styles.connPhoto}
                            textStyle={styles.connInitials}
                          />
                        </View>
                        <View style={styles.connInfo}>
                          <View style={styles.connTopRow}>
                            <Text style={styles.connName} numberOfLines={1}>{c.name}</Text>
                            <Text style={styles.connDate}>{c.lastAt}</Text>
                          </View>
                          <Text style={styles.connGroup} numberOfLines={1}>{c.groupEmoji} {c.groupName}</Text>
                          <Text
                            style={[styles.connLast, c.lastAt ? styles.connLastMsg : styles.connLastEmpty]}
                            numberOfLines={1}
                          >
                            {c.lastAt ? c.lastMessage : 'Start the conversation'}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.border} />
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.activeEmptyWrap}>
                      <View style={styles.activeEmptyIconBox}>
                        <Ionicons name="chatbubbles-outline" size={22} color={Colors.brownLight} />
                      </View>
                      <Text style={styles.activeEmptyTitle}>No conversations yet</Text>
                      <Text style={styles.activeEmptyText}>
                        Accepted introductions will appear here.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={{ height: 48 }} />
            </ScrollView>
          </Animated.View>
        )}

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initialsAvatar: {
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 2 },

  // ── Layout ──
  contentWrap: { flex: 1 },
  scrollContent: { paddingTop: Spacing.lg, paddingBottom: 24 },

  // ── Empty State ──
  emptyWrap: { flex: 1 },
  emptyScroll: { paddingHorizontal: Spacing.lg, paddingTop: 12 },
  emptyHero: {
    alignItems: 'center',
    paddingTop: 44,
    paddingBottom: 32,
    gap: 10,
  },
  emptyIconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(196,98,45,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconBox: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(196,98,45,0.11)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  emptySubtext: {
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 270,
  },

  // ── Sections ──
  section: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 12,
  },
  newBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },

  connectionList: { gap: 8 },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  requestHint: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  requestActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeEmptyWrap: {
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
  },
  activeEmptyIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  activeEmptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  activeEmptyText: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 220,
  },

  // ── Connection cards ──
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  connPhotoWrap: { position: 'relative' },
  connPhoto: { width: 54, height: 54, borderRadius: 27 },
  connInitials: { color: Colors.brown, fontSize: 16, fontWeight: '800' },
  connInfo: { flex: 1, minWidth: 0 },
  connTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  connName: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink, marginRight: 8 },
  connGroup: { fontSize: 11, color: Colors.terracotta, fontWeight: '600', marginBottom: 3 },
  connLast: { fontSize: 12 },
  connLastMsg: { color: Colors.brownMid },
  connLastEmpty: { color: Colors.muted, fontStyle: 'italic' },
  connDate: { fontSize: 11, color: Colors.muted, flexShrink: 0 },

  // ── How it works ──
  howBox: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: Colors.borderDark,
  },
  howTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
  },
  howTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brownMid,
  },
  howSteps: { gap: 0 },
  howStep: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  howStepNumWrap: {
    alignItems: 'center',
    width: 22,
  },
  howStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.terracotta,
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  howStepLine: {
    width: 1.5,
    height: 18,
    backgroundColor: 'rgba(196,98,45,0.2)',
    marginTop: 3,
  },
  howStepText: { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 20, paddingTop: 2 },
});
