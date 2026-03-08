import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { EventDetailSkeleton } from '../../components/Skeleton';
import RAnimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  fetchEventById,
  fetchEventRsvps,
  fetchGroupsByIds,
  getSessionUserId,
  upsertEventRsvp,
  updateEventByOwner,
  deleteEventByOwner,
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

type RsvpOption = { status: MyStatus; label: string; icon: string; color: string };

const RSVP_OPTIONS: RsvpOption[] = [
  { status: 'going',     label: 'Going',           icon: 'checkmark-circle', color: Colors.success },
  { status: 'interested',label: 'Interested',       icon: 'eye',              color: Colors.gold },
  { status: 'not_going', label: "Can't make it",    icon: 'close-circle',     color: Colors.muted },
];

function RsvpRow({
  opt,
  selected,
  saving,
  hasDivider,
  onPress,
}: {
  opt: RsvpOption;
  selected: boolean;
  saving: boolean;
  hasDivider: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.96,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          speed: 18,
          bounciness: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [selected, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[
          styles.rsvpRow,
          hasDivider && styles.rsvpRowDivider,
          selected && { backgroundColor: opt.color + '0d' },
        ]}
        onPress={onPress}
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
    </Animated.View>
  );
}

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [eventRow, setEventRow] = useState<EventRow | null>(null);
  const [groupRow, setGroupRow] = useState<GroupRow | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [goingCount, setGoingCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [dateDraft, setDateDraft] = useState('');
  const [timeDraft, setTimeDraft] = useState('');
  const [locationDraft, setLocationDraft] = useState('');
  const [isVirtualDraft, setIsVirtualDraft] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const uid = await getSessionUserId();
    setUserId(uid);
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

  const isOwner = Boolean(userId && eventRow?.created_by && eventRow.created_by === userId);

  const openEdit = () => {
    if (!eventRow) return;
    const d = new Date(eventRow.starts_at);
    setTitleDraft(eventRow.title);
    setDescriptionDraft(eventRow.description ?? '');
    setDateDraft(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    setTimeDraft(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    setLocationDraft(eventRow.location_name ?? '');
    setIsVirtualDraft(eventRow.is_virtual);
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!eventRow || !userId || savingEdit) return;
    const title = titleDraft.trim();
    if (!title) {
      Alert.alert('Missing title', 'Event title is required.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateDraft.trim()) || !/^\d{2}:\d{2}$/.test(timeDraft.trim())) {
      Alert.alert('Invalid date/time', 'Use YYYY-MM-DD and HH:MM format.');
      return;
    }

    const startsAt = new Date(`${dateDraft.trim()}T${timeDraft.trim()}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      Alert.alert('Invalid date/time', 'Please enter a valid date and time.');
      return;
    }

    setSavingEdit(true);
    const { data, error } = await updateEventByOwner({
      eventId: eventRow.id,
      ownerUserId: userId,
      title,
      description: descriptionDraft.trim() || null,
      starts_at: startsAt.toISOString(),
      location_name: isVirtualDraft ? null : (locationDraft.trim() || null),
      is_virtual: isVirtualDraft,
    });
    setSavingEdit(false);

    if (error || !data) {
      Alert.alert('Could not update event', error?.message || 'Unknown error');
      return;
    }

    setEventRow(data as EventRow);
    setShowEdit(false);
  };

  const cancelEvent = () => {
    if (!eventRow || !userId) return;
    Alert.alert(
      'Cancel event?',
      'This will delete the event and RSVPs tied to it.',
      [
        { text: 'Keep event', style: 'cancel' },
        {
          text: 'Cancel event',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const { error } = await deleteEventByOwner(eventRow.id, userId);
              if (error) {
                Alert.alert('Could not cancel event', error.message);
                return;
              }
              router.back();
            })();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <EventDetailSkeleton />
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
    <RAnimated.View entering={FadeIn.duration(260)} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Hero ── */}
        <View style={[styles.hero, { backgroundColor: heroColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          {isOwner && (
            <View style={styles.heroOwnerActions}>
              <TouchableOpacity style={styles.heroActionBtn} onPress={openEdit} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.92)" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.heroActionBtnDanger} onPress={cancelEvent} activeOpacity={0.8}>
                <Ionicons name="close-circle-outline" size={16} color="rgba(255,255,255,0.95)" />
              </TouchableOpacity>
            </View>
          )}

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
          {/* ── Owner edit form (top section) ── */}
          {isOwner && showEdit && (
            <View style={styles.editCard}>
              <Text style={styles.ownerTitle}>Edit Event</Text>
              <View style={styles.editWrap}>
                <TextInput
                  style={styles.editInput}
                  value={titleDraft}
                  onChangeText={setTitleDraft}
                  placeholder="Event title"
                  placeholderTextColor={Colors.muted}
                />
                <TextInput
                  style={[styles.editInput, styles.editTextarea]}
                  value={descriptionDraft}
                  onChangeText={setDescriptionDraft}
                  placeholder="Description"
                  placeholderTextColor={Colors.muted}
                  multiline
                />
                <View style={styles.editRow}>
                  <TextInput
                    style={[styles.editInput, styles.editHalf]}
                    value={dateDraft}
                    onChangeText={setDateDraft}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.muted}
                  />
                  <TextInput
                    style={[styles.editInput, styles.editHalf]}
                    value={timeDraft}
                    onChangeText={setTimeDraft}
                    placeholder="HH:MM"
                    placeholderTextColor={Colors.muted}
                  />
                </View>
                {!isVirtualDraft && (
                  <TextInput
                    style={styles.editInput}
                    value={locationDraft}
                    onChangeText={setLocationDraft}
                    placeholder="Location"
                    placeholderTextColor={Colors.muted}
                  />
                )}
                <View style={styles.editSwitchRow}>
                  <Text style={styles.editSwitchLabel}>Virtual event</Text>
                  <Switch
                    value={isVirtualDraft}
                    onValueChange={setIsVirtualDraft}
                    trackColor={{ false: Colors.border, true: Colors.olive }}
                    thumbColor={Colors.white}
                  />
                </View>
                <View style={styles.editActionRow}>
                  <TouchableOpacity style={styles.editCancelBtn} onPress={() => setShowEdit(false)} activeOpacity={0.85}>
                    <Text style={styles.editCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editSaveBtn} onPress={saveEdit} activeOpacity={0.85} disabled={savingEdit}>
                    {savingEdit ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.editSaveText}>Save changes</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── Details card ── */}
          <RAnimated.View entering={FadeInDown.delay(60).duration(300)} style={styles.detailCard}>
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
          </RAnimated.View>

          {/* ── About ── */}
          <RAnimated.View entering={FadeInDown.delay(140).duration(300)} style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>About</Text>
            <Text style={[styles.aboutText, !eventRow.description?.trim() && styles.aboutEmpty]}>
              {eventRow.description?.trim() || 'No description provided.'}
            </Text>
          </RAnimated.View>

          {/* ── RSVP ── */}
          <RAnimated.View entering={FadeInDown.delay(220).duration(300)} style={styles.rsvpCard}>
            <Text style={styles.rsvpHeading}>Will you attend?</Text>
            {RSVP_OPTIONS.map((opt, i) => (
              <RsvpRow
                key={opt.status}
                opt={opt}
                selected={myStatus === opt.status}
                saving={saving}
                hasDivider={i < RSVP_OPTIONS.length - 1}
                onPress={() => handleSetStatus(opt.status)}
              />
            ))}
          </RAnimated.View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </RAnimated.View>
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
  heroOwnerActions: {
    position: 'absolute',
    top: 14,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  heroActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroActionBtnDanger: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(217,79,79,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
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

  // ── Owner controls ──
  editCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 10,
  },
  ownerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ownerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  ownerBtn: {
    flex: 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  ownerBtnDanger: {
    flex: 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.error,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  ownerBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  editWrap: { gap: 8 },
  editInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.ink,
  },
  editTextarea: { minHeight: 86, textAlignVertical: 'top' },
  editRow: { flexDirection: 'row', gap: 8 },
  editHalf: { flex: 1 },
  editSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  editSwitchLabel: { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  editActionRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  editCancelBtn: {
    flex: 1,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  editCancelText: { fontSize: 13, color: Colors.brownMid, fontWeight: '700' },
  editSaveBtn: {
    flex: 1,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  editSaveText: { fontSize: 13, color: Colors.white, fontWeight: '700' },

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
