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

type PendingReveal = {
  id: string;
  matchName: string;
  matchPhoto: string;
  groupName: string;
  groupEmoji: string;
  message: string;
};

type ActiveConnection = {
  id: string;
  name: string;
  photo: string;
  groupName: string;
  groupEmoji: string;
  lastMessage: string;
  lastAt: string;
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

export default function ConnectionsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
  const [activeConnections, setActiveConnections] = useState<ActiveConnection[]>([]);

  const screenFade = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      const load = async () => {
        setLoading(true);
        screenFade.setValue(0);

        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user.id ?? null;
        if (!uid) {
          setPendingReveal(null);
          setActiveConnections([]);
          setLoading(false);
          return;
        }

        const { data: connectionsData } = await supabase
          .from('connections')
          .select('id, group_id, user_a_id, user_b_id, status, revealed_at')
          .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
          .order('revealed_at', { ascending: false });

        const rows = (connectionsData ?? []) as ConnectionRow[];
        if (rows.length === 0) {
          setPendingReveal(null);
          setActiveConnections([]);
          setLoading(false);
          return;
        }

        const counterpartIds = Array.from(
          new Set(rows.map((c) => (c.user_a_id === uid ? c.user_b_id : c.user_a_id)))
        );
        const groupIds = Array.from(new Set(rows.map((c) => c.group_id)));
        const connectionIds = rows.map((c) => c.id);

        const [profilesRes, groupsRes, messagesRes] = await Promise.all([
          supabase.rpc('get_connection_profiles', { p_user_ids: counterpartIds }),
          supabase.from('groups').select('id, name, category').in('id', groupIds),
          supabase
            .from('connection_messages')
            .select('connection_id, content, sent_at')
            .in('connection_id', connectionIds)
            .is('deleted_at', null)
            .order('sent_at', { ascending: false }),
        ]);

        const profileRows = (profilesRes.data ?? []) as ProfileRow[];
        const profiles = await Promise.all(
          profileRows.map(async (p) => ({
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

        const pending = rows.filter((c) => c.status === 'pending');
        const accepted = rows.filter((c) => c.status === 'accepted');

        if (pending.length > 0) {
          const top = pending[0];
          const otherId = top.user_a_id === uid ? top.user_b_id : top.user_a_id;
          const p = profileByUser.get(otherId);
          const g = groupById.get(top.group_id);
          setPendingReveal({
            id: top.id,
            matchName: p?.full_name || 'Someone',
            matchPhoto: p?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&q=80',
            groupName: g?.name || 'Your group',
            groupEmoji: groupEmoji(g?.category),
            message: `You both have been consistently showing up in ${g?.name || 'this group'}.`,
          });
        } else {
          setPendingReveal(null);
        }

        setActiveConnections(
          accepted.map((c) => {
            const otherId = c.user_a_id === uid ? c.user_b_id : c.user_a_id;
            const p = profileByUser.get(otherId);
            const g = groupById.get(c.group_id);
            const m = lastMsgByConnection.get(c.id);
            return {
              id: c.id,
              name: p?.full_name || 'Connection',
              photo: p?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=200&q=80',
              groupName: g?.name || 'Group',
              groupEmoji: groupEmoji(g?.category),
              lastMessage: m?.content || 'No messages yet',
              lastAt: m?.sent_at ? new Date(m.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
            };
          })
        );

        setLoading(false);
      };

      void load();
    }, [])
  );

  // Fade in after data loads
  useEffect(() => {
    if (!loading) {
      Animated.timing(screenFade, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [loading]);

  const hasAnyData = pendingReveal !== null || activeConnections.length > 0;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        <View style={styles.header}>
          <Text style={styles.title}>Connections</Text>
          <Text style={styles.subtitle}>Your introductions and conversations</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>

        ) : !hasAnyData ? (

          /* ── Empty State ── */
          <Animated.View style={[styles.emptyWrap, { opacity: screenFade }]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.emptyScroll}>
              <View style={styles.emptyHero}>
                <View style={styles.emptyIconRing}>
                  <View style={styles.emptyIconBox}>
                    <Ionicons name="heart-outline" size={34} color={Colors.terracotta} />
                  </View>
                </View>
                <Text style={styles.emptyTitle}>No introductions yet</Text>
                <Text style={styles.emptySubtext}>
                  Participate genuinely in a group. When both of you are open — we'll make a warm, mutual introduction.
                </Text>
              </View>

              <View style={styles.howBox}>
                <Text style={styles.howTitle}>How introductions work</Text>
                <View style={styles.howSteps}>
                  <View style={styles.howStep}>
                    <Text style={styles.howStepNum}>1</Text>
                    <Text style={styles.howStepText}>Toggle "Open" in a group you're active in</Text>
                  </View>
                  <View style={styles.howStep}>
                    <Text style={styles.howStepNum}>2</Text>
                    <Text style={styles.howStepText}>We look for genuine, consistent activity between open members</Text>
                  </View>
                  <View style={styles.howStep}>
                    <Text style={styles.howStepNum}>3</Text>
                    <Text style={styles.howStepText}>When both signals align — warm introduction. Always mutual.</Text>
                  </View>
                </View>
              </View>
              <View style={{ height: 40 }} />
            </ScrollView>
          </Animated.View>

        ) : (

          /* ── Connections Layout ── */
          <Animated.View style={[styles.tabbedWrap, { opacity: screenFade }]}>
            <Animated.View style={styles.tabContentWrap}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Pending reveal */}
                {pendingReveal && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionLabel}>New Introduction</Text>
                      <View style={styles.newBadge}><Text style={styles.newBadgeText}>New</Text></View>
                    </View>
                    <TouchableOpacity style={styles.revealCard} onPress={() => router.push('/reveal')} activeOpacity={0.88}>
                      <View style={styles.revealGlow} />
                      <View style={styles.revealRow}>
                        <View style={styles.revealLeftCol}>
                          <View style={styles.revealTop}>
                            <Image source={{ uri: pendingReveal.matchPhoto }} style={styles.revealPhoto} />
                            <View style={styles.revealBadge}>
                              <Text style={styles.revealBadgeText}>✨</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.revealContent}>
                          <Text style={styles.revealName}>{pendingReveal.matchName}</Text>
                          <Text style={styles.revealGroup}>{pendingReveal.groupEmoji} via {pendingReveal.groupName}</Text>
                          <Text style={styles.revealMsg} numberOfLines={2}>{pendingReveal.message}</Text>
                        </View>
                        <View style={styles.revealChevronWrap}>
                          <Ionicons name="chevron-forward" size={20} color="rgba(245,240,232,0.85)" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Active connections */}
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>Active Connections</Text>
                  </View>
                  {activeConnections.length > 0 ? (
                    activeConnections.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.connectionCard}
                        onPress={() => router.push(`/chat/${c.id}`)}
                        activeOpacity={0.85}
                      >
                        <Image source={{ uri: c.photo }} style={styles.connPhoto} />
                        <View style={styles.connInfo}>
                          <View style={styles.connTopRow}>
                            <Text style={styles.connName} numberOfLines={1}>{c.name}</Text>
                            <View style={styles.connTopRight}>
                              <Text style={styles.connDate}>{c.lastAt}</Text>
                              <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
                            </View>
                          </View>
                          <Text style={styles.connGroup}>{c.groupEmoji} {c.groupName}</Text>
                          <Text
                            style={[styles.connLast, c.lastAt ? styles.connLastMsg : styles.connLastEmpty]}
                            numberOfLines={1}
                          >
                            {c.lastAt ? c.lastMessage : 'Start the conversation'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.activeEmptyWrap}>
                      <View style={styles.activeEmptyIconBox}>
                        <Ionicons name="chatbubbles-outline" size={22} color={Colors.brownLight} />
                      </View>
                      <Text style={styles.activeEmptyTitle}>No active connections yet</Text>
                      <Text style={styles.activeEmptyText}>
                        Accepted introductions will appear here as conversations.
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ height: 40 }} />
              </ScrollView>
            </Animated.View>

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

  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  title: { fontSize: 28, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 2 },

  // ── Empty State ──
  emptyWrap: { flex: 1 },
  emptyScroll: { paddingHorizontal: Spacing.lg },
  emptyHero: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    gap: 12,
  },
  emptyIconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(196,98,45,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyIconBox: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(196,98,45,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  emptySubtext: {
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },

  // ── Tabbed layout ──
  tabbedWrap: { flex: 1 },
  tabContentWrap: { flex: 1 },

  // ── Sections ──
  section: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  newBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },

  activeEmptyWrap: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 6,
  },
  activeEmptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  activeEmptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  activeEmptyText: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 240,
  },

  // ── Reveal card ──
  revealCard: {
    backgroundColor: Colors.brown,
    borderRadius: Radius.lg,
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  revealRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  revealLeftCol: {
    width: 68,
  },
  revealContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 4,
  },
  revealGlow: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(196,98,45,0.18)',
  },
  revealTop: { position: 'relative', width: 68, height: 68 },
  revealPhoto: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: Colors.terraLight },
  revealBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },
  revealBadgeText: { fontSize: 11 },
  revealName: { fontSize: 17, fontWeight: '800', color: Colors.cream, marginBottom: 2 },
  revealGroup: { fontSize: 11, color: Colors.brownLight, marginBottom: 8 },
  revealMsg: { fontSize: 13, color: 'rgba(245,240,232,0.72)', lineHeight: 19 },
  revealChevronWrap: {
    alignSelf: 'center',
    paddingLeft: 4,
  },

  // ── Connection cards ──
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  connPhoto: { width: 52, height: 52, borderRadius: 26 },
  connInfo: { flex: 1 },
  connTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  connTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  connName: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.ink, marginRight: 8 },
  connGroup: { fontSize: 11, color: Colors.terracotta, fontWeight: '600', marginBottom: 4 },
  connLast: { fontSize: 12, color: Colors.muted },
  connLastMsg: { color: Colors.brownMid, fontWeight: '500' },
  connLastEmpty: { fontStyle: 'italic' },
  connDate: { fontSize: 11, color: Colors.muted },

  // ── How it works ──
  howBox: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderDark,
  },
  howTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brownMid,
    marginBottom: 12,
  },
  howSteps: { gap: 10 },
  howStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
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
    flexShrink: 0,
  },
  howStepText: { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 19 },
});
