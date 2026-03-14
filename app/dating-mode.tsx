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
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

// ── Types ─────────────────────────────────────────────────────────────────────

type DatingState = 'loading' | 'error' | 'disabled' | 'caught_up' | 'active';
type DatingTab   = 'discover' | 'matches' | 'messages' | 'profile';

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

type MyDatingSummary = {
  fullName: string;
  city: string;
  about: string;
  intent: string;
  languages: string[];
  avatarUrl: string | null;
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

type DatingMatchRow = {
  matchId: string;
  otherUserId: string;
  name: string;
  city: string;
  photoUrl: string | null;
  matchedAt: string;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH    = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const PHOTO_GAP       = 8;
const PHOTO_COLS      = 3;
const PHOTO_W         = Math.floor((SCREEN_WIDTH - 16 * 2 - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS);
const PHOTO_H         = Math.round(PHOTO_W * 1.35);

const GENDER_OPTIONS = [
  { value: 'man',        label: 'Men'        },
  { value: 'woman',      label: 'Women'      },
  { value: 'non_binary', label: 'Non-binary' },
];
const INTENT_OPTIONS = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating',     label: 'Dating'     },
  { value: 'long_term',  label: 'Long-term'  },
  { value: 'marriage',   label: 'Marriage'   },
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

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7)  return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function serializePrefDraft(prefDraft: PrefDraft): string {
  return JSON.stringify({
    preferredGenders: [...prefDraft.preferredGenders].sort(),
    preferredIntents: [...prefDraft.preferredIntents].sort(),
    preferredAgeMin: prefDraft.preferredAgeMin,
    preferredAgeMax: prefDraft.preferredAgeMax,
    isGloballyVisible: prefDraft.isGloballyVisible,
  });
}

// ── DatingHeader ──────────────────────────────────────────────────────────────

function DatingHeader({
  name, onBack, saveState,
}: { name: string; likedCount: number; onBack: () => void; saveState?: SaveState }) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (saveState !== 'saved') return;
    scale.setValue(0.3);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }),
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 350, delay: 1800, useNativeDriver: true }),
        Animated.timing(scale,   { toValue: 0.7, duration: 350, delay: 1800, useNativeDriver: true }),
      ]).start();
    });
  }, [saveState, scale, opacity]);

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
      <View style={styles.headerStatusWrap}>
        <Animated.View style={[styles.headerStatusBadge, { opacity, transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={15} color={Colors.success} />
        </Animated.View>
      </View>
    </View>
  );
}

// ── TabBar ────────────────────────────────────────────────────────────────────

const TAB_CONFIG: { id: DatingTab; icon: string; label: string }[] = [
  { id: 'discover',  icon: 'compass',  label: 'Discover' },
  { id: 'matches',   icon: 'heart',    label: 'Matches'  },
  { id: 'messages',  icon: 'chatbubble', label: 'Messages' },
  { id: 'profile',   icon: 'person',   label: 'Profile'  },
];

function TabBar({
  active, onSelect, matchCount,
}: { active: DatingTab; onSelect: (t: DatingTab) => void; matchCount: number }) {
  return (
    <View style={styles.tabBar}>
      {TAB_CONFIG.map((t) => {
        const isActive = active === t.id;
        const showBadge = t.id === 'matches' && matchCount > 0 && !isActive;
        return (
          <TouchableOpacity
            key={t.id}
            style={styles.tabItem}
            onPress={() => onSelect(t.id)}
            activeOpacity={0.7}
          >
            <View style={styles.tabIconWrap}>
              <Ionicons
                name={`${t.icon}${isActive ? '' : '-outline'}` as never}
                size={22}
                color={isActive ? Colors.terracotta : Colors.muted}
              />
              {showBadge ? <View style={styles.tabBadge} /> : null}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
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

// ── MatchesTab ────────────────────────────────────────────────────────────────

function MatchesTab({
  matches, loading, onChat,
}: { matches: DatingMatchRow[]; loading: boolean; onChat: (matchId: string) => void }) {
  if (loading) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator color={Colors.terracotta} />
        <Text style={styles.emptySub}>Loading matches…</Text>
      </View>
    );
  }
  if (matches.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(196,98,45,0.10)' }]}>
          <Ionicons name="heart-outline" size={32} color={Colors.terracotta} />
        </View>
        <Text style={styles.emptyTitle}>No matches yet</Text>
        <Text style={styles.emptySub}>
          Keep swiping in Discover — when someone likes you back, they'll appear here.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView
      contentContainerStyle={styles.matchesGrid}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.matchesHeading}>{matches.length} match{matches.length === 1 ? '' : 'es'}</Text>
      <View style={styles.matchGridRow}>
        {matches.map((m) => (
          <TouchableOpacity
            key={m.matchId}
            style={styles.matchCard}
            onPress={() => onChat(m.matchId)}
            activeOpacity={0.85}
          >
            <View style={styles.matchAvatar}>
              {m.photoUrl ? (
                <Image source={{ uri: m.photoUrl }} style={styles.matchAvatarImg} />
              ) : (
                <View style={styles.matchAvatarFallback}>
                  <Text style={styles.matchAvatarInitials}>{getInitials(m.name)}</Text>
                </View>
              )}
              <View style={styles.matchNewDot} />
            </View>
            <Text style={styles.matchName} numberOfLines={1}>{m.name}</Text>
            {m.city ? <Text style={styles.matchCity} numberOfLines={1}>{m.city}</Text> : null}
            <View style={styles.matchChatBtn}>
              <Ionicons name="chatbubble-outline" size={13} color={Colors.terracotta} />
              <Text style={styles.matchChatBtnText}>Say hi</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ── MessagesTab ───────────────────────────────────────────────────────────────

function MessagesTab({
  matches, loading, onChat,
}: { matches: DatingMatchRow[]; loading: boolean; onChat: (matchId: string) => void }) {
  if (loading) {
    return (
      <View style={styles.emptyWrap}>
        <ActivityIndicator color={Colors.terracotta} />
        <Text style={styles.emptySub}>Loading…</Text>
      </View>
    );
  }
  if (matches.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(196,98,45,0.08)' }]}>
          <Ionicons name="chatbubbles-outline" size={32} color={Colors.terracotta} />
        </View>
        <Text style={styles.emptyTitle}>No conversations yet</Text>
        <Text style={styles.emptySub}>
          Once you match with someone, you can start a conversation here.
        </Text>
      </View>
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {matches.map((m, i) => (
        <TouchableOpacity
          key={m.matchId}
          style={[styles.msgRow, i === 0 && styles.msgRowFirst]}
          onPress={() => onChat(m.matchId)}
          activeOpacity={0.8}
        >
          <View style={styles.msgAvatar}>
            {m.photoUrl ? (
              <Image source={{ uri: m.photoUrl }} style={styles.msgAvatarImg} />
            ) : (
              <View style={styles.msgAvatarFallback}>
                <Text style={styles.msgAvatarInitials}>{getInitials(m.name)}</Text>
              </View>
            )}
          </View>
          <View style={styles.msgBody}>
            <Text style={styles.msgName}>{m.name}</Text>
            {m.city ? <Text style={styles.msgCity}>{m.city}</Text> : null}
            <Text style={styles.msgHint}>Tap to start chatting</Text>
          </View>
          <View style={styles.msgRight}>
            <Text style={styles.msgTime}>{timeAgo(m.matchedAt)}</Text>
            <Ionicons name="chevron-forward" size={14} color={Colors.muted} />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── ProfileTab (profile + preferences merged) ─────────────────────────────────

function ProfileTab({
  summary, photoPaths, photoUrls, updatingPhotos,
  prefDraft,
  onAdd, onRemove, onSaveBio,
  onPrefUpdate, onBioSaveStateChange,
  scrollRef,
}: {
  summary: MyDatingSummary | null;
  photoPaths: string[];
  photoUrls: string[];
  updatingPhotos: boolean;
  prefDraft: PrefDraft;
  onAdd: () => void;
  onRemove: (path: string, idx: number) => void;
  onSaveBio: (text: string) => Promise<void>;
  onPrefUpdate: (patch: Partial<PrefDraft>) => void;
  onBioSaveStateChange: (state: SaveState) => void;
  scrollRef: React.RefObject<ScrollView | null>;
}) {
  const [bioText, setBioText] = useState(summary?.about ?? '');
  const [bioFocused, setBioFocused] = useState(false);
  const [bioInputHeight, setBioInputHeight] = useState(96);
  const [bioSaveState, setBioSaveState] = useState<SaveState>('idle');

  // Sync bioText when summary loads/changes
  useEffect(() => { setBioText(summary?.about ?? ''); }, [summary?.about]);

  useEffect(() => {
    onBioSaveStateChange(bioSaveState);
  }, [bioSaveState, onBioSaveStateChange]);

  useEffect(() => {
    if (bioSaveState !== 'saved' && bioSaveState !== 'error') return;
    const delay = bioSaveState === 'error' ? 4500 : 3500;
    const timer = setTimeout(() => setBioSaveState('idle'), delay);
    return () => clearTimeout(timer);
  }, [bioSaveState]);

  useEffect(() => {
    const next = summary?.about ?? '';
    if (bioText.trim() === next.trim()) {
      setBioSaveState('idle');
      return;
    }
    const timer = setTimeout(() => {
      setBioSaveState('saving');
      void onSaveBio(bioText.trim())
        .then(() => setBioSaveState('saved'))
        .catch(() => setBioSaveState('error'));
    }, 4000);
    return () => clearTimeout(timer);
  }, [bioText, summary?.about, onSaveBio]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.tabScroll}
      contentContainerStyle={styles.tabScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* ── Avatar hero ──────────────────────────────────────────────────── */}
      <View style={styles.profileHero}>
        <View style={styles.profileAvatarRing}>
          <View style={styles.profileAvatarWrap}>
            {summary?.avatarUrl ? (
              <Image source={{ uri: summary.avatarUrl }} style={styles.profileAvatar} />
            ) : (
              <View style={[styles.profileAvatar, styles.profileAvatarFallback]}>
                <Text style={styles.profileAvatarInitials}>
                  {summary?.fullName ? getInitials(summary.fullName) : '?'}
                </Text>
              </View>
            )}
          </View>
        </View>
        {summary?.city ? (
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={12} color={Colors.muted} />
            <Text style={styles.profileHeroCity}>{summary.city}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      <View style={styles.photoSection}>
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
                disabled={updatingPhotos}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))}
          {photoPaths.length < 6 ? (
            <TouchableOpacity
              style={styles.photoAddBtn}
              onPress={onAdd}
              disabled={updatingPhotos}
              activeOpacity={0.8}
            >
              {updatingPhotos ? (
                <ActivityIndicator size="small" color={Colors.terracotta} />
              ) : (
                <>
                  <Ionicons name="add" size={22} color={Colors.terracotta} />
                  {photoPaths.length === 0 ? (
                    <Text style={styles.photoAddLabel}>Add photo</Text>
                  ) : null}
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* ── Bio ──────────────────────────────────────────────────────────── */}
      <View style={[styles.bioCard, bioFocused && styles.bioCardFocused]}>
        <Text style={styles.prefCardLabel}>Bio</Text>
        <TextInput
          value={bioText}
          onChangeText={setBioText}
          onContentSizeChange={(e) => {
            const next = Math.max(56, e.nativeEvent.contentSize.height + 16);
            setBioInputHeight(next);
          }}
          onFocus={() => setBioFocused(true)}
          onBlur={() => {
            setBioFocused(false);
            setBioSaveState('saving');
            void onSaveBio(bioText.trim())
              .then(() => setBioSaveState('saved'))
              .catch(() => setBioSaveState('error'));
          }}
          multiline
          maxLength={280}
          scrollEnabled={false}
          placeholder="Tap to write a short bio…"
          placeholderTextColor={Colors.muted}
          textAlignVertical="top"
          style={[styles.profileBio, styles.profileBioInput, { height: bioInputHeight }]}
        />
      </View>

      {/* Gender */}
      <View style={styles.prefCard}>
        <Text style={styles.prefCardLabel}>I'm interested in</Text>
        <View style={styles.chipRow}>
          {GENDER_OPTIONS.map((opt) => {
            const sel = prefDraft.preferredGenders.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, sel && styles.chipActive]}
                onPress={() => onPrefUpdate({ preferredGenders: toggle(prefDraft.preferredGenders, opt.value) })}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, sel && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Intent */}
      <View style={styles.prefCard}>
        <Text style={styles.prefCardLabel}>Looking for</Text>
        <View style={styles.chipRow}>
          {INTENT_OPTIONS.map((opt) => {
            const sel = prefDraft.preferredIntents.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, sel && styles.chipActive]}
                onPress={() => onPrefUpdate({ preferredIntents: toggle(prefDraft.preferredIntents, opt.value) })}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, sel && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Age range */}
      <View style={styles.prefCard}>
        <View style={styles.ageHeaderRow}>
          <Text style={styles.prefCardLabel}>Age range</Text>
          <Text style={styles.ageRangeValue}>
            {prefDraft.preferredAgeMin ?? 18} – {prefDraft.preferredAgeMax ?? 65}
          </Text>
        </View>
        <View style={styles.ageSliderRow}>
          <Text style={styles.ageSliderLabel}>Min</Text>
          <Slider
            style={styles.ageSlider}
            minimumValue={18}
            maximumValue={prefDraft.preferredAgeMax ?? 65}
            step={1}
            value={prefDraft.preferredAgeMin ?? 18}
            onValueChange={(v) => onPrefUpdate({ preferredAgeMin: Math.round(v) })}
            minimumTrackTintColor={Colors.terracotta}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.terracotta}
          />
        </View>
        <View style={styles.ageSliderRow}>
          <Text style={styles.ageSliderLabel}>Max</Text>
          <Slider
            style={styles.ageSlider}
            minimumValue={prefDraft.preferredAgeMin ?? 18}
            maximumValue={65}
            step={1}
            value={prefDraft.preferredAgeMax ?? 65}
            onValueChange={(v) => onPrefUpdate({ preferredAgeMax: Math.round(v) })}
            minimumTrackTintColor={Colors.terracotta}
            maximumTrackTintColor={Colors.border}
            thumbTintColor={Colors.terracotta}
          />
        </View>
      </View>

      {/* Visibility */}
      <View style={styles.prefCard}>
        <Text style={styles.prefCardLabel}>Visible in dating</Text>
        <View style={styles.visibilityRow}>
          <Text style={[styles.visHint, { flex: 1, marginRight: 12 }]}>
            {prefDraft.isGloballyVisible
              ? 'Others in your groups can discover you.'
              : "You're hidden — you can still swipe."}
          </Text>
          <Switch
            value={prefDraft.isGloballyVisible}
            onValueChange={(v) => onPrefUpdate({ isGloballyVisible: v })}
            trackColor={{ false: Colors.border, true: Colors.terracotta }}
            thumbColor={Colors.white}
          />
        </View>
      </View>
    </ScrollView>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DatingModeScreen() {
  const router = useRouter();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [loading,        setLoading]        = useState(true);
  const [loadError,      setLoadError]      = useState('');
  const [datingDisabled, setDatingDisabled] = useState(false);

  // Swipe
  const [profiles,           setProfiles]           = useState<DatingCardProfile[]>([]);
  const [index,              setIndex]              = useState(0);
  const [likedCount,         setLikedCount]         = useState(0);
  const [photoIdxByProfile,  setPhotoIdxByProfile]  = useState<Record<string, number>>({});
  const [submittingSwipe,    setSubmittingSwipe]    = useState(false);

  // My profile
  const [headerName,     setHeaderName]     = useState('You');
  const [userId,         setUserId]         = useState<string | null>(null);
  const [mySummary,      setMySummary]      = useState<MyDatingSummary | null>(null);
  const [myPhotoPaths,   setMyPhotoPaths]   = useState<string[]>([]);
  const [myPhotoUrls,    setMyPhotoUrls]    = useState<string[]>([]);
  const [updatingPhotos, setUpdatingPhotos] = useState(false);

  // Matches
  const [datingMatches,  setDatingMatches]  = useState<DatingMatchRow[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesLoaded,  setMatchesLoaded]  = useState(false);

  // Preferences draft
  const [prefDraft,   setPrefDraft]   = useState<PrefDraft>({
    preferredGenders: [], preferredIntents: [],
    preferredAgeMin: null, preferredAgeMax: null, isGloballyVisible: true,
  });
  const [prefSaveState, setPrefSaveState] = useState<SaveState>('idle');
  const [bioSaveState,  setBioSaveState]  = useState<SaveState>('idle');

  // Navigation
  const [activeTab, setActiveTab] = useState<DatingTab>('discover');

  const position      = useRef(new Animated.ValueXY()).current;
  const profileScroll = useRef<ScrollView>(null);
  const prefsHydrated = useRef(false);
  const lastSavedPrefs = useRef(serializePrefDraft({
    preferredGenders: [],
    preferredIntents: [],
    preferredAgeMin: null,
    preferredAgeMax: null,
    isGloballyVisible: true,
  }));

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

  const currentProfile  = profiles[index] ?? null;
  const nextProfile     = profiles[index + 1] ?? null;
  const curPhotoIdx     = currentProfile ? (photoIdxByProfile[currentProfile.id] ?? 0) : 0;
  const nxtPhotoIdx     = nextProfile    ? (photoIdxByProfile[nextProfile.id]    ?? 0) : 0;

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

  // ── Photo management ─────────────────────────────────────────────────────────

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
      const fileData    = asset.base64
        ? await (await fetch(`data:${contentType};base64,${asset.base64}`)).arrayBuffer()
        : await (await fetch(asset.uri)).arrayBuffer();
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

  // ── Preferences save ─────────────────────────────────────────────────────────

  const persistPreferences = useCallback(async (draft: PrefDraft) => {
    if (!userId) throw new Error('Missing user');
    const { error } = await supabase.from('dating_preferences').upsert(
      {
        user_id:             userId,
        preferred_genders:   draft.preferredGenders,
        preferred_intents:   draft.preferredIntents,
        preferred_age_min:   draft.preferredAgeMin,
        preferred_age_max:   draft.preferredAgeMax,
        is_globally_visible: draft.isGloballyVisible,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;
    setMySummary((prev) => prev ? {
      ...prev,
      preferredGenders:    draft.preferredGenders,
      preferredIntents:    draft.preferredIntents,
      preferredAgeMin:     draft.preferredAgeMin,
      preferredAgeMax:     draft.preferredAgeMax,
      isGloballyVisible:   draft.isGloballyVisible,
    } : prev);
  }, [userId]);

  // ── Bio save ─────────────────────────────────────────────────────────────────

  const saveDatingBio = async (text: string) => {
    if (!userId) return;
    const { error } = await supabase.from('dating_profiles')
      .upsert({ user_id: userId, is_enabled: true, about: text }, { onConflict: 'user_id' });
    if (error) throw error;
    setMySummary((prev) => prev ? { ...prev, about: text } : prev);
  };

  useEffect(() => {
    if (!userId || !prefsHydrated.current) return;
    const serialized = serializePrefDraft(prefDraft);
    if (serialized === lastSavedPrefs.current) {
      if (prefSaveState !== 'idle') setPrefSaveState('idle');
      return;
    }
    const timer = setTimeout(() => {
      setPrefSaveState('saving');
      void persistPreferences(prefDraft)
        .then(() => {
          lastSavedPrefs.current = serialized;
          setPrefSaveState('saved');
        })
        .catch(() => {
          setPrefSaveState('error');
        });
    }, 4000);
    return () => clearTimeout(timer);
  }, [prefDraft, prefSaveState, persistPreferences, userId]);

  useEffect(() => {
    if (prefSaveState !== 'saved' && prefSaveState !== 'error') return;
    const delay = prefSaveState === 'error' ? 4500 : 3500;
    const timer = setTimeout(() => setPrefSaveState('idle'), delay);
    return () => clearTimeout(timer);
  }, [prefSaveState]);

  // ── Matches loading ──────────────────────────────────────────────────────────

  const loadMatches = useCallback(async () => {
    if (!userId || matchesLoading) return;
    setMatchesLoading(true);
    const { data: matchData, error: matchErr } = await supabase
      .from('dating_matches')
      .select('id, user_a_id, user_b_id, created_at')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (matchErr || !matchData) { setMatchesLoading(false); return; }

    const otherIds = matchData.map((m) => m.user_a_id === userId ? m.user_b_id : m.user_a_id);
    if (otherIds.length === 0) { setDatingMatches([]); setMatchesLoading(false); setMatchesLoaded(true); return; }

    const { data: profData } = await supabase
      .from('profiles')
      .select('user_id, full_name, city, avatar_url')
      .in('user_id', otherIds);

    const profMap = Object.fromEntries((profData ?? []).map((p) => [p.user_id, p]));

    const resolved: DatingMatchRow[] = await Promise.all(
      matchData.map(async (m) => {
        const otherId = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
        const prof    = profMap[otherId];
        const photoUrl = prof?.avatar_url
          ? await resolveProfilePhotoUrl(prof.avatar_url)
          : null;
        return {
          matchId:     m.id,
          otherUserId: otherId,
          name:        prof?.full_name?.trim() || 'Member',
          city:        prof?.city?.trim()       || '',
          photoUrl:    photoUrl ?? null,
          matchedAt:   m.created_at,
        };
      })
    );

    setDatingMatches(resolved);
    setMatchesLoading(false);
    setMatchesLoaded(true);
  }, [userId, matchesLoading]);

  // Load matches lazily when switching to matches/messages tab
  useEffect(() => {
    if ((activeTab === 'matches' || activeTab === 'messages') && userId && !matchesLoaded) {
      void loadMatches();
    }
  }, [activeTab, userId, matchesLoaded, loadMatches]);

  // ── Candidates loading ───────────────────────────────────────────────────────

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
        .select('full_name, city, birth_date, gender, languages, avatar_url').eq('user_id', uid).maybeSingle(),
      supabase.from('dating_profiles')
        .select('is_enabled, about, photos').eq('user_id', uid).maybeSingle(),
      supabase.from('dating_preferences')
        .select('preferred_genders, preferred_intents, preferred_age_min, preferred_age_max, is_globally_visible')
        .eq('user_id', uid).maybeSingle(),
      supabase.rpc('get_dating_candidates', { p_limit: 40 }),
    ]);

    const myName = me?.full_name?.trim();
    if (myName) setHeaderName(myName.split(' ')[0] || myName);

    const paths      = (dp?.photos as string[] | null | undefined) ?? [];
    const urls       = await Promise.all(paths.map((p) => resolveProfilePhotoUrl(p)));
    const avatarUrl  = me?.avatar_url ? await resolveProfilePhotoUrl(me.avatar_url) : null;
    setMyPhotoPaths(paths);
    setMyPhotoUrls(urls.map((u) => u ?? ''));

    const pg  = (dprefs?.preferred_genders  as string[] | null | undefined) ?? [];
    const pi  = (dprefs?.preferred_intents  as string[] | null | undefined) ?? [];
    const pam = dprefs?.preferred_age_min   ?? null;
    const pax = dprefs?.preferred_age_max   ?? null;
    const vis = dprefs?.is_globally_visible ?? true;

    setMySummary({
      fullName:         myName || 'You',
      city:             me?.city?.trim() || 'City not set',
      about:            dp?.about?.trim() || '',
      intent:           pi[0] ? formatIntent(pi[0] as DatingCandidateRow['intent']) : 'Not set',
      languages:        (me?.languages as string[] | null | undefined) ?? [],
      avatarUrl:        avatarUrl ?? null,
      preferredGenders: pg,
      preferredIntents: pi.map((v) => v === 'long_term' ? 'Long-term' : v.replace('_', ' ')),
      preferredAgeMin:  pam,
      preferredAgeMax:  pax,
      isGloballyVisible: vis,
    });
    const loadedPrefDraft = {
      preferredGenders: pg,
      preferredIntents: pi,
      preferredAgeMin: pam,
      preferredAgeMax: pax,
      isGloballyVisible: vis,
    };
    prefsHydrated.current = false;
    setPrefDraft(loadedPrefDraft);
    lastSavedPrefs.current = serializePrefDraft(loadedPrefDraft);
    setPrefSaveState('idle');
    prefsHydrated.current = true;

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

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRefresh    = () => { setIndex(0); void loadCandidates(false); };
  const handleAdjustPrefs = () => {
    setActiveTab('profile');
    // Small delay to let tab switch render before scrolling to prefs
    setTimeout(() => profileScroll.current?.scrollToEnd({ animated: true }), 150);
  };
  const handleChat = (matchId: string) => router.push(`/chat/${matchId}?source=dating`);

  // ── Render ───────────────────────────────────────────────────────────────────

  const showDeck = datingState === 'active';
  const headerSaveState: SaveState = activeTab === 'profile'
    ? (bioSaveState !== 'idle' ? bioSaveState : prefSaveState)
    : 'idle';

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <DatingHeader
          name={headerName}
          likedCount={likedCount}
          onBack={() => router.back()}
          saveState={headerSaveState}
        />
      </SafeAreaView>

      {/* Tab content */}
      <View style={styles.tabContent}>

        {/* ── DISCOVER ─────────────────────────────────────────────────────── */}
        {activeTab === 'discover' ? (
          showDeck ? (
            <View style={styles.deckContainer}>
              {/* Deck */}
              <View style={styles.deckWrap}>
                {nextProfile ? (
                  <View style={[styles.card, styles.cardUnder]}>
                    {nextProfile.images.length > 0 ? (
                      <ImageBackground
                        source={{ uri: nextProfile.images[nxtPhotoIdx] ?? nextProfile.images[0] }}
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
                      source={{ uri: currentProfile!.images[curPhotoIdx] ?? currentProfile!.images[0] }}
                      style={styles.cardImage}
                      imageStyle={styles.cardImageRounded}
                    >
                      {currentProfile!.images.length > 1 ? (
                        <>
                          <View style={styles.dotsRow}>
                            {currentProfile!.images.map((_, i) => (
                              <View
                                key={`${currentProfile!.id}-${i}`}
                                style={[styles.dot, i === curPhotoIdx && styles.dotActive]}
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
              <View style={styles.bioBand}>
                <View style={styles.bioBandHeader}>
                  <Text style={styles.sectionLabel}>About</Text>
                  <View style={styles.intentBadge}>
                    <Text style={styles.intentBadgeText}>{currentProfile!.intent}</Text>
                  </View>
                </View>
                <Text style={styles.bioBandText} numberOfLines={2}>{currentProfile!.bio}</Text>
                {currentProfile!.languages.length > 0 ? (
                  <View style={styles.metaRow}>
                    <Ionicons name="chatbubble-ellipses-outline" size={12} color={Colors.muted} />
                    <Text style={styles.metaText}>{currentProfile!.languages.join(' · ')}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <DiscoverEmpty
              datingState={datingState}
              loadError={loadError}
              onRefresh={handleRefresh}
              onAdjustPrefs={handleAdjustPrefs}
              onGoToProfile={() => setActiveTab('profile')}
            />
          )
        ) : null}

        {/* ── MATCHES ──────────────────────────────────────────────────────── */}
        {activeTab === 'matches' ? (
          <MatchesTab
            matches={datingMatches}
            loading={matchesLoading}
            onChat={handleChat}
          />
        ) : null}

        {/* ── MESSAGES ─────────────────────────────────────────────────────── */}
        {activeTab === 'messages' ? (
          <MessagesTab
            matches={datingMatches}
            loading={matchesLoading}
            onChat={handleChat}
          />
        ) : null}

        {/* ── PROFILE ──────────────────────────────────────────────────────── */}
        {activeTab === 'profile' ? (
          <ProfileTab
            summary={mySummary}
            photoPaths={myPhotoPaths}
            photoUrls={myPhotoUrls}
            updatingPhotos={updatingPhotos}
            prefDraft={prefDraft}
            onAdd={() => { void addPhoto(); }}
            onRemove={(p, i) => { void removePhoto(p, i); }}
            onSaveBio={(text) => saveDatingBio(text)}
            onPrefUpdate={(patch) => setPrefDraft((prev) => ({ ...prev, ...patch }))}
            onBioSaveStateChange={setBioSaveState}
            scrollRef={profileScroll}
          />
        ) : null}
      </View>

      {/* Tab bar — pinned to bottom */}
      <SafeAreaView edges={['bottom']} style={styles.tabBarSafe}>
        <TabBar
          active={activeTab}
          onSelect={setActiveTab}
          matchCount={datingMatches.length}
        />
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const DECK_H = 390;

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.cream },
  headerSafe:   { backgroundColor: Colors.cream },
  tabContent:   { flex: 1 },
  tabBarSafe:   { backgroundColor: Colors.paper, borderTopWidth: 1, borderTopColor: Colors.border },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xs,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.paper,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle:     { fontSize: 20, fontWeight: '800', color: Colors.ink },
  headerStatusWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerStatusBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(90,158,111,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.success,
  },
  headerStatusBadgeSaved: {
    borderColor: Colors.terracotta,
    backgroundColor: 'rgba(196,98,45,0.08)',
  },
  headerStatusBadgeError: {
    backgroundColor: Colors.error,
    borderColor: Colors.error,
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row', paddingVertical: 6, paddingHorizontal: Spacing.sm,
  },
  tabItem:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, gap: 2 },
  tabIconWrap:   { position: 'relative' },
  tabBadge: {
    position: 'absolute', top: -1, right: -4,
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.terracotta,
    borderWidth: 1.5, borderColor: Colors.paper,
  },
  tabLabel:       { fontSize: 10, fontWeight: '600', color: Colors.muted },
  tabLabelActive: { color: Colors.terracotta },

  // Shared
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
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

  // Discover deck
  deckContainer: { flex: 1, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  deckWrap: { height: DECK_H, justifyContent: 'center', alignItems: 'center' },
  card: {
    width: '100%', height: DECK_H, borderRadius: Radius.xl, overflow: 'hidden',
    backgroundColor: Colors.paper, shadowColor: '#000', shadowOpacity: 0.14,
    shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6, position: 'absolute',
  },
  cardUnder:       { transform: [{ scale: 0.95 }, { translateY: 10 }], opacity: 0.72 },
  cardImage:        { flex: 1, justifyContent: 'flex-end' },
  cardImageRounded: { borderRadius: Radius.xl },
  cardOverlay:      { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  cardContent: { padding: Spacing.md, paddingBottom: 16, zIndex: 5 },
  cardName: {
    color: Colors.white, fontSize: 26, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardCity: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600' },
  dotsRow: {
    position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', gap: 5, zIndex: 4,
  },
  dot:       { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.38)' },
  dotActive: { backgroundColor: Colors.white },
  tapRow:  { ...StyleSheet.absoluteFillObject, flexDirection: 'row', zIndex: 3 },
  tapZone: { flex: 1 },
  swipeBadge: {
    position: 'absolute', top: 22, borderWidth: 2.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, zIndex: 6,
  },
  swipeBadgeLike: { left: 16, borderColor: '#4caf70', transform: [{ rotate: '-12deg' }] },
  swipeBadgePass: { right: 16, borderColor: Colors.error, transform: [{ rotate: '12deg' }] },
  swipeBadgeText: { fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  swipeActions: {
    marginTop: Spacing.sm, flexDirection: 'row', justifyContent: 'center', gap: 24, alignItems: 'center',
  },
  actionBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  actionBtnDim: { opacity: 0.6 },
  passBtn: {
    backgroundColor: Colors.warmWhite, borderWidth: 1.5, borderColor: 'rgba(217,79,79,0.22)',
  },
  likeBtn: { backgroundColor: Colors.terracotta, width: 72, height: 72, borderRadius: 36 },
  bioBand: {
    marginTop: Spacing.sm, backgroundColor: Colors.warmWhite, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 6,
  },
  bioBandHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bioBandText:   { fontSize: 14, color: Colors.brownMid, lineHeight: 20 },

  // No-photo card
  noPhotoCard:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.paper },
  noPhotoFill:   { ...StyleSheet.absoluteFillObject, backgroundColor: Colors.warmWhite, opacity: 0.6 },
  initialsCircle: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
    shadowColor: Colors.terracotta, shadowOpacity: 0.28, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  initialsText:  { fontSize: 34, fontWeight: '900', color: Colors.white, letterSpacing: 1 },
  noPhotoInfo:   { alignItems: 'center', gap: 4 },
  noPhotoName:   { fontSize: 24, fontWeight: '900', color: Colors.ink, textAlign: 'center' },
  noPhotoCity:   { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  noPhotoNote: {
    marginTop: 10, fontSize: 12, color: Colors.muted, fontWeight: '500',
    backgroundColor: Colors.border, borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3,
  },

  // Matches grid
  matchesGrid:     { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 24 },
  matchesHeading:  { fontSize: 13, color: Colors.muted, fontWeight: '700', marginBottom: 12 },
  matchGridRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  matchCard: {
    width: (SCREEN_WIDTH - Spacing.md * 2 - 12) / 2,
    backgroundColor: Colors.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, alignItems: 'center', gap: 6,
  },
  matchAvatar:     { position: 'relative' },
  matchAvatarImg: {
    width: 72, height: 72, borderRadius: 36,
  },
  matchAvatarFallback: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center',
  },
  matchAvatarInitials: { fontSize: 22, fontWeight: '900', color: Colors.white },
  matchNewDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 12, height: 12, borderRadius: 6, backgroundColor: '#5a9e6f',
    borderWidth: 2, borderColor: Colors.paper,
  },
  matchName:    { fontSize: 14, fontWeight: '700', color: Colors.ink, textAlign: 'center' },
  matchCity:    { fontSize: 12, color: Colors.muted, textAlign: 'center' },
  matchChatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2,
    borderWidth: 1, borderColor: Colors.terracotta, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  matchChatBtnText: { fontSize: 12, color: Colors.terracotta, fontWeight: '700' },

  // Messages list
  msgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  msgRowFirst:        { borderTopWidth: 1, borderTopColor: Colors.border },
  msgAvatarImg:       { width: 52, height: 52, borderRadius: 26 },
  msgAvatar:          {},
  msgAvatarFallback: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center',
  },
  msgAvatarInitials: { fontSize: 18, fontWeight: '900', color: Colors.white },
  msgBody:  { flex: 1, gap: 2 },
  msgName:  { fontSize: 15, fontWeight: '700', color: Colors.ink },
  msgCity:  { fontSize: 12, color: Colors.muted },
  msgHint:  { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginTop: 2 },
  msgRight: { alignItems: 'flex-end', gap: 4 },
  msgTime:  { fontSize: 11, color: Colors.muted },

  // Profile + prefs tab
  tabScroll:        { flex: 1 },
  tabScrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: 32, gap: Spacing.sm },
  profileCard: {
    backgroundColor: Colors.paper, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, gap: 12,
  },
  // Profile hero
  profileHero: { alignItems: 'center', gap: 6, paddingTop: 12, paddingBottom: 4 },
  profileAvatarRing: {
    borderRadius: 56, borderWidth: 2.5, borderColor: Colors.terracotta, padding: 3,
    shadowColor: Colors.terracotta, shadowOpacity: 0.25, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 5,
  },
  profileAvatarWrap: { width: 100, height: 100, borderRadius: 50, overflow: 'hidden' },
  profileAvatar:     { width: 100, height: 100, borderRadius: 50 },
  profileAvatarFallback: { backgroundColor: Colors.terracotta, alignItems: 'center', justifyContent: 'center' },
  profileAvatarInitials: { fontSize: 32, fontWeight: '900', color: Colors.white },
  profileHeroName: { fontSize: 20, fontWeight: '900', color: Colors.ink, marginTop: 4 },
  profileHeroCity: { fontSize: 13, color: Colors.muted, fontWeight: '600' },

  photoSection: { marginTop: 4, marginBottom: 16 },
  bioCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, gap: 6,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  bioCardFocused: { borderColor: Colors.terracotta },
  profileCardSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  photoCount: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  profileCardTop: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  profileCardTopRight: { alignItems: 'flex-end', gap: 6 },
  profileName:    { fontSize: 18, fontWeight: '900', color: Colors.ink },
  profileCity:    { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  profileSection: { gap: 4 },
  profileBio:     { fontSize: 14, color: Colors.brownMid, lineHeight: 20 },
  profileBioInput: {
    minHeight: 56,
    maxHeight: 112,
    padding: 0,
  },
  photoStrip:     { flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_GAP },
  photoWrap:      { position: 'relative' },
  photo: {
    width: PHOTO_W, height: PHOTO_H, borderRadius: 8, backgroundColor: Colors.warmWhite,
  },
  photoEmpty:     { borderWidth: 1, borderColor: Colors.border },
  photoRemoveBtn: {
    position: 'absolute', right: -6, top: -6, backgroundColor: Colors.cream, borderRadius: 9,
  },
  photoAddBtn: {
    width: PHOTO_W, height: PHOTO_H, borderRadius: 8, borderWidth: 1.5,
    borderColor: Colors.terracotta, borderStyle: 'dashed',
    backgroundColor: Colors.warmWhite, alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddLabel: { fontSize: 10, color: Colors.terracotta, fontWeight: '700' },

  // Pref divider
  prefDivider: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20,
  },
  prefDividerLine:  { flex: 1, height: 1, backgroundColor: Colors.border },
  prefDividerLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.8 },

  prefCard: {
    backgroundColor: Colors.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    gap: 10, marginBottom: Spacing.sm,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  prefCardLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.7,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full,
    backgroundColor: Colors.warmWhite, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive:     { backgroundColor: 'rgba(196,98,45,0.13)', borderColor: Colors.terracotta, borderWidth: 1.5 },
  chipText:       { fontSize: 13, fontWeight: '600', color: Colors.brown },
  chipTextActive: { color: Colors.terracotta },
  ageHeaderRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ageRangeValue:  { fontSize: 15, fontWeight: '800', color: Colors.ink },
  ageSliderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ageSliderLabel: { fontSize: 11, fontWeight: '700', color: Colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, width: 28 },
  ageSlider:      { flex: 1, height: 36 },
  visibilityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  visHint: { fontSize: 12, color: Colors.muted, marginTop: 2 },
});
