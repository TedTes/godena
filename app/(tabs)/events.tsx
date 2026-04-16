import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useScreenEnter } from '../../hooks/useScreenEnter';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import {
  createExternalEventChat,
  fetchGoingUserProfiles,
  fetchMembershipGroupIds,
  createEventCompanionRequest,
  fetchUnifiedEventsForUser,
  getSessionUserId,
  removeChannel,
  subscribeToGroupEvents,
  upsertExternalEventRsvp,
  type UnifiedEventRow,
} from '../../lib/services/events';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { EventCardSkeleton } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';
import {
  fetchAgentEventSuggestions,
  logAgentFeedbackEvent,
  type AgentEventSuggestion,
} from '../../lib/services/agentPipeline';

type EventCard = {
  id: string;
  source: 'group' | 'external';
  groupId: string;
  groupName: string;
  groupEmoji: string;
  title: string;
  startsAt: string;
  time: string;
  location: string;
  isVirtual: boolean;
  attendeeCount: number;
  myStatus: 'going' | 'interested' | 'not_going' | null;
  goingAvatars: (string | null)[];
  attendeeLabel?: string | null;
  externalUrl?: string | null;
  proposalId?: string | null;
  trustedGoingCount?: number;
  imageUrl?: string | null;
  isSuggested?: boolean;
  reasons?: Array<{ id: string; label: string }>;
};

type EventIntentAction = 'interested' | 'going' | 'find_company' | 'not_for_me' | 'hide_similar';

function categoryEmoji(category?: string) {
  switch (category) {
    case 'outdoors':     return '🥾';
    case 'food_drink':   return '☕';
    case 'professional': return '💼';
    case 'language':     return '🗣️';
    case 'faith':        return '✝️';
    case 'culture':      return '🎉';
    default:             return '👥';
  }
}

function normalizeExternalCategory(raw?: string | null) {
  if (!raw) return 'other';
  const v = raw.toLowerCase();
  if (v.includes('food') || v.includes('drink') || v.includes('coffee')) return 'food_drink';
  if (v.includes('outdoor') || v.includes('hiking') || v.includes('run')) return 'outdoors';
  if (v.includes('faith') || v.includes('religion') || v.includes('church')) return 'faith';
  if (v.includes('music') || v.includes('concert') || v.includes('arts') || v.includes('theatre') || v.includes('theater') || v.includes('comedy') || v.includes('dance') || v.includes('language') || v.includes('culture') || v.includes('community')) return 'culture';
  if (v.includes('sport')) return 'sports';
  if (v.includes('professional') || v.includes('business') || v.includes('career')) return 'professional';
  return 'other';
}

function cleanText(value: string) {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .trim();
}


function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatRelativeDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const tom  = new Date(now);
  tom.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === tom.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function EventsScreen() {
  const router = useRouter();
  const [filter, setFilter]   = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [events, setEvents]   = useState<EventCard[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [actingEventIds, setActingEventIds] = useState<string[]>([]);
  const viewedProposalIdsRef = useRef<Set<string>>(new Set());
  const enterStyle = useScreenEnter();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const uid = await getSessionUserId();
    if (!uid) { setEvents([]); setLoading(false); return; }
    setSessionUserId(uid);

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('city')
      .eq('user_id', uid)
      .maybeSingle();
    const userCity = (profileRow as { city?: string | null } | null)?.city ?? null;

    const [{ data: unifiedRows, error: unifiedError }, { data: suggestionRows, error: suggestionError }] = await Promise.all([
      fetchUnifiedEventsForUser(uid, userCity),
      fetchAgentEventSuggestions({ city: userCity, userId: uid, limit: 6 }),
    ]);
    if (unifiedError) { setError(unifiedError.message); setLoading(false); return; }

    // Log viewed feedback for suggestions
    const validSuggestions = (suggestionRows ?? []).filter((s) => Boolean(s.opportunityId));
    if (!suggestionError) {
      for (const suggestion of validSuggestions) {
        if (viewedProposalIdsRef.current.has(suggestion.proposalId)) continue;
        const { error: feedbackError } = await logAgentFeedbackEvent({
          proposalId: suggestion.proposalId,
          userId: uid,
          eventType: 'viewed',
          metadata: { source: 'events_screen' },
        });
        if (!feedbackError) viewedProposalIdsRef.current.add(suggestion.proposalId);
      }
    }

    const unified = (unifiedRows ?? []) as UnifiedEventRow[];
    const groupGoingIds = Array.from(
      new Set(unified.filter((e) => e.source === 'group').flatMap((e) => e.going_user_ids))
    );

    const userAvatarMap: Record<string, string | null> = {};
    if (groupGoingIds.length > 0) {
      const { data: profileRows } = await fetchGoingUserProfiles(groupGoingIds);
      const rawMap: Record<string, string | null> = {};
      for (const p of (profileRows ?? []) as Array<{ user_id: string; avatar_url: string | null }>) {
        rawMap[p.user_id] = p.avatar_url;
      }
      const resolved = await Promise.all(
        groupGoingIds.map(async (id) => ({ id, url: await resolveProfilePhotoUrl(rawMap[id] ?? null) }))
      );
      for (const { id, url } of resolved) userAvatarMap[id] = url;
    }

    // Suggestion opportunity IDs are excluded from the unified list (dedup)
    const suggestedOpportunityIds = new Set(
      validSuggestions.map((s) => s.opportunityId as string)
    );

    const externalSocialAvatarPaths = Array.from(
      new Set(
        unified
          .filter((e) => e.source === 'external')
          .flatMap((e) => e.trusted_going_avatar_urls ?? [])
          .filter((value): value is string => Boolean(value))
      )
    );
    const externalSocialAvatarMap: Record<string, string | null> = {};
    if (externalSocialAvatarPaths.length > 0) {
      const resolved = await Promise.all(
        externalSocialAvatarPaths.map(async (path) => ({ path, url: await resolveProfilePhotoUrl(path) }))
      );
      for (const { path, url } of resolved) externalSocialAvatarMap[path] = url;
    }

    // Convert suggestions to EventCards (shown at top, with isSuggested flag)
    const suggestionCards: EventCard[] = validSuggestions.map((s) => ({
      id:            s.opportunityId as string,
      source:        'external' as const,
      groupId:       'external',
      groupName:     s.city ?? 'Local event',
      groupEmoji:    '🗓️',
      title:         s.title,
      startsAt:      s.startsAt ?? new Date().toISOString(),
      time:          s.startsAt ? formatTime(s.startsAt) : '',
      location:      s.venueName ?? s.city ?? 'TBA',
      isVirtual:     false,
      attendeeCount: 0,
      myStatus:      null,
      goingAvatars:  [],
      proposalId:    s.proposalId,
      imageUrl:      s.imageUrl ?? null,
      isSuggested:   true,
      reasons:       s.reasons.slice(0, 2),
    }));

    // Regular events (suggestions deduped out)
    const regularCards: EventCard[] = unified
      .filter((e) => !(e.source === 'external' && suggestedOpportunityIds.has(e.id)))
      .map((e) => {
        const isExternal = e.source === 'external';
        const cat = normalizeExternalCategory(e.category);
        const rawLocation = e.is_virtual ? 'Virtual' : (e.location_name || 'TBA');
        const location = isExternal ? cleanText(rawLocation) : rawLocation;
        const trustedAvatarUrls = (e.trusted_going_avatar_urls ?? []).map((path) =>
          path ? externalSocialAvatarMap[path] ?? null : null
        );
        return {
          id:            e.id,
          source:        e.source,
          groupId:       e.group_id ?? 'external',
          groupName:     e.group_name ?? (e.city ?? 'Local event'),
          groupEmoji:    categoryEmoji(isExternal ? cat : e.category ?? undefined),
          title:         e.title,
          startsAt:      e.starts_at,
          time:          formatTime(e.starts_at),
          location,
          isVirtual:     e.is_virtual,
          attendeeCount: e.attendee_count,
          myStatus:      e.my_status as EventCard['myStatus'],
          goingAvatars:  isExternal ? trustedAvatarUrls : e.going_user_ids.map((id) => userAvatarMap[id] ?? null),
          attendeeLabel: e.attendee_label ?? null,
          externalUrl:   e.source_url,
          proposalId:    e.proposal_id ?? null,
          trustedGoingCount: isExternal ? e.trusted_going_count ?? 0 : undefined,
          imageUrl:      isExternal ? (e.image_url ?? null) : null,
        };
      });

    setEvents([...suggestionCards, ...regularCards]);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active  = true;
      let channel: ReturnType<typeof subscribeToGroupEvents> = null;

      const boot = async () => {
        await load();
        if (!active) return;
        const uid = await getSessionUserId();
        if (!uid) return;
        const { data: membershipRows } = await fetchMembershipGroupIds(uid);
        const groupIds = Array.from(
          new Set(((membershipRows ?? []) as Array<{ group_id: string }>).map((m) => m.group_id))
        );
        channel = subscribeToGroupEvents(groupIds, () => { if (active) void load(); });
      };

      void boot();
      return () => { active = false; if (channel) void removeChannel(channel); };
    }, [load])
  );

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.myStatus === 'going' || e.myStatus === 'interested');
  }, [events, filter]);


  const updateExternalCardStatus = useCallback((eventId: string, next: EventCard['myStatus']) => {
    setEvents((prev) => prev.map((event) => {
      if (event.id !== eventId || event.source !== 'external') return event;
      const wasGoing = event.myStatus === 'going';
      const willBeGoing = next === 'going';
      return {
        ...event,
        myStatus: next,
        attendeeCount: wasGoing === willBeGoing
          ? event.attendeeCount
          : Math.max(0, event.attendeeCount + (willBeGoing ? 1 : -1)),
      };
    }));
  }, []);

  const hideExternalCard = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  }, []);

  const handleExternalEventIntent = useCallback(async (event: EventCard, action: EventIntentAction) => {
    if (!sessionUserId || actingEventIds.includes(event.id) || event.source !== 'external') return;
    setActingEventIds((prev) => Array.from(new Set([...prev, event.id])));

    try {
      if (action === 'interested' || action === 'going') {
        const { error: rsvpError } = await upsertExternalEventRsvp(event.id, sessionUserId, action);
        if (rsvpError) throw new Error(rsvpError.message);
        updateExternalCardStatus(event.id, action);

        if (event.proposalId) {
          const { error: feedbackError } = await logAgentFeedbackEvent({
            proposalId: event.proposalId,
            userId: sessionUserId,
            eventType: action === 'going' ? 'rsvped_event' : 'clicked',
            metadata: { source: 'events_card', action },
          });
          if (feedbackError) console.warn('logAgentFeedbackEvent(intent) failed', feedbackError.message);
        }
        Alert.alert(
          action === 'going' ? "You're going" : "You're interested",
          "The attendee thread is open to people who RSVP'd.",
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open thread',
              onPress: () => {
                void (async () => {
                  const { groupId, error } = await createExternalEventChat(event.id);
                  if (error || !groupId) {
                    Alert.alert('Could not open thread', error ?? 'Please try again.');
                    return;
                  }
                  router.push(`/group/chat/${groupId}`);
                })();
              },
            },
          ]
        );
        return;
      }

      if (action === 'find_company') {
        const { ok, error } = await createEventCompanionRequest(event.id);
        if (!ok) throw new Error(error ?? 'Please try again.');
        updateExternalCardStatus(event.id, event.myStatus === 'going' ? 'going' : 'interested');
        if (event.proposalId) {
          const { error: feedbackError } = await logAgentFeedbackEvent({
            proposalId: event.proposalId,
            userId: sessionUserId,
            eventType: 'clicked',
            metadata: { source: 'events_card', action },
          });
          if (feedbackError) console.warn('logAgentFeedbackEvent(find company) failed', feedbackError.message);
        }
        Alert.alert('Request saved', "We'll look for someone compatible who also wants company for this event.");
        return;
      }

      if (action === 'not_for_me') {
        const { error: rsvpError } = await upsertExternalEventRsvp(event.id, sessionUserId, 'not_going');
        if (rsvpError) throw new Error(rsvpError.message);
        if (event.proposalId) {
          const { error: feedbackError } = await logAgentFeedbackEvent({
            proposalId: event.proposalId,
            userId: sessionUserId,
            eventType: 'dismissed',
            metadata: { source: 'events_card', action },
          });
          if (feedbackError) throw new Error(feedbackError.message);
        } else {
          console.warn('Not for me did not log proposal feedback because proposalId is missing', event.id);
        }
        hideExternalCard(event.id);
        return;
      }

      const { error: rsvpError } = await upsertExternalEventRsvp(event.id, sessionUserId, 'not_going');
      if (rsvpError) throw new Error(rsvpError.message);
      if (event.proposalId) {
        const { error: feedbackError } = await logAgentFeedbackEvent({
          proposalId: event.proposalId,
          userId: sessionUserId,
          eventType: 'ignored',
          metadata: {
            source: 'events_card',
            action,
            title: event.title,
            group_name: event.groupName,
          },
        });
        if (feedbackError) throw new Error(feedbackError.message);
      } else {
        console.warn('Hide similar did not log proposal feedback because proposalId is missing', event.id);
      }
      hideExternalCard(event.id);
    } catch (err) {
      Alert.alert('Could not update event', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setActingEventIds((prev) => prev.filter((id) => id !== event.id));
    }
  }, [actingEventIds, hideExternalCard, router, sessionUserId, updateExternalCardStatus]);

  const hasSuggestions = visibleEvents.some((e) => e.isSuggested);

  const renderHeader = () => hasSuggestions ? (
    <View style={styles.suggestionHeaderRow}>
      <Text style={styles.suggestionSectionLabel}>Suggested For You</Text>
      <View style={styles.suggestionHintPill}>
        <Ionicons name="sparkles-outline" size={12} color={Colors.terracotta} />
        <Text style={styles.suggestionHintText}>Picked for you</Text>
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Events</Text>
            <Text style={styles.headerSub}>
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* ── Filter tabs ── */}
        <View style={styles.tabRow}>
          {(['all', 'mine'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.tabBtn, filter === f && styles.tabBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
                {f === 'all' ? 'All Events' : "RSVP'd"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.skeletonList}>
            {Array.from({ length: 3 }).map((_, i) => <EventCardSkeleton key={i} />)}
          </View>
        ) : (
          <FlatList
            data={visibleEvents}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={<EmptyState error={error} filter={filter} />}
            renderItem={({ item: ev, index }) => (
              <>
                {!ev.isSuggested && index > 0 && visibleEvents[index - 1]?.isSuggested && (
                  <View style={styles.sectionDivider}>
                    <Text style={styles.sectionDividerText}>All Events</Text>
                  </View>
                )}
                <EventItem
                  ev={ev}
                  acting={actingEventIds.includes(ev.id)}
                  onPress={() => {
                    if (ev.source === 'external') {
                      router.push(`/event/external/${ev.id}`);
                    } else {
                      router.push(`/event/${ev.id}`);
                    }
                  }}
                  onIntent={(action) => void handleExternalEventIntent(ev, action)}
                />
              </>
            )}
          />
        )}
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

// Fades an image in on load to avoid abrupt pop-in
function FadeImage({ uri, style }: { uri: string; style: object }) {
  const opacity = useRef(new Animated.Value(0)).current;
  return (
    <Animated.Image
      source={{ uri }}
      style={[style, { opacity }]}
      onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()}
    />
  );
}

function EventItem({
  ev,
  acting,
  onPress,
  onIntent,
}: {
  ev: EventCard;
  acting: boolean;
  onPress: () => void;
  onIntent: (action: EventIntentAction) => void;
}) {
  const d        = new Date(ev.startsAt);
  const month    = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day      = d.getDate();
  const isGoing  = ev.myStatus === 'going';
  const isMaybe  = ev.myStatus === 'interested';
  const relDate  = formatRelativeDate(ev.startsAt);
  const isToday  = relDate === 'Today';
  const isExternal = ev.source === 'external';
  const socialProofCount = isExternal ? ev.trustedGoingCount ?? 0 : ev.attendeeCount;
  const goingLabel = isExternal && socialProofCount > 0
    ? `${socialProofCount} from your groups going`
    : `${ev.attendeeCount} going`;

  // Real avatars only — skip placeholder fallbacks
  const realAvatars = ev.goingAvatars.filter((uri): uri is string => Boolean(uri)).slice(0, 3);
  const extraCount  = socialProofCount > realAvatars.length ? socialProofCount - realAvatars.length : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {/* ── Top content row ── */}
      <View style={styles.cardTopRow}>
        {/* Date block */}
        <View style={[
          styles.dateBlock,
          isGoing && styles.dateBlockGoing,
          isToday && styles.dateBlockToday,
          isExternal && !ev.isSuggested && styles.dateBlockExternal,
          ev.isSuggested && styles.dateBlockSuggested,
        ]}>
          {ev.isSuggested && <Text style={styles.dateBlockBadge}>✦</Text>}
          <Text style={styles.dateMonth}>{month}</Text>
          <Text style={styles.dateDay}>{day}</Text>
        </View>

        {/* Card body */}
        <View style={styles.cardBody}>
          {/* Suggested badge row OR group pill */}
          {ev.isSuggested ? (
            <View style={styles.suggestedTopRow}>
              <View style={styles.suggestedBadge}>
                <Text style={styles.suggestedBadgeText}>Suggested</Text>
              </View>
              <Text style={styles.suggestedMatchText}>Strong match</Text>
            </View>
          ) : (
            <View style={styles.groupPill}>
              <Text style={styles.groupPillText}>{ev.groupEmoji} {ev.groupName}</Text>
            </View>
          )}

          <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={Colors.muted} />
            <Text style={[styles.metaText, isToday && styles.metaTextToday]}>
              {relDate} · {ev.time}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons
              name={ev.isVirtual ? 'globe-outline' : 'location-outline'}
              size={12}
              color={ev.isVirtual ? Colors.olive : Colors.muted}
            />
            <Text style={[styles.metaText, ev.isVirtual && styles.metaTextVirtual]} numberOfLines={1}>
              {ev.location}
            </Text>
            {ev.isVirtual && <View style={styles.virtualPill}><Text style={styles.virtualPillText}>Online</Text></View>}
          </View>

          {/* Real avatar stack — only when photos exist */}
          {realAvatars.length > 0 && (
            <View style={styles.avatarRow}>
              {realAvatars.map((uri, i) => (
                <FadeImage
                  key={i}
                  uri={uri}
                  style={[styles.avatar, { marginLeft: i === 0 ? 0 : -8 }]}
                />
              ))}
              {extraCount > 0 && (
                <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -8 }]}>
                  <Text style={styles.avatarOverflowText}>+{extraCount}</Text>
                </View>
              )}
              <Text style={styles.goingLabel} numberOfLines={1}>{goingLabel}</Text>
            </View>
          )}

          {/* Group event status badge */}
          {!isExternal && (
            <View style={styles.cardFooter}>
              {isGoing ? (
                <View style={styles.statusGoing}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                  <Text style={styles.statusGoingText}>Going</Text>
                </View>
              ) : isMaybe ? (
                <View style={styles.statusMaybe}>
                  <Text style={styles.statusMaybeText}>👀 Interested</Text>
                </View>
              ) : (
                <View style={styles.statusRsvp}>
                  <Text style={styles.statusRsvpText}>RSVP</Text>
                  <Ionicons name="chevron-forward" size={11} color={Colors.terracotta} />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Event image */}
        {ev.imageUrl ? (
          <FadeImage uri={ev.imageUrl} style={styles.cardThumb} />
        ) : null}
      </View>

      {/* ── Action bar (external events only) ── */}
      {isExternal && (
        <View style={styles.cardActionBar}>
          <TouchableOpacity
            style={styles.actionBarBtn}
            activeOpacity={0.65}
            disabled={acting}
            onPress={(e) => { e.stopPropagation(); onIntent('not_for_me'); }}
          >
            <Ionicons name="close-outline" size={20} color={Colors.muted} />
            <Text style={styles.actionBarLabel}>Pass</Text>
          </TouchableOpacity>

          <View style={styles.actionBarDivider} />

          <TouchableOpacity
            style={styles.actionBarBtn}
            activeOpacity={0.65}
            disabled={acting}
            onPress={(e) => { e.stopPropagation(); onIntent('find_company'); }}
          >
            <Ionicons name="people-outline" size={20} color={Colors.terracotta} />
            <Text style={[styles.actionBarLabel, { color: Colors.terracotta }]}>Company</Text>
          </TouchableOpacity>

          <View style={styles.actionBarDivider} />

          <TouchableOpacity
            style={styles.actionBarBtn}
            activeOpacity={0.65}
            disabled={acting}
            onPress={(e) => { e.stopPropagation(); onIntent('going'); }}
          >
            <Ionicons
              name={isGoing ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={20}
              color={isGoing ? Colors.olive : Colors.brownMid}
            />
            <Text style={[styles.actionBarLabel, isGoing && { color: Colors.olive, fontWeight: '700' }]}>
              {isGoing ? 'Going ✓' : 'Going'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ error, filter }: { error: string; filter: 'all' | 'mine' }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIconBox}>
        <Ionicons name="calendar-outline" size={32} color={Colors.muted} />
      </View>
      <Text style={styles.emptyTitle}>{error ? 'Could not load events' : 'No upcoming events'}</Text>
      <Text style={styles.emptyText}>
        {error || (filter === 'mine'
          ? "Events you RSVP'd to will appear here."
          : "Nothing in your groups yet — join a new group or create an event to get things started.")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe:      { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Header ──
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.ink },
  headerSub:   { fontSize: 13, color: Colors.muted, marginTop: 2 },

  // ── Tabs ──
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabBtn:       { flex: 1, height: 40, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  tabBtnActive: { backgroundColor: Colors.white },
  tabText:      { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta, fontWeight: '700' },

  // ── List ──
  list: { paddingHorizontal: Spacing.lg, gap: 10, paddingBottom: 32 },
  skeletonList: { paddingHorizontal: Spacing.lg, gap: 10, paddingTop: 4 },
  suggestionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  suggestionSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.muted,
  },
  suggestionHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(196,98,45,0.10)',
  },
  suggestionHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
  },
  // ── Section divider between suggested and regular events ──
  sectionDivider: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  sectionDividerText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: Colors.muted,
  },

  // ── Card ──
  card: {
    flexDirection: 'column',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.ink,
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
  },

  // Date block
  dateBlock: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.terracotta,
    paddingVertical: 16,
    gap: 2,
  },
  dateBlockGoing: { backgroundColor: Colors.olive },
  dateBlockToday: { backgroundColor: Colors.terraDim },
  dateBlockExternal: { backgroundColor: Colors.brownMid },
  dateBlockSuggested: { backgroundColor: Colors.terracotta },
  dateBlockBadge: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: -2,
  },
  dateMonth: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.8,
  },
  dateDay: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.white,
    lineHeight: 28,
  },

  // Card body
  cardBody: { flex: 1, padding: 12, gap: 4 },

  // Suggested card elements
  suggestedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  suggestedBadge: {
    borderRadius: Radius.full,
    backgroundColor: Colors.brown,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  suggestedBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.cream,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  suggestedMatchText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.olive,
  },

  // Image thumbnail
  cardThumb: {
    width: 72,
    alignSelf: 'stretch',
  },

  groupPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  groupPillText: { fontSize: 10, fontWeight: '700', color: Colors.brownMid },

  eventTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, lineHeight: 20 },

  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:     { fontSize: 12, color: Colors.muted, flex: 1 },
  metaTextToday:{ color: Colors.terracotta, fontWeight: '600' },

  // Group event status footer
  cardFooter: {
    marginTop: 6,
  },

  // Real avatar row
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 0,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.warmWhite,
  },
  avatarOverflow: {
    backgroundColor: Colors.paper,
    borderColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  avatarOverflowText: { fontSize: 8, fontWeight: '800', color: Colors.muted },
  goingLabel: { fontSize: 11, color: Colors.muted, marginLeft: 6, flexShrink: 1 },

  // ── Action bar ──
  cardActionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  actionBarBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
  },
  actionBarLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.muted,
  },
  actionBarDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },

  // Virtual badge
  metaTextVirtual: { color: Colors.olive },
  virtualPill: {
    backgroundColor: 'rgba(122,140,92,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(122,140,92,0.25)',
  },
  virtualPillText: { fontSize: 9, fontWeight: '700', color: Colors.olive, letterSpacing: 0.3 },

  statusGoing: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusGoingText: { fontSize: 12, fontWeight: '700', color: Colors.success },

  statusMaybe: {},
  statusMaybeText: { fontSize: 12, color: Colors.gold, fontWeight: '600' },

  statusRsvp: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  statusRsvpText: { fontSize: 12, fontWeight: '700', color: Colors.terracotta },
  // ── Empty ──
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: Spacing.lg },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  emptyText:  { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20 },
});
