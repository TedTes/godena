import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useScreenEnter } from '../../hooks/useScreenEnter';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, useThemeColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { fetchNotificationInboxItems } from '../../lib/services/notificationInbox';

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

function getGreetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getGreetingEmoji() {
  const h = new Date().getHours();
  if (h < 12) return '☕';
  if (h < 17) return '☀️';
  return '🌙';
}

function getGreetingSub() {
  const h = new Date().getHours();
  if (h < 12) return 'Ready to show up somewhere today?';
  if (h < 17) return "What's happening in your groups?";
  return 'A good time to check in on your community.';
}

export default function HomeScreen() {
  const router = useRouter();
  const [myGroups, setMyGroups] = useState<HomeGroup[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeEvent[]>([]);
  const [firstName, setFirstName] = useState('there');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [revealSuggestions, setRevealSuggestions] = useState<RevealSuggestion[]>([]);
  const [eventsThisMonth, setEventsThisMonth] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const enterStyle = useScreenEnter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const loadHome = useCallback(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setLoadingProfile(false);
        setNotificationCount(0);
        return;
      }

      const inboxItems = await fetchNotificationInboxItems(userId);
      setNotificationCount(inboxItems.length);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile?.full_name) {
        setFirstName(profile.full_name.split(' ')[0] ?? profile.full_name);
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { count: attendedCount } = await supabase
        .from('event_rsvps')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('attended_at', 'is', null)
        .gte('attended_at', startOfMonth.toISOString());
      setEventsThisMonth(attendedCount ?? 0);

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
      }

      const { data: pendingConnections } = await supabase
        .from('connections')
        .select('id, group_id, user_a_id, user_b_id, revealed_at')
        .eq('status', 'pending')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .order('revealed_at', { ascending: false })
        .limit(5);

      const pendingRows = (pendingConnections as Array<{
        id: string;
        group_id: string;
        user_a_id: string;
        user_b_id: string;
      }> | null) ?? [];

      if (pendingRows.length > 0) {
        const counterpartIds = pendingRows.map((c) => (
          c.user_a_id === userId ? c.user_b_id : c.user_a_id
        ));
        const groupIdsForPending = pendingRows.map((c) => c.group_id);
        const [{ data: counterpartRows }, { data: groupRows }] = await Promise.all([
          supabase.rpc('get_connection_profiles', { p_user_ids: counterpartIds }),
          supabase.from('groups').select('id, name').in('id', groupIdsForPending),
        ]);

        const counterpartById = new Map(
          (((counterpartRows as Array<{ user_id: string; full_name: string | null; avatar_url: string | null }> | null) ?? [])
            .map((r) => [r.user_id, r]))
        );
        const groupNameById = new Map(
          (((groupRows as Array<{ id: string; name: string }> | null) ?? [])
            .map((g) => [g.id, g.name]))
        );

        const built = await Promise.all(
          pendingRows.map(async (row) => {
            const counterpartId = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
            const counterpart = counterpartById.get(counterpartId);
            const matchPhoto = counterpart?.avatar_url
              ? await resolveProfilePhotoUrl(counterpart.avatar_url)
              : null;
            return {
              connectionId: row.id,
              matchName: counterpart?.full_name || 'Someone',
              matchPhoto,
              groupName: groupNameById.get(row.group_id) || 'your group',
            } satisfies RevealSuggestion;
          })
        );

        setRevealSuggestions(built);
      } else {
        setRevealSuggestions([]);
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
        <Animated.View style={[{ flex: 1 }, enterStyle]}>
          <View style={styles.header}>
            {/* Top row: logo */}
            <Image source={require('../../assets/logo-temp.png')} style={styles.wordmarkLogo} resizeMode="contain" />
            {/* Greeting row: text + bell on same line */}
            <View style={styles.greetingRow}>
              <View style={styles.greetingLeft}>
                <Text style={styles.greeting}>
                  {loadingProfile ? '...' : `${getGreetingWord()}, ${firstName} ${getGreetingEmoji()}`}
                </Text>
                {!loadingProfile && (
                  <Text style={styles.greetingSub}>{getGreetingSub()}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => router.push('/notification-inbox')}
                activeOpacity={0.8}
              >
                <Ionicons name="notifications-outline" size={22} color={C.brown} />
                {notificationCount > 0 && (
                  <View style={styles.notifDot}>
                    <Text style={styles.notifCountText}>{notificationCount > 9 ? '9+' : `${notificationCount}`}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {revealSuggestions.length > 0 && (
            <View style={styles.revealStack}>
              {revealSuggestions.map((suggestion, idx) => (
                <TouchableOpacity
                  key={suggestion.connectionId}
                  style={styles.revealBanner}
                  onPress={() => router.push(`/reveal?connectionId=${suggestion.connectionId}`)}
                  activeOpacity={0.88}
                >
                  <View style={styles.revealLeft}>
                    <Text style={styles.revealEyebrow}>
                      ✨  New Introduction{idx === 0 && revealSuggestions.length > 1 ? ` • ${revealSuggestions.length} waiting` : ''}
                    </Text>
                    <Text style={styles.revealTitle}>
                      {`You and ${suggestion.matchName} might connect`}
                    </Text>
                    <Text style={styles.revealSub}>
                      {`via ${suggestion.groupName}`}
                    </Text>
                  </View>
                  <View style={styles.revealImgWrap}>
                    {suggestion.matchPhoto ? (
                      <Image source={{ uri: suggestion.matchPhoto }} style={styles.revealImg} />
                    ) : (
                      <View style={[styles.revealImg, styles.revealImgFallback]}>
                        <Ionicons name="people-outline" size={26} color={C.brownLight} />
                      </View>
                    )}
                    <View style={styles.revealImgBorder} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {eventsThisMonth > 0 && (
            <View style={styles.momentumStrip}>
              <View style={styles.momentumDot} />
              <Text style={styles.momentumText}>
                {`${eventsThisMonth} event${eventsThisMonth !== 1 ? 's' : ''} attended this month — reveals unlock through consistent presence`}
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Groups</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/groups?tab=discover')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {myGroups.length > 0 ? (
                <>
                  {myGroups.map((g) => (
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
                  ))}
                  <TouchableOpacity
                    style={styles.addGroupCard}
                    onPress={() => router.push('/(tabs)/groups?tab=discover')}
                  >
                    <Ionicons name="add" size={28} color={C.muted} />
                    <Text style={styles.addGroupText}>Join a Group</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={styles.addGroupCard}
                  onPress={() => router.push('/(tabs)/groups?tab=discover')}
                >
                  <Ionicons name="add" size={28} color={C.muted} />
                  <Text style={styles.addGroupText}>Join a Group</Text>
                </TouchableOpacity>
              )}
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
                  onPress={() => router.push(`/event/${ev.id}`)}
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
              <View style={styles.eventsEmpty}>
                <View style={styles.eventsEmptyIcon}>
                  <Ionicons name="calendar-outline" size={28} color={C.terracotta} />
                </View>
                <Text style={styles.eventsEmptyTitle}>Nothing planned yet</Text>
                <Text style={styles.eventsEmptySub}>
                  {myGroups.length === 0
                    ? 'Join a group to unlock events from your community.'
                    : 'Events from your groups will show here once organizers add them.'}
                </Text>
                {myGroups.length === 0 && (
                  <TouchableOpacity
                    style={styles.eventsEmptyBtn}
                    onPress={() => router.push('/(tabs)/groups?tab=discover')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.eventsEmptyBtnText}>Browse groups</Text>
                    <Ionicons name="arrow-forward" size={12} color={C.terracotta} />
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={{ height: 20 }} />
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

function makeStyles(C: typeof Colors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.cream },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  wordmarkLogo: {
    width: 96,
    height: 24,
    marginBottom: 10,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greetingLeft: { flex: 1, paddingRight: 8 },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 28,
  },
  greetingSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  notifBtn: { position: 'relative', padding: 6, marginTop: -2 },
  notifDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.terracotta,
    borderWidth: 1.5,
    borderColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCountText: { fontSize: 9, color: C.white, fontWeight: '800', lineHeight: 10 },
  scroll: { paddingTop: 8 },

  revealBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
    backgroundColor: C.brown,
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  revealStack: { gap: 0 },
  revealLeft: { flex: 1, paddingRight: Spacing.md },
  revealEyebrow: {
    fontSize: 11,
    color: C.terraLight,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  revealTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: C.cream,
    marginBottom: 6,
    lineHeight: 28,
  },
  revealSub: {
    fontSize: 13,
    color: C.brownLight,
  },
  revealImgWrap: {
    position: 'relative',
    width: 88,
    height: 88,
  },
  revealImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  revealImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.paper,
  },
  revealImgBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: C.terraLight,
  },

  section: { marginBottom: 32 },
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
    color: C.ink,
  },
  seeAll: {
    fontSize: 13,
    color: C.terracotta,
    fontWeight: '600',
  },

  hScroll: { paddingLeft: Spacing.lg },
  groupCard: {
    width: 166,
    height: 132,
    borderRadius: Radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 12,
    gap: 8,
  },
  groupCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupEmoji: { fontSize: 32, marginTop: 2 },
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
    color: C.white,
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
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 18,
    minHeight: 38,
    flex: 1,
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
  addGroupCard: {
    width: 166,
    height: 132,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: C.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
    gap: 8,
  },
  addGroupText: { fontSize: 12, color: C.muted, fontWeight: '600' },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: 14,
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 16,
  },
  eventIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  eventIcon: { fontSize: 26 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 4 },
  eventMeta: { fontSize: 13, color: C.terracotta, fontWeight: '600', marginBottom: 2 },
  eventLocation: { fontSize: 12, color: C.muted },
  eventRight: { alignItems: 'flex-end', gap: 4 },
  rsvpPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.cream,
  },
  rsvpPillActive: {
    backgroundColor: C.terracotta,
    borderColor: C.terracotta,
  },
  rsvpText: { fontSize: 11, fontWeight: '700', color: C.muted },
  rsvpTextActive: { color: C.white },
  attendeeCount: { fontSize: 10, color: C.muted },
  eventsEmpty: {
    marginHorizontal: Spacing.lg,
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    paddingVertical: 36,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    gap: 8,
  },
  eventsEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(196,98,45,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  eventsEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
    textAlign: 'center',
  },
  eventsEmptySub: {
    fontSize: 13,
    color: C.muted,
    lineHeight: 19,
    textAlign: 'center',
    maxWidth: 260,
  },
  eventsEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  eventsEmptyBtnText: {
    fontSize: 13,
    color: C.terracotta,
    fontWeight: '700',
  },

  momentumStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginTop: 10,
    marginBottom: Spacing.lg,
  },
  momentumDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.olive,
    flexShrink: 0,
  },
  momentumText: {
    flex: 1,
    fontSize: 12,
    color: C.muted,
    lineHeight: 17,
  },

}); }
