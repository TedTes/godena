import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
  fetchGoingUserProfiles,
  fetchMembershipGroupIds,
  fetchUnifiedEventsForUser,
  getSessionUserId,
  removeChannel,
  subscribeToGroupEvents,
  type UnifiedEventRow,
} from '../../lib/services/events';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { EventCardSkeleton } from '../../components/Skeleton';
import { supabase } from '../../lib/supabase';

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
};

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
  if (v.includes('language') || v.includes('culture') || v.includes('community')) return 'culture';
  if (v.includes('professional') || v.includes('business') || v.includes('career')) return 'professional';
  return 'other';
}

function cleanText(value: string) {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\/g, '');
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
  const enterStyle = useScreenEnter();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const uid = await getSessionUserId();
    if (!uid) { setEvents([]); setLoading(false); return; }

    const { data: profileRow } = await supabase
      .from('profiles')
      .select('city')
      .eq('user_id', uid)
      .maybeSingle();
    const userCity = (profileRow as { city?: string | null } | null)?.city ?? null;

    const { data: unifiedRows, error: unifiedError } = await fetchUnifiedEventsForUser(uid, userCity);
    if (unifiedError) { setError(unifiedError.message); setLoading(false); return; }

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

    const mapped: EventCard[] = unified.map((e) => {
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
        goingAvatars:  isExternal ? [] : e.going_user_ids.map((id) => userAvatarMap[id] ?? null),
        attendeeLabel: e.attendee_label ?? null,
        externalUrl:   e.source_url,
      };
    });

    setEvents(mapped);
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
            ListEmptyComponent={<EmptyState error={error} filter={filter} />}
            renderItem={({ item: ev }) => (
              <View>
                <EventItem
                  ev={ev}
                  onPress={() => {
                    if (ev.source === 'external') {
                      router.push(`/event/external/${ev.id}`);
                    } else {
                      router.push(`/event/${ev.id}`);
                    }
                  }}
                />
              </View>
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

function EventItem({ ev, onPress }: { ev: EventCard; onPress: () => void }) {
  const d        = new Date(ev.startsAt);
  const month    = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day      = d.getDate();
  const isGoing  = ev.myStatus === 'going';
  const isMaybe  = ev.myStatus === 'interested';
  const relDate  = formatRelativeDate(ev.startsAt);
  const isToday  = relDate === 'Today';
  const isExternal = ev.source === 'external';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      {/* Date block */}
      <View style={[
        styles.dateBlock,
        isGoing && styles.dateBlockGoing,
        isToday && styles.dateBlockToday,
        isExternal && styles.dateBlockExternal,
      ]}>
        <Text style={styles.dateMonth}>{month}</Text>
        <Text style={styles.dateDay}>{day}</Text>
      </View>

      {/* Card body */}
      <View style={styles.cardBody}>
        {/* Group pill */}
        <View style={styles.groupPill}>
          <Text style={styles.groupPillText}>{ev.groupEmoji} {ev.groupName}</Text>
        </View>

        <Text style={styles.eventTitle} numberOfLines={2}>{ev.title}</Text>

        {/* Date + time */}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={12} color={Colors.muted} />
          <Text style={[styles.metaText, isToday && styles.metaTextToday]}>
            {relDate} · {ev.time}
          </Text>
        </View>

        {/* Location */}
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

        {/* Footer: avatar stack + status badge */}
        <View style={styles.cardFooter}>
          {ev.goingAvatars.length > 0 ? (
            <View style={styles.avatarStack}>
              {ev.goingAvatars.map((uri, i) =>
                uri ? (
                  <FadeImage
                    key={i}
                    uri={uri}
                    style={[styles.avatar, { marginLeft: i === 0 ? 0 : -7 }]}
                  />
                ) : (
                  <View key={i} style={[styles.avatar, styles.avatarFallback, { marginLeft: i === 0 ? 0 : -7 }]}>
                    <Ionicons name="person" size={9} color={Colors.muted} />
                  </View>
                )
              )}
              {ev.attendeeCount > 3 && (
                <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -7 }]}>
                  <Text style={styles.avatarOverflowText}>+{ev.attendeeCount - 3}</Text>
                </View>
              )}
              <Text style={styles.goingLabel}>{ev.attendeeCount} going</Text>
            </View>
          ) : ev.attendeeCount > 0 ? (
            <View style={styles.attendeePill}>
              <Ionicons name="people-outline" size={11} color={Colors.muted} />
              <Text style={styles.attendeeText}>{ev.attendeeCount} going</Text>
            </View>
          ) : isExternal && ev.attendeeLabel ? (
            <View style={styles.attendeePill}>
              <Ionicons name="people-outline" size={11} color={Colors.muted} />
              <Text style={styles.attendeeText} numberOfLines={1}>{ev.attendeeLabel}</Text>
            </View>
          ) : (
            <View />
          )}
          {isExternal ? (
            ev.myStatus === 'going' ? (
              <View style={styles.statusGoing}>
                <Ionicons name="checkmark-circle" size={12} color={Colors.success} />
                <Text style={styles.statusGoingText}>Going</Text>
              </View>
            ) : (
              <View style={styles.statusExternal}>
                <Text style={styles.statusExternalText}>View details</Text>
                <Ionicons name="arrow-forward" size={12} color={Colors.terracotta} />
              </View>
            )
          ) : isGoing ? (
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
      </View>
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

  // ── Card ──
  card: {
    flexDirection: 'row',
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

  // Footer
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  attendeePill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  attendeeText: { fontSize: 11, color: Colors.muted },

  // Avatar stack
  avatarStack: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.warmWhite,
  },
  avatarFallback: {
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverflow: {
    backgroundColor: Colors.paper,
    borderColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOverflowText: { fontSize: 8, fontWeight: '800', color: Colors.muted },
  goingLabel: { fontSize: 11, color: Colors.muted, marginLeft: 2 },

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
  statusExternal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusExternalText: { fontSize: 12, fontWeight: '700', color: Colors.terracotta },

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
