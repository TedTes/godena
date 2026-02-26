import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import {
  fetchEventById,
  fetchEventRsvps,
  fetchGroupsByIds,
  getSessionUserId,
  upsertEventRsvp,
  type EventRsvpRow,
  type EventRow,
  type GroupRow,
} from '../../lib/services/events';

type MyStatus = 'going' | 'interested' | 'not_going';

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
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatEventTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [groupRow, setGroupRow] = useState<GroupRow | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus>('not_going');
  const [goingCount, setGoingCount] = useState(0);

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const uid = await getSessionUserId();
    if (!uid) {
      setLoading(false);
      return;
    }

    const { data: eventData, error: eventError } = await fetchEventById(id);
    if (eventError || !eventData) {
      setEventRow(null);
      setGroupRow(null);
      setLoading(false);
      return;
    }

    setEventRow(eventData as EventRow);

    const [groupRes, rsvpRes] = await Promise.all([
      fetchGroupsByIds([eventData.group_id]),
      fetchEventRsvps([id]),
    ]);

    const group = ((groupRes.data ?? []) as GroupRow[])[0] ?? null;
    setGroupRow(group);

    const rsvps = (rsvpRes.data ?? []) as EventRsvpRow[];
    setGoingCount(rsvps.filter((r) => r.status === 'going').length);
    setMyStatus((rsvps.find((r) => r.user_id === uid)?.status ?? 'not_going') as MyStatus);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const handleSetStatus = (next: MyStatus) => {
    void (async () => {
      if (!id || saving) return;
      const uid = await getSessionUserId();
      if (!uid) return;
      const prev = myStatus;

      setSaving(true);
      setMyStatus(next);
      setGoingCount((prevCount) => {
        const wasGoing = prev === 'going';
        const willBeGoing = next === 'going';
        if (wasGoing === willBeGoing) return prevCount;
        return Math.max(0, prevCount + (willBeGoing ? 1 : -1));
      });

      const { error } = await upsertEventRsvp(id, uid, next);
      setSaving(false);

      if (error) {
        setMyStatus(prev);
        void load();
      }
    })();
  };

  const locationLabel = useMemo(() => {
    if (!eventRow) return '';
    return eventRow.is_virtual ? 'Virtual' : (eventRow.location_name || 'Location TBA');
  }, [eventRow]);

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!eventRow) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Event not found</Text>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Event Details</Text>
          <View style={styles.iconSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.groupPill}>
              <Text style={styles.groupPillText}>{groupEmoji(groupRow?.category)} {groupRow?.name || 'Group'}</Text>
            </View>
            <Text style={styles.title}>{eventRow.title}</Text>

            <View style={styles.metaRow}>
              <Ionicons name="calendar-outline" size={14} color={Colors.muted} />
              <Text style={styles.metaText}>{formatEventDate(eventRow.starts_at)} · {formatEventTime(eventRow.starts_at)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color={Colors.muted} />
              <Text style={styles.metaText}>{locationLabel}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="people-outline" size={14} color={Colors.muted} />
              <Text style={styles.metaText}>{goingCount} going</Text>
            </View>
          </View>

          <View style={styles.rsvpCard}>
            <Text style={styles.rsvpTitle}>Your RSVP</Text>
            <View style={styles.rsvpRow}>
              <TouchableOpacity
                style={[styles.rsvpChip, myStatus === 'going' && styles.rsvpChipActive]}
                onPress={() => handleSetStatus('going')}
                disabled={saving}
              >
                <Text style={[styles.rsvpChipText, myStatus === 'going' && styles.rsvpChipTextActive]}>Going</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rsvpChip, myStatus === 'interested' && styles.rsvpChipActive]}
                onPress={() => handleSetStatus('interested')}
                disabled={saving}
              >
                <Text style={[styles.rsvpChipText, myStatus === 'interested' && styles.rsvpChipTextActive]}>Interested</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rsvpChip, myStatus === 'not_going' && styles.rsvpChipActiveMuted]}
                onPress={() => handleSetStatus('not_going')}
                disabled={saving}
              >
                <Text style={[styles.rsvpChipText, myStatus === 'not_going' && styles.rsvpChipTextMuted]}>Not going</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.ink },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
  },
  backBtnText: { color: Colors.white, fontWeight: '700' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
  },
  iconSpacer: { width: 36 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 32, gap: 12 },

  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  groupPill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  groupPillText: { fontSize: 12, color: Colors.brownMid, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '900', color: Colors.ink, marginBottom: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metaText: { fontSize: 13, color: Colors.muted },

  rsvpCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  rsvpTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 10 },
  rsvpRow: { flexDirection: 'row', gap: 8 },
  rsvpChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.paper,
  },
  rsvpChipActive: { backgroundColor: Colors.terracotta, borderColor: Colors.terracotta },
  rsvpChipActiveMuted: { backgroundColor: Colors.warmWhite },
  rsvpChipText: { fontSize: 12, fontWeight: '700', color: Colors.brownMid },
  rsvpChipTextActive: { color: Colors.white },
  rsvpChipTextMuted: { color: Colors.muted },
});
