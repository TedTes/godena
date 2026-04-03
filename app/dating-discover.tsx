import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatingState = 'loading' | 'error' | 'disabled' | 'caught_up' | 'active';

type DatingCandidateRow = {
  user_id: string;
  full_name: string | null;
  city: string | null;
  intent: 'friendship' | 'dating' | 'long_term' | 'marriage' | null;
  languages: string[] | null;
  birth_date: string | null;
  avatar_url: string | null;
  dating_about: string | null;
  dating_photos: string[] | null;
};

type DatingCardProfile = {
  id: string;
  name: string;
  age: number | null;
  city: string;
  bio: string;
  intent: string;
  languages: string[];
  images: string[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH    = Dimensions.get('window').width;
const SCREEN_HEIGHT   = Dimensions.get('window').height;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const DECK_H          = Math.round(SCREEN_HEIGHT * 0.55);

// ── Helpers ───────────────────────────────────────────────────────────────────

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 18 && age <= 99 ? age : null;
}

function formatIntent(intent: DatingCandidateRow['intent']): string {
  if (!intent) return 'Not set';
  if (intent === 'long_term' || intent === 'marriage') return 'Long term';
  return intent.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

// ── NoPhotoCard ───────────────────────────────────────────────────────────────

function NoPhotoCard({
  profile,
  likeOpacity,
  passOpacity,
}: {
  profile: DatingCardProfile;
  likeOpacity?: Animated.AnimatedInterpolation<string | number>;
  passOpacity?: Animated.AnimatedInterpolation<string | number>;
}) {
  return (
    <View style={styles.noPhotoCard}>
      <View style={styles.noPhotoFill} />
      <View style={styles.initialsCircle}>
        <Text style={styles.initialsText}>{getInitials(profile.name)}</Text>
      </View>
      <View style={styles.noPhotoInfo}>
        <Text style={styles.noPhotoName}>
          {profile.name}{profile.age != null ? `, ${profile.age}` : ''}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={12} color={Colors.brownMid} />
          <Text style={styles.noPhotoCity}>{profile.city}</Text>
        </View>
        <Text style={styles.noPhotoNote}>No photos shared yet</Text>
      </View>
      {likeOpacity && passOpacity ? (
        <>
          <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, { opacity: likeOpacity }]}>
            <Text style={[styles.swipeBadgeText, { color: '#4caf70' }]}>LIKE</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, { opacity: passOpacity }]}>
            <Text style={[styles.swipeBadgeText, { color: Colors.error }]}>PASS</Text>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

// ── DiscoverEmpty ─────────────────────────────────────────────────────────────

function DiscoverEmpty({
  datingState, loadError, onRefresh, onAdjustPrefs, onGoToProfile,
}: {
  datingState: DatingState;
  loadError: string;
  onRefresh: () => void;
  onAdjustPrefs: () => void;
  onGoToProfile: () => void;
}) {
  if (datingState === 'loading') {
    return (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <ActivityIndicator size="large" color={Colors.terracotta} />
        </View>
        <Text style={styles.emptyTitle}>Finding profiles</Text>
        <Text style={styles.emptySub}>Looking for people in your groups…</Text>
      </View>
    );
  }
  if (datingState === 'error') {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(217,79,79,0.09)' }]}>
          <Ionicons name="cloud-offline-outline" size={32} color={Colors.error} />
        </View>
        <Text style={styles.emptyTitle}>Couldn't load profiles</Text>
        <Text style={styles.emptySub}>{loadError}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onRefresh} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (datingState === 'disabled') {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(196,98,45,0.10)' }]}>
          <Ionicons name="heart-dislike-outline" size={32} color={Colors.terracotta} />
        </View>
        <Text style={styles.emptyTitle}>Dating Mode is off</Text>
        <Text style={styles.emptySub}>
          Enable Dating Mode in your profile settings to start connecting with people in your groups.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={onGoToProfile} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // caught_up
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(90,158,111,0.10)' }]}>
        <Ionicons name="checkmark-circle-outline" size={32} color="#5a9e6f" />
      </View>
      <Text style={styles.emptyTitle}>No new suggestions</Text>
      <Text style={styles.emptySub}>
        You've seen everyone available right now. Adjust your preferences or check back later.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={onAdjustPrefs} activeOpacity={0.85}>
        <Ionicons name="options-outline" size={15} color={Colors.white} />
        <Text style={styles.primaryBtnText}>Adjust preferences</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onRefresh} activeOpacity={0.7}>
        <Text style={styles.secondaryBtnText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DatingDiscoverScreen() {
  const router = useRouter();

  const [loading,          setLoading]          = useState(true);
  const [loadError,        setLoadError]        = useState('');
  const [datingDisabled,   setDatingDisabled]   = useState(false);
  const [profiles,         setProfiles]         = useState<DatingCardProfile[]>([]);
  const [index,            setIndex]            = useState(0);
  const [photoIdxByProfile, setPhotoIdxByProfile] = useState<Record<string, number>>({});
  const [submittingSwipe,  setSubmittingSwipe]  = useState(false);
  const [overlayExpanded,  setOverlayExpanded]  = useState(false);
  const [userId,           setUserId]           = useState<string | null>(null);

  const position   = useRef(new Animated.ValueXY()).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // ── Derived ──────────────────────────────────────────────────────────────────

  const datingState: DatingState = loading
    ? 'loading'
    : loadError
    ? 'error'
    : datingDisabled
    ? 'disabled'
    : profiles[index]
    ? 'active'
    : 'caught_up';

  const currentProfile = profiles[index] ?? null;
  const nextProfile    = profiles[index + 1] ?? null;
  const curPhotoIdx    = currentProfile ? (photoIdxByProfile[currentProfile.id] ?? 0) : 0;
  const nxtPhotoIdx    = nextProfile    ? (photoIdxByProfile[nextProfile.id]    ?? 0) : 0;

  const headerTitle = currentProfile
    ? `${currentProfile.name}${currentProfile.age != null ? `, ${currentProfile.age}` : ''}`
    : 'Discover';

  // ── Swipe animations ─────────────────────────────────────────────────────────

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, 60, 120], outputRange: [0, 0.75, 1], extrapolate: 'clamp',
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-120, -60, 0], outputRange: [1, 0.75, 0], extrapolate: 'clamp',
  });

  // ── Swipe handlers ───────────────────────────────────────────────────────────

  const resetPosition = () => {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
  };

  const moveToNext = (liked: boolean) => {
    void liked; // reserved for future like-count display
    position.setValue({ x: 0, y: 0 });
    setIndex((n) => n + 1);
    setOverlayExpanded(false);
    Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
  };

  const toggleOverlay = () => {
    const next = !overlayExpanded;
    setOverlayExpanded(next);
    Animated.spring(overlayAnim, { toValue: next ? 1 : 0, useNativeDriver: false, friction: 8, tension: 60 }).start();
  };

  const submitSwipe = async (direction: 'left' | 'right') => {
    if (!currentProfile || submittingSwipe) return;
    setSubmittingSwipe(true);
    const { data, error } = await supabase.rpc('submit_dating_swipe', {
      p_target_id: currentProfile.id,
      p_decision: direction === 'right' ? 'like' : 'pass',
    });
    setSubmittingSwipe(false);
    if (error) {
      resetPosition();
      Alert.alert('Could not submit swipe', error.message || 'Please try again.');
      return;
    }
    const result = (data as Array<{ matched: boolean; match_id: string | null }> | null)?.[0] ?? null;
    moveToNext(direction === 'right');
    if (direction === 'right' && result?.matched && result.match_id) {
      router.push(`/chat/${result.match_id}?source=dating`);
    }
  };

  const forceSwipe = (direction: 'left' | 'right') => {
    if (submittingSwipe || !currentProfile) return;
    const x = direction === 'right' ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2;
    Animated.timing(position, { toValue: { x, y: 0 }, duration: 220, useNativeDriver: false })
      .start(() => { void submitSwipe(direction); });
  };

  const cyclePhoto = (id: string, count: number, dir: 'next' | 'prev') => {
    setPhotoIdxByProfile((prev) => {
      const cur  = prev[id] ?? 0;
      const next = dir === 'next' ? (cur + 1) % count : (cur - 1 + count) % count;
      return { ...prev, [id]: next };
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          !submittingSwipe && (Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5),
        onPanResponderMove:    (_, g) => { position.setValue({ x: g.dx, y: g.dy * 0.15 }); },
        onPanResponderRelease: (_, g) => {
          if (g.dx >  SWIPE_THRESHOLD) { forceSwipe('right'); return; }
          if (g.dx < -SWIPE_THRESHOLD) { forceSwipe('left');  return; }
          resetPosition();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, submittingSwipe, currentProfile]
  );

  // ── Load candidates ───────────────────────────────────────────────────────────

  const loadCandidates = useCallback(async (resetRound: boolean) => {
    setLoading(true);
    setLoadError('');
    if (resetRound) { setIndex(0); }

    const { data: sd, error: se } = await supabase.auth.getSession();
    const uid = sd.session?.user.id;
    if (se || !uid) {
      setProfiles([]); setDatingDisabled(false);
      setLoadError('Please sign in to use Dating Mode.');
      setLoading(false); return;
    }
    setUserId(uid);

    const [{ data: dp }, candidatesRes] = await Promise.all([
      supabase.from('dating_profiles').select('is_enabled').eq('user_id', uid).maybeSingle(),
      supabase.rpc('get_dating_candidates', { p_limit: 40 }),
    ]);

    if ((dp?.is_enabled ?? false) === false) {
      setProfiles([]); setDatingDisabled(true); setLoading(false); return;
    }
    setDatingDisabled(false);

    if (candidatesRes.error) {
      setProfiles([]);
      setLoadError(candidatesRes.error.message || 'Could not load dating profiles right now.');
      setLoading(false); return;
    }

    const rows = (candidatesRes.data ?? []) as DatingCandidateRow[];
    const prepared = await Promise.all(
      rows.map(async (row) => {
        const allPaths = [row.avatar_url, ...(row.dating_photos ?? [])]
          .filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);
        const resolved = await Promise.all(allPaths.map((p) => resolveProfilePhotoUrl(p)));
        return {
          id:        row.user_id,
          name:      row.full_name?.trim() || 'Member',
          age:       ageFromBirthDate(row.birth_date),
          city:      row.city?.trim() || 'City not set',
          bio:       row.dating_about?.trim() || 'No bio yet.',
          intent:    formatIntent(row.intent),
          languages: row.languages ?? [],
          images:    resolved.filter((u): u is string => Boolean(u)),
        } satisfies DatingCardProfile;
      })
    );

    setIndex(0);
    setProfiles(prepared);
    setPhotoIdxByProfile(
      prepared.reduce<Record<string, number>>((acc, p) => { acc[p.id] = 0; return acc; }, {})
    );
    setLoading(false);
  }, []);

  useEffect(() => { void loadCandidates(true); }, [loadCandidates]);

  useFocusEffect(
    useCallback(() => {
      if (profiles.length === 0 || index >= profiles.length) void loadCandidates(false);
    }, [profiles.length, index, loadCandidates])
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  const showDeck = datingState === 'active';

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={20} color={Colors.brown} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          {/* spacer to balance the back button */}
          <View style={styles.headerBtn} />
        </View>
      </SafeAreaView>

      {/* Deck content */}
      <View style={styles.deckContent}>
        {showDeck ? (
          <View style={styles.deckContainer}>
            <View style={styles.deckWrap}>
              {/* Background card (next) */}
              {nextProfile ? (
                <View style={[styles.card, styles.cardUnder]}>
                  {nextProfile.images.length > 0 ? (
                    <ImageBackground
                      source={{ uri: nextProfile.images[nxtPhotoIdx] ?? nextProfile.images[0] }}
                      style={styles.cardImage}
                      imageStyle={styles.cardImageStyle}
                    />
                  ) : (
                    <NoPhotoCard profile={nextProfile} />
                  )}
                </View>
              ) : null}

              {/* Foreground card (swipeable) */}
              <Animated.View
                style={[
                  styles.card,
                  { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
                ]}
                {...panResponder.panHandlers}
              >
                {currentProfile!.images.length > 0 ? (
                  <ImageBackground
                    source={{ uri: currentProfile!.images[curPhotoIdx] ?? currentProfile!.images[0] }}
                    style={styles.cardImage}
                    imageStyle={styles.cardImageStyle}
                  >
                    {/* Photo dots */}
                    {currentProfile!.images.length > 1 ? (
                      <>
                        <View style={styles.dotsRow}>
                          {currentProfile!.images.map((_, i) => (
                            <View key={`${currentProfile!.id}-${i}`} style={[styles.dot, i === curPhotoIdx && styles.dotActive]} />
                          ))}
                        </View>
                        <View style={styles.tapRow}>
                          <TouchableOpacity
                            style={styles.tapZone}
                            onPress={() => cyclePhoto(currentProfile!.id, currentProfile!.images.length, 'prev')}
                            activeOpacity={1}
                          />
                          <TouchableOpacity
                            style={styles.tapZone}
                            onPress={() => cyclePhoto(currentProfile!.id, currentProfile!.images.length, 'next')}
                            activeOpacity={1}
                          />
                        </View>
                      </>
                    ) : null}

                    {/* Swipe stamps */}
                    <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, { opacity: likeOpacity }]}>
                      <Text style={[styles.swipeBadgeText, { color: '#4caf70' }]}>LIKE</Text>
                    </Animated.View>
                    <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, { opacity: passOpacity }]}>
                      <Text style={[styles.swipeBadgeText, { color: Colors.error }]}>PASS</Text>
                    </Animated.View>

                    {/* Profile info overlay — expandable */}
                    <Animated.View style={styles.cardContent}>
                      <TouchableOpacity onPress={toggleOverlay} activeOpacity={0.7} style={styles.cardHandle}>
                        <View style={styles.cardHandleBar} />
                      </TouchableOpacity>

                      <View style={styles.cardInfoBlock}>
                        <View style={styles.metaRow}>
                          <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.45)" />
                          <Text style={styles.cardCity}>{currentProfile!.city}</Text>
                        </View>

                        {currentProfile!.bio ? (
                          <Text style={styles.cardBio} numberOfLines={overlayExpanded ? 0 : 2}>
                            {currentProfile!.bio}
                          </Text>
                        ) : null}

                        {(() => {
                          const intent = currentProfile!.intent && currentProfile!.intent !== 'Not set'
                            ? formatIntent(currentProfile!.intent as DatingCandidateRow['intent'])
                            : null;
                          const langs = currentProfile!.languages.slice(0, overlayExpanded ? 8 : 3);
                          const parts = [intent, ...langs].filter(Boolean) as string[];
                          return parts.length > 0 ? (
                            <Text style={styles.cardMeta}>{parts.join(' . ')}</Text>
                          ) : null;
                        })()}

                        {overlayExpanded && (
                          <View style={styles.cardExpandedDetail}>
                            <View style={styles.cardDivider} />
                            <View style={styles.cardDetailRow}>
                              <Ionicons name="heart-outline" size={12} color="rgba(255,255,255,0.35)" />
                              <Text style={styles.cardDetailText}>
                                {currentProfile!.intent && currentProfile!.intent !== 'Not set'
                                  ? formatIntent(currentProfile!.intent as DatingCandidateRow['intent'])
                                  : 'Not specified'}
                              </Text>
                            </View>
                            {currentProfile!.age != null && (
                              <View style={styles.cardDetailRow}>
                                <Ionicons name="calendar-outline" size={12} color="rgba(255,255,255,0.35)" />
                                <Text style={styles.cardDetailText}>{currentProfile!.age} years old</Text>
                              </View>
                            )}
                            {currentProfile!.languages.length > 0 && (
                              <View style={styles.cardDetailRow}>
                                <Ionicons name="language-outline" size={12} color="rgba(255,255,255,0.35)" />
                                <Text style={styles.cardDetailText}>{currentProfile!.languages.join(', ')}</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>

                      {/* Action buttons */}
                      <View style={styles.cardActions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.passBtn, submittingSwipe && styles.actionBtnDim]}
                          onPress={() => forceSwipe('left')}
                          disabled={submittingSwipe}
                          activeOpacity={0.8}
                        >
                          {submittingSwipe
                            ? <ActivityIndicator size="small" color={Colors.white} />
                            : <Ionicons name="close" size={26} color={Colors.white} />}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.likeBtn, submittingSwipe && styles.actionBtnDim]}
                          onPress={() => forceSwipe('right')}
                          disabled={submittingSwipe}
                          activeOpacity={0.8}
                        >
                          {submittingSwipe
                            ? <ActivityIndicator size="small" color={Colors.white} />
                            : <Ionicons name="heart" size={24} color={Colors.white} />}
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  </ImageBackground>
                ) : (
                  <NoPhotoCard profile={currentProfile!} likeOpacity={likeOpacity} passOpacity={passOpacity} />
                )}
              </Animated.View>
            </View>
          </View>
        ) : (
          <DiscoverEmpty
            datingState={datingState}
            loadError={loadError}
            onRefresh={() => { setIndex(0); void loadCandidates(false); }}
            onAdjustPrefs={() => router.push('/(tabs)/profile')}
            onGoToProfile={() => router.push('/(tabs)/profile')}
          />
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.cream },
  headerSafe:  { backgroundColor: Colors.cream },
  deckContent: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.paper,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },

  // Empty states
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 10,
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(196,98,45,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  emptySub:   { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 21, maxWidth: 280 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    backgroundColor: Colors.terracotta, borderRadius: Radius.full,
    paddingHorizontal: 24, paddingVertical: 13,
  },
  primaryBtnText:   { color: Colors.white, fontWeight: '700', fontSize: 15 },
  secondaryBtn:     { paddingHorizontal: 16, paddingVertical: 8 },
  secondaryBtnText: { color: Colors.muted, fontWeight: '600', fontSize: 13 },

  // Deck
  deckContainer: { flex: 1 },
  deckWrap:      { flex: 1, position: 'relative', marginBottom: -34 },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl, overflow: 'hidden',
    backgroundColor: Colors.paper,
    shadowColor: '#000', shadowOpacity: 0.20,
    shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  cardUnder:      { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.72 },
  cardImage:      { flex: 1, justifyContent: 'flex-end' },
  cardImageStyle: { borderRadius: Radius.xl },
  cardContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 44,
    zIndex: 5,
    gap: 0,
  },
  cardInfoBlock: {
    gap: 0,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(8,4,2,0.42)',
    borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  cardActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 4,
  },
  cardCity: {
    color: 'rgba(255,255,255,0.50)', fontSize: 11, fontWeight: '500', letterSpacing: 0.2,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardBio: {
    color: 'rgba(255,255,255,0.90)', fontSize: 13, lineHeight: 19,
    borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.18)',
    paddingLeft: 8, marginVertical: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardMeta: {
    color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '400', letterSpacing: 0.1,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  cardHandle:    { alignItems: 'center', paddingTop: 2, paddingBottom: 8 },
  cardHandleBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.50)' },
  cardExpandedDetail: { gap: 8, marginTop: 8 },
  cardDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDetailText: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '400' },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 4 },

  // No-photo card
  noPhotoCard:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  noPhotoFill:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.warmWhite, opacity: 0.6 },
  initialsCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: Colors.terracotta, shadowOpacity: 0.28, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  initialsText: { fontSize: 34, fontWeight: '900', color: Colors.white, letterSpacing: 1 },
  noPhotoInfo:  { alignItems: 'center', gap: 4 },
  noPhotoName:  { fontSize: 24, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  noPhotoCity:  { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  noPhotoNote: {
    marginTop: 10, fontSize: 12, color: Colors.muted, fontWeight: '500',
    backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },

  // Action buttons
  actionBtn: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  actionBtnDim: { opacity: 0.55 },
  passBtn: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
  likeBtn: { backgroundColor: Colors.terracotta },

  // Swipe stamps
  swipeBadge: {
    position: 'absolute', top: 22, borderWidth: 2.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, zIndex: 6,
  },
  swipeBadgeLike: { left: 16, borderColor: '#4caf70', transform: [{ rotate: '-12deg' }] },
  swipeBadgePass: { right: 16, borderColor: Colors.error, transform: [{ rotate: '12deg' }] },
  swipeBadgeText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  // Photo dots + tap zones
  dotsRow: {
    position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', gap: 5, zIndex: 4,
  },
  dot:       { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  dotActive: { backgroundColor: Colors.white, opacity: 1 },
  tapRow:  { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 3 },
  tapZone: { flex: 1 },

  // Shared
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
