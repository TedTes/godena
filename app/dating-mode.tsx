import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  ImageBackground,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatingState = 'loading' | 'error' | 'disabled' | 'caught_up' | 'active';
type DatingTab   = 'discover' | 'profile' | 'preferences';

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

type MyDatingSummary = {
  fullName: string;
  city: string;
  about: string;
  intent: string;
  languages: string[];
  preferredGenders: string[];
  preferredIntents: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  isGloballyVisible: boolean;
};

type PrefDraft = {
  preferredGenders: string[];
  preferredIntents: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  isGloballyVisible: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH   = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const PHOTO_SIZE     = 58;
const PHOTO_ASPECT   = 1.25;

const GENDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'man',       label: 'Men' },
  { value: 'woman',     label: 'Women' },
  { value: 'non_binary', label: 'Non-binary' },
];

const INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating',     label: 'Dating' },
  { value: 'long_term',  label: 'Long-term' },
  { value: 'marriage',   label: 'Marriage' },
];

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
  if (intent === 'long_term') return 'Long-term';
  return intent.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

function labelFor(value: string, options: { value: string; label: string }[]): string {
  return options.find((o) => o.value === value)?.label ?? value.replace('_', ' ');
}

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

// ── Shared components ─────────────────────────────────────────────────────────

function DatingHeader({
  name,
  likedCount,
  onBack,
}: {
  name: string;
  likedCount: number;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.headerBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color={Colors.brown} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{name}</Text>
      <View style={styles.headerBadge}>
        <Ionicons name="heart" size={10} color={Colors.terracotta} />
        <Text style={styles.headerBadgeText}>{likedCount}</Text>
      </View>
    </View>
  );
}

function TabBar({
  active,
  onSelect,
}: {
  active: DatingTab;
  onSelect: (tab: DatingTab) => void;
}) {
  const tabs: { id: DatingTab; icon: string; label: string }[] = [
    { id: 'discover',    icon: 'compass-outline',  label: 'Discover' },
    { id: 'profile',     icon: 'person-outline',   label: 'Profile'  },
    { id: 'preferences', icon: 'options-outline',  label: 'Prefs'    },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={styles.tabItem}
            onPress={() => onSelect(t.id)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive ? (t.icon.replace('-outline', '') as never) : (t.icon as never)}
              size={22}
              color={isActive ? Colors.terracotta : Colors.muted}
            />
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {t.label}
            </Text>
            {isActive ? <View style={styles.tabDot} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** No-photo placeholder inside swipe card */
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

// ── Discover tab ──────────────────────────────────────────────────────────────

function DiscoverEmpty({
  datingState,
  loadError,
  onRefresh,
  onGoToPrefs,
  onGoToProfile,
}: {
  datingState: DatingState;
  loadError: string;
  onRefresh: () => void;
  onGoToPrefs: () => void;
  onGoToProfile: () => void;
}) {
  if (datingState === 'loading') {
    return (
      <View style={styles.discoverEmpty}>
        <View style={styles.discoverEmptyIcon}>
          <ActivityIndicator size="large" color={Colors.terracotta} />
        </View>
        <Text style={styles.discoverEmptyTitle}>Finding profiles</Text>
        <Text style={styles.discoverEmptySub}>Looking for people in your groups…</Text>
      </View>
    );
  }

  if (datingState === 'error') {
    return (
      <View style={styles.discoverEmpty}>
        <View style={[styles.discoverEmptyIcon, { backgroundColor: 'rgba(217,79,79,0.09)' }]}>
          <Ionicons name="cloud-offline-outline" size={32} color={Colors.error} />
        </View>
        <Text style={styles.discoverEmptyTitle}>Couldn't load profiles</Text>
        <Text style={styles.discoverEmptySub}>{loadError}</Text>
        <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={onRefresh} activeOpacity={0.85}>
          <Text style={styles.emptyPrimaryBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (datingState === 'disabled') {
    return (
      <View style={styles.discoverEmpty}>
        <View style={[styles.discoverEmptyIcon, { backgroundColor: 'rgba(196,98,45,0.10)' }]}>
          <Ionicons name="heart-dislike-outline" size={32} color={Colors.terracotta} />
        </View>
        <Text style={styles.discoverEmptyTitle}>Dating Mode is off</Text>
        <Text style={styles.discoverEmptySub}>
          Enable Dating Mode in your profile to start connecting with people from your groups.
        </Text>
        <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={onGoToProfile} activeOpacity={0.85}>
          <Text style={styles.emptyPrimaryBtnText}>Go to Profile tab</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // caught_up
  return (
    <View style={styles.discoverEmpty}>
      <View style={[styles.discoverEmptyIcon, { backgroundColor: 'rgba(90,158,111,0.10)' }]}>
        <Ionicons name="checkmark-circle-outline" size={32} color="#5a9e6f" />
      </View>
      <Text style={styles.discoverEmptyTitle}>No new suggestions</Text>
      <Text style={styles.discoverEmptySub}>
        You've seen everyone available right now. Adjust your preferences or check back later.
      </Text>
      <TouchableOpacity style={styles.emptyPrimaryBtn} onPress={onGoToPrefs} activeOpacity={0.85}>
        <Ionicons name="options-outline" size={15} color={Colors.white} />
        <Text style={styles.emptyPrimaryBtnText}>Adjust preferences</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.emptySecondaryBtn} onPress={onRefresh} activeOpacity={0.7}>
        <Text style={styles.emptySecondaryBtnText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab({
  summary,
  photoPaths,
  photoUrls,
  updating,
  onAdd,
  onRemove,
  onEditProfile,
}: {
  summary: MyDatingSummary | null;
  photoPaths: string[];
  photoUrls: string[];
  updating: boolean;
  onAdd: () => void;
  onRemove: (path: string, idx: number) => void;
  onEditProfile: () => void;
}) {
  const hasAbout = Boolean(summary?.about?.trim());

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Identity row */}
      <View style={styles.profileCard}>
        <View style={styles.profileCardHeader}>
          <View>
            <Text style={styles.profileName}>{summary?.fullName ?? 'You'}</Text>
            {summary?.city ? (
              <View style={styles.metaRow}>
                <Ionicons name="location-outline" size={12} color={Colors.muted} />
                <Text style={styles.profileCity}>{summary.city}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.profileCardHeaderRight}>
            {summary?.intent && summary.intent !== 'Not set' ? (
              <View style={styles.intentBadge}>
                <Text style={styles.intentBadgeText}>{summary.intent}</Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={onEditProfile} style={styles.editBtn} activeOpacity={0.8}>
              <Ionicons name="pencil-outline" size={12} color={Colors.terracotta} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Photo strip */}
        <View style={styles.photoStrip}>
          {photoUrls.map((url, idx) => (
            <View key={`${photoPaths[idx] ?? idx}`} style={styles.photoWrap}>
              {url ? (
                <Image source={{ uri: url }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoEmpty]} />
              )}
              <TouchableOpacity
                style={styles.photoRemoveBtn}
                onPress={() => { const p = photoPaths[idx]; if (p) onRemove(p, idx); }}
                disabled={updating}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {photoPaths.length < 6 ? (
            <TouchableOpacity
              style={styles.photoAddBtn}
              onPress={onAdd}
              disabled={updating}
              activeOpacity={0.8}
            >
              {updating ? (
                <ActivityIndicator size="small" color={Colors.terracotta} />
              ) : (
                <>
                  <Ionicons name="add" size={20} color={Colors.terracotta} />
                  {photoPaths.length === 0 ? (
                    <Text style={styles.photoAddLabel}>Add photo</Text>
                  ) : null}
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Bio */}
        <View style={styles.profileSection}>
          <Text style={styles.sectionLabel}>About</Text>
          <Text style={styles.profileBio}>
            {hasAbout ? summary!.about : 'No bio yet — tap Edit to add one.'}
          </Text>
        </View>

        {/* Languages */}
        {(summary?.languages ?? []).length > 0 ? (
          <View style={styles.metaRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={13} color={Colors.muted} />
            <Text style={styles.metaText}>{summary!.languages.join(' · ')}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

// ── Preferences tab ───────────────────────────────────────────────────────────

function PreferencesTab({
  draft,
  saving,
  onUpdate,
  onSave,
}: {
  draft: PrefDraft;
  saving: boolean;
  onUpdate: (patch: Partial<PrefDraft>) => void;
  onSave: () => void;
}) {
  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.prefIntro}>
        Your preferences determine who you see in the Discover feed.
      </Text>

      {/* Gender */}
      <View style={styles.prefCard}>
        <Text style={styles.sectionLabel}>I'm interested in</Text>
        <View style={styles.chipRow}>
          {GENDER_OPTIONS.map((opt) => {
            const selected = draft.preferredGenders.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => onUpdate({ preferredGenders: toggle(draft.preferredGenders, opt.value) })}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Intent */}
      <View style={styles.prefCard}>
        <Text style={styles.sectionLabel}>Looking for</Text>
        <View style={styles.chipRow}>
          {INTENT_OPTIONS.map((opt) => {
            const selected = draft.preferredIntents.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={() => onUpdate({ preferredIntents: toggle(draft.preferredIntents, opt.value) })}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Age range */}
      <View style={styles.prefCard}>
        <Text style={styles.sectionLabel}>Age range</Text>
        <View style={styles.ageRow}>
          <AgeField
            label="Min"
            value={draft.preferredAgeMin}
            min={18}
            max={draft.preferredAgeMax ?? 99}
            onChange={(v) => onUpdate({ preferredAgeMin: v })}
          />
          <View style={styles.ageDash} />
          <AgeField
            label="Max"
            value={draft.preferredAgeMax}
            min={draft.preferredAgeMin ?? 18}
            max={99}
            onChange={(v) => onUpdate({ preferredAgeMax: v })}
          />
        </View>
        {(draft.preferredAgeMin == null && draft.preferredAgeMax == null) ? (
          <Text style={styles.ageHint}>No limit set — you'll see all ages.</Text>
        ) : null}
      </View>

      {/* Visibility */}
      <View style={styles.prefCard}>
        <View style={styles.visibilityRow}>
          <View>
            <Text style={styles.sectionLabel}>Visible in dating</Text>
            <Text style={styles.visHint}>
              {draft.isGloballyVisible
                ? 'Others in your groups can see you.'
                : "You're hidden \u2014 you can still swipe."}
            </Text>
          </View>
          <Switch
            value={draft.isGloballyVisible}
            onValueChange={(v) => onUpdate({ isGloballyVisible: v })}
            trackColor={{ false: Colors.border, true: 'rgba(196,98,45,0.35)' }}
            thumbColor={draft.isGloballyVisible ? Colors.terracotta : Colors.muted}
          />
        </View>
      </View>

      {/* Save */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function AgeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  onChange: (v: number | null) => void;
}) {
  const decrement = () => {
    if (value == null) return;
    const next = value - 1;
    onChange(next < min ? null : next);
  };
  const increment = () => {
    const next = (value ?? min - 1) + 1;
    onChange(next > max ? max : next);
  };

  return (
    <View style={styles.ageField}>
      <Text style={styles.ageFieldLabel}>{label}</Text>
      <View style={styles.ageControl}>
        <TouchableOpacity
          onPress={decrement}
          style={styles.ageStepBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="remove" size={16} color={Colors.brownMid} />
        </TouchableOpacity>
        <View style={styles.ageValueWrap}>
          <Text style={styles.ageValue}>{value ?? 'Any'}</Text>
        </View>
        <TouchableOpacity
          onPress={increment}
          style={styles.ageStepBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={16} color={Colors.brownMid} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DatingModeScreen() {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────

  // Core fetch
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState('');
  const [datingDisabled, setDatingDisabled] = useState(false);

  // Swipe
  const [profiles, setProfiles]           = useState<DatingCardProfile[]>([]);
  const [index, setIndex]                 = useState(0);
  const [likedCount, setLikedCount]       = useState(0);
  const [photoIndexByProfile, setPhotoIndexByProfile] = useState<Record<string, number>>({});
  const [submittingSwipe, setSubmittingSwipe] = useState(false);

  // My profile
  const [headerName, setHeaderName]       = useState('You');
  const [userId, setUserId]               = useState<string | null>(null);
  const [mySummary, setMySummary]         = useState<MyDatingSummary | null>(null);
  const [myPhotoPaths, setMyPhotoPaths]   = useState<string[]>([]);
  const [myPhotoUrls, setMyPhotoUrls]     = useState<string[]>([]);
  const [updatingPhotos, setUpdatingPhotos] = useState(false);

  // Preferences
  const [prefDraft, setPrefDraft]         = useState<PrefDraft>({
    preferredGenders: [],
    preferredIntents: [],
    preferredAgeMin: null,
    preferredAgeMax: null,
    isGloballyVisible: true,
  });
  const [savingPrefs, setSavingPrefs]     = useState(false);

  // Tab
  const [activeTab, setActiveTab]         = useState<DatingTab>('discover');

  const position = useRef(new Animated.ValueXY()).current;

  // ── Derived ────────────────────────────────────────────────────────────────

  const datingState: DatingState = loading
    ? 'loading'
    : loadError
    ? 'error'
    : datingDisabled
    ? 'disabled'
    : profiles[index]
    ? 'active'
    : 'caught_up';

  const currentProfile  = profiles[index] ?? null;
  const nextProfile     = profiles[index + 1] ?? null;
  const currentPhotoIdx = currentProfile ? (photoIndexByProfile[currentProfile.id] ?? 0) : 0;
  const nextPhotoIdx    = nextProfile    ? (photoIndexByProfile[nextProfile.id]    ?? 0) : 0;

  // ── Swipe animations ───────────────────────────────────────────────────────

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-12deg', '0deg', '12deg'],
    extrapolate: 'clamp',
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, 60, 120],   outputRange: [0, 0.75, 1], extrapolate: 'clamp',
  });
  const passOpacity = position.x.interpolate({
    inputRange: [-120, -60, 0], outputRange: [1, 0.75, 0], extrapolate: 'clamp',
  });

  // ── Swipe handlers ─────────────────────────────────────────────────────────

  const resetPosition = () => {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 6 }).start();
  };

  const moveToNext = (liked: boolean) => {
    if (liked) setLikedCount((n) => n + 1);
    position.setValue({ x: 0, y: 0 });
    setIndex((n) => n + 1);
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
    setPhotoIndexByProfile((prev) => {
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
        onPanResponderMove:   (_, g) => { position.setValue({ x: g.dx, y: g.dy * 0.15 }); },
        onPanResponderRelease: (_, g) => {
          if (g.dx >  SWIPE_THRESHOLD) { forceSwipe('right'); return; }
          if (g.dx < -SWIPE_THRESHOLD) { forceSwipe('left');  return; }
          resetPosition();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [position, submittingSwipe, currentProfile]
  );

  // ── Photo management ───────────────────────────────────────────────────────

  const addPhoto = async () => {
    if (!userId || updatingPhotos) return;
    if (myPhotoPaths.length >= 6) {
      Alert.alert('Photo limit reached', 'You can upload up to 6 dating photos.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    try {
      setUpdatingPhotos(true);
      const asset       = picked.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext         = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const filePath    = `${userId}/${Date.now()}-dating.${ext}`;
      let fileData: ArrayBuffer;
      if (asset.base64) {
        fileData = await (await fetch(`data:${contentType};base64,${asset.base64}`)).arrayBuffer();
      } else {
        fileData = await (await fetch(asset.uri)).arrayBuffer();
      }
      const { error: upErr } = await supabase.storage
        .from('profile-photos').upload(filePath, fileData, { contentType, upsert: false });
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const nextPaths = [...myPhotoPaths, filePath];
      const { error: dbErr } = await supabase.from('dating_profiles')
        .upsert({ user_id: userId, is_enabled: true, photos: nextPaths }, { onConflict: 'user_id' });
      if (dbErr) { Alert.alert('Update failed', dbErr.message); return; }
      const resolved = await resolveProfilePhotoUrl(filePath);
      setMyPhotoPaths(nextPaths);
      setMyPhotoUrls((prev) => [...prev, resolved ?? '']);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not upload photo.');
    } finally {
      setUpdatingPhotos(false);
    }
  };

  const removePhoto = async (path: string, idx: number) => {
    if (!userId || updatingPhotos) return;
    const nextPaths = myPhotoPaths.filter((p) => p !== path);
    setUpdatingPhotos(true);
    const { error } = await supabase.from('dating_profiles')
      .upsert({ user_id: userId, is_enabled: true, photos: nextPaths }, { onConflict: 'user_id' });
    if (error) { setUpdatingPhotos(false); Alert.alert('Update failed', error.message); return; }
    const { error: stErr } = await supabase.storage.from('profile-photos').remove([path]);
    if (stErr) Alert.alert('Storage warning', stErr.message);
    setMyPhotoPaths(nextPaths);
    setMyPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
    setUpdatingPhotos(false);
  };

  // ── Preferences save ───────────────────────────────────────────────────────

  const savePreferences = async () => {
    if (!userId || savingPrefs) return;
    setSavingPrefs(true);
    const { error } = await supabase.from('dating_preferences').upsert(
      {
        user_id:              userId,
        preferred_genders:    prefDraft.preferredGenders,
        preferred_intents:    prefDraft.preferredIntents,
        preferred_age_min:    prefDraft.preferredAgeMin,
        preferred_age_max:    prefDraft.preferredAgeMax,
        is_globally_visible:  prefDraft.isGloballyVisible,
      },
      { onConflict: 'user_id' }
    );
    setSavingPrefs(false);
    if (error) {
      Alert.alert('Save failed', error.message);
      return;
    }
    // Update local summary to reflect saved changes
    setMySummary((prev) =>
      prev
        ? {
            ...prev,
            preferredGenders: prefDraft.preferredGenders,
            preferredIntents: prefDraft.preferredIntents,
            preferredAgeMin:  prefDraft.preferredAgeMin,
            preferredAgeMax:  prefDraft.preferredAgeMax,
            isGloballyVisible: prefDraft.isGloballyVisible,
          }
        : prev
    );
    Alert.alert('Saved', 'Your preferences have been updated.');
  };

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadCandidates = useCallback(async (resetRound: boolean) => {
    setLoading(true);
    setLoadError('');
    if (resetRound) { setLikedCount(0); setIndex(0); }

    const { data: sd, error: se } = await supabase.auth.getSession();
    const uid = sd.session?.user.id;
    if (se || !uid) {
      setProfiles([]); setDatingDisabled(false);
      setLoadError('Please sign in to use Dating Mode.');
      setLoading(false); return;
    }
    setUserId(uid);

    const [{ data: me }, { data: dp }, { data: dprefs }, candidatesRes] = await Promise.all([
      supabase.from('profiles')
        .select('full_name, city, bio, intent, languages').eq('user_id', uid).maybeSingle(),
      supabase.from('dating_profiles')
        .select('is_enabled, about, photos').eq('user_id', uid).maybeSingle(),
      supabase.from('dating_preferences')
        .select('preferred_genders, preferred_intents, preferred_age_min, preferred_age_max, is_globally_visible')
        .eq('user_id', uid).maybeSingle(),
      supabase.rpc('get_dating_candidates', { p_limit: 40 }),
    ]);

    const myName = me?.full_name?.trim();
    if (myName) setHeaderName(myName.split(' ')[0] || myName);

    const paths   = (dp?.photos as string[] | null | undefined) ?? [];
    const urls    = await Promise.all(paths.map((p) => resolveProfilePhotoUrl(p)));
    setMyPhotoPaths(paths);
    setMyPhotoUrls(urls.map((u) => u ?? ''));

    const preferredGenders  = (dprefs?.preferred_genders  as string[] | null | undefined) ?? [];
    const preferredIntents  = (dprefs?.preferred_intents  as string[] | null | undefined) ?? [];
    const preferredAgeMin   = dprefs?.preferred_age_min   ?? null;
    const preferredAgeMax   = dprefs?.preferred_age_max   ?? null;
    const isGloballyVisible = dprefs?.is_globally_visible ?? true;

    setMySummary({
      fullName:    myName || 'You',
      city:        me?.city?.trim() || 'City not set',
      about:       dp?.about?.trim() || me?.bio?.trim() || '',
      intent:      formatIntent((me?.intent as DatingCandidateRow['intent'] | null | undefined) ?? null),
      languages:   (me?.languages as string[] | null | undefined) ?? [],
      preferredGenders,
      preferredIntents: preferredIntents.map((v) =>
        v === 'long_term' ? 'Long-term' : v.replace('_', ' ')
      ),
      preferredAgeMin,
      preferredAgeMax,
      isGloballyVisible,
    });

    setPrefDraft({
      preferredGenders,
      preferredIntents,
      preferredAgeMin,
      preferredAgeMax,
      isGloballyVisible,
    });

    if ((dp?.is_enabled ?? false) === false) {
      setProfiles([]); setDatingDisabled(true); setLoading(false); return;
    }
    setDatingDisabled(false);

    const rows = (candidatesRes.data ?? []) as DatingCandidateRow[];
    if (candidatesRes.error) {
      setProfiles([]);
      setLoadError(candidatesRes.error.message || 'Could not load dating profiles right now.');
      setLoading(false); return;
    }

    const prepared = await Promise.all(
      rows.map(async (row) => {
        const allPaths = [row.avatar_url, ...(row.photo_urls ?? []), ...(row.dating_photos ?? [])]
          .filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);
        const resolved = await Promise.all(allPaths.map((p) => resolveProfilePhotoUrl(p)));
        return {
          id:        row.user_id,
          name:      row.full_name?.trim() || 'Member',
          age:       ageFromBirthDate(row.birth_date),
          city:      row.city?.trim() || 'City not set',
          bio:       row.dating_about?.trim() || row.bio?.trim() || 'No bio yet.',
          intent:    formatIntent(row.intent),
          languages: row.languages ?? [],
          images:    resolved.filter((u): u is string => Boolean(u)),
        } satisfies DatingCardProfile;
      })
    );

    setIndex(0);
    setProfiles(prepared);
    setPhotoIndexByProfile(
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

  const handleRefresh   = () => { setIndex(0); void loadCandidates(false); };
  const handleGoToPrefs = () => setActiveTab('preferences');

  // ── Render ─────────────────────────────────────────────────────────────────

  const showDeck = datingState === 'active';

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <DatingHeader name={headerName} likedCount={likedCount} onBack={() => router.back()} />
      </SafeAreaView>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <View style={styles.tabContent}>

        {/* DISCOVER tab */}
        {activeTab === 'discover' ? (
          showDeck ? (
            // ── Active swipe deck (non-scrolling, PanResponder-safe) ──────
            <View style={styles.deckContainer}>
              {/* Card deck */}
              <View style={styles.deckWrap}>
                {nextProfile ? (
                  <View style={[styles.card, styles.cardUnder]}>
                    {nextProfile.images.length > 0 ? (
                      <ImageBackground
                        source={{ uri: nextProfile.images[nextPhotoIdx] ?? nextProfile.images[0] }}
                        style={styles.cardImage}
                        imageStyle={styles.cardImageRounded}
                      />
                    ) : (
                      <NoPhotoCard profile={nextProfile} />
                    )}
                  </View>
                ) : null}

                <Animated.View
                  style={[
                    styles.card,
                    { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] },
                  ]}
                  {...panResponder.panHandlers}
                >
                  {currentProfile!.images.length > 0 ? (
                    <ImageBackground
                      source={{ uri: currentProfile!.images[currentPhotoIdx] ?? currentProfile!.images[0] }}
                      style={styles.cardImage}
                      imageStyle={styles.cardImageRounded}
                    >
                      {currentProfile!.images.length > 1 ? (
                        <>
                          <View style={styles.dotsRow}>
                            {currentProfile!.images.map((_, i) => (
                              <View
                                key={`${currentProfile!.id}-${i}`}
                                style={[styles.dot, i === currentPhotoIdx && styles.dotActive]}
                              />
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

                      {/* LIKE / PASS badges */}
                      <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, { opacity: likeOpacity }]}>
                        <Text style={[styles.swipeBadgeText, { color: '#4caf70' }]}>LIKE</Text>
                      </Animated.View>
                      <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, { opacity: passOpacity }]}>
                        <Text style={[styles.swipeBadgeText, { color: Colors.error }]}>PASS</Text>
                      </Animated.View>

                      <View style={styles.cardOverlay} />
                      <View style={styles.cardContent}>
                        <Text style={styles.cardName}>
                          {currentProfile!.name}{currentProfile!.age != null ? `, ${currentProfile!.age}` : ''}
                        </Text>
                        <View style={styles.metaRow}>
                          <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.75)" />
                          <Text style={styles.cardCity}>{currentProfile!.city}</Text>
                        </View>
                      </View>
                    </ImageBackground>
                  ) : (
                    <NoPhotoCard
                      profile={currentProfile!}
                      likeOpacity={likeOpacity}
                      passOpacity={passOpacity}
                    />
                  )}
                </Animated.View>
              </View>

              {/* Action buttons */}
              <View style={styles.swipeActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.passBtn, submittingSwipe && styles.actionBtnDim]}
                  onPress={() => forceSwipe('left')}
                  disabled={submittingSwipe}
                  activeOpacity={0.8}
                >
                  {submittingSwipe
                    ? <ActivityIndicator size="small" color={Colors.error} />
                    : <Ionicons name="close" size={26} color={Colors.error} />}
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

              {/* Candidate bio strip */}
              <View style={styles.candidateBio}>
                <View style={styles.candidateBioHeader}>
                  <Text style={styles.sectionLabel}>About</Text>
                  <View style={styles.intentBadge}>
                    <Text style={styles.intentBadgeText}>{currentProfile!.intent}</Text>
                  </View>
                </View>
                <Text style={styles.candidateBioText} numberOfLines={2}>
                  {currentProfile!.bio}
                </Text>
                {currentProfile!.languages.length > 0 ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.muted} />
                    <Text style={styles.metaText}>{currentProfile!.languages.join(' · ')}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            // ── Non-active states (scrollable) ────────────────────────────
            <DiscoverEmpty
              datingState={datingState}
              loadError={loadError}
              onRefresh={handleRefresh}
              onGoToPrefs={handleGoToPrefs}
              onGoToProfile={() => setActiveTab('profile')}
            />
          )
        ) : null}

        {/* PROFILE tab */}
        {activeTab === 'profile' ? (
          <ProfileTab
            summary={mySummary}
            photoPaths={myPhotoPaths}
            photoUrls={myPhotoUrls}
            updating={updatingPhotos}
            onAdd={() => { void addPhoto(); }}
            onRemove={(p, i) => { void removePhoto(p, i); }}
            onEditProfile={() => router.push('/(tabs)/profile')}
          />
        ) : null}

        {/* PREFERENCES tab */}
        {activeTab === 'preferences' ? (
          <PreferencesTab
            draft={prefDraft}
            saving={savingPrefs}
            onUpdate={(patch) => setPrefDraft((prev) => ({ ...prev, ...patch }))}
            onSave={() => { void savePreferences(); }}
          />
        ) : null}
      </View>

      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['bottom']} style={styles.tabBarSafe}>
        <TabBar active={activeTab} onSelect={setActiveTab} />
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const DECK_HEIGHT = 390;

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.cream },
  safe:         { backgroundColor: Colors.cream },
  tabBarSafe:   { backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border },
  tabContent:   { flex: 1 },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop:        Spacing.sm,
    paddingBottom:     Spacing.xs,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle:    { fontSize: 20, fontWeight: '800', color: Colors.ink },
  headerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(196,98,45,0.10)', borderWidth: 1, borderColor: 'rgba(196,98,45,0.18)',
    paddingHorizontal: 10, paddingVertical: 5,
  },
  headerBadgeText: { fontSize: 12, color: Colors.terracotta, fontWeight: '800' },

  // ── Tab bar ────────────────────────────────────────────────────────────────
  tabBar: {
    flexDirection:  'row',
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: '600', color: Colors.muted },
  tabLabelActive: { color: Colors.terracotta },
  tabDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.terracotta, marginTop: 1,
  },

  // ── Discover empty ─────────────────────────────────────────────────────────
  discoverEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 10,
  },
  discoverEmptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(196,98,45,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  discoverEmptyTitle: { fontSize: 20, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  discoverEmptySub:   { fontSize: 14, color: Colors.muted, textAlign: 'center', lineHeight: 21, maxWidth: 280 },
  emptyPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 12, backgroundColor: Colors.terracotta,
    borderRadius: Radius.full, paddingHorizontal: 24, paddingVertical: 13,
  },
  emptyPrimaryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  emptySecondaryBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  emptySecondaryBtnText: { color: Colors.muted, fontWeight: '600', fontSize: 13 },

  // ── Swipe deck ─────────────────────────────────────────────────────────────
  deckContainer: {
    flex: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm,
  },
  deckWrap: {
    height: DECK_HEIGHT, justifyContent: 'center', alignItems: 'center',
  },
  card: {
    width: '100%', height: DECK_HEIGHT, borderRadius: Radius.xl,
    overflow: 'hidden', backgroundColor: Colors.paper,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 6, position: 'absolute',
  },
  cardUnder: { transform: [{ scale: 0.95 }, { translateY: 10 }], opacity: 0.72 },
  cardImage:        { flex: 1, justifyContent: 'flex-end' },
  cardImageRounded: { borderRadius: Radius.xl },
  cardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  cardContent: { padding: Spacing.md, paddingBottom: 16, zIndex: 5 },
  cardName: {
    color: Colors.white, fontSize: 26, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardCity: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' },

  // Photo carousel
  dotsRow: {
    position: 'absolute', top: 10, left: 12, right: 12,
    flexDirection: 'row', gap: 5, zIndex: 4,
  },
  dot:       { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.38)' },
  dotActive: { backgroundColor: Colors.white },
  tapRow:    { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 3 },
  tapZone:   { flex: 1 },

  // Swipe intent badges
  swipeBadge: {
    position: 'absolute', top: 22, borderWidth: 2.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, zIndex: 6,
  },
  swipeBadgeLike: { left: 16, borderColor: '#4caf70', transform: [{ rotate: '-12deg' }] },
  swipeBadgePass: { right: 16, borderColor: Colors.error, transform: [{ rotate: '12deg' }] },
  swipeBadgeText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },

  // Swipe action buttons
  swipeActions: {
    marginTop: Spacing.sm, flexDirection: 'row',
    justifyContent: 'center', gap: 24, alignItems: 'center',
  },
  actionBtn: {
    width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  actionBtnDim: { opacity: 0.6 },
  passBtn: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1.5, borderColor: 'rgba(217,79,79,0.22)',
  },
  likeBtn: {
    backgroundColor: Colors.terracotta,
    width: 72, height: 72, borderRadius: 36,
  },

  // Candidate bio strip (below deck)
  candidateBio: {
    marginTop: Spacing.sm, backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 6,
  },
  candidateBioHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  candidateBioText: { fontSize: 14, color: Colors.brownMid, lineHeight: 20 },

  // ── No-photo card ──────────────────────────────────────────────────────────
  noPhotoCard: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  noPhotoFill: { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.warmWhite, opacity: 0.6 },
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
    backgroundColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3,
  },

  // ── Profile & Preferences tab shared ──────────────────────────────────────
  tabScroll:        { flex: 1 },
  tabScrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 32 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: Colors.muted, fontWeight: '600' },
  intentBadge: {
    backgroundColor: 'rgba(196,98,45,0.09)', borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  intentBadgeText: { fontSize: 11, color: Colors.terracotta, fontWeight: '700' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(196,98,45,0.08)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  editBtnText: { fontSize: 12, color: Colors.terracotta, fontWeight: '700' },

  // ── Profile tab ────────────────────────────────────────────────────────────
  profileCard: {
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, gap: 12,
  },
  profileCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  profileCardHeaderRight: { alignItems: 'flex-end', gap: 6 },
  profileName: { fontSize: 18, fontWeight: '900', color: Colors.ink },
  profileCity: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  profileSection: { gap: 4 },
  profileBio:     { fontSize: 14, color: Colors.brownMid, lineHeight: 20 },

  // Photo strip
  photoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoWrap:  { position: 'relative' },
  photo: {
    width: PHOTO_SIZE, height: Math.round(PHOTO_SIZE * PHOTO_ASPECT),
    borderRadius: 8, backgroundColor: Colors.warmWhite,
  },
  photoEmpty:     { borderWidth: 1, borderColor: Colors.border },
  photoRemoveBtn: {
    position: 'absolute', right: -6, top: -6,
    backgroundColor: Colors.cream, borderRadius: 9,
  },
  photoAddBtn: {
    width: PHOTO_SIZE, height: Math.round(PHOTO_SIZE * PHOTO_ASPECT),
    borderRadius: 8, borderWidth: 1.5, borderColor: Colors.terracotta,
    borderStyle: 'dashed', backgroundColor: 'rgba(196,98,45,0.04)',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddLabel: { fontSize: 10, color: Colors.terracotta, fontWeight: '700' },

  // ── Preferences tab ────────────────────────────────────────────────────────
  prefIntro: {
    fontSize: 13, color: Colors.muted, lineHeight: 19, marginBottom: Spacing.sm,
  },
  prefCard: {
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, gap: 10, marginBottom: Spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.warmWhite, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: 'rgba(196,98,45,0.10)', borderColor: Colors.terracotta,
  },
  chipText:       { fontSize: 13, fontWeight: '600', color: Colors.brownMid },
  chipTextActive: { color: Colors.terracotta },

  // Age range
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ageDash: {
    width: 20, height: 2, borderRadius: 1, backgroundColor: Colors.border,
  },
  ageField:     { flex: 1, alignItems: 'center', gap: 6 },
  ageFieldLabel:{ fontSize: 10, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  ageControl: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warmWhite, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 8,
  },
  ageStepBtn:  { padding: 4 },
  ageValueWrap:{ minWidth: 40, alignItems: 'center' },
  ageValue:    { fontSize: 16, fontWeight: '800', color: Colors.ink },
  ageHint:     { fontSize: 12, color: Colors.muted },

  // Visibility
  visibilityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  visHint: { fontSize: 12, color: Colors.muted, marginTop: 2, maxWidth: 220 },

  // Save button
  saveBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.terracotta,
    borderRadius: Radius.full, paddingVertical: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
