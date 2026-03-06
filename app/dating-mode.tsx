import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

type ProfileRow = {
  user_id: string;
  full_name: string | null;
  city: string | null;
  bio: string | null;
  intent: string | null;
  languages: string[] | null;
  birth_date: string | null;
  avatar_url: string | null;
  photo_urls: string[] | null;
  dating_mode_enabled?: boolean | null;
  is_open_to_connections: boolean | null;
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

const PROFILE_BASE_SELECT =
  'user_id, full_name, city, bio, intent, languages, birth_date, avatar_url, photo_urls, is_open_to_connections';
const PROFILE_SELECT_WITH_DATING = `${PROFILE_BASE_SELECT}, dating_mode_enabled`;

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=1200&q=80';
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

function formatIntent(intent: string | null): string {
  if (!intent) return 'Not set';
  if (intent === 'long_term') return 'Long-term';
  return intent.replace('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function DatingModeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<DatingCardProfile[]>([]);
  const [index, setIndex] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [headerName, setHeaderName] = useState('You');
  const [photoIndexByProfile, setPhotoIndexByProfile] = useState<Record<string, number>>({});
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

  const swipeLabelOpacity = position.x.interpolate({
    inputRange: [-120, 0, 120],
    outputRange: [1, 0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) {
        if (active) {
          setProfiles([]);
          setLoading(false);
        }
        return;
      }

      const { data: me } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', uid)
        .maybeSingle();
      const myName = me?.full_name?.trim();
      if (myName && active) setHeaderName(myName.split(' ')[0] || myName);

      const primaryQuery = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_WITH_DATING)
        .neq('user_id', uid)
        .eq('is_open_to_connections', true)
        .eq('dating_mode_enabled', true)
        .limit(40);

      let rows = primaryQuery.data as ProfileRow[] | null;
      let error = primaryQuery.error;

      if (error?.message?.toLowerCase().includes('dating_mode_enabled')) {
        const fallback = await supabase
          .from('profiles')
          .select(PROFILE_BASE_SELECT)
          .neq('user_id', uid)
          .eq('is_open_to_connections', true)
          .limit(40);
        rows = fallback.data as ProfileRow[] | null;
        error = fallback.error;
      }

      if (error || !rows) {
        if (active) {
          setProfiles([]);
          setLoading(false);
        }
        return;
      }

      const prepared = await Promise.all(
        (rows as ProfileRow[]).map(async (row) => {
          const allPaths = [row.avatar_url, ...(row.photo_urls ?? [])].filter(
            (value, i, arr): value is string => Boolean(value) && arr.indexOf(value) === i
          );
          const resolved = await Promise.all(allPaths.map((path) => resolveProfilePhotoUrl(path)));
          const images = resolved.filter((url): url is string => Boolean(url));

          return {
            id: row.user_id,
            name: row.full_name?.trim() || 'Member',
            age: ageFromBirthDate(row.birth_date),
            city: row.city?.trim() || 'City not set',
            bio: row.bio?.trim() || 'No bio yet.',
            intent: formatIntent(row.intent),
            languages: row.languages ?? [],
            images: images.length > 0 ? images : [FALLBACK_IMAGE],
          } satisfies DatingCardProfile;
        })
      );

      if (!active) return;
      setProfiles(prepared);
      setPhotoIndexByProfile(
        prepared.reduce<Record<string, number>>((acc, p) => {
          acc[p.id] = 0;
          return acc;
        }, {})
      );
      setLoading(false);
    };

    void loadData();
    return () => {
      active = false;
    };
  }, []);

  const moveToNext = (liked: boolean) => {
    if (liked) setLikedCount((prev) => prev + 1);
    position.setValue({ x: 0, y: 0 });
    setIndex((prev) => prev + 1);
  };

  const forceSwipe = (direction: 'left' | 'right') => {
    const toValue = direction === 'right' ? SCREEN_WIDTH * 1.2 : -SCREEN_WIDTH * 1.2;
    Animated.timing(position, {
      toValue: { x: toValue, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => moveToNext(direction === 'right'));
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
          Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
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
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
            friction: 6,
          }).start();
        },
      }),
    [position]
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.terracotta} />
            <Text style={styles.loadingText}>Loading profiles...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!currentProfile) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyTitle}>You are all caught up</Text>
            <Text style={styles.emptySub}>Liked {likedCount} profile{likedCount === 1 ? '' : 's'} in this round.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace('/(tabs)/home')}>
              <Text style={styles.emptyBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.brown} />
          </TouchableOpacity>
          <Text style={styles.title}>{headerName}</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{likedCount} liked</Text>
          </View>
        </View>

        <View style={styles.deckWrap}>
          {nextProfile ? (
            <View style={[styles.card, styles.cardUnder]}>
              <ImageBackground
                source={{ uri: nextProfile.images[nextPhotoIndex] ?? nextProfile.images[0] }}
                style={styles.image}
                imageStyle={styles.imageRounded}
              />
            </View>
          ) : null}

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
            <ImageBackground
              source={{ uri: currentProfile.images[currentPhotoIndex] ?? currentProfile.images[0] }}
              style={styles.image}
              imageStyle={styles.imageRounded}
            >
              <View style={styles.overlay} />

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

              <Animated.View style={[styles.swipeHint, { opacity: swipeLabelOpacity }]}>
                <Text style={styles.swipeHintText}>Swipe to decide</Text>
              </Animated.View>
              <View style={styles.cardContent}>
                <Text style={styles.name}>
                  {currentProfile.name}{currentProfile.age != null ? `, ${currentProfile.age}` : ''}
                </Text>
                <Text style={styles.city}>{currentProfile.city}</Text>
              </View>
            </ImageBackground>
          </Animated.View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.actionBtn, styles.passBtn]} onPress={() => forceSwipe('left')}>
            <Ionicons name="close" size={24} color={Colors.error} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.likeBtn]} onPress={() => forceSwipe('right')}>
            <Ionicons name="heart" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Profile details</Text>
          <Text style={styles.detailsBio}>{currentProfile.bio}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Intent</Text>
            <Text style={styles.value}>{currentProfile.intent}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Languages</Text>
            <Text style={styles.value}>{currentProfile.languages.length > 0 ? currentProfile.languages.join(', ') : 'Not set'}</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.md },
  header: {
    marginTop: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.ink },
  headerBadge: {
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  headerBadgeText: { fontSize: 11, color: Colors.brownMid, fontWeight: '700' },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: { fontSize: 14, color: Colors.muted, fontWeight: '600' },
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
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    position: 'absolute',
  },
  cardUnder: {
    transform: [{ scale: 0.96 }, { translateY: 8 }],
    opacity: 0.55,
  },
  image: { flex: 1, justifyContent: 'flex-end' },
  imageRounded: { borderRadius: Radius.xl },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
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
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  carouselDotActive: {
    backgroundColor: Colors.white,
  },
  carouselTapRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 3,
  },
  carouselTapZone: {
    flex: 1,
  },
  swipeHint: {
    position: 'absolute',
    top: 22,
    alignSelf: 'center',
    backgroundColor: 'rgba(61,43,31,0.75)',
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 5,
  },
  swipeHintText: { color: Colors.white, fontSize: 12, fontWeight: '600' },
  cardContent: { padding: Spacing.md, zIndex: 5 },
  name: { color: Colors.white, fontSize: 30, fontWeight: '900' },
  city: { color: '#f3e9df', fontSize: 14, fontWeight: '600' },
  actions: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  actionBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  passBtn: { backgroundColor: Colors.warmWhite },
  likeBtn: { backgroundColor: Colors.terracotta, borderColor: Colors.terracotta },
  detailsCard: {
    marginTop: Spacing.md,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 10,
  },
  detailsTitle: { fontSize: 13, color: Colors.muted, fontWeight: '700', textTransform: 'uppercase' },
  detailsBio: { fontSize: 14, color: Colors.brownMid, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
  value: { fontSize: 13, color: Colors.ink, fontWeight: '700', flex: 1, textAlign: 'right' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    gap: 8,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 23, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  emptySub: { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 21 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyBtnText: { color: Colors.white, fontWeight: '700' },
});
