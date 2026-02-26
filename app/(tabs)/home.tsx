import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

type HomeGroup = {
  id: string;
  name: string;
  memberCount: number;
  coverColor: string;
  emoji: string;
  iconEmoji?: string | null;
  isMember: boolean;
  isOpenToConnect: boolean;
};

type HomeEvent = {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  attendeeCount: number;
  isRsvped: boolean;
  emoji: string;
};

type RevealSuggestion = {
  connectionId: string;
  matchName: string;
  matchPhoto: string | null;
  groupName: string;
};

function getGroupVisuals(category: string, iconEmoji?: string | null): { emoji: string; coverColor: string } {
  let base: { emoji: string; coverColor: string };
  switch (category) {
    case 'outdoors': base = { emoji: '🥾', coverColor: '#7a8c5c' }; break;
    case 'food_drink': base = { emoji: '☕', coverColor: '#c4622d' }; break;
    case 'professional': base = { emoji: '💼', coverColor: '#3d2b1f' }; break;
    case 'language': base = { emoji: '🗣️', coverColor: '#c9a84c' }; break;
    case 'faith': base = { emoji: '✝️', coverColor: '#8b4220' }; break;
    case 'culture': base = { emoji: '🎉', coverColor: '#a07820' }; break;
    default: base = { emoji: '👥', coverColor: '#6b4c3b' }; break;
  }
  return { ...base, emoji: iconEmoji || base.emoji };
}

function formatEventDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatEventTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function HomeScreen() {
  const router = useRouter();
  const [myGroups, setMyGroups] = useState<HomeGroup[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeEvent[]>([]);
  const [firstName, setFirstName] = useState('there');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [revealSuggestion, setRevealSuggestion] = useState<RevealSuggestion | null>(null);
  const [openSignalGroupName, setOpenSignalGroupName] = useState<string | null>(null);

  const loadHome = useCallback(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setLoadingProfile(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile?.full_name) {
        setFirstName(profile.full_name.split(' ')[0] ?? profile.full_name);
      }

      const { data: membershipRows } = await supabase
        .from('group_memberships')
        .select('group_id, is_open_to_connect')
        .eq('user_id', userId);

      const memberships =
        (membershipRows as Array<{ group_id: string; is_open_to_connect: boolean }> | null) ?? [];
      const groupIds = memberships.map((m) => m.group_id);

      if (groupIds.length > 0) {
        const [groupsRes, eventsRes] = await Promise.all([
          supabase
            .from('groups')
            .select('id, name, member_count, category, icon_emoji')
            .in('id', groupIds),
          supabase
            .from('group_events')
            .select('id, group_id, title, starts_at, location_name, is_virtual')
            .in('group_id', groupIds)
            .order('starts_at', { ascending: true })
            .limit(50),
        ]);

        const groups =
          (groupsRes.data as Array<{ id: string; name: string; member_count: number; category: string; icon_emoji: string | null }> | null) ?? [];
        const groupById = new Map(groups.map((g) => [g.id, g]));
        const openByGroup = new Map(memberships.map((m) => [m.group_id, !!m.is_open_to_connect]));
        const liveCounts: Record<string, number> = {};
        const { data: countsData } = await supabase.rpc('get_group_member_counts', { p_group_ids: groupIds });
        for (const row of (countsData as Array<{ group_id: string; member_count: number }> | null) ?? []) {
          liveCounts[row.group_id] = row.member_count;
        }

        setMyGroups(
          groups.map((g) => {
            const visuals = getGroupVisuals(g.category, g.icon_emoji);
            return {
              id: g.id,
              name: g.name,
              memberCount: liveCounts[g.id] ?? g.member_count ?? 0,
              coverColor: visuals.coverColor,
              emoji: visuals.emoji,
              iconEmoji: g.icon_emoji,
              isMember: true,
              isOpenToConnect: openByGroup.get(g.id) ?? false,
            };
          })
        );

        const firstOpenGroup = groups.find((g) => openByGroup.get(g.id));
        setOpenSignalGroupName(firstOpenGroup?.name ?? null);

        const events =
          (eventsRes.data as Array<{
            id: string;
            group_id: string;
            title: string;
            starts_at: string;
            location_name: string | null;
            is_virtual: boolean;
          }> | null) ?? [];

        if (events.length > 0) {
          const eventIds = events.map((e) => e.id);
          const [myRsvpsRes, allGoingRes] = await Promise.all([
            supabase
              .from('event_rsvps')
              .select('event_id, status')
              .eq('user_id', userId)
              .in('event_id', eventIds),
            supabase
              .from('event_rsvps')
              .select('event_id, status')
              .eq('status', 'going')
              .in('event_id', eventIds),
          ]);

          const myRsvps =
            (myRsvpsRes.data as Array<{ event_id: string; status: 'going' | 'interested' | 'not_going' }> | null) ?? [];
          const goingRows =
            (allGoingRes.data as Array<{ event_id: string; status: 'going' }> | null) ?? [];

          const myRsvpByEvent = new Map(myRsvps.map((r) => [r.event_id, r.status]));
          const attendeeCountByEvent: Record<string, number> = {};
          for (const row of goingRows) {
            attendeeCountByEvent[row.event_id] = (attendeeCountByEvent[row.event_id] ?? 0) + 1;
          }

          // Keep "Going" events visible, and avoid strict timezone cutoff hiding same-day events.
          const cutoffMs = Date.now() - (6 * 60 * 60 * 1000);
          const visibleEvents = events
            .filter((ev) => {
              const isGoing = (myRsvpByEvent.get(ev.id) ?? 'not_going') === 'going';
              const eventMs = new Date(ev.starts_at).getTime();
              return isGoing || eventMs >= cutoffMs;
            })
            .sort((a, b) => {
              const aGoing = (myRsvpByEvent.get(a.id) ?? 'not_going') === 'going';
              const bGoing = (myRsvpByEvent.get(b.id) ?? 'not_going') === 'going';
              if (aGoing !== bGoing) return aGoing ? -1 : 1;
              return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
            });

          setUpcomingEvents(
            visibleEvents.map((ev) => {
              const sourceGroup = groupById.get(ev.group_id);
              const visuals = getGroupVisuals(sourceGroup?.category ?? 'other', sourceGroup?.icon_emoji);
              return {
                id: ev.id,
                title: ev.title,
                date: formatEventDate(ev.starts_at),
                time: formatEventTime(ev.starts_at),
                location: ev.is_virtual ? 'Virtual' : ev.location_name || 'Location TBA',
                attendeeCount: attendeeCountByEvent[ev.id] ?? 0,
                isRsvped: (myRsvpByEvent.get(ev.id) ?? 'not_going') === 'going',
                emoji: visuals.emoji,
              };
            })
          );
        } else {
          setUpcomingEvents([]);
        }
      } else {
        setMyGroups([]);
        setUpcomingEvents([]);
        setOpenSignalGroupName(null);
      }

      const { data: pendingConnection } = await supabase
        .from('connections')
        .select('id, group_id, user_a_id, user_b_id, revealed_at')
        .eq('status', 'pending')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .order('revealed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingConnection) {
        const counterpartId =
          pendingConnection.user_a_id === userId
            ? pendingConnection.user_b_id
            : pendingConnection.user_a_id;

        const [{ data: counterpart }, { data: group }] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, avatar_url')
            .eq('user_id', counterpartId)
            .maybeSingle(),
          supabase
            .from('groups')
            .select('name')
            .eq('id', pendingConnection.group_id)
            .maybeSingle(),
        ]);

        setRevealSuggestion({
          connectionId: pendingConnection.id,
          matchName: counterpart?.full_name || 'Someone',
          matchPhoto: counterpart?.avatar_url || null,
          groupName: group?.name || 'your group',
        });
      } else {
        setRevealSuggestion(null);
      }

      setLoadingProfile(false);
    }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useFocusEffect(
    useCallback(() => {
      void loadHome();
    }, [loadHome])
  );

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>Godena</Text>
            <Text style={styles.greeting}>
              Good morning, {loadingProfile ? '...' : firstName} 👋
            </Text>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.brown} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <TouchableOpacity
            style={styles.revealBanner}
            onPress={() => router.push('/reveal')}
            activeOpacity={0.88}
          >
            <View style={styles.revealLeft}>
              <Text style={styles.revealEyebrow}>
                {revealSuggestion ? '✨  New Connection' : '🌱  Keep Showing Up'}
              </Text>
              <Text style={styles.revealTitle}>
                {revealSuggestion
                  ? `You and ${revealSuggestion.matchName} might connect`
                  : 'No new introductions yet'}
              </Text>
              <Text style={styles.revealSub}>
                {revealSuggestion
                  ? `via ${revealSuggestion.groupName}`
                  : 'Mutual introductions appear after real group activity'}
              </Text>
            </View>
            <View style={styles.revealImgWrap}>
              {revealSuggestion?.matchPhoto ? (
                <Image source={{ uri: revealSuggestion.matchPhoto }} style={styles.revealImg} />
              ) : (
                <View style={[styles.revealImg, styles.revealImgFallback]}>
                  <Ionicons name="people-outline" size={26} color={Colors.brownLight} />
                </View>
              )}
              <View style={styles.revealImgBorder} />
            </View>
          </TouchableOpacity>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Groups</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/groups')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {myGroups.length > 0 ? (
                myGroups.map((g) => (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.groupCard, { backgroundColor: g.coverColor }]}
                    onPress={() => router.push(`/group/${g.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.groupCardTop}>
                      <Text style={styles.groupEmoji}>{g.emoji}</Text>
                      {g.isOpenToConnect ? (
                        <View style={styles.openBadge}>
                          <View style={styles.openDot} />
                          <Text style={styles.openBadgeText}>Open</Text>
                        </View>
                      ) : (
                        <View style={styles.openBadgeMuted}>
                          <Text style={styles.openBadgeMutedText}>Closed</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.groupCardName} numberOfLines={2}>{g.name}</Text>
                    <View style={styles.groupCardFooter}>
                      <View style={styles.groupCardMetaRow}>
                        <Ionicons name="people-outline" size={12} color="rgba(255,255,255,0.78)" />
                        <Text style={styles.groupCardMeta}>{g.memberCount} members</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.75)" />
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <View style={styles.inlineEmptyCard}>
                  <Text style={styles.inlineEmptyText}>No groups yet</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.addGroupCard}
                onPress={() => router.push('/(tabs)/groups')}
              >
                <Ionicons name="add" size={28} color={Colors.muted} />
                <Text style={styles.addGroupText}>Join a Group</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Events</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/events')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {upcomingEvents.length > 0 ? (
              upcomingEvents.slice(0, 2).map((ev) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.eventCard}
                  activeOpacity={0.85}
                  onPress={() => router.push('/(tabs)/events')}
                >
                  <View style={styles.eventIconWrap}>
                    <Text style={styles.eventIcon}>{ev.emoji}</Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{ev.title}</Text>
                    <Text style={styles.eventMeta}>
                      {ev.date} · {ev.time}
                    </Text>
                    <Text style={styles.eventLocation} numberOfLines={1}>
                      {ev.location}
                    </Text>
                  </View>
                  <View style={styles.eventRight}>
                    <View style={[styles.rsvpPill, ev.isRsvped && styles.rsvpPillActive]}>
                      <Text style={[styles.rsvpText, ev.isRsvped && styles.rsvpTextActive]}>
                        {ev.isRsvped ? 'Going' : 'RSVP'}
                      </Text>
                    </View>
                    <Text style={styles.attendeeCount}>{ev.attendeeCount} going</Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptySectionCard}>
                <Text style={styles.emptySectionText}>No upcoming events yet.</Text>
              </View>
            )}
          </View>

          <View style={styles.hintBox}>
            <Text style={styles.hintIcon}>🌱</Text>
            <Text style={styles.hintText}>
              {openSignalGroupName ? (
                <>
                  You're open to a connection in <Text style={styles.hintBold}>{openSignalGroupName}</Text>. Keep showing up - it matters.
                </>
              ) : (
                <>
                  Toggle openness in a group when you're ready. Introductions stay private and mutual.
                </>
              )}
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
  },
  notifBtn: { position: 'relative', padding: 6 },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.terracotta,
    borderWidth: 1.5,
    borderColor: Colors.cream,
  },
  scroll: { paddingTop: Spacing.md },

  revealBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.brown,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  revealLeft: { flex: 1, paddingRight: Spacing.md },
  revealEyebrow: {
    fontSize: 11,
    color: Colors.terraLight,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  revealTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.cream,
    marginBottom: 4,
    lineHeight: 24,
  },
  revealSub: {
    fontSize: 13,
    color: Colors.brownLight,
  },
  revealImgWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  revealImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  revealImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
  },
  revealImgBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: Colors.terraLight,
  },

  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },
  seeAll: {
    fontSize: 13,
    color: Colors.terracotta,
    fontWeight: '600',
  },

  hScroll: { paddingLeft: Spacing.lg },
  groupCard: {
    width: 136,
    height: 92,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 10,
    gap: 8,
  },
  groupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupEmoji: { fontSize: 28, marginTop: 3 },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeText: {
    fontSize: 10,
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  openBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeMutedText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5a9e6f',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  groupCardName: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 16,
    minHeight: 36,
  },
  groupCardFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupCardMeta: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.68)',
    fontWeight: '400',
  },
  inlineEmptyCard: {
    width: 136,
    height: 92,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  inlineEmptyText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  addGroupCard: {
    width: 136,
    height: 92,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
    gap: 8,
  },
  addGroupText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  eventIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIcon: { fontSize: 22 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  eventMeta: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginBottom: 2 },
  eventLocation: { fontSize: 11, color: Colors.muted },
  eventRight: { alignItems: 'flex-end', gap: 4 },
  rsvpPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cream,
  },
  rsvpPillActive: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
  },
  rsvpText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  rsvpTextActive: { color: Colors.white },
  attendeeCount: { fontSize: 10, color: Colors.muted },
  emptySectionCard: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptySectionText: { color: Colors.muted, fontSize: 13 },

  hintBox: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    borderLeftWidth: 3,
    borderLeftColor: Colors.olive,
  },
  hintIcon: { fontSize: 18, marginTop: 1 },
  hintText: { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 20 },
  hintBold: { color: Colors.brown, fontWeight: '700' },
});
