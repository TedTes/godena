import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import {
  fetchEventRsvps,
  fetchEventsForGroups,
  fetchGroupsByIds,
  fetchMembershipGroupIds,
  getSessionUserId,
  removeChannel,
  subscribeToGroupEvents,
  upsertEventRsvp,
  type EventRsvpRow,
  type EventRow,
  type GroupRow,
} from '../../lib/services/events';

type EventCard = {
  id: string;
  groupId: string;
  groupName: string;
  groupEmoji: string;
  title: string;
  date: string;
  time: string;
  location: string;
  attendeeCount: number;
  myStatus: 'going' | 'interested' | 'not_going';
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

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function EventsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<EventCard[]>([]);
  const [pendingRsvp, setPendingRsvp] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    const uid = await getSessionUserId();
    if (!uid) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const { data: membershipRows, error: membershipError } = await fetchMembershipGroupIds(uid);
    if (membershipError) {
      setError(membershipError.message);
      setLoading(false);
      return;
    }

    const groupIds = Array.from(new Set(((membershipRows ?? []) as Array<{ group_id: string }>).map((m) => m.group_id)));
    if (groupIds.length === 0) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const [eventsRes, groupsRes] = await Promise.all([
      fetchEventsForGroups(groupIds),
      fetchGroupsByIds(groupIds),
    ]);

    if (eventsRes.error) {
      setError(eventsRes.error.message);
      setLoading(false);
      return;
    }

    const eventRows = (eventsRes.data ?? []) as EventRow[];
    const groupRows = (groupsRes.data ?? []) as GroupRow[];

    const eventIds = eventRows.map((e) => e.id);
    const { data: rsvpRows } = await fetchEventRsvps(eventIds);
    const rsvps = (rsvpRows ?? []) as EventRsvpRow[];

    const groupById = new Map(groupRows.map((g) => [g.id, g]));
    const myRsvpByEvent = new Map(
      rsvps.filter((r) => r.user_id === uid).map((r) => [r.event_id, r.status])
    );
    const goingCountByEvent: Record<string, number> = {};
    for (const r of rsvps) {
      if (r.status === 'going') {
        goingCountByEvent[r.event_id] = (goingCountByEvent[r.event_id] ?? 0) + 1;
      }
    }

    const mapped: EventCard[] = eventRows.map((e) => {
      const g = groupById.get(e.group_id);
      const myStatus = (myRsvpByEvent.get(e.id) ?? 'not_going') as 'going' | 'interested' | 'not_going';
      return {
        id: e.id,
        groupId: e.group_id,
        groupName: g?.name || 'Group',
        groupEmoji: groupEmoji(g?.category),
        title: e.title,
        date: formatEventDate(e.starts_at),
        time: formatEventTime(e.starts_at),
        location: e.is_virtual ? 'Virtual' : (e.location_name || 'Location TBA'),
        attendeeCount: goingCountByEvent[e.id] ?? 0,
        myStatus,
      };
    });

    setEvents(mapped);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let channel: ReturnType<typeof subscribeToGroupEvents> = null;

      const boot = async () => {
        await load();
        if (!active) return;
        const uid = await getSessionUserId();
        if (!uid) return;
        const { data: membershipRows } = await fetchMembershipGroupIds(uid);
        const groupIds = Array.from(new Set(((membershipRows ?? []) as Array<{ group_id: string }>).map((m) => m.group_id)));
        channel = subscribeToGroupEvents(groupIds, () => {
          if (active) void load();
        });
      };

      void boot();

      return () => {
        active = false;
        if (channel) void removeChannel(channel);
      };
    }, [load])
  );

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => e.myStatus === 'going' || e.myStatus === 'interested');
  }, [events, filter]);

  const toggleRsvp = async (eventId: string) => {
    const uid = await getSessionUserId();
    if (!uid) return;
    if (pendingRsvp.has(eventId)) return;

    const current = events.find((e) => e.id === eventId)?.myStatus ?? 'not_going';
    const next: 'going' | 'not_going' = current === 'going' ? 'not_going' : 'going';

    setPendingRsvp((prev) => new Set(prev).add(eventId));

    // Optimistic UI
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== eventId) return e;
        const delta = next === 'going' ? 1 : -1;
        return {
          ...e,
          myStatus: next,
          attendeeCount: Math.max(0, e.attendeeCount + delta),
        };
      })
    );

    const { error: upsertError } = await upsertEventRsvp(eventId, uid, next);

    setPendingRsvp((prev) => {
      const n = new Set(prev);
      n.delete(eventId);
      return n;
    });

    if (upsertError) {
      Alert.alert('Could not update RSVP', upsertError.message);
      // Re-sync from server on failure
      void load();
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.subtitle}>From your groups</Text>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, filter === 'all' && styles.tabBtnActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>All Events</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, filter === 'mine' && styles.tabBtnActive]}
            onPress={() => setFilter('mine')}
          >
            <Text style={[styles.tabText, filter === 'mine' && styles.tabTextActive]}>RSVP'd</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>
        ) : (
          <FlatList
            data={visibleEvents}
            keyExtractor={(e) => e.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{error ? 'Could not load events' : 'No events yet'}</Text>
                <Text style={styles.emptyText}>
                  {error || (filter === 'mine'
                    ? 'Events you RSVP to will appear here.'
                    : 'Join groups and create events to get started.')}
                </Text>
              </View>
            }
            renderItem={({ item: ev }) => {
              const isGoing = ev.myStatus === 'going';
              const pending = pendingRsvp.has(ev.id);
              return (
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.9}
                  onPress={() => router.push(`/event/${ev.id}`)}
                >
                  <View style={styles.dateStrip}>
                    <Text style={styles.dateEmoji}>{ev.groupEmoji}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.groupLabel}>{ev.groupName}</Text>
                    <Text style={styles.eventTitle}>{ev.title}</Text>
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={12} color={Colors.muted} />
                      <Text style={styles.metaText}>{ev.date} · {ev.time}</Text>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="location-outline" size={12} color={Colors.muted} />
                      <Text style={styles.metaText} numberOfLines={1}>{ev.location}</Text>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.attendeeText}>{ev.attendeeCount} going</Text>
                      <TouchableOpacity
                        style={[styles.rsvpBtn, isGoing && styles.rsvpBtnActive, pending && styles.rsvpBtnDisabled]}
                        onPress={(e) => {
                          e.stopPropagation();
                          void toggleRsvp(ev.id);
                        }}
                        disabled={pending}
                      >
                        <Text style={[styles.rsvpBtnText, isGoing && styles.rsvpBtnTextActive]}>
                          {pending ? 'Saving...' : (isGoing ? '✓ Going' : 'RSVP')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 2 },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabBtn: {
    flex: 1,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: Colors.white },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing.lg, gap: 12, paddingBottom: 32 },

  card: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dateStrip: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
  },
  dateEmoji: { fontSize: 24 },
  cardBody: { flex: 1, padding: 12 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  eventTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  metaText: { fontSize: 12, color: Colors.muted, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  attendeeText: { fontSize: 12, color: Colors.muted },
  rsvpBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.terracotta,
  },
  rsvpBtnActive: { backgroundColor: Colors.terracotta },
  rsvpBtnDisabled: { opacity: 0.6 },
  rsvpBtnText: { fontSize: 12, fontWeight: '700', color: Colors.terracotta },
  rsvpBtnTextActive: { color: Colors.white },

  emptyCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 6 },
  emptyText: { fontSize: 13, color: Colors.muted, textAlign: 'center' },
});
