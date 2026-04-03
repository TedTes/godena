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

type DatingMatchRow = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  status: 'matched' | 'unmatched' | 'blocked' | 'expired';
  matched_at: string;
};

type DatingMessageRow = {
  match_id: string;
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
  source: 'connection' | 'dating';
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
  const [datingModeEnabled, setDatingModeEnabled] = useState(false);
  const [datingCandidateCount, setDatingCandidateCount] = useState(0);
  const [datingMatchCount, setDatingMatchCount] = useState(0);

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

        const [connectionsRes, datingMatchesRes] = await Promise.all([
          supabase
            .from('connections')
            .select('id, group_id, user_a_id, user_b_id, status, revealed_at')
            .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
            .order('revealed_at', { ascending: false }),
          supabase
            .from('dating_matches')
            .select('id, user_a_id, user_b_id, status, matched_at')
            .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
            .eq('status', 'matched')
            .order('matched_at', { ascending: false }),
        ]);

        const rows = (connectionsRes.data ?? []) as ConnectionRow[];
        const datingMatches = (datingMatchesRes.data ?? []) as DatingMatchRow[];

        const connectionCounterpartIds = rows.map((c) => (c.user_a_id === uid ? c.user_b_id : c.user_a_id));
        const datingCounterpartIds = datingMatches.map((m) => (m.user_a_id === uid ? m.user_b_id : m.user_a_id));
        const counterpartIds = Array.from(new Set([...connectionCounterpartIds, ...datingCounterpartIds]));
        const groupIds = Array.from(new Set(rows.map((c) => c.group_id)));
        const connectionIds = rows.map((c) => c.id);
        const datingMatchIds = datingMatches.map((m) => m.id);

        const [connectionProfilesRes, datingProfilesRes, groupsRes, messagesRes, datingMessagesRes] = await Promise.all([
          counterpartIds.length > 0
            ? supabase.rpc('get_connection_profiles', { p_user_ids: counterpartIds })
            : Promise.resolve({ data: [], error: null } as any),
          counterpartIds.length > 0
            ? supabase.rpc('get_dating_match_profiles', { p_user_ids: counterpartIds })
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
          datingMatchIds.length > 0
            ? supabase
                .from('dating_messages')
                .select('match_id, content, sent_at')
                .in('match_id', datingMatchIds)
                .is('deleted_at', null)
                .order('sent_at', { ascending: false })
            : Promise.resolve({ data: [], error: null } as any),
        ]);

        const profileRows = [
          ...((connectionProfilesRes.data ?? []) as ProfileRow[]),
          ...((datingProfilesRes.data ?? []) as ProfileRow[]),
        ];
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
        const datingMessages = (datingMessagesRes.data ?? []) as DatingMessageRow[];

        const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
        const groupById = new Map(groups.map((g) => [g.id, g]));
        const lastMsgByConnection = new Map<string, MessageRow>();
        for (const m of messages) {
          if (!lastMsgByConnection.has(m.connection_id)) {
            lastMsgByConnection.set(m.connection_id, m);
          }
        }
        const lastMsgByDatingMatch = new Map<string, DatingMessageRow>();
        for (const m of datingMessages) {
          if (!lastMsgByDatingMatch.has(m.match_id)) {
            lastMsgByDatingMatch.set(m.match_id, m);
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

        const connectionCards: ActiveConnection[] = accepted.map((c) => {
          const otherId = c.user_a_id === uid ? c.user_b_id : c.user_a_id;
          const p = profileByUser.get(otherId);
          const g = groupById.get(c.group_id);
          const m = lastMsgByConnection.get(c.id);
          return {
            id: c.id,
            source: 'connection',
            name: p?.full_name || 'Connection',
            photo: p?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=200&q=80',
            groupName: g?.name || 'Group',
            groupEmoji: groupEmoji(g?.category),
            lastMessage: m?.content || 'No messages yet',
            lastAt: m?.sent_at ? new Date(m.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
          };
        });

        const datingCards: ActiveConnection[] = datingMatches.map((m) => {
          const otherId = m.user_a_id === uid ? m.user_b_id : m.user_a_id;
          const p = profileByUser.get(otherId);
          const lastDatingMessage = lastMsgByDatingMatch.get(m.id);
          return {
            id: m.id,
            source: 'dating',
            name: p?.full_name || 'Dating match',
            photo: p?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=200&q=80',
            groupName: 'Dating Mode',
            groupEmoji: '💘',
            lastMessage: lastDatingMessage?.content || 'Say hello to your match',
            lastAt: lastDatingMessage?.sent_at
              ? new Date(lastDatingMessage.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '',
          };
        });

        setActiveConnections([...datingCards, ...connectionCards]);

        // Dating state
        const [{ data: datingProfile }, { count: matchCount }] = await Promise.all([
          supabase.from('dating_profiles').select('is_enabled').eq('user_id', uid).maybeSingle(),
          supabase
            .from('dating_matches')
            .select('id', { count: 'exact', head: true })
            .or(`user_a_id.eq.${uid},user_b_id.eq.${uid}`)
            .eq('status', 'matched'),
        ]);
        const datingEnabled = (datingProfile as { is_enabled?: boolean } | null)?.is_enabled ?? false;
        setDatingModeEnabled(datingEnabled);
        setDatingMatchCount(matchCount ?? 0);
        if (datingEnabled) {
          const { data: candidates } = await supabase.rpc('get_dating_candidates', { p_limit: 12 });
          setDatingCandidateCount(((candidates as Array<unknown> | null) ?? []).length);
        } else {
          setDatingCandidateCount(0);
        }

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

  const hasAnyData = pendingReveal !== null || activeConnections.length > 0;

  // Count badge on dating pill: candidates or matches
  const datingBadgeCount = datingCandidateCount > 0 ? datingCandidateCount : datingMatchCount;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Connections</Text>
            <Text style={styles.subtitle}>Introductions &amp; conversations</Text>
          </View>
          {datingModeEnabled && (
            <TouchableOpacity
              style={styles.datingPill}
              onPress={() => router.push('/dating-discover')}
              activeOpacity={0.82}
            >
              <View style={styles.datingPillIcon}>
                <Text style={styles.datingPillEmoji}>💘</Text>
              </View>
              <View style={styles.datingPillText}>
                <Text style={styles.datingPillLabel}>Dating</Text>
                <Text style={styles.datingPillSub}>Discover</Text>
              </View>
              {datingBadgeCount > 0 && (
                <View style={styles.datingPillBadge}>
                  <Text style={styles.datingPillBadgeText}>{datingBadgeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
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
                      <View style={styles.revealTop}>
                        <Image source={{ uri: pendingReveal.matchPhoto }} style={styles.revealPhoto} />
                        <View style={styles.revealBadge}>
                          <Text style={styles.revealBadgeText}>✨</Text>
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
                {activeConnections.length > 0 && (
                  <Text style={styles.sectionLabel}>Conversations</Text>
                )}
                <View style={styles.connectionList}>
                  {activeConnections.length > 0 ? (
                    activeConnections.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.connectionCard}
                        onPress={() => router.push(c.source === 'dating' ? `/chat/${c.id}?source=dating` : `/chat/${c.id}`)}
                        activeOpacity={0.82}
                      >
                        <View style={styles.connPhotoWrap}>
                          <Image source={{ uri: c.photo }} style={styles.connPhoto} />
                          {c.source === 'dating' && (
                            <View style={styles.connDatingDot}>
                              <Text style={styles.connDatingDotText}>💘</Text>
                            </View>
                          )}
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

  // Dating pill in header
  datingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.brown,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: Colors.terraDim,
    shadowColor: Colors.brown,
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  datingPillIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(232,133,90,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  datingPillEmoji: { fontSize: 12 },
  datingPillText: { alignItems: 'flex-start' },
  datingPillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.cream,
  },
  datingPillSub: {
    fontSize: 10,
    color: Colors.terraLight,
    fontWeight: '600',
    marginTop: -1,
  },
  datingPillBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 2,
  },
  datingPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.white,
  },

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
  revealChevronWrap: { alignSelf: 'center', paddingLeft: 4 },

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
  connDatingDot: {
    position: 'absolute',
    bottom: -1,
    right: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connDatingDotText: { fontSize: 11 },
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
