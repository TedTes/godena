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
import AsyncStorage from '@react-native-async-storage/async-storage';
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
type DatingTab   = 'discover' | 'matches' | 'profile';

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
  lastMessage: string | null;
  lastMessageSentAt: string | null;
  lastMessageSenderId: string | null;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ── Constants ─────────────────────────────────────────────────────────────────

const SCREEN_WIDTH    = Dimensions.get('window').width;
const SCREEN_HEIGHT   = Dimensions.get('window').height;
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
  { value: 'long_term',  label: 'Long term'  },
  { value: 'marriage',   label: 'Long term'  },
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
  if (intent === 'long_term' || intent === 'marriage') return 'Long term';
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
  name, subtitle, onBack, saveState,
}: { name: string; subtitle?: string; likedCount: number; onBack: () => void; saveState?: SaveState; dimTitle?: boolean }) {
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
      <View style={styles.headerTitleWrap}>
        <Text style={styles.headerTitle}>{name}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
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
  { id: 'matches',   icon: 'heart',    label: 'Connections' },
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

// ── CandidateDetail ───────────────────────────────────────────────────────────

function CandidateDetail({ profile }: { profile: DatingCardProfile }) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const bioIsLong = profile.bio.length > 120;

  return (
    <View style={styles.candidateDetail}>
      {/* About */}
      <View style={styles.detailCard}>
        <Text style={styles.sectionLabel}>About</Text>
        <Text style={styles.bioBandText} numberOfLines={bioExpanded ? undefined : 3}>
          {profile.bio}
        </Text>
        {bioIsLong ? (
          <TouchableOpacity
            onPress={() => setBioExpanded((v) => !v)}
            hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
          >
            <Text style={styles.detailExpandBtn}>
              {bioExpanded ? 'Show less' : 'Read more'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Looking For */}
      {profile.intent && profile.intent !== 'Not set' ? (
        <View style={styles.detailCard}>
          <Text style={styles.sectionLabel}>Looking For</Text>
          <View style={styles.chipRow}>
            <View style={styles.intentChip}>
              <Ionicons name="heart-outline" size={12} color={Colors.terracotta} />
              <Text style={styles.intentChipText}>{profile.intent}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Languages */}
      {profile.languages.length > 0 ? (
        <View style={styles.detailCard}>
          <Text style={styles.sectionLabel}>Languages</Text>
          <View style={styles.chipRow}>
            {profile.languages.map((lang) => (
              <View key={lang} style={styles.basicChip}>
                <Text style={styles.basicChipText}>{lang}</Text>
              </View>
            ))}
          </View>
        </View>
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

// ── MatchesTab (combined matches + messages) ──────────────────────────────────

function MatchesTab({
  matches, loading, onChat, userId,
}: { matches: DatingMatchRow[]; loading: boolean; onChat: (matchId: string) => void; userId: string | null }) {
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

  const newMatches = matches.filter((m) => !m.lastMessage);
  const conversations = [...matches].sort((a, b) => {
    const aTime = a.lastMessageSentAt ?? a.matchedAt;
    const bTime = b.lastMessageSentAt ?? b.matchedAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.connectionsContent}>
      {/* New matches — horizontal scroll row */}
      {newMatches.length > 0 && (
        <View style={styles.newMatchesSection}>
          <Text style={styles.newMatchesSectionLabel}>New Matches</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.newMatchesScroll}
          >
            {newMatches.map((m) => (
              <TouchableOpacity
                key={m.matchId}
                style={styles.newMatchBubble}
                onPress={() => onChat(m.matchId)}
                activeOpacity={0.85}
              >
                <View style={styles.newMatchAvatarWrap}>
                  {m.photoUrl ? (
                    <Image source={{ uri: m.photoUrl }} style={styles.newMatchAvatarImg} />
                  ) : (
                    <View style={styles.newMatchAvatarFallback}>
                      <Text style={styles.newMatchAvatarInitials}>{getInitials(m.name)}</Text>
                    </View>
                  )}
                  <View style={styles.matchNewDot} />
                </View>
                <Text style={styles.newMatchName} numberOfLines={1}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Conversations label — only shown when new matches row is visible above */}
      {newMatches.length > 0 && (
        <View style={styles.conversationsDivider}>
          <Text style={styles.conversationsLabel}>Messages</Text>
        </View>
      )}
      {conversations.map((m) => {
        const isNew = !m.lastMessage;
        const preview = m.lastMessage
          ? (m.lastMessageSenderId === userId ? `You: ${m.lastMessage}` : m.lastMessage)
          : 'New match · say hello';
        const previewTime = m.lastMessageSentAt ?? m.matchedAt;
        const isRecent = Date.now() - new Date(previewTime).getTime() < 86400 * 1000;
        return (
          <TouchableOpacity
            key={m.matchId}
            style={styles.msgRow}
            onPress={() => onChat(m.matchId)}
            activeOpacity={0.8}
          >
            <View style={isNew ? styles.msgAvatarRingWrap : styles.msgAvatar}>
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
              <Text
                style={[styles.msgPreview, isNew && styles.msgPreviewNew]}
                numberOfLines={1}
              >
                {preview}
              </Text>
            </View>
            <View style={styles.msgRight}>
              <Text style={[styles.msgTime, isRecent && styles.msgTimeRecent]}>
                {timeAgo(previewTime)}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={Colors.border} />
            </View>
          </TouchableOpacity>
        );
      })}
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
  const [overlayExpanded,    setOverlayExpanded]    = useState(false);
  const overlayAnim = useRef(new Animated.Value(0)).current;

  // My profile
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
  const headerTitle = useMemo(() => {
    if (activeTab === 'discover') return currentProfile
      ? `${currentProfile.name}${currentProfile.age != null ? `, ${currentProfile.age}` : ''}`
      : 'Dating';
    if (activeTab === 'matches') return 'Connections';
    return 'Your profile';
  }, [activeTab, currentProfile]);

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
    // collapse overlay when advancing to next card
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
      .eq('status', 'matched')
      .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (matchErr || !matchData) { setMatchesLoading(false); return; }

    const otherIds = matchData.map((m) => m.user_a_id === userId ? m.user_b_id : m.user_a_id);
    if (otherIds.length === 0) { setDatingMatches([]); setMatchesLoading(false); setMatchesLoaded(true); return; }

    const matchIds = matchData.map((m) => m.id);

    const [{ data: profData }, { data: msgData }] = await Promise.all([
      supabase.rpc('get_dating_match_profiles', { p_user_ids: otherIds }),
      supabase
        .from('dating_messages')
        .select('match_id, content, sent_at, sender_id')
        .in('match_id', matchIds)
        .is('deleted_at', null)
        .order('sent_at', { ascending: false }),
    ]);

    const profMap = Object.fromEntries(
      (
        (profData as Array<{
          user_id: string;
          full_name: string | null;
          avatar_url: string | null;
          birth_date?: string | null;
        }> | null) ?? []
      ).map((p) => [p.user_id, p])
    );

    // Latest message per match (rows are already sorted desc)
    const lastMsgByMatch: Record<string, { content: string; sentAt: string; senderId: string }> = {};
    for (const msg of (msgData as Array<{ match_id: string; content: string; sent_at: string; sender_id: string }> | null) ?? []) {
      if (!lastMsgByMatch[msg.match_id]) {
        lastMsgByMatch[msg.match_id] = { content: msg.content, sentAt: msg.sent_at, senderId: msg.sender_id };
      }
    }

    const resolved: DatingMatchRow[] = await Promise.all(
      matchData.map(async (m) => {
        const otherId = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
        const prof    = profMap[otherId];
        const photoUrl = prof?.avatar_url
          ? await resolveProfilePhotoUrl(prof.avatar_url)
          : null;
        const lastName = lastMsgByMatch[m.id];
        return {
          matchId:              m.id,
          otherUserId:          otherId,
          name:                 prof?.full_name?.trim() || 'Member',
          city:                 '',
          photoUrl:             photoUrl ?? null,
          matchedAt:            m.created_at,
          lastMessage:          lastName?.content ?? null,
          lastMessageSentAt:    lastName?.sentAt ?? null,
          lastMessageSenderId:  lastName?.senderId ?? null,
        };
      })
    );

    setDatingMatches(resolved);
    setMatchesLoading(false);
    setMatchesLoaded(true);
  }, [userId, matchesLoading]);

  useEffect(() => {
    if (!userId || activeTab !== 'matches' || datingMatches.length === 0) return;
    const latestMatchedAt = datingMatches[0]?.matchedAt;
    if (!latestMatchedAt) return;
    void AsyncStorage.setItem(`dating_matches_last_seen:${userId}`, latestMatchedAt);
  }, [userId, activeTab, datingMatches]);

  // Load matches lazily when switching to matches tab
  useEffect(() => {
    if (activeTab === 'matches' && userId && !matchesLoaded) {
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
      fullName:         me?.full_name?.trim() || 'You',
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
          name={headerTitle}
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

                      {/* Swipe stamps */}
                      <Animated.View style={[styles.swipeBadge, styles.swipeBadgeLike, { opacity: likeOpacity }]}>
                        <Text style={[styles.swipeBadgeText, { color: '#4caf70' }]}>LIKE</Text>
                      </Animated.View>
                      <Animated.View style={[styles.swipeBadge, styles.swipeBadgePass, { opacity: passOpacity }]}>
                        <Text style={[styles.swipeBadgeText, { color: Colors.error }]}>PASS</Text>
                      </Animated.View>

                      {/* Profile info overlay — expandable */}
                      <Animated.View style={styles.cardContent}>
                        {/* Drag handle */}
                        <TouchableOpacity onPress={toggleOverlay} activeOpacity={0.7} style={styles.cardHandle}>
                          <View style={styles.cardHandleBar} />
                        </TouchableOpacity>

                        {/* Info block */}
                        <View style={styles.cardInfoBlock}>
                          {/* City */}
                          <View style={styles.metaRow}>
                            <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.45)" />
                            <Text style={styles.cardCity}>{currentProfile!.city}</Text>
                          </View>

                          {/* Bio */}
                          {currentProfile!.bio ? (
                            <Text style={styles.cardBio} numberOfLines={overlayExpanded ? 0 : 2}>
                              {currentProfile!.bio}
                            </Text>
                          ) : null}

                          {/* Tags — intent + languages separated by "." */}
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

                          {/* Expanded detail section */}
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

                        {/* Action buttons — embedded in overlay */}
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
                    <NoPhotoCard
                      profile={currentProfile!}
                      likeOpacity={likeOpacity}
                      passOpacity={passOpacity}
                    />
                  )}
                </Animated.View>

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

        {/* ── MATCHES + MESSAGES ───────────────────────────────────────────── */}
        {activeTab === 'matches' ? (
          <MatchesTab
            matches={datingMatches}
            loading={matchesLoading}
            onChat={handleChat}
            userId={userId}
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

const DECK_H = Math.round(SCREEN_HEIGHT * 0.55);

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
  headerTitleWrap:  { alignItems: 'center', gap: 1 },
  headerTitle:      { fontSize: 18, fontWeight: '800', color: Colors.ink },
  headerSubtitle:   { fontSize: 11, fontWeight: '500', color: Colors.muted },
  headerTitleMuted: { fontSize: 13, fontWeight: '500', color: Colors.muted },
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

  // Discover deck — full screen
  deckContainer: { flex: 1 },
  deckWrap:      { flex: 1, position: 'relative', marginBottom: -34 },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.xl, overflow: 'hidden',
    backgroundColor: Colors.paper,
    shadowColor: '#000', shadowOpacity: 0.20,
    shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  cardUnder:        { transform: [{ scale: 0.96 }, { translateY: 10 }], opacity: 0.72 },
  cardImage:        { flex: 1, justifyContent: 'flex-end' },
  cardImageStyle:   { borderRadius: Radius.xl },
  cardBottomFade: {},
  cardContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: 8,
    paddingBottom: 44,
    zIndex: 5,
    gap: 0,
  },
  cardInfoBlock: {
    gap: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 10,
    backgroundColor: 'rgba(8,4,2,0.42)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    overflow: 'hidden',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  cardName: {
    color: Colors.white, fontSize: 28, fontWeight: '900', lineHeight: 32,
  },
  cardCity: {
    color: 'rgba(255,255,255,0.50)', fontSize: 11, fontWeight: '500', letterSpacing: 0.2,
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardMetaLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardMeta: {
    color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '400', letterSpacing: 0.1,
    marginTop: 8,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  cardExpandedDetail: { gap: 8, marginTop: 8 },
  cardDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardDetailText: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontWeight: '400' },
  cardBio: {
    color: 'rgba(255,255,255,0.90)', fontSize: 13, lineHeight: 19, fontWeight: '400',
    borderLeftWidth: 2, borderLeftColor: 'rgba(255,255,255,0.18)',
    paddingLeft: 8, marginVertical: 2,
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  cardHandle: { alignItems: 'center', paddingTop: 2, paddingBottom: 8 },
  cardHandleBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.50)',
  },
  cardTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
  cardTagIntent: { color: 'rgba(240,217,138,0.85)', fontSize: 12, fontWeight: '600' },
  cardTagLang:   { color: 'rgba(255,255,255,0.50)', fontSize: 12 },
  cardExpandedSection: { gap: 6 },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 4 },
  cardExpandedHint: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center' },
  cardIntentInline: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontStyle: 'italic' },
  cardChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  cardChip: {
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  cardChipText: { color: 'rgba(255,255,255,0.90)', fontSize: 11, fontWeight: '600' },
  cardChipIntent: {
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(201,168,76,0.30)',
  },
  cardChipIntentText: { color: 'rgba(240,217,138,0.85)', fontSize: 11, fontWeight: '600' },
  cardChipLang: {
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: Radius.full,
    paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  cardChipLangText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '600' },
  dotsRow: {
    position: 'absolute', top: 14, left: 14, right: 14, flexDirection: 'row', gap: 5, zIndex: 4,
  },
  dot:       { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  dotActive: { backgroundColor: Colors.white, opacity: 1 },
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
    position: 'absolute', bottom: 48, left: 0, right: 0, zIndex: 20,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: Spacing.md,
  },
  actionBtn: {
    width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4,
  },
  actionBtnDim: { opacity: 0.55 },
  passBtn: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)' },
  likeBtn: { backgroundColor: Colors.terracotta },
  bioBandText: { fontSize: 14, color: Colors.brownMid, lineHeight: 21 },

  // Candidate detail sections (kept for other uses)
  candidateScroll:        { flex: 1, marginTop: Spacing.md },
  candidateScrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 16, gap: 8 },
  candidateDetail:        { gap: 8 },
  detailCard: {
    backgroundColor: Colors.warmWhite, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: 8,
  },
  detailExpandBtn: { fontSize: 13, color: Colors.terracotta, fontWeight: '700', marginTop: 2 },
  intentChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    backgroundColor: 'rgba(196,98,45,0.09)', borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(196,98,45,0.20)',
  },
  intentChipText: { fontSize: 13, color: Colors.terracotta, fontWeight: '700' },
  basicChip: {
    backgroundColor: Colors.paper, borderRadius: Radius.full,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  basicChipText: { fontSize: 13, color: Colors.brown, fontWeight: '600' },

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

  // Conversation rows
  msgRow: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    marginHorizontal: Spacing.md, marginBottom: 8,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  msgAvatarImg: { width: 50, height: 50, borderRadius: 25 },
  msgAvatar: {},
  msgAvatarRingWrap: {
    borderWidth: 2, borderColor: Colors.terracotta,
    borderRadius: 27, padding: 2,
  },
  msgAvatarFallback: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center',
  },
  msgAvatarInitials: { fontSize: 17, fontWeight: '900', color: Colors.white },
  msgBody:  { flex: 1, gap: 3 },
  msgName:  { fontSize: 15, fontWeight: '700', color: Colors.ink },
  msgPreview: { fontSize: 13, color: Colors.muted, lineHeight: 17 },
  msgPreviewNew: { color: Colors.terracotta, fontWeight: '600' },
  msgRight: { alignItems: 'flex-end', gap: 5 },
  msgTime:  { fontSize: 10, color: Colors.muted, fontWeight: '500' },
  msgTimeRecent: { fontSize: 11, color: Colors.terracotta, fontWeight: '700' },

  // New matches row
  newMatchesSection: { paddingTop: Spacing.sm, paddingBottom: 4 },
  newMatchesSectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted,
    letterSpacing: 0.4, paddingHorizontal: Spacing.md, marginBottom: 10,
  },
  newMatchesScroll: { paddingHorizontal: Spacing.md, gap: 16 },
  newMatchBubble: { alignItems: 'center', gap: 5, width: 64 },
  newMatchAvatarWrap: { position: 'relative' },
  newMatchAvatarImg: { width: 60, height: 60, borderRadius: 30 },
  newMatchAvatarFallback: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.terracotta,
    alignItems: 'center', justifyContent: 'center',
  },
  newMatchAvatarInitials: { fontSize: 20, fontWeight: '900', color: Colors.white },
  newMatchName: { fontSize: 11, fontWeight: '600', color: Colors.ink, textAlign: 'center' },

  connectionsContent: { paddingBottom: 24 },

  // Section divider between new matches and conversations
  conversationsDivider: {
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 6,
  },
  conversationsLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.muted, letterSpacing: 0.4,
  },

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
