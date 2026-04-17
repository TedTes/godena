import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
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

type EventIntentAction = 'interested' | 'going' | 'not_for_me' | 'hide_similar';

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
  const { width } = useWindowDimensions();
  const [filter, setFilter]   = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [events, setEvents]   = useState<EventCard[]>([]);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [sessionAvatarUrl, setSessionAvatarUrl] = useState<string | null>(null);
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
      .select('city, avatar_url')
      .eq('user_id', uid)
      .maybeSingle();
    const profile = profileRow as { city?: string | null; avatar_url?: string | null } | null;
    const userCity = profile?.city ?? null;
    const currentUserAvatarUrl = await resolveProfilePhotoUrl(profile?.avatar_url ?? null);
    setSessionAvatarUrl(currentUserAvatarUrl);

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

    const unifiedById = new Map(unified.map((e) => [e.id, e]));
    const externalAvatarsFor = (e: UnifiedEventRow | undefined) => {
      const trustedAvatarUrls = (e?.trusted_going_avatar_urls ?? []).map((path) =>
        path ? externalSocialAvatarMap[path] ?? null : null
      );
      if (e?.my_status === 'going' && currentUserAvatarUrl) {
        return Array.from(new Set([currentUserAvatarUrl, ...trustedAvatarUrls.filter(Boolean)])).slice(0, 3);
      }
      return trustedAvatarUrls;
    };

    // Convert suggestions to EventCards (shown at top, with isSuggested flag)
    const suggestionCards: EventCard[] = validSuggestions.map((s) => {
      const matched = unifiedById.get(s.opportunityId as string);
      const startsAt = matched?.starts_at ?? s.startsAt ?? new Date().toISOString();
      return {
        id:            s.opportunityId as string,
        source:        'external' as const,
        groupId:       'external',
        groupName:     matched?.group_name ?? s.city ?? 'Local event',
        groupEmoji:    categoryEmoji(normalizeExternalCategory(matched?.category ?? undefined)),
        title:         matched?.title ?? s.title,
        startsAt,
        time:          formatTime(startsAt),
        location:      cleanText(matched?.location_name ?? s.venueName ?? s.city ?? 'TBA'),
        isVirtual:     false,
        attendeeCount: matched?.attendee_count ?? 0,
        myStatus:      (matched?.my_status ?? null) as EventCard['myStatus'],
        goingAvatars:  externalAvatarsFor(matched),
        attendeeLabel: matched?.attendee_label ?? null,
        externalUrl:   matched?.source_url ?? null,
        proposalId:    s.proposalId,
        trustedGoingCount: matched?.trusted_going_count ?? 0,
        imageUrl:      matched?.image_url ?? s.imageUrl ?? null,
        isSuggested:   true,
        reasons:       s.reasons.slice(0, 2),
      };
    });

    // Regular events (suggestions deduped out)
    const regularCards: EventCard[] = unified
      .filter((e) => !(e.source === 'external' && suggestedOpportunityIds.has(e.id)))
      .map((e) => {
        const isExternal = e.source === 'external';
        const cat = normalizeExternalCategory(e.category);
        const rawLocation = e.is_virtual ? 'Virtual' : (e.location_name || 'TBA');
        const location = isExternal ? cleanText(rawLocation) : rawLocation;
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
          goingAvatars:  isExternal ? externalAvatarsFor(e) : e.going_user_ids.map((id) => userAvatarMap[id] ?? null),
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
      const goingAvatars = sessionAvatarUrl
        ? willBeGoing
          ? Array.from(new Set([sessionAvatarUrl, ...event.goingAvatars.filter(Boolean)])).slice(0, 3)
          : wasGoing
            ? event.goingAvatars.filter((url) => url !== sessionAvatarUrl)
            : event.goingAvatars
        : event.goingAvatars;
      return {
        ...event,
        myStatus: next,
        goingAvatars,
        attendeeCount: wasGoing === willBeGoing
          ? event.attendeeCount
          : Math.max(0, event.attendeeCount + (willBeGoing ? 1 : -1)),
      };
    }));
  }, [sessionAvatarUrl]);

  const hideExternalCard = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  }, []);

  const handleOpenEventChat = useCallback(async (ev: EventCard) => {
    if (ev.source === 'group') {
      router.push(`/group/chat/${ev.groupId}`);
      return;
    }

    if (!sessionUserId || actingEventIds.includes(ev.id)) return;

    const openThread = async () => {
      const { groupId, error } = await createExternalEventChat(ev.id);
      if (error || !groupId) {
        throw new Error(error ?? 'Please try again.');
      }
      router.push(`/group/chat/${groupId}`);
    };

    const rsvpAndOpenThread = async (status: 'going' | 'interested') => {
      setActingEventIds((prev) => Array.from(new Set([...prev, ev.id])));
      try {
        const { error: rsvpError } = await upsertExternalEventRsvp(ev.id, sessionUserId, status);
        if (rsvpError) throw new Error(rsvpError.message);
        updateExternalCardStatus(ev.id, status);

        if (ev.proposalId) {
          const { error: feedbackError } = await logAgentFeedbackEvent({
            proposalId: ev.proposalId,
            userId: sessionUserId,
            eventType: status === 'going' ? 'rsvped_event' : 'clicked',
            metadata: { source: 'events_card', action: `open_chat_${status}` },
          });
          if (feedbackError) console.warn('logAgentFeedbackEvent(open chat) failed', feedbackError.message);
        }

        await openThread();
      } catch (err) {
        Alert.alert('Could not open thread', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setActingEventIds((prev) => prev.filter((id) => id !== ev.id));
      }
    };

    if (ev.myStatus === 'going' || ev.myStatus === 'interested') {
      setActingEventIds((prev) => Array.from(new Set([...prev, ev.id])));
      try {
        await openThread();
      } catch (err) {
        Alert.alert('Could not open thread', err instanceof Error ? err.message : 'Please try again.');
      } finally {
        setActingEventIds((prev) => prev.filter((id) => id !== ev.id));
      }
      return;
    }

    Alert.alert(
      'Join event chat?',
      "RSVP as Going or Interested to enter the attendee thread.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Interested', onPress: () => void rsvpAndOpenThread('interested') },
        { text: 'Going', onPress: () => void rsvpAndOpenThread('going') },
      ]
    );
  }, [actingEventIds, router, sessionUserId, updateExternalCardStatus]);

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
  const screenPadding = width < 380 ? Spacing.md : Spacing.lg;

  const renderHeader = () => hasSuggestions ? (
    <View style={styles.suggestionHeaderRow}>
      <Text maxFontSizeMultiplier={1.1} style={styles.suggestionSectionLabel}>Suggested For You</Text>
      <View style={styles.suggestionHintPill}>
        <Ionicons name="sparkles-outline" size={12} color={Colors.terracotta} />
        <Text maxFontSizeMultiplier={1.1} style={styles.suggestionHintText}>Picked for you</Text>
      </View>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>

        {/* ── Header ── */}
        <View style={[styles.header, { paddingHorizontal: screenPadding }]}>
          <View>
            <Text maxFontSizeMultiplier={1.15} style={styles.headerTitle}>Events</Text>
            <Text maxFontSizeMultiplier={1.1} style={styles.headerSub}>
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {/* ── Filter tabs ── */}
        <View style={[styles.tabRow, { marginHorizontal: screenPadding }]}>
          {(['all', 'mine'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.tabBtn, filter === f && styles.tabBtnActive]}
              onPress={() => setFilter(f)}
            >
              <Text maxFontSizeMultiplier={1.1} style={[styles.tabText, filter === f && styles.tabTextActive]}>
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
            contentContainerStyle={[styles.list, { paddingHorizontal: screenPadding }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={renderHeader}
            ListEmptyComponent={<EmptyState error={error} filter={filter} />}
            renderItem={({ item: ev, index }) => (
              <>
                {!ev.isSuggested && index > 0 && visibleEvents[index - 1]?.isSuggested && (
                  <View style={styles.sectionDivider}>
                    <Text maxFontSizeMultiplier={1.1} style={styles.sectionDividerText}>All Events</Text>
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
                  onAttendeePress={() => void handleOpenEventChat(ev)}
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
  onAttendeePress,
}: {
  ev: EventCard;
  acting: boolean;
  onPress: () => void;
  onIntent: (action: EventIntentAction) => void;
  onAttendeePress: () => void;
}) {
  const { width } = useWindowDimensions();
  const d        = new Date(ev.startsAt);
  const month    = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day      = d.getDate();
  const isGoing  = ev.myStatus === 'going';
  const isMaybe  = ev.myStatus === 'interested';
  const relDate  = formatRelativeDate(ev.startsAt);
  const isToday  = relDate === 'Today';
  const isExternal = ev.source === 'external';
  const trustedGoingCount = isExternal ? ev.trustedGoingCount ?? 0 : ev.attendeeCount;
  const displayGoingCount = isExternal ? Math.max(ev.attendeeCount, trustedGoingCount) : ev.attendeeCount;
  const goingLabel = isExternal && trustedGoingCount > 0
    ? `${displayGoingCount} from your groups going`
    : `${displayGoingCount} going`;

  // Real avatars only — skip placeholder fallbacks
  const realAvatars = ev.goingAvatars.filter((uri): uri is string => Boolean(uri)).slice(0, 3);
  const extraCount  = displayGoingCount > realAvatars.length ? displayGoingCount - realAvatars.length : 0;
  const compact = width < 380;
  const dateWidth = compact ? 52 : 58;
  const thumbWidth = compact ? 68 : Math.min(88, Math.max(74, Math.round(width * 0.2)));

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {/* ── Top content row ── */}
      <View style={styles.cardTopRow}>
        {/* Date block */}
        <View style={[
          styles.dateBlock,
          { width: dateWidth },
          isGoing && styles.dateBlockGoing,
          isToday && styles.dateBlockToday,
          isExternal && !ev.isSuggested && styles.dateBlockExternal,
          ev.isSuggested && styles.dateBlockSuggested,
        ]}>
          {ev.isSuggested && <Text maxFontSizeMultiplier={1.1} style={styles.dateBlockBadge}>✦</Text>}
          <Text maxFontSizeMultiplier={1.1} style={styles.dateMonth}>{month}</Text>
          <Text maxFontSizeMultiplier={1.1} style={styles.dateDay}>{day}</Text>
        </View>

        {/* Card body */}
        <View style={styles.cardBody}>
          {/* Suggested badge row OR group pill */}
          {ev.isSuggested ? (
            <View style={styles.suggestedTopRow}>
              <View style={styles.suggestedBadge}>
                <Text maxFontSizeMultiplier={1.05} style={styles.suggestedBadgeText}>Suggested</Text>
              </View>
              <Text maxFontSizeMultiplier={1.05} style={styles.suggestedMatchText} numberOfLines={1}>Strong match</Text>
            </View>
          ) : (
            <View style={styles.groupPill}>
              <Text maxFontSizeMultiplier={1.1} style={styles.groupPillText} numberOfLines={1}>{ev.groupEmoji} {ev.groupName}</Text>
            </View>
          )}

          <Text maxFontSizeMultiplier={1.15} style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>

          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={12} color={Colors.muted} />
            <Text maxFontSizeMultiplier={1.1} style={[styles.metaText, isToday && styles.metaTextToday]} numberOfLines={1}>
              {relDate} · {ev.time}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <Ionicons
              name={ev.isVirtual ? 'globe-outline' : 'location-outline'}
              size={12}
              color={ev.isVirtual ? Colors.olive : Colors.muted}
            />
            <Text maxFontSizeMultiplier={1.1} style={[styles.metaText, ev.isVirtual && styles.metaTextVirtual]} numberOfLines={1}>
              {ev.location}
            </Text>
            {ev.isVirtual && <View style={styles.virtualPill}><Text maxFontSizeMultiplier={1.05} style={styles.virtualPillText}>Online</Text></View>}
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
                  <Text maxFontSizeMultiplier={1.05} style={styles.avatarOverflowText}>+{extraCount}</Text>
                </View>
              )}
              <Text maxFontSizeMultiplier={1.1} style={styles.goingLabel} numberOfLines={1}>{goingLabel}</Text>
            </View>
          )}

          {/* Group event status badge */}
          {!isExternal && (
            <View style={styles.cardFooter}>
              {isGoing ? (
                <View style={styles.statusGoing}>
                  <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                  <Text maxFontSizeMultiplier={1.1} style={styles.statusGoingText}>Going</Text>
                </View>
              ) : isMaybe ? (
                <View style={styles.statusMaybe}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.statusMaybeText}>👀 Interested</Text>
                </View>
              ) : (
                <View style={styles.statusRsvp}>
                  <Text maxFontSizeMultiplier={1.1} style={styles.statusRsvpText}>RSVP</Text>
                  <Ionicons name="chevron-forward" size={11} color={Colors.terracotta} />
                </View>
              )}
            </View>
          )}
        </View>

        {/* Event image */}
        {ev.imageUrl ? (
          <FadeImage uri={ev.imageUrl} style={[styles.cardThumb, { width: thumbWidth }]} />
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
            <Text maxFontSizeMultiplier={1.1} style={styles.actionBarLabel}>Pass</Text>
          </TouchableOpacity>

          <View style={styles.actionBarDivider} />

          <TouchableOpacity
            style={styles.actionBarAttendees}
            activeOpacity={0.65}
            disabled={acting}
            onPress={(e) => { e.stopPropagation(); onAttendeePress(); }}
          >
            <View style={styles.actionChatCopy}>
              <Text maxFontSizeMultiplier={1.1} style={styles.actionChatLabel} numberOfLines={1}>Chat</Text>
              {displayGoingCount > 0 && (
                <Text maxFontSizeMultiplier={1.05} style={styles.actionChatMeta} numberOfLines={1}>
                  {displayGoingCount} going
                </Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={11} color={Colors.muted} />
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
            <Text maxFontSizeMultiplier={1.1} style={[styles.actionBarLabel, isGoing && { color: Colors.olive, fontWeight: '700' }]}>
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
  list: { gap: 14, paddingBottom: 116 },
  skeletonList: { paddingHorizontal: Spacing.lg, gap: 10, paddingTop: 4 },
  suggestionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    marginBottom: 2,
    gap: 12,
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
    minHeight: 126,
  },

  // Date block
  dateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.terracotta,
    paddingVertical: 12,
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
  cardBody: { flex: 1, minWidth: 0, padding: 12, gap: 5 },

  // Suggested card elements
  suggestedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  suggestedBadge: {
    flexShrink: 0,
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
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.olive,
    textAlign: 'right',
  },

  // Image thumbnail
  cardThumb: {
    alignSelf: 'stretch',
    backgroundColor: Colors.paper,
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

  eventTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, lineHeight: 20, flexShrink: 1 },

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
    minHeight: 48,
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

  // ── Event chat action ──
  actionBarAttendees: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
  },
  actionChatCopy: {
    minWidth: 0,
    alignItems: 'center',
  },
  actionChatLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.terracotta,
  },
  actionChatMeta: {
    fontSize: 9,
    fontWeight: '500',
    color: Colors.muted,
  },
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
