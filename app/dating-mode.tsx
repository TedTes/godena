import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

type DatingCandidateRow = {
  user_id: string;
  full_name: string | null;
  city: string | null;
  bio: string | null;
  intent: 'friendship' | 'dating' | 'long_term' | 'marriage' | null;
  languages: string[] | null;
  birth_date: string | null;
  avatar_url: string | null;
  photo_urls: string[] | null;
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

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;

function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age >= 18 && age <= 99 ? age : null;
}

function formatIntent(intent: DatingCandidateRow['intent']): string {
  if (!intent) return 'Not set';
  if (intent === 'long_term') return 'Long-term';
  return intent.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

// ── Empty / Error screens ─────────────────────────────────────────────────────

function EmptyScreen({
  icon,
  iconBg,
  iconColor,
  title,
  sub,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  stat,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  stat?: string;
}) {
  return (
    <View style={styles.emptyWrap}>
      <View style={[styles.emptyIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as never} size={36} color={iconColor} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
      {stat ? <Text style={styles.emptyStat}>{stat}</Text> : null}
      <TouchableOpacity style={styles.emptyBtn} onPress={onPrimary} activeOpacity={0.85}>
        <Text style={styles.emptyBtnText}>{primaryLabel}</Text>
      </TouchableOpacity>
      {secondaryLabel && onSecondary ? (
        <TouchableOpacity style={styles.emptyBtnSecondary} onPress={onSecondary} activeOpacity={0.7}>
          <Text style={styles.emptyBtnSecondaryText}>{secondaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DatingModeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DatingCardProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [headerName, setHeaderName] = useState('You');
  const [photoIndexByProfile, setPhotoIndexByProfile] = useState<Record<string, number>>({});
  const [submittingSwipe, setSubmittingSwipe] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [datingDisabled, setDatingDisabled] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;

  const currentProfile = profiles[index] ?? null;
  const nextProfile = profiles[index + 1] ?? null;
  const currentPhotoIndex = currentProfile ? (photoIndexByProfile[currentProfile.id] ?? 0) : 0;
  const nextPhotoIndex = nextProfile ? (photoIndexByProfile[nextProfile.id] ?? 0) : 0;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });

  // Directional swipe intent labels
  const likeOpacity = position.x.interpolate({
    inputRange: [0, 60, 120],
    outputRange: [0, 0.75, 1],
    extrapolate: 'clamp',
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-120, -60, 0],
    outputRange: [1, 0.75, 0],
    extrapolate: 'clamp',
  });

  const resetCardPosition = () => {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 6,
    }).start();
  };

  const moveToNext = (liked: boolean) => {
    if (liked) setLikedCount((prev) => prev + 1);
    position.setValue({ x: 0, y: 0 });
    setIndex((prev) => prev + 1);
  };

  const loadCandidates = useCallback(async (resetRound: boolean) => {
    setLoading(true);
    setLoadError('');

    if (resetRound) {
      setLikedCount(0);
      setIndex(0);
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id;
    if (sessionError || !uid) {
      setProfiles([]);
      setDatingDisabled(false);
      setLoadError('Please sign in to use Dating Mode.');
      setLoading(false);
      return;
    }

    const [{ data: me }, { data: datingProfile }, candidatesRes] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('user_id', uid).maybeSingle(),
      supabase.from('dating_profiles').select('is_enabled').eq('user_id', uid).maybeSingle(),
      supabase.rpc('get_dating_candidates', { p_limit: 40 }),
    ]);

    const myName = me?.full_name?.trim();
    if (myName) setHeaderName(myName.split(' ')[0] || myName);

    if ((datingProfile?.is_enabled ?? false) === false) {
      setProfiles([]);
      setDatingDisabled(true);
      setLoading(false);
      return;
    }

    setDatingDisabled(false);

    const rows = (candidatesRes.data ?? []) as DatingCandidateRow[];
    if (candidatesRes.error || !rows) {
      setProfiles([]);
      setLoadError(candidatesRes.error?.message || 'Could not load dating profiles right now.');
      setLoading(false);
      return;
    }

    const prepared = await Promise.all(
      rows.map(async (row) => {
        const allPaths = [
          row.avatar_url,
          ...(row.photo_urls ?? []),
          ...(row.dating_photos ?? []),
        ].filter((value, i, arr): value is string => Boolean(value) && arr.indexOf(value) === i);
        const resolved = await Promise.all(allPaths.map((path) => resolveProfilePhotoUrl(path)));
        const images = resolved.filter((url): url is string => Boolean(url));

        return {
          id: row.user_id,
          name: row.full_name?.trim() || 'Member',
          age: ageFromBirthDate(row.birth_date),
          city: row.city?.trim() || 'City not set',
          bio: row.dating_about?.trim() || row.bio?.trim() || 'No bio yet.',
          intent: formatIntent(row.intent),
          languages: row.languages ?? [],
          images,
        } satisfies DatingCardProfile;
      })
    );

    setIndex(0);
    setProfiles(prepared);
    setPhotoIndexByProfile(
      prepared.reduce<Record<string, number>>((acc, p) => {
        acc[p.id] = 0;
        return acc;
      }, {})
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCandidates(true);
  }, [loadCandidates]);

  useFocusEffect(
    useCallback(() => {
      if (profiles.length === 0 || index >= profiles.length) {
        void loadCandidates(false);
      }
    }, [profiles.length, index, loadCandidates])
  );

  const retryLoading = () => {
    setIndex(0);
    void loadCandidates(false);
  };

  const submitSwipe = async (direction: 'left' | 'right') => {
    if (!currentProfile || submittingSwipe) return;
    setSubmittingSwipe(true);

    const decision = direction === 'right' ? 'like' : 'pass';
    const { data, error } = await supabase.rpc('submit_dating_swipe', {
      p_target_id: currentProfile.id,
      p_decision: decision,
    });

    setSubmittingSwipe(false);

    if (error) {
      resetCardPosition();
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
    const toValue = direction === 'right' ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2;
    Animated.timing(position, {
      toValue: { x: toValue, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => {
      void submitSwipe(direction);
    });
  };

  const cyclePhoto = (profileId: string, imageCount: number, direction: 'next' | 'prev') => {
    setPhotoIndexByProfile((prev) => {
      const current = prev[profileId] ?? 0;
      const next = direction === 'next'
        ? (current + 1) % imageCount
        : (current - 1 + imageCount) % imageCount;
      return { ...prev, [profileId]: next };
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !submittingSwipe && (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5),
        onPanResponderMove: (_, gesture) => {
          position.setValue({ x: gesture.dx, y: gesture.dy * 0.15 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx > SWIPE_THRESHOLD) {
            forceSwipe('right');
            return;
          }
          if (gesture.dx < -SWIPE_THRESHOLD) {
            forceSwipe('left');
            return;
          }
          resetCardPosition();
        },
      }),
    [position, submittingSwipe, currentProfile]
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingWrap}>
            <View style={styles.loadingIconWrap}>
              <ActivityIndicator size="large" color={Colors.terracotta} />
            </View>
            <Text style={styles.loadingTitle}>Finding profiles</Text>
            <Text style={styles.loadingText}>Looking for people in your groups…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Dating off ───────────────────────────────────────────────────────────────
  if (datingDisabled) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <EmptyScreen
            icon="heart-dislike-outline"
            iconBg="rgba(196,98,45,0.10)"
            iconColor={Colors.terracotta}
            title="Dating Mode is off"
            sub="Enable Dating Mode in your profile to start connecting with people from your groups."
            primaryLabel="Go to Profile"
            onPrimary={() => router.push('/(tabs)/profile')}
            secondaryLabel="Back to Home"
            onSecondary={() => router.replace('/(tabs)/home')}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── Load error ───────────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <EmptyScreen
            icon="cloud-offline-outline"
            iconBg="rgba(217,79,79,0.09)"
            iconColor={Colors.error}
            title="Couldn't load profiles"
            sub={loadError}
            primaryLabel="Try again"
            onPrimary={retryLoading}
            secondaryLabel="Back to Home"
            onSecondary={() => router.replace('/(tabs)/home')}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── Caught up ────────────────────────────────────────────────────────────────
  if (!currentProfile) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <EmptyScreen
            icon="checkmark-circle-outline"
            iconBg="rgba(90,158,111,0.10)"
            iconColor="#5a9e6f"
            title="You're all caught up"
            sub="You've seen everyone available in your groups right now. Check back later for new members."
            stat={likedCount > 0 ? `${likedCount} like${likedCount === 1 ? '' : 's'} sent this round` : undefined}
            primaryLabel="Back to Home"
            onPrimary={() => router.replace('/(tabs)/home')}
          />
        </SafeAreaView>
      </View>
    );
  }

  // ── Main swipe UI ─────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={20} color={Colors.brown} />
          </TouchableOpacity>
          <Text style={styles.title}>{headerName}</Text>
          <View style={styles.headerBadge}>
            <Ionicons name="heart" size={10} color={Colors.terracotta} />
            <Text style={styles.headerBadgeText}>{likedCount}</Text>
          </View>
        </View>

        {/* Card deck */}
        <View style={styles.deckWrap}>

          {/* Background card (next profile) */}
          {nextProfile ? (
            <View style={[styles.card, styles.cardUnder]}>
              {nextProfile.images.length > 0 ? (
                <ImageBackground
                  source={{ uri: nextProfile.images[nextPhotoIndex] ?? nextProfile.images[0] }}
                  style={styles.image}
                  imageStyle={styles.imageRounded}
                />
              ) : (
                <NoPhotoCard profile={nextProfile} />
              )}
            </View>
          ) : null}

          {/* Foreground card (current profile) */}
          <Animated.View
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { translateY: position.y },
                  { rotate },
                ],
              },
            ]}
            {...panResponder.panHandlers}
          >
            {currentProfile.images.length > 0 ? (
              <ImageBackground
                source={{ uri: currentProfile.images[currentPhotoIndex] ?? currentProfile.images[0] }}
                style={styles.image}
                imageStyle={styles.imageRounded}
              >
                {/* Photo indicators */}
                {currentProfile.images.length > 1 ? (
                  <>
                    <View style={styles.carouselDotsRow}>
                      {currentProfile.images.map((_, i) => (
                        <View
                          key={`${currentProfile.id}-${i}`}
                          style={[styles.carouselDot, i === currentPhotoIndex && styles.carouselDotActive]}
                        />
                      ))}
                    </View>
                    <View style={styles.carouselTapRow}>
                      <TouchableOpacity
                        style={styles.carouselTapZone}
                        onPress={() => cyclePhoto(currentProfile.id, currentProfile.images.length, 'prev')}
                        activeOpacity={1}
                      />
                      <TouchableOpacity
                        style={styles.carouselTapZone}
                        onPress={() => cyclePhoto(currentProfile.id, currentProfile.images.length, 'next')}
                        activeOpacity={1}
                      />
                    </View>
                  </>
                ) : null}

                {/* LIKE / PASS intent labels */}
                <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, { opacity: likeOpacity }]}>
                  <Text style={[styles.swipeBadgeText, styles.swipeBadgeLikeText]}>LIKE</Text>
                </Animated.View>
                <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, { opacity: passOpacity }]}>
                  <Text style={[styles.swipeBadgeText, styles.swipeBadgePassText]}>PASS</Text>
                </Animated.View>

                {/* Dark overlay + content */}
                <View style={styles.overlay} />
                <View style={styles.cardContent}>
                  <Text style={styles.name}>
                    {currentProfile.name}{currentProfile.age != null ? `, ${currentProfile.age}` : ''}
                  </Text>
                  <View style={styles.cityRow}>
                    <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.75)" />
                    <Text style={styles.city}>{currentProfile.city}</Text>
                  </View>
                </View>
              </ImageBackground>
            ) : (
              <NoPhotoCard profile={currentProfile} showSwipeBadges likeOpacity={likeOpacity} passOpacity={passOpacity} />
            )}
          </Animated.View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.passBtn, submittingSwipe && styles.actionBtnDisabled]}
            onPress={() => forceSwipe('left')}
            disabled={submittingSwipe}
            activeOpacity={0.8}
          >
            {submittingSwipe
              ? <ActivityIndicator size="small" color={Colors.error} />
              : <Ionicons name="close" size={26} color={Colors.error} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.likeBtn, submittingSwipe && styles.actionBtnDisabled]}
            onPress={() => forceSwipe('right')}
            disabled={submittingSwipe}
            activeOpacity={0.8}
          >
            {submittingSwipe
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="heart" size={24} color={Colors.white} />}
          </TouchableOpacity>
        </View>

        {/* Profile details card */}
        <View style={styles.detailsCard}>
          <View style={styles.detailsHeader}>
            <Text style={styles.detailsTitle}>About</Text>
            <View style={styles.intentBadge}>
              <Text style={styles.intentBadgeText}>{currentProfile.intent}</Text>
            </View>
          </View>
          <Text style={styles.detailsBio} numberOfLines={3}>{currentProfile.bio}</Text>
          {currentProfile.languages.length > 0 && (
            <View style={styles.langRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.muted} />
              <Text style={styles.langText}>{currentProfile.languages.join(' · ')}</Text>
            </View>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

// ── No-photo card ─────────────────────────────────────────────────────────────

function NoPhotoCard({
  profile,
  showSwipeBadges = false,
  likeOpacity,
  passOpacity,
}: {
  profile: DatingCardProfile;
  showSwipeBadges?: boolean;
  likeOpacity?: Animated.AnimatedInterpolation<string | number>;
  passOpacity?: Animated.AnimatedInterpolation<string | number>;
}) {
  const initials = getInitials(profile.name);
  return (
    <View style={styles.noPhotoCard}>
      {/* Soft background texture */}
      <View style={styles.noPhotoTopFill} />

      {/* Initials avatar */}
      <View style={styles.initialsCircle}>
        <Text style={styles.initialsText}>{initials}</Text>
      </View>

      {/* Name + city */}
      <View style={styles.noPhotoInfo}>
        <Text style={styles.noPhotoName}>
          {profile.name}{profile.age != null ? `, ${profile.age}` : ''}
        </Text>
        <View style={styles.cityRow}>
          <Ionicons name="location-outline" size={12} color={Colors.brownMid} />
          <Text style={styles.noPhotoCity}>{profile.city}</Text>
        </View>
        <Text style={styles.noPhotoNote}>No photos shared yet</Text>
      </View>

      {/* Swipe intent badges (only on foreground card) */}
      {showSwipeBadges && likeOpacity && passOpacity ? (
        <>
          <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, styles.swipeBadgeNoPhoto, { opacity: likeOpacity }]}>
            <Text style={[styles.swipeBadgeText, styles.swipeBadgeLikeText]}>LIKE</Text>
          </Animated.View>
          <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, styles.swipeBadgeNoPhoto, { opacity: passOpacity }]}>
            <Text style={[styles.swipeBadgeText, styles.swipeBadgePassText]}>PASS</Text>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },

  // Header
  header: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(196,98,45,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBadgeText: { fontSize: 12, color: Colors.terracotta, fontWeight: '800' },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(196,98,45,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  loadingTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  loadingText: { fontSize: 13, color: Colors.muted, textAlign: 'center' },

  // Empty / error states
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  emptySub: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 21, maxWidth: 280 },
  emptyStat: {
    fontSize: 13,
    color: Colors.terracotta,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  emptyBtn: {
    marginTop: 10,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  emptyBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  emptyBtnSecondary: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyBtnSecondaryText: { color: Colors.muted, fontWeight: '600', fontSize: 13 },

  // Card deck
  deckWrap: {
    marginTop: Spacing.md,
    height: 420,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: 420,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.paper,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    position: 'absolute',
  },
  cardUnder: {
    transform: [{ scale: 0.95 }, { translateY: 10 }],
    opacity: 0.72,
  },

  // Card image
  image: { flex: 1, justifyContent: 'flex-end' },
  imageRounded: { borderRadius: Radius.xl },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  // Swipe intent badges
  swipeBadge: {
    position: 'absolute',
    top: 22,
    borderWidth: 2.5,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 6,
  },
  swipeBadgeLike: {
    left: 16,
    borderColor: '#4caf70',
    transform: [{ rotate: '-12deg' }],
  },
  swipeBadgeLikeText: {
    color: '#4caf70',
  },
  swipeBadgePass: {
    right: 16,
    borderColor: Colors.error,
    transform: [{ rotate: '12deg' }],
  },
  swipeBadgePassText: {
    color: Colors.error,
  },
  swipeBadgeNoPhoto: {
    top: 18,
  },
  swipeBadgeText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Card content (name/city over photo)
  cardContent: {
    padding: Spacing.md,
    paddingBottom: 18,
    zIndex: 5,
  },
  name: { color: Colors.white, fontSize: 28, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  cityRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  city: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' },

  // Photo carousel
  carouselDotsRow: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 5,
    zIndex: 4,
  },
  carouselDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  carouselDotActive: { backgroundColor: Colors.white },
  carouselTapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 3,
  },
  carouselTapZone: { flex: 1 },

  // No-photo card
  noPhotoCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
    gap: 0,
  },
  noPhotoTopFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.warmWhite,
    opacity: 0.6,
  },
  initialsCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.terracotta,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  initialsText: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 1,
  },
  noPhotoInfo: { alignItems: 'center', gap: 4 },
  noPhotoName: {
    fontSize: 26,
    fontWeight: '900',
    color: Colors.ink,
    textAlign: 'center',
  },
  noPhotoCity: { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  noPhotoNote: {
    marginTop: 10,
    fontSize: 12,
    color: Colors.muted,
    fontWeight: '500',
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },

  // Action buttons
  actions: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    alignItems: 'center',
  },
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  actionBtnDisabled: { opacity: 0.6 },
  passBtn: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1.5,
    borderColor: 'rgba(217,79,79,0.22)',
  },
  likeBtn: {
    backgroundColor: Colors.terracotta,
    borderWidth: 0,
    width: 72,
    height: 72,
    borderRadius: 36,
  },

  // Profile details card
  detailsCard: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 8,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailsTitle: { fontSize: 11, color: Colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  intentBadge: {
    backgroundColor: 'rgba(196,98,45,0.09)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  intentBadgeText: { fontSize: 11, color: Colors.terracotta, fontWeight: '700' },
  detailsBio: { fontSize: 14, color: Colors.brownMid, lineHeight: 21 },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  langText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
});
