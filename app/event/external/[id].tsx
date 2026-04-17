import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { Colors, Spacing, Radius } from '../../../constants/theme';
import RAnimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  createExternalEventChat,
  deleteExternalEventRsvp,
  fetchExternalEventById,
  fetchExternalEventRsvps,
  fetchExternalEventSharedGroupSocialProof,
  getSessionUserId,
  upsertExternalEventRsvp,
  type ExternalEventSocialProofRow,
  type ExternalEventRow,
  type ExternalEventRsvpRow,
} from '../../../lib/services/events';
import { resolveProfilePhotoUrl } from '../../../lib/services/photoUrls';

type MyStatus = 'going' | 'interested' | 'not_going';

function getCategoryMeta(category?: string | null): { emoji: string; color: string } {
  switch (category) {
    case 'outdoors':     return { emoji: '🏕️', color: '#7a8c5c' };
    case 'food_drink':   return { emoji: '☕',  color: '#c4622d' };
    case 'professional': return { emoji: '💼',  color: '#4a5568' };
    case 'language':     return { emoji: '🗣️', color: '#c9a84c' };
    case 'faith':        return { emoji: '✝️',  color: '#6b4c3b' };
    case 'culture':      return { emoji: '🎉',  color: '#8b5e3c' };
    default:             return { emoji: '🗓️',  color: '#c4622d' };
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
  { status: 'going',     label: 'Going',        icon: 'checkmark-circle', color: Colors.success },
  { status: 'interested',label: 'Interested',    icon: 'eye',              color: Colors.gold },
  { status: 'not_going', label: "Can't make it", icon: 'close-circle',     color: Colors.muted },
];

function cleanExternalText(value: string) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/(\d)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .trim();
}

function getUsefulExternalDescription(value?: string | null) {
  const cleaned = cleanExternalText(value ?? '');
  if (cleaned.length < 40) return null;

  const lower = cleaned.toLowerCase();
  const boilerplateHits = [
    'delivery delay',
    'tickets will be delivered',
    'ticketweb account',
    'all sales are final',
    'no refunds or exchanges',
    'box office',
    'will call',
    'legal age',
  ].filter((needle) => lower.includes(needle)).length;

  if (boilerplateHits >= 2) return null;
  return cleaned.length > 520 ? `${cleaned.slice(0, 520).trim()}...` : cleaned;
}

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
        Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, speed: 18, bounciness: 7, useNativeDriver: true }),
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

export default function ExternalEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingChat, setCreatingChat] = useState(false);
  const [eventRow, setEventRow] = useState<ExternalEventRow | null>(null);
  const [attendeeLabel, setAttendeeLabel] = useState<string | null>(null);
  const [attendeeAvatars, setAttendeeAvatars] = useState<(string | null)[]>([]);
  const [goingCount, setGoingCount] = useState(0);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const buildAttendeeLabel = (rsvps: ExternalEventRsvpRow[], names: string[], uid: string) => {
    const going = rsvps.filter((r) => r.status === 'going');
    if (going.length === 0) { setAttendeeLabel(null); return; }
    const currentUserGoing = going.some((r) => r.user_id === uid);
    const otherCount = going.filter((r) => r.user_id !== uid).length;
    if (currentUserGoing && otherCount === 0) {
      setAttendeeLabel("You're going");
      return;
    }
    if (currentUserGoing && names.length === 0) {
      setAttendeeLabel(`You and ${otherCount} other${otherCount === 1 ? '' : 's'} are going`);
      return;
    }
    if (currentUserGoing) {
      const a = names[0] ?? 'someone';
      if (otherCount === 1) {
        setAttendeeLabel(`You and ${a} are going`);
        return;
      }
      setAttendeeLabel(`You, ${a} and ${otherCount - 1} others are going`);
      return;
    }
    if (names.length === 0) {
      setAttendeeLabel(going.length === 1 ? '1 person going' : `${going.length} people going`);
      return;
    }
    const a = names[0];
    if (going.length === 1) {
      setAttendeeLabel(`${a} is going`);
      return;
    }
    if (names.length < 2) {
      const others = going.length - 1;
      setAttendeeLabel(`${a} and ${others} other${others === 1 ? '' : 's'} are going`);
      return;
    }
    const b = names[1];
    if (going.length === 2) {
      setAttendeeLabel(`${a} and ${b} are going`);
      return;
    }
    setAttendeeLabel(`${a}, ${b} and ${going.length - 2} others are going`);
  };

  const loadRsvpState = async (uid: string) => {
    if (!id) return;
    const { data: rsvpRows } = await fetchExternalEventRsvps([id]);
    const rsvps = (rsvpRows ?? []) as ExternalEventRsvpRow[];
    const mine = uid ? rsvps.find((r) => r.user_id === uid) : null;
    setMyStatus((mine?.status ?? null) as MyStatus | null);
    const going = rsvps.filter((r) => r.status === 'going');
    setGoingCount(going.length);
    const { data: socialProofRows } = await fetchExternalEventSharedGroupSocialProof([id]);
    const proofRows = ((socialProofRows ?? []) as ExternalEventSocialProofRow[]).filter((row) => row.opportunity_id === id);
    if (proofRows.length > 0) {
      const names = proofRows.map((p) => p.full_name).filter((v): v is string => Boolean(v));
      const avatars = await Promise.all(
        proofRows.slice(0, 3).map(async (p) => resolveProfilePhotoUrl(p.avatar_url))
      );
      setAttendeeAvatars(avatars);
      buildAttendeeLabel(rsvps, names, uid);
    } else {
      setAttendeeAvatars([]);
      buildAttendeeLabel(rsvps, [], uid);
    }
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const uid = await getSessionUserId();
      const { data } = await fetchExternalEventById(id, uid);
      setEventRow((data ?? null) as ExternalEventRow | null);
      setUserId(uid);
      if (uid) await loadRsvpState(uid);
      setLoading(false);
    };
    void load();
  }, [id]);

  const handleSetStatus = (next: MyStatus) => {
    void (async () => {
      if (!id || saving || !userId) return;
      const prev = myStatus;
      setSaving(true);
      setMyStatus(next);
      setGoingCount((c) => {
        const wasGoing = prev === 'going';
        const willBeGoing = next === 'going';
        if (wasGoing === willBeGoing) return c;
        return Math.max(0, c + (willBeGoing ? 1 : -1));
      });
      if (next === prev) {
        await deleteExternalEventRsvp(id, userId);
        setMyStatus(null);
      } else {
        const { error } = await upsertExternalEventRsvp(id, userId, next);
        if (error) setMyStatus(prev);
        if (!error && (next === 'going' || next === 'interested')) {
          Alert.alert(
            next === 'going' ? "You're going" : "You're interested",
            "The attendee thread is open to people who RSVP'd.",
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open thread', onPress: handleStartGroupChat },
            ]
          );
        }
      }
      setSaving(false);
      await loadRsvpState(userId);
    })();
  };

  const handleStartGroupChat = () => {
    void (async () => {
      if (!id || creatingChat) return;
      setCreatingChat(true);
      const { groupId, error } = await createExternalEventChat(id);
      setCreatingChat(false);
      if (error || !groupId) {
        Alert.alert(
          'Could not open thread',
          error === 'rsvp_required'
            ? 'RSVP as Going or Interested to join the attendee thread.'
            : error === 'event_chat_archived'
              ? 'This event thread has been archived.'
              : error ?? 'Please try again.'
        );
        return;
      }
      router.push(`/group/chat/${groupId}`);
    })();
  };

  const handleJoinChatWithStatus = (next: 'going' | 'interested') => {
    void (async () => {
      if (!id || !userId || saving || creatingChat) return;
      const prev = myStatus;
      setSaving(true);
      setCreatingChat(true);
      setMyStatus(next);
      setGoingCount((c) => {
        const wasGoing = prev === 'going';
        const willBeGoing = next === 'going';
        if (wasGoing === willBeGoing) return c;
        return Math.max(0, c + (willBeGoing ? 1 : -1));
      });

      const { error: rsvpError } = await upsertExternalEventRsvp(id, userId, next);
      if (rsvpError) {
        setMyStatus(prev);
        Alert.alert('Could not update RSVP', rsvpError.message);
        setSaving(false);
        setCreatingChat(false);
        return;
      }

      const { groupId, error } = await createExternalEventChat(id);
      setSaving(false);
      setCreatingChat(false);
      if (error || !groupId) {
        Alert.alert(
          'Could not open thread',
          error === 'event_chat_archived'
            ? 'This event thread has been archived.'
            : error ?? 'Please try again.'
        );
        if (userId) await loadRsvpState(userId);
        return;
      }
      router.push(`/group/chat/${groupId}`);
      if (userId) await loadRsvpState(userId);
    })();
  };

  const handleJoinChatPrompt = () => {
    Alert.alert(
      'Join event chat?',
      "RSVP as Going or Interested to enter the attendee thread.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Interested', onPress: () => handleJoinChatWithStatus('interested') },
        { text: 'Going', onPress: () => handleJoinChatWithStatus('going') },
      ]
    );
  };

  const handleOpenSourceUrl = () => {
    void (async () => {
      const url = eventRow?.source_url;
      if (!url) return;
      try {
        await WebBrowser.openBrowserAsync(url);
      } catch (err) {
        try {
          await Linking.openURL(url);
        } catch {
          Alert.alert('Could not open event page', err instanceof Error ? err.message : 'Please try again.');
        }
      }
    })();
  };

  const locationLine = useMemo(() => {
    if (!eventRow) return '';
    if (eventRow.venue_name) return eventRow.venue_name;
    if (eventRow.city && eventRow.country) return `${eventRow.city}, ${eventRow.country}`;
    return eventRow.city ?? 'Location TBA';
  }, [eventRow]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.terracotta} />
      </View>
    );
  }

  if (!eventRow) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyTitle}>Event not found</Text>
        <TouchableOpacity style={styles.emptyBack} onPress={() => router.back()}>
          <Text style={styles.emptyBackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { emoji, color: heroColor } = getCategoryMeta(eventRow.category);
  const usefulDescription = getUsefulExternalDescription(eventRow.description);
  const heroContent = (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
      </TouchableOpacity>

      <View style={styles.heroBody}>
        {eventRow.image_url ? null : (
          <View style={styles.heroEmojiWrap}>
            <Text style={styles.heroEmoji}>{emoji}</Text>
          </View>
        )}
        <Text style={styles.heroTitle}>{eventRow.title}</Text>
        {eventRow.organizer_name ? (
          <View style={styles.groupPill}>
            <Text style={styles.groupPillText}>{eventRow.organizer_name}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.heroStrip}>
        <View style={styles.heroChip}>
          <Text style={styles.heroChipText}>{formatDateShort(eventRow.start_at)}</Text>
        </View>
        <View style={styles.stripDot} />
        <Text style={styles.stripText}>{formatWeekday(eventRow.start_at)}</Text>
        <View style={styles.stripDot} />
        <Text style={styles.stripText}>{formatTime(eventRow.start_at)}</Text>
        {eventRow.is_free && (
          <>
            <View style={styles.stripDot} />
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>Free</Text>
            </View>
          </>
        )}
      </View>
    </>
  );

  return (
    <RAnimated.View entering={FadeIn.duration(260)} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Hero ── */}
        {eventRow.image_url ? (
          <ImageBackground
            source={{ uri: eventRow.image_url }}
            style={styles.hero}
            imageStyle={styles.heroImage}
          >
            <View style={styles.heroImageOverlay} />
            {heroContent}
          </ImageBackground>
        ) : (
          <View style={[styles.hero, { backgroundColor: heroColor }]}>
            {heroContent}
          </View>
        )}

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Details card ── */}
          <RAnimated.View entering={FadeInDown.delay(60).duration(300)} style={styles.detailCard}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: 'rgba(196,98,45,0.1)' }]}>
                <Ionicons name="calendar" size={16} color={Colors.terracotta} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatDate(eventRow.start_at)}</Text>
                <Text style={styles.detailSub}>{formatTime(eventRow.start_at)}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIconBox, { backgroundColor: 'rgba(122,140,92,0.1)' }]}>
                <Ionicons name="location" size={16} color={Colors.olive} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{cleanExternalText(locationLine)}</Text>
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
                  {goingCount === 0
                    ? 'No one yet — be the first!'
                    : `${goingCount} ${goingCount === 1 ? 'person' : 'people'} going`}
                </Text>
                {attendeeLabel ? (
                  <Text style={styles.detailSub}>{attendeeLabel}</Text>
                ) : null}
                {attendeeAvatars.length > 0 ? (
                  <View style={styles.attendeeAvatarRow}>
                    {attendeeAvatars.map((uri, index) => (
                      uri ? (
                        <Image
                          key={`${uri}-${index}`}
                          source={{ uri }}
                          style={[styles.attendeeAvatar, { marginLeft: index === 0 ? 0 : -8 }]}
                        />
                      ) : (
                        <View
                          key={`avatar-${index}`}
                          style={[styles.attendeeAvatar, styles.attendeeAvatarFallback, { marginLeft: index === 0 ? 0 : -8 }]}
                        >
                          <Ionicons name="person" size={10} color={Colors.muted} />
                        </View>
                      )
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </RAnimated.View>

          {/* ── About ── */}
          {usefulDescription ? (
            <RAnimated.View entering={FadeInDown.delay(140).duration(300)} style={styles.aboutCard}>
              <Text style={styles.aboutTitle}>About</Text>
              <Text style={styles.aboutText}>{usefulDescription}</Text>
            </RAnimated.View>
          ) : null}

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

          {myStatus !== 'going' && myStatus !== 'interested' ? (
            <RAnimated.View entering={FadeInDown.delay(260).duration(300)}>
              <TouchableOpacity
                style={styles.chatCta}
                onPress={handleJoinChatPrompt}
                disabled={saving || creatingChat}
                activeOpacity={0.85}
              >
                <View style={styles.chatCtaLeft}>
                  <View style={styles.chatCtaIconBox}>
                    <Ionicons name="chatbubbles-outline" size={19} color={Colors.olive} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatCtaTitle}>Join event chat</Text>
                    <Text style={styles.chatCtaSub}>RSVP to enter the attendee thread.</Text>
                  </View>
                </View>
                {saving || creatingChat ? (
                  <ActivityIndicator size="small" color={Colors.olive} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={Colors.olive} />
                )}
              </TouchableOpacity>
            </RAnimated.View>
          ) : null}

          {/* ── Group chat CTA ── */}
          {myStatus === 'going' || myStatus === 'interested' ? (
            <RAnimated.View entering={FadeInDown.delay(300).duration(300)}>
              <TouchableOpacity
                style={styles.chatCta}
                onPress={handleStartGroupChat}
                disabled={creatingChat}
                activeOpacity={0.85}
              >
                <View style={styles.chatCtaLeft}>
                  <View style={styles.chatCtaIconBox}>
                    <Ionicons name="chatbubbles" size={18} color={Colors.olive} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.chatCtaTitle}>Open attendee thread</Text>
                    <Text style={styles.chatCtaSub}>Only people who RSVP'd can join. Archives 24 hours after the event.</Text>
                  </View>
                </View>
                {creatingChat ? (
                  <ActivityIndicator size="small" color={Colors.olive} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={Colors.olive} />
                )}
              </TouchableOpacity>
            </RAnimated.View>
          ) : null}

          {/* ── Open event ── */}
          {eventRow.source_url ? (
            <RAnimated.View entering={FadeInDown.delay(280).duration(300)}>
              <TouchableOpacity
                style={styles.openBtn}
                onPress={handleOpenSourceUrl}
                activeOpacity={0.85}
              >
                <Text style={styles.openBtnText}>Open event page</Text>
                <Ionicons name="open-outline" size={15} color={Colors.terracotta} />
              </TouchableOpacity>
            </RAnimated.View>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </RAnimated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.cream },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.ink },
  emptyBack: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: Radius.full, backgroundColor: Colors.terracotta,
  },
  emptyBackText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // ── Hero ──
  hero: {
    minHeight: 270,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heroImage: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(45,31,23,0.42)',
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
  freeBadge: {
    backgroundColor: 'rgba(90,158,111,0.35)',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(90,158,111,0.5)',
  },
  freeBadgeText: { fontSize: 11, color: Colors.white, fontWeight: '700' },

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
  attendeeAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  attendeeAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.warmWhite,
  },
  attendeeAvatarFallback: {
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

  // ── Group chat CTA ──
  chatCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  chatCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  chatCtaIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(122,140,92,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chatCtaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 2,
  },
  chatCtaSub: {
    fontSize: 12,
    color: Colors.muted,
  },

  // ── Open event ──
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.terracotta,
    backgroundColor: Colors.warmWhite,
  },
  openBtnText: { fontSize: 14, fontWeight: '700', color: Colors.terracotta },
});
