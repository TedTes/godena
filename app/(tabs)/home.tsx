import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Linking,
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
import * as WebBrowser from 'expo-web-browser';
import { Colors, Spacing, Radius, useThemeColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { fetchNotificationInboxItems } from '../../lib/services/notificationInbox';
import {
  fetchAgentEventSuggestions,
  logAgentFeedbackEvent,
  type AgentEventSuggestion,
} from '../../lib/services/agentPipeline';

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

type ActivityPost = {
  postId: string;
  groupId: string;
  authorId: string;
  authorFirstName: string;
  content: string;
  createdAt: string;
  groupName: string;
  groupEmoji: string;
};

type HomeAgentSuggestion = AgentEventSuggestion;

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

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getGreetingSub() {
  const h = new Date().getHours();
  if (h < 12) return 'Ready to show up somewhere today?';
  if (h < 17) return "What's happening in your groups?";
  return 'A good time to check in on your community.';
}

export default function HomeScreen() {
  const router = useRouter();
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<HomeGroup[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<HomeEvent[]>([]);
  const [firstName, setFirstName] = useState('there');
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [eventsThisMonth, setEventsThisMonth] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityPost[]>([]);
  const [agentSuggestions, setAgentSuggestions] = useState<HomeAgentSuggestion[]>([]);
  const enterStyle = useScreenEnter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const loadHome = useCallback(async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setSessionUserId(null);
        setLoadingProfile(false);
        setNotificationCount(0);
        return;
      }
      setSessionUserId(userId);

      const inboxItems = await fetchNotificationInboxItems(userId);
      setNotificationCount(inboxItems.length);

      const [{ data: profile }] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, city')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (profile?.full_name) {
        setFirstName(profile.full_name.split(' ')[0] ?? profile.full_name);
      }

      const userCity = (profile as { city?: string | null } | null)?.city ?? null;
      const { data: suggestionRows, error: suggestionError } = await fetchAgentEventSuggestions({
        city: userCity,
        userId,
        limit: 2,
      });
      if (suggestionError) {
        console.warn('fetchAgentEventSuggestions(home) failed', suggestionError.message);
        setAgentSuggestions([]);
      } else {
        setAgentSuggestions(suggestionRows ?? []);
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

      const { data: blockedRows } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

      const blockedUserIds = new Set<string>();
      for (const row of (blockedRows as Array<{ blocker_id: string; blocked_id: string }> | null) ?? []) {
        const otherId = row.blocker_id === userId ? row.blocked_id : row.blocker_id;
        if (otherId) blockedUserIds.add(otherId);
      }

      const memberships =
        (membershipRows as Array<{ group_id: string; is_open_to_connect: boolean }> | null) ?? [];
      const groupIds = memberships.map((m) => m.group_id);

      if (groupIds.length > 0) {
        const [groupsRes, eventsRes, activityRes] = await Promise.all([
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
          supabase.rpc('get_group_activity_feed', { p_group_ids: groupIds }),
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

        type ActivityRow = { post_id: string; group_id: string; author_id: string; author_first_name: string; content: string; created_at: string };
        const allActivityRows = (activityRes.data as ActivityRow[] | null) ?? [];
        const seenAuthors = new Set<string>();
        const activityRows = allActivityRows.filter((r) => {
          if (blockedUserIds.has(r.author_id)) return false;
          if (seenAuthors.has(r.author_id)) return false;
          seenAuthors.add(r.author_id);
          return true;
        });
        const groupNameById2 = new Map(groups.map((g) => [g.id, g.name]));
        setRecentActivity(
          activityRows.map((r) => {
            const grp = groups.find((g) => g.id === r.group_id);
            const visuals = getGroupVisuals(grp?.category ?? 'other', grp?.icon_emoji);
            return {
              postId: r.post_id,
              groupId: r.group_id,
              authorId: r.author_id,
              authorFirstName: r.author_first_name,
              content: r.content,
              createdAt: r.created_at,
              groupName: groupNameById2.get(r.group_id) ?? 'Group',
              groupEmoji: visuals.emoji,
            };
          })
        );
      } else {
        setMyGroups([]);
        setUpcomingEvents([]);
        setRecentActivity([]);
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
                <Ionicons name="notifications" size={22} color={C.brown} />
                {notificationCount > 0 && (
                  <View style={styles.notifDot}>
                    <Text style={styles.notifCountText}>{notificationCount > 9 ? '9+' : `${notificationCount}`}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {eventsThisMonth > 0 && (
            <View style={styles.momentumStrip}>
              <View style={styles.momentumDot} />
              <Text style={styles.momentumText}>
                {`${eventsThisMonth} event${eventsThisMonth !== 1 ? 's' : ''} attended this month`}
              </Text>
            </View>
          )}

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

          {agentSuggestions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Suggested Next</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/events')}>
                  <Text style={styles.seeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentSuggestionRail}>
                {agentSuggestions.map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion.proposalId}
                    style={styles.agentSuggestionCard}
                    activeOpacity={0.88}
                    onPress={async () => {
                      void logAgentFeedbackEvent({
                        proposalId: suggestion.proposalId,
                        userId: sessionUserId,
                        eventType: 'clicked',
                        metadata: { source: 'home_screen' },
                      });
                      if (suggestion.opportunityId) {
                        router.push(`/event/external/${suggestion.opportunityId}`);
                        return;
                      }
                      if (suggestion.sourceUrl) {
                        try {
                          await WebBrowser.openBrowserAsync(suggestion.sourceUrl);
                        } catch (err) {
                          try {
                            await Linking.openURL(suggestion.sourceUrl);
                          } catch {
                            console.warn('Could not open suggestion URL', err);
                          }
                        }
                      }
                    }}
                  >
                    <View style={styles.agentSuggestionTop}>
                      <View style={styles.agentSuggestionBadge}>
                        <Text style={styles.agentSuggestionBadgeText}>Agent pick</Text>
                      </View>
                      <Text style={styles.agentSuggestionScore}>{Math.round(suggestion.confidenceScore)} fit</Text>
                    </View>
                    <Text style={styles.agentSuggestionTitle} numberOfLines={2}>{suggestion.title}</Text>
                    <Text style={styles.agentSuggestionMeta} numberOfLines={2}>
                      {suggestion.startsAt ? `${formatEventDate(suggestion.startsAt)} · ${formatEventTime(suggestion.startsAt)}` : 'Flexible timing'}
                      {suggestion.venueName ? ` · ${suggestion.venueName}` : suggestion.city ? ` · ${suggestion.city}` : ''}
                    </Text>
                    {suggestion.reasons.length > 0 ? (
                      <Text style={styles.agentSuggestionReason} numberOfLines={1}>
                        {suggestion.reasons.slice(0, 2).map((reason) => reason.label).join(' • ')}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
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

          {recentActivity.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Group Activity</Text>
              </View>
              <View style={styles.activityFeed}>
                {recentActivity.map((post) => (
                  <TouchableOpacity
                    key={post.postId}
                    style={styles.activityItem}
                    activeOpacity={0.82}
                    onPress={() => router.push(`/group/${post.groupId}?tab=activity`)}
                  >
                    <View style={styles.activityAccent} />
                    <View style={styles.activityAvatarWrap}>
                      <Text style={styles.activityAvatarText}>
                        {post.authorFirstName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.activityBody}>
                      <View style={styles.activityTopRow}>
                        <Text style={styles.activityAuthor}>{post.authorFirstName}</Text>
                        <Text style={styles.activityTime}>{timeAgo(post.createdAt)}</Text>
                      </View>
                      <View style={styles.activityGroupPill}>
                        <Text style={styles.activityGroupEmoji}>{post.groupEmoji}</Text>
                        <Text style={styles.activityGroupName} numberOfLines={1}>{post.groupName}</Text>
                      </View>
                      <Text style={styles.activityContent} numberOfLines={2}>{post.content}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

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
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  greetingLeft: { flex: 1, paddingRight: 8 },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
    lineHeight: 26,
  },
  greetingSub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 3,
    lineHeight: 18,
  },
  notifBtn: {
    position: 'relative', width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center',
  },
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

  section: { marginBottom: 32 },
  agentSuggestionRail: {
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
  },
  agentSuggestionCard: {
    width: 258,
    backgroundColor: C.paper,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 7,
    marginRight: 10,
  },
  agentSuggestionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  agentSuggestionBadge: {
    backgroundColor: C.brown,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  agentSuggestionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: C.cream,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  agentSuggestionScore: {
    fontSize: 11,
    fontWeight: '700',
    color: C.olive,
  },
  agentSuggestionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: C.ink,
    lineHeight: 20,
  },
  agentSuggestionMeta: {
    fontSize: 12,
    color: C.brownMid,
    lineHeight: 17,
  },
  agentSuggestionReason: {
    fontSize: 11,
    color: C.muted,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  seeAll: {
    fontSize: 13,
    color: C.terracotta,
    fontWeight: '600',
  },

  hScroll: { paddingLeft: Spacing.lg },
  groupCard: {
    width: 160,
    height: 116,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 12,
    gap: 6,
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
    minHeight: 32,
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
    width: 160,
    height: 116,
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
    marginBottom: 10,
    backgroundColor: C.paper,
    borderRadius: Radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 14,
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
  eventTitle: { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 4 },
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


  activityFeed: { gap: 8, paddingHorizontal: Spacing.lg },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    paddingVertical: 13,
    paddingRight: 14,
    paddingLeft: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  activityAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: C.terracotta,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    marginRight: 2,
  },
  activityAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(196,98,45,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  activityAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.terracotta,
  },
  activityBody: { flex: 1, gap: 4 },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activityAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: C.ink,
  },
  activityTime: {
    fontSize: 11,
    color: C.muted,
  },
  activityGroupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(196,98,45,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activityGroupEmoji: { fontSize: 11 },
  activityGroupName: {
    fontSize: 11,
    fontWeight: '600',
    color: C.terracotta,
  },
  activityContent: {
    fontSize: 13,
    color: C.brownMid,
    lineHeight: 19,
  },

}); }
