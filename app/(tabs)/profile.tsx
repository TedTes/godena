import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockGroups } from '../../data/mock';
import { supabase } from '../../lib/supabase';

const settingsRows = [
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-outline', label: 'Privacy & Safety' },
  { icon: 'star-outline', label: 'Upgrade to Premium', accent: true },
  { icon: 'help-circle-outline', label: 'Help & Feedback' },
  { icon: 'log-out-outline', label: 'Sign Out', danger: true },
] as const;

const INTENT_META: Record<string, { emoji: string; label: string }> = {
  friendship: { emoji: '🤝', label: 'Friendship' },
  dating:     { emoji: '💛', label: 'Dating' },
  long_term:  { emoji: '🌿', label: 'Long-term' },
  marriage:   { emoji: '💍', label: 'Marriage' },
};

function getIntentMeta(intent: string) {
  return INTENT_META[intent] ?? INTENT_META.dating;
}

function abbrevGender(g: string): string {
  const s = g.toLowerCase().replace(/[_\s]+/g, ' ').trim();
  if (s === 'male')   return 'M';
  if (s === 'female') return 'F';
  if (s.includes('non')) return 'NB';
  // Capitalise first letter, keep short
  return s.charAt(0).toUpperCase() + s.slice(1, 8) + (s.length > 8 ? '.' : '');
}

const COMPLETENESS_TOTAL = 7;

export default function ProfileScreen() {
  const router = useRouter();
  const myGroups = mockGroups.filter((g) => g.isMember);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [galleryPhotos, setGalleryPhotos] = useState<
    Array<{ uri: string; path: string; isAvatar: boolean }>
  >([]);
  const [profile, setProfile] = useState<{
    full_name: string;
    city: string | null;
    bio: string | null;
    birth_date: string | null;
    ethnicity: string | null;
    religion: string | null;
    languages: string[] | null;
    intent: string;
    gender: string | null;
    preferred_genders: string[] | null;
    preferred_age_min: number | null;
    preferred_age_max: number | null;
    is_open_to_connections: boolean | null;
    avatar_url: string | null;
    photo_urls: string[] | null;
  } | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(myGroups.map((g) => [g.id, g.isOpenToConnect]))
  );

  const resolvePhotoUri = async (value: string): Promise<string | null> => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(value, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;

    const { data: publicData } = supabase.storage.from('profile-photos').getPublicUrl(value);
    if (publicData?.publicUrl) return publicData.publicUrl;
    return null;
  };

  const loadProfile = async (uid?: string) => {
    const resolvedUserId = uid ?? userId;
    if (!resolvedUserId) return;

    const { data } = await supabase
      .from('profiles')
      .select('full_name, city, bio, birth_date, ethnicity, religion, languages, intent, gender, preferred_genders, preferred_age_min, preferred_age_max, is_open_to_connections, avatar_url, photo_urls')
      .eq('user_id', resolvedUserId)
      .maybeSingle();

    setProfile(data ?? null);

    const avatarValue = data?.avatar_url ?? null;
    if (avatarValue) {
      const uri = await resolvePhotoUri(avatarValue);
      setAvatarUri(uri ?? null);
    } else {
      setAvatarUri(null);
    }

    const mergedPaths = [
      ...(data?.avatar_url ? [data.avatar_url] : []),
      ...(data?.photo_urls ?? []),
    ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

    if (mergedPaths.length > 0) {
      const resolved = await Promise.all(mergedPaths.map((v) => resolvePhotoUri(v)));
      const photos = mergedPaths
        .map((path, index) => ({
          path,
          uri: resolved[index],
          isAvatar: Boolean(data?.avatar_url && path === data.avatar_url),
        }))
        .filter((p): p is { uri: string; path: string; isAvatar: boolean } => Boolean(p.uri));
      setGalleryPhotos(photos);
    } else {
      setGalleryPhotos([]);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const boot = async () => {
        setLoadingProfile(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user.id;
        if (!uid) {
          setLoadingProfile(false);
          router.replace('/(auth)/phone');
          return;
        }
        setUserId(uid);
        await loadProfile(uid);
        setLoadingProfile(false);
      };
      void boot();
    }, [router])
  );

  const age = useMemo(() => {
    if (!profile?.birth_date) return null;
    const birthYear = new Date(profile.birth_date).getFullYear();
    if (!birthYear) return null;
    return new Date().getFullYear() - birthYear;
  }, [profile?.birth_date]);

  const name            = profile?.full_name ?? 'New Member';
  const city            = profile?.city ?? 'Unknown city';
  const ethnicity       = profile?.ethnicity ?? null;
  const religion        = profile?.religion ?? null;
  const languages       = profile?.languages ?? [];
  const intentMeta      = getIntentMeta(profile?.intent ?? 'dating');
  const preferredGenders = profile?.preferred_genders ?? [];

  const preferredAgeLabel     =
    profile?.preferred_age_min != null && profile?.preferred_age_max != null
      ? `${profile.preferred_age_min}–${profile.preferred_age_max} years`
      : null;

  // Interleaved identity + preference grid (identity left col, prefs right col)
  const detailItems = [
    ethnicity                   ? { emoji: '🇪🇹', value: ethnicity }                                            : null,
    profile?.gender             ? { emoji: '🧍',  value: abbrevGender(profile.gender) }                         : null,
    religion                    ? { emoji: '✝️',  value: religion }                                             : null,
    preferredGenders.length > 0 ? { emoji: '💞',  value: preferredGenders.map(abbrevGender).join(', ') }        : null,
    languages.length > 0        ? { emoji: '🗣️', value: languages.join(', ') }                                 : null,
    preferredAgeLabel           ? { emoji: '🎂',  value: preferredAgeLabel }                                    : null,
  ].filter((x): x is { emoji: string; value: string } => Boolean(x));

  // Profile completeness
  const completenessScore = [
    Boolean(profile?.full_name?.trim()),
    Boolean(profile?.bio?.trim()),
    Boolean(profile?.avatar_url),
    galleryPhotos.filter((p) => !p.isAvatar).length > 0,
    Boolean(profile?.ethnicity?.trim()),
    Boolean(profile?.religion?.trim()),
    languages.length > 0,
  ].filter(Boolean).length;
  const completenessPercent = Math.round((completenessScore / COMPLETENESS_TOTAL) * 100);
  const isProfileComplete = completenessScore === COMPLETENESS_TOTAL;

  const toggleGroup = (id: string, val: boolean) =>
    setOpenGroups((prev) => ({ ...prev, [id]: val }));

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/onboarding');
  };

  const updatePhoto = async () => {
    if (!userId || updatingPhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to update your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    try {
      setUpdatingPhoto(true);
      const asset = result.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' : 'jpg';
      const filePath = `${userId}/${Date.now()}-avatar.${ext}`;

      let fileData: ArrayBuffer;
      if (asset.base64) {
        const response = await fetch(`data:${contentType};base64,${asset.base64}`);
        fileData = await response.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        fileData = await response.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, fileData, { contentType, upsert: false });

      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('user_id', userId);

      if (updateError) { Alert.alert('Update failed', updateError.message); return; }

      const resolvedAvatarUri = await resolvePhotoUri(filePath);
      setAvatarUri(resolvedAvatarUri ?? null);
      setProfile((prev) => (prev ? { ...prev, avatar_url: filePath } : prev));
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Could not update profile photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const addGalleryPhoto = async () => {
    if (!userId || updatingPhoto) return;

    const current = profile?.photo_urls ?? [];
    if (current.length >= 4) {
      Alert.alert('Photo limit reached', 'You can upload up to 4 gallery photos.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to add gallery photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    try {
      setUpdatingPhoto(true);
      const asset = result.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' : 'jpg';
      const filePath = `${userId}/${Date.now()}-gallery.${ext}`;

      let fileData: ArrayBuffer;
      if (asset.base64) {
        const response = await fetch(`data:${contentType};base64,${asset.base64}`);
        fileData = await response.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        fileData = await response.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, fileData, { contentType, upsert: false });

      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ photo_urls: [...current, filePath] })
        .eq('user_id', userId);

      if (updateError) { Alert.alert('Update failed', updateError.message); return; }

      const resolvedUri = await resolvePhotoUri(filePath);
      setProfile((prev) =>
        prev ? { ...prev, photo_urls: [...(prev.photo_urls ?? []), filePath] } : prev
      );
      if (resolvedUri) {
        setGalleryPhotos((prev) => [...prev, { uri: resolvedUri, path: filePath, isAvatar: false }]);
      }
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Could not add gallery photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const removeGalleryPhoto = async (path: string) => {
    if (!userId || updatingPhoto) return;
    const current = profile?.photo_urls ?? [];
    if (!current.includes(path)) return;

    setUpdatingPhoto(true);
    const next = current.filter((p) => p !== path);
    const { error } = await supabase
      .from('profiles')
      .update({ photo_urls: next })
      .eq('user_id', userId);

    if (error) {
      setUpdatingPhoto(false);
      Alert.alert('Update failed', error.message);
      return;
    }

    const { error: storageError } = await supabase.storage.from('profile-photos').remove([path]);
    setUpdatingPhoto(false);

    if (storageError) Alert.alert('Storage cleanup warning', storageError.message);

    setProfile((prev) =>
      prev ? { ...prev, photo_urls: (prev.photo_urls ?? []).filter((p) => p !== path) } : prev
    );
    setGalleryPhotos((prev) => prev.filter((p) => p.path !== path));
  };

  const openPhotoActions = () => {
    const hasPhoto = Boolean(avatarUri);
    Alert.alert('Profile photo', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose new photo', onPress: () => void updatePhoto() },
      ...(hasPhoto ? [{
        text: 'Remove photo',
        style: 'destructive' as const,
        onPress: async () => {
          if (!userId) return;
          setUpdatingPhoto(true);
          const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null })
            .eq('user_id', userId);
          setUpdatingPhoto(false);
          if (error) { Alert.alert('Update failed', error.message); return; }
          setAvatarUri(null);
          setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev));
        },
      }] : []),
    ]);
  };

  if (loadingProfile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Hero Header ── */}
          <View style={styles.headerBg}>
            <View style={styles.headerContent}>

              {/* Avatar */}
              <TouchableOpacity style={styles.photoWrap} onPress={openPhotoActions} activeOpacity={0.85}>
                {avatarUri ? (
                  <Image
                    key={avatarUri}
                    source={{ uri: avatarUri }}
                    style={styles.photoImage}
                    resizeMode="cover"
                    onError={() => setAvatarUri(null)}
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoInitial}>{name[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                {updatingPhoto && (
                  <View style={styles.photoLoadingOverlay}>
                    <ActivityIndicator color={Colors.white} />
                  </View>
                )}
                <View style={styles.cameraBtn}>
                  <Ionicons name="camera" size={13} color={Colors.white} />
                </View>
              </TouchableOpacity>

              {/* Name */}
              <Text style={styles.name}>{name}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {age ? <Text style={styles.metaText}>{age}</Text> : null}
                {age ? <View style={styles.metaDot} /> : null}
                <Ionicons name="location-outline" size={12} color={Colors.brownLight} />
                <Text style={styles.metaText}>{city}</Text>
              </View>

              {/* Intent pill */}
              <View style={styles.intentPill}>
                <Text style={styles.intentPillText}>{intentMeta.emoji} {intentMeta.label}</Text>
              </View>

              {/* Edit button */}
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => router.push('/profile-setup')}
                activeOpacity={0.85}
              >
                <Ionicons name="pencil-outline" size={14} color={Colors.brown} />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Completeness Banner ── */}
          {!isProfileComplete && (
            <TouchableOpacity
              style={styles.completenessBanner}
              onPress={() => router.push('/profile-setup')}
              activeOpacity={0.85}
            >
              <Ionicons name="sparkles-outline" size={18} color={Colors.terracotta} />
              <View style={styles.completenessMiddle}>
                <Text style={styles.completenessTitle}>
                  Complete your profile — {completenessPercent}%
                </Text>
                <View style={styles.completenessTrack}>
                  <View
                    style={[styles.completenessFill, { width: `${completenessPercent}%` as any }]}
                  />
                </View>
              </View>
              <Ionicons name="chevron-forward" size={15} color={Colors.borderDark} />
            </TouchableOpacity>
          )}

          {/* ── Photos ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Photos</Text>
              {galleryPhotos.length > 0 && (
                <Text style={styles.sectionMeta}>{galleryPhotos.length} / 5</Text>
              )}
            </View>

            {galleryPhotos.length === 0 ? (
              <TouchableOpacity
                style={styles.galleryEmptyCard}
                onPress={() => void addGalleryPhoto()}
                activeOpacity={0.85}
              >
                <View style={styles.galleryEmptyIcon}>
                  <Ionicons name="images-outline" size={26} color={Colors.muted} />
                </View>
                <Text style={styles.galleryEmptyTitle}>Add photos</Text>
                <Text style={styles.galleryEmptySubtext}>
                  Profiles with photos get far more connections
                </Text>
                <View style={styles.galleryEmptyBtn}>
                  <Ionicons name="add" size={14} color={Colors.white} />
                  <Text style={styles.galleryEmptyBtnText}>Upload a photo</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScroll}
              >
                {galleryPhotos.map((photo) => (
                  <View key={photo.path} style={styles.galleryPhotoWrap}>
                    <Image source={{ uri: photo.uri }} style={styles.galleryPhoto} resizeMode="cover" />
                    {photo.isAvatar ? (
                      <View style={styles.avatarBadge}>
                        <Text style={styles.avatarBadgeText}>Avatar</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.galleryRemoveBtn}
                        onPress={() => void removeGalleryPhoto(photo.path)}
                        activeOpacity={0.85}
                        hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      >
                        <Ionicons name="close" size={11} color={Colors.white} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                {(profile?.photo_urls ?? []).length < 4 && (
                  <TouchableOpacity
                    style={styles.addPhotoTile}
                    onPress={() => void addGalleryPhoto()}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add" size={26} color={Colors.terracotta} />
                    <Text style={styles.addPhotoLabel}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>

          {/* ── About ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <View style={styles.card}>
              {profile?.bio ? (
                <Text style={styles.bioText}>{profile.bio}</Text>
              ) : (
                <TouchableOpacity
                  onPress={() => router.push('/profile-setup')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bioEmpty}>
                    Tap to introduce yourself — your bio helps others decide if you'd connect well.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── About Me (identity + preferences grid) ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About Me</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {detailItems.length > 0 ? (
                <View style={styles.detailChips}>
                  {detailItems.map((item) => (
                    <View key={item.emoji} style={styles.detailChip}>
                      <Text style={styles.detailChipEmoji}>{item.emoji}</Text>
                      <Text style={styles.detailChipValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  style={{ padding: Spacing.md }}
                  onPress={() => router.push('/profile-setup')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.bioEmpty}>
                    Add your identity and preferences to help others connect with you.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Openness Signals ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Openness Signals</Text>
              <View style={styles.privateBadge}>
                <Ionicons name="lock-closed" size={9} color={Colors.muted} />
                <Text style={styles.privateBadgeText}>Private</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtext}>
              Only visible to you. A reveal fires only when it's mutual.
            </Text>
            <View style={styles.card}>
              {myGroups.map((g, i) => (
                <View key={g.id} style={[styles.infoRow, i > 0 && styles.infoRowDivider]}>
                  <View style={[styles.signalDot, { backgroundColor: g.coverColor + '28' }]}>
                    <Text style={styles.infoEmoji}>{g.emoji}</Text>
                  </View>
                  <View style={styles.infoText}>
                    <Text style={styles.signalName} numberOfLines={1}>{g.name}</Text>
                    <Text style={[styles.signalState, openGroups[g.id] && styles.signalStateOn]}>
                      {openGroups[g.id] ? '🌱 Open to connect' : 'Not signalling'}
                    </Text>
                  </View>
                  <Switch
                    value={openGroups[g.id] || false}
                    onValueChange={(val) => toggleGroup(g.id, val)}
                    trackColor={{ false: Colors.border, true: Colors.olive }}
                    thumbColor={Colors.white}
                  />
                </View>
              ))}
            </View>
          </View>

          {/* ── Account ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {settingsRows.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[
                    styles.settingsRow,
                    i < settingsRows.length - 1 && styles.settingsRowDivider,
                    'accent' in row && row.accent && styles.settingsRowPremium,
                  ]}
                  onPress={row.label === 'Sign Out' ? signOut : undefined}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.settingsIcon,
                    'accent' in row && row.accent && styles.settingsIconAccent,
                    'danger' in row && row.danger && styles.settingsIconDanger,
                  ]}>
                    <Ionicons
                      name={row.icon as any}
                      size={18}
                      color={
                        'danger' in row && row.danger ? Colors.error :
                        'accent' in row && row.accent ? Colors.gold :
                        Colors.brownMid
                      }
                    />
                  </View>
                  <Text style={[
                    styles.settingsLabel,
                    'danger' in row && row.danger && styles.settingsLabelDanger,
                    'accent' in row && row.accent && styles.settingsLabelAccent,
                  ]}>
                    {row.label}
                  </Text>
                  {'accent' in row && row.accent ? (
                    <View style={styles.premiumBadge}>
                      <Text style={styles.premiumBadgeText}>PRO</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={Colors.borderDark} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },

  // ── Header ──
  headerBg: {
    backgroundColor: Colors.brown,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 36,
    shadowColor: Colors.ink,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: Spacing.lg,
  },

  // Avatar
  photoWrap: { position: 'relative', width: 108, height: 108, marginBottom: 18 },
  photoPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  photoImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: Colors.brownMid,
  },
  photoLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 54,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: { fontSize: 44, fontWeight: '900', color: Colors.white },
  cameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },

  // Name & meta
  name: { fontSize: 26, fontWeight: '900', color: Colors.white, marginBottom: 6, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  metaText: { fontSize: 13, color: Colors.brownLight },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: Colors.brownLight },

  // Intent pill
  intentPill: {
    backgroundColor: 'rgba(196,98,45,0.22)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.3)',
  },
  intentPillText: { fontSize: 12, color: Colors.terraLight, fontWeight: '700' },

  // Edit button
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  editBtnText: { fontSize: 13, color: Colors.brown, fontWeight: '700' },

  // ── Completeness banner ──
  completenessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Spacing.lg,
    marginTop: 20,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.2)',
    padding: 14,
  },
  completenessMiddle: { flex: 1, gap: 6 },
  completenessTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  completenessTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  completenessFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.terracotta,
  },

  // ── Sections ──
  section: { paddingHorizontal: Spacing.lg, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  sectionMeta: {
    fontSize: 11,
    color: Colors.muted,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionSubtext: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 10,
    marginTop: -6,
  },

  // ── Card ──
  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardNoPad: { padding: 0, overflow: 'hidden' },

  // ── Gallery ──
  galleryEmptyCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6,
  },
  galleryEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  galleryEmptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  galleryEmptySubtext: { fontSize: 12, color: Colors.muted, textAlign: 'center', lineHeight: 18 },
  galleryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  galleryEmptyBtnText: { fontSize: 13, color: Colors.white, fontWeight: '700' },

  galleryScroll: { gap: 10, paddingRight: Spacing.lg },
  galleryPhotoWrap: {
    width: 112,
    height: 148,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryPhoto: {
    width: 112,
    height: 148,
    borderRadius: Radius.md,
    backgroundColor: Colors.paper,
  },
  galleryRemoveBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(61,43,31,0.75)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  avatarBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  addPhotoTile: {
    width: 80,
    height: 148,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.borderDark,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoLabel: { fontSize: 11, color: Colors.terracotta, fontWeight: '700' },

  // ── Bio ──
  bioText: { fontSize: 14, color: Colors.brownMid, lineHeight: 23 },
  bioEmpty: {
    fontSize: 14,
    color: Colors.muted,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // ── Info rows (shared by Identity, Looking For, and Signals) ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  infoRowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: { fontSize: 19 },
  infoText: { flex: 1 },
  infoFieldLabel: {
    fontSize: 10,
    color: Colors.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, color: Colors.ink, fontWeight: '600' },

  // ── Private badge ──
  privateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privateBadgeText: { fontSize: 9, color: Colors.muted, fontWeight: '600' },

  // ── Signal rows ──
  signalDot: { width: 40, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  signalName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  signalState: { fontSize: 11, color: Colors.muted },
  signalStateOn: { color: Colors.olive, fontWeight: '600' },

  // ── Settings ──
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingsRowDivider: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsRowPremium: { backgroundColor: 'rgba(201,168,76,0.06)' },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: { backgroundColor: 'rgba(201,168,76,0.12)' },
  settingsIconDanger: { backgroundColor: 'rgba(217,79,79,0.1)' },
  settingsLabel: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '500' },
  settingsLabelDanger: { color: Colors.error },
  settingsLabelAccent: { color: Colors.gold, fontWeight: '600' },
  premiumBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: { fontSize: 9, color: Colors.white, fontWeight: '800', letterSpacing: 0.5 },

  // ── About Me chips ──
  detailChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: Spacing.md,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailChipEmoji: { fontSize: 13 },
  detailChipValue: { fontSize: 13, color: Colors.ink, fontWeight: '600' },
});
