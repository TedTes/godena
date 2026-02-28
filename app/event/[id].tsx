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

function getCategoryMeta(category?: string): { emoji: string; color: string } {
  switch (category) {
    case 'outdoors':     return { emoji: '🏕️', color: '#7a8c5c' };
    case 'food_drink':   return { emoji: '☕',  color: '#c4622d' };
    case 'professional': return { emoji: '💼',  color: '#4a5568' };
    case 'language':     return { emoji: '🗣️', color: '#c9a84c' };
    case 'faith':        return { emoji: '✝️',  color: '#6b4c3b' };
    case 'culture':      return { emoji: '🎉',  color: '#8b5e3c' };
    default:             return { emoji: '👥',  color: '#3d2b1f' };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatWeekday(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const RSVP_OPTIONS: { status: MyStatus; label: string; icon: string; color: string }[] = [
  { status: 'going',     label: 'Going',           icon: 'checkmark-circle', color: Colors.success },
  { status: 'interested',label: 'Interested',       icon: 'eye',              color: Colors.gold },
  { status: 'not_going', label: "Can't make it",    icon: 'close-circle',     color: Colors.muted },
];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [groupRow, setGroupRow] = useState<GroupRow | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [goingCount, setGoingCount] = useState(0);

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const uid = await getSessionUserId();
    if (!uid) { setLoading(false); return; }

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
    const mine = rsvps.find((r) => r.user_id === uid);
    setMyStatus(mine ? (mine.status as MyStatus) : null);

    setLoading(false);
  };

  useEffect(() => { void load(); }, [id]);

  const handleSetStatus = (next: MyStatus) => {
    void (async () => {
      if (!id || saving) return;
      const uid = await getSessionUserId();
      if (!uid) return;
      const prev = myStatus;

      setSaving(true);
      setMyStatus(next);
      setGoingCount((c) => {
        const wasGoing = prev === 'going';
        const willBeGoing = next === 'going';
        if (wasGoing === willBeGoing) return c;
        return Math.max(0, c + (willBeGoing ? 1 : -1));
      });

      const { error } = await upsertEventRsvp(id, uid, next);
      setSaving(false);
      if (error) { setMyStatus(prev); void load(); }
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
            <ActivityIndicator color={Colors.terracotta} size="large" />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!eventRow) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingWrap}>
            <Text style={styles.emptyTitle}>Event not found</Text>
            <TouchableOpacity style={styles.emptyBack} onPress={() => router.back()}>
              <Text style={styles.emptyBackText}>Go back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const { emoji, color: heroColor } = getCategoryMeta(groupRow?.category);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Hero ── */}
        <View style={[styles.hero, { backgroundColor: heroColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

          <View style={styles.heroBody}>
            <View style={styles.heroEmojiWrap}>
              <Text style={styles.heroEmoji}>{emoji}</Text>
            </View>
            <Text style={styles.heroTitle}>{eventRow.title}</Text>
            {groupRow && (
              <View style={styles.groupPill}>
                <Text style={styles.groupPillText}>{groupRow.name}</Text>
              </View>
            )}
          </View>

          {/* Date strip */}
          <View style={styles.heroStrip}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>{formatDateShort(eventRow.starts_at)}</Text>
            </View>
            <View style={styles.stripDot} />
            <Text style={styles.stripText}>{formatWeekday(eventRow.starts_at)}</Text>
            <View style={styles.stripDot} />
            <Text style={styles.stripText}>{formatTime(eventRow.starts_at)}</Text>
            {eventRow.is_virtual && (
              <>
                <View style={styles.stripDot} />
                <View style={styles.virtualBadge}>
                  <Text style={styles.virtualBadgeText}>Virtual</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Details card ── */}
          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: 'rgba(196,98,45,0.1)' }]}>
                <Ionicons name="calendar" size={16} color={Colors.terracotta} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatDate(eventRow.starts_at)}</Text>
                <Text style={styles.detailSub}>{formatTime(eventRow.starts_at)}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: 'rgba(122,140,92,0.1)' }]}>
                <Ionicons name={eventRow.is_virtual ? 'videocam' : 'location'} size={16} color={Colors.olive} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{locationLabel}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: 'rgba(201,168,76,0.1)' }]}>
                <Ionicons name="people" size={16} color={Colors.gold} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Attending</Text>
                <Text style={styles.detailValue}>
                  {goingCount === 0 ? 'No one yet — be the first!' : `${goingCount} ${goingCount === 1 ? 'person' : 'people'} going`}
                </Text>
              </View>
            </View>
          </View>

          {/* ── About ── */}
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={[styles.aboutText, !eventRow.description?.trim() && styles.aboutEmpty]}>
              {eventRow.description?.trim() || 'No description provided.'}
            </Text>
          </View>

          {/* ── RSVP ── */}
          <View style={styles.rsvpCard}>
            <Text style={styles.rsvpHeading}>Will you attend?</Text>
            {RSVP_OPTIONS.map((opt, i) => {
              const selected = myStatus === opt.status;
              return (
                <TouchableOpacity
                  key={opt.status}
                  style={[
                    styles.rsvpRow,
                    i < RSVP_OPTIONS.length - 1 && styles.rsvpRowDivider,
                    selected && { backgroundColor: opt.color + '0d' },
                  ]}
                  onPress={() => handleSetStatus(opt.status)}
                  disabled={saving}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={(selected ? opt.icon : `${opt.icon}-outline`) as any}
                    size={22}
                    color={selected ? opt.color : Colors.borderDark}
                  />
                  <Text style={[styles.rsvpLabel, selected && { color: opt.color, fontWeight: '700' }]}>
                    {opt.label}
                  </Text>
                  {saving && selected ? (
                    <ActivityIndicator size="small" color={opt.color} />
                  ) : (
                    <View style={[styles.radioOuter, selected && { borderColor: opt.color }]}>
                      {selected && <View style={[styles.radioInner, { backgroundColor: opt.color }]} />}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  emptyBack: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: Radius.full, backgroundColor: Colors.terracotta,
  },
  emptyBackText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // ── Hero ──
  hero: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  backBtn: {
    position: 'absolute',
    top: 14,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroBody: {
    alignItems: 'center',
    paddingTop: 54,
    paddingBottom: 24,
    paddingHorizontal: Spacing.lg,
  },
  heroEmojiWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  heroEmoji: { fontSize: 34 },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 12,
  },
  groupPill: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  groupPillText: { fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: '600' },

  // Date strip
  heroStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroChip: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroChipText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  stripText: { fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  stripDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
  virtualBadge: {
    backgroundColor: 'rgba(90,158,111,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(90,158,111,0.5)',
  },
  virtualBadgeText: { fontSize: 11, color: Colors.white, fontWeight: '700' },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 14,
  },

  // ── Detail card ──
  detailCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    padding: Spacing.md,
  },
  detailIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  detailText: { flex: 1, justifyContent: 'center' },
  detailLabel: {
    fontSize: 10,
    color: Colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  detailValue: { fontSize: 14, color: Colors.ink, fontWeight: '700' },
  detailSub: { fontSize: 12, color: Colors.muted, marginTop: 2 },
  detailDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 16 + 14 + 38 },

  // ── About ──
  aboutCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  aboutTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  aboutText: { fontSize: 14, color: Colors.brownMid, lineHeight: 22 },
  aboutEmpty: { color: Colors.muted, fontStyle: 'italic' },

  // ── RSVP ──
  rsvpCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rsvpHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 10,
  },
  rsvpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
  },
  rsvpRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  rsvpLabel: { flex: 1, fontSize: 15, color: Colors.brownMid, fontWeight: '500' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
});
