import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Alert,
  Modal,
  Image,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, useThemeColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { useScreenEnter } from '../../hooks/useScreenEnter';

type SignalGroup = {
  id: string;
  name: string;
  coverColor: string;
  emoji: string;
  isMember: boolean;
  isOpenToConnect: boolean;
};

const mockGroups: SignalGroup[] = [];

const settingsRows = [
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-outline', label: 'Privacy & Safety' },
  { icon: 'star-outline', label: 'Upgrade to Premium', accent: true },
  { icon: 'help-circle-outline', label: 'Help & Feedback' },
  { icon: 'trash-outline', label: 'Delete Account', danger: true },
  { icon: 'log-out-outline', label: 'Sign Out', danger: true },
] as const;

function abbrevGender(g: string): string {
  const s = g.toLowerCase().replace(/[_\s]+/g, ' ').trim();
  if (s === 'male')   return 'M';
  if (s === 'female') return 'F';
  if (s.includes('non')) return 'NB';
  // Capitalise first letter, keep short
  return s.charAt(0).toUpperCase() + s.slice(1, 8) + (s.length > 8 ? '.' : '');
}

const COMPLETENESS_TOTAL = 7;

function AvatarImage({ uri, style, onError }: { uri: string; style: object; onError: () => void }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  return (
    <Animated.Image
      source={{ uri }}
      style={[style, { opacity }]}
      resizeMode="cover"
      onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()}
      onError={onError}
    />
  );
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [updatingGlobalOpen, setUpdatingGlobalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
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
          router.replace('/(auth)');
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
  const preferredGenders = profile?.preferred_genders ?? [];

  const preferredAgeLabel     =
    profile?.preferred_age_min != null && profile?.preferred_age_max != null
      ? `${profile.preferred_age_min}–${profile.preferred_age_max} years`
      : null;

  const identityItems = [
    ethnicity            ? { emoji: '🌍', value: ethnicity }                     : null,
    profile?.gender      ? { emoji: '🧍', value: abbrevGender(profile.gender) } : null,
    religion             ? { emoji: '🛐', value: religion }                      : null,
    languages.length > 0 ? { emoji: '🗣️', value: languages.join(', ') }         : null,
  ].filter((x): x is { emoji: string; value: string } => Boolean(x));

  const preferenceItems = [
    preferredGenders.length > 0
      ? { emoji: '💞', value: preferredGenders.map(abbrevGender).join(', ') }
      : null,
    preferredAgeLabel ? { emoji: '🎂', value: preferredAgeLabel } : null,
  ].filter((x): x is { emoji: string; value: string } => Boolean(x));

  const enterStyle = useScreenEnter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  // Toggle thumb position (off=0, on=18)
  const isOpen  = profile?.is_open_to_connections ?? true;
  const thumbStyle = { transform: [{ translateX: isOpen ? 18 : 0 }] as const };

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

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/onboarding');
  };

  const toggleGlobalOpen = async (value: boolean) => {
    if (!userId || updatingGlobalOpen) return;
    const prevValue = profile?.is_open_to_connections ?? true;

    setUpdatingGlobalOpen(true);
    setProfile((prev) => (prev ? { ...prev, is_open_to_connections: value } : prev));

    const { error } = await supabase
      .from('profiles')
      .update({ is_open_to_connections: value })
      .eq('user_id', userId);

    if (error) {
      setProfile((prev) => (prev ? { ...prev, is_open_to_connections: prevValue } : prev));
      Alert.alert('Update failed', error.message);
    }
    setUpdatingGlobalOpen(false);
  };

  const deleteAccount = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });
      if (error || (data as any)?.ok === false) {
        Alert.alert('Could not delete account', error?.message || (data as any)?.error || 'Unknown error');
        setDeletingAccount(false);
        return;
      }
      await supabase.auth.signOut();
      setShowDeleteModal(false);
      const restoreUntil = (data as any)?.restore_until as string | undefined;
      const restoreText = restoreUntil
        ? ` You can request account restore until ${new Date(restoreUntil).toLocaleDateString()}.`
        : '';
      Alert.alert('Account deletion scheduled', `Your account has been deactivated.${restoreText}`);
      router.replace('/onboarding');
    } finally {
      setDeletingAccount(false);
    }
  };

  const onPressSettingRow = (label: string) => {
    if (label === 'Delete Account') {
      setDeleteStep(1);
      setShowDeleteModal(true);
      return;
    }
    if (label === 'Sign Out') {
      void signOut();
      return;
    }
    if (label === 'Upgrade to Premium') {
      router.push('/premium');
      return;
    }
    if (label === 'Privacy & Safety') {
      router.push('/privacy-safety');
      return;
    }
    if (label === 'Help & Feedback') {
      router.push('/help-feedback');
    }
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
        <ActivityIndicator color={C.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>
        <ScrollView showsVerticalScrollIndicator={false}>

          {/* ── Hero Header ── */}
          <View style={styles.headerBg}>
            <View style={styles.headerContent}>

              {/* Avatar + completion ring */}
              <View style={styles.avatarRingWrap}>
                {/* Track */}
                <View style={styles.ringTrack} />
                {(() => {
                  const frac = completenessScore / COMPLETENESS_TOTAL;
                  const arcColor = completenessScore === COMPLETENESS_TOTAL ? C.success : C.terracotta;
                  const rightRot = (Math.min(frac, 0.5) / 0.5) * 180 - 180;
                  const leftRot  = frac > 0.5 ? ((frac - 0.5) / 0.5) * 180 - 180 : -180;
                  return (
                    <>
                      {/* Right half — covers 0–50% of arc (12 o'clock → 6 o'clock CW) */}
                      <View style={styles.ringHalfClipRight}>
                        <View style={[styles.ringArc, {
                          left: -60,
                          borderTopColor: arcColor,
                          borderRightColor: arcColor,
                          borderBottomColor: 'transparent',
                          borderLeftColor: 'transparent',
                          transform: [{ rotate: `${rightRot}deg` }],
                        }]} />
                      </View>
                      {/* Left half — covers 50–100% of arc (6 o'clock → 12 o'clock CW) */}
                      <View style={styles.ringHalfClipLeft}>
                        <View style={[styles.ringArc, {
                          left: 0,
                          borderTopColor: 'transparent',
                          borderRightColor: 'transparent',
                          borderBottomColor: arcColor,
                          borderLeftColor: arcColor,
                          transform: [{ rotate: `${leftRot}deg` }],
                        }]} />
                      </View>
                    </>
                  );
                })()}
                <TouchableOpacity style={styles.photoWrap} onPress={openPhotoActions} activeOpacity={0.85}>
                  {avatarUri ? (
                    <AvatarImage
                      key={avatarUri}
                      uri={avatarUri}
                      style={styles.photoImage}
                      onError={() => setAvatarUri(null)}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoInitial}>{name[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  {updatingPhoto && (
                    <View style={styles.photoLoadingOverlay}>
                      <ActivityIndicator color={C.white} />
                    </View>
                  )}
                  <View style={styles.cameraBtn}>
                    <Ionicons name="camera" size={13} color={C.white} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={styles.name}>{name}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {age ? <Text style={styles.metaText}>{age}</Text> : null}
                {age ? <View style={styles.metaDot} /> : null}
                <Ionicons name="location-outline" size={12} color={C.brownLight} />
                <Text style={styles.metaText}>{city}</Text>
              </View>

              {profile && (
                <View style={styles.headerActionsRow}>
                  <TouchableOpacity
                    style={styles.headerActionItem}
                    onPress={() => router.push('/profile-setup')}
                    activeOpacity={0.8}
                  >
                    <View style={styles.headerActionControl}>
                      <Ionicons name="pencil-outline" size={22} color={C.white} />
                    </View>
                    <Text style={styles.headerActionLabel}>Edit Profile</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.headerActionItem}
                    onPress={() => { void toggleGlobalOpen(!(profile.is_open_to_connections ?? true)); }}
                    activeOpacity={0.8}
                    disabled={updatingGlobalOpen}
                  >
                    <View style={[
                      styles.toggleTrack,
                      (profile.is_open_to_connections ?? true) && styles.toggleTrackOn,
                    ]}>
                      <View style={[styles.toggleThumb, thumbStyle]} />
                    </View>
                    <Text style={styles.headerActionLabel}>Connections</Text>
                  </TouchableOpacity>
                </View>
              )}

            </View>
          </View>

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
                  <Ionicons name="images-outline" size={26} color={C.muted} />
                </View>
                <Text style={styles.galleryEmptyTitle}>Add photos</Text>
                <Text style={styles.galleryEmptySubtext}>
                  Profiles with photos get far more connections
                </Text>
                <View style={styles.galleryEmptyBtn}>
                  <Ionicons name="add" size={14} color={C.white} />
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
                        <Ionicons name="close" size={11} color={C.white} />
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
                    <Ionicons name="add" size={26} color={C.terracotta} />
                    <Text style={styles.addPhotoLabel}>Add</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>

          {/* ── About Me (identity) ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About Me</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {identityItems.length > 0 ? (
                <View style={styles.detailChips}>
                  {identityItems.map((item) => (
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
                    Add your identity details to help others know you better.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Preferences ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {preferenceItems.length > 0 ? (
                <View style={styles.detailChips}>
                  {preferenceItems.map((item) => (
                    <View key={item.emoji + item.value} style={styles.detailChip}>
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
                    Add your match preferences to get better introductions.
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Account ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              <TouchableOpacity
                style={[styles.settingsRow, styles.settingsRowDivider]}
                onPress={() => Alert.alert('Identity Verification', "Coming soon \u2014 verify your identity to build trust in your community.")}
                activeOpacity={0.7}
              >
                <View style={[styles.settingsIcon, { backgroundColor: 'rgba(201,168,76,0.12)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={C.gold} />
                </View>
                <Text style={styles.settingsLabel}>Verify Identity</Text>
                <View style={styles.unverifiedBadge}>
                  <Text style={styles.unverifiedText}>Unverified</Text>
                </View>
              </TouchableOpacity>
              {settingsRows.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[
                    styles.settingsRow,
                    i < settingsRows.length - 1 && styles.settingsRowDivider,
                    'accent' in row && row.accent && styles.settingsRowPremium,
                  ]}
                  onPress={() => onPressSettingRow(row.label)}
                  activeOpacity={0.7}
                  disabled={deletingAccount && row.label === 'Delete Account'}
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
                        'danger' in row && row.danger ? C.error :
                        'accent' in row && row.accent ? C.gold :
                        C.brownMid
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
                  ) : row.label === 'Delete Account' && deletingAccount ? (
                    <ActivityIndicator size="small" color={C.error} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
        </Animated.View>
      </SafeAreaView>

      {/* ── Delete Account Modal ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deletingAccount) setShowDeleteModal(false); }}
      >
        <View style={styles.deleteOverlay}>
          <TouchableOpacity
            style={styles.deleteBackdrop}
            activeOpacity={1}
            onPress={() => { if (!deletingAccount) setShowDeleteModal(false); }}
          />
          <View style={styles.deleteSheet}>
            <View style={styles.deleteHandle} />

            {deleteStep === 1 ? (
              <>
                <View style={styles.deleteIconWrap}>
                  <Ionicons name="person-remove-outline" size={28} color={Colors.terracotta} />
                </View>
                <Text style={styles.deleteTitle}>Delete your account?</Text>
                <Text style={styles.deleteBody}>
                  Your account will be <Text style={styles.deleteBold}>deactivated immediately</Text> and permanently deleted after 30 days.
                </Text>
                <View style={styles.deleteRestoreBox}>
                  <Ionicons name="refresh-circle-outline" size={18} color={Colors.terracotta} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deleteRestoreTitle}>30-day restore window</Text>
                    <Text style={styles.deleteRestoreBody}>
                      Changed your mind? Email us within 30 days to recover everything — profile, groups, and connections.
                    </Text>
                  </View>
                </View>
                <View style={styles.deleteActions}>
                  <TouchableOpacity
                    style={styles.deleteCancelBtn}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <Text style={styles.deleteCancelText}>Keep account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteNextBtn}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={styles.deleteNextText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.deleteIconWrap, styles.deleteIconWrapRed]}>
                  <Ionicons name="trash-outline" size={28} color={Colors.error} />
                </View>
                <Text style={styles.deleteTitle}>This is permanent</Text>
                <Text style={styles.deleteBody}>
                  Deleting your account removes your profile, groups, events, and connections — all of it — after the 30-day window closes.
                </Text>
                <Text style={styles.deleteNote}>
                  You can still request a restore within 30 days by emailing support.
                </Text>
                <View style={styles.deleteActions}>
                  <TouchableOpacity
                    style={styles.deleteCancelBtn}
                    onPress={() => setDeleteStep(1)}
                    disabled={deletingAccount}
                  >
                    <Text style={styles.deleteCancelText}>Go back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteConfirmBtn, deletingAccount && styles.deleteConfirmBtnDisabled]}
                    onPress={() => void deleteAccount()}
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.deleteConfirmText}>Delete my account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(C: typeof Colors) { return StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1, backgroundColor: C.cream },
  safe: { flex: 1 },

  // ── Header ──
  headerBg: {
    backgroundColor: C.brown,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 36,
    shadowColor: C.ink,
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

  // Avatar ring
  avatarRingWrap: {
    width: 120,
    height: 120,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  ringTrack: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ringHalfClipRight: {
    position: 'absolute',
    width: 60,
    height: 120,
    right: 0,
    overflow: 'hidden',
  },
  ringHalfClipLeft: {
    position: 'absolute',
    width: 60,
    height: 120,
    left: 0,
    overflow: 'hidden',
  },
  ringArc: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  photoWrap: { position: 'relative', width: 108, height: 108 },
  photoPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: C.terracotta,
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
    backgroundColor: C.brownMid,
  },
  photoLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 54,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: { fontSize: 44, fontWeight: '900', color: C.white },
  cameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.brown,
  },

  // Name & meta
  name: { fontSize: 26, fontWeight: '900', color: C.white, marginBottom: 6, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  metaText: { fontSize: 13, color: C.brownLight },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.brownLight },

  // Header actions inside avatar card
  headerActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 28,
    marginTop: 16,
  },
  headerActionItem: {
    alignItems: 'center',
    gap: 6,
  },
  headerActionControl: {
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionLabel: {
    fontSize: 11,
    color: C.brownLight,
    fontWeight: '600',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  toggleTrackOn: {
    backgroundColor: C.olive,
  },
  toggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.white,
    top: 3,
    left: 3,
  },

  // ── Sections ──
  section: { paddingHorizontal: Spacing.lg, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  sectionMeta: {
    fontSize: 11,
    color: C.muted,
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
    color: C.muted,
    lineHeight: 18,
    marginBottom: 10,
    marginTop: -6,
  },

  // ── Card ──
  card: {
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing.md,
  },
  cardNoPad: { padding: 0, overflow: 'hidden' },

  // ── Gallery ──
  galleryEmptyCard: {
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
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
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  galleryEmptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  galleryEmptySubtext: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
  galleryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: C.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  galleryEmptyBtnText: { fontSize: 13, color: C.white, fontWeight: '700' },

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
    backgroundColor: C.paper,
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
    color: C.white,
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
    borderColor: C.borderDark,
    backgroundColor: C.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoLabel: { fontSize: 11, color: C.terracotta, fontWeight: '700' },

  // ── Bio ──
  bioText: { fontSize: 14, color: C.brownMid, lineHeight: 23 },
  bioEmpty: {
    fontSize: 14,
    color: C.muted,
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
  infoRowDivider: { borderTopWidth: 1, borderTopColor: C.border },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: { fontSize: 19 },
  infoText: { flex: 1 },
  infoFieldLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, color: C.ink, fontWeight: '600' },

  // ── Settings ──
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingsRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  settingsRowPremium: { backgroundColor: 'rgba(201,168,76,0.06)' },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: { backgroundColor: 'rgba(201,168,76,0.12)' },
  settingsIconDanger: { backgroundColor: 'rgba(217,79,79,0.1)' },
  settingsLabel: { flex: 1, fontSize: 14, color: C.ink, fontWeight: '500' },
  settingsLabelDanger: { color: C.error },
  settingsLabelAccent: { color: C.gold, fontWeight: '600' },
  premiumBadge: {
    backgroundColor: C.gold,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: { fontSize: 9, color: C.white, fontWeight: '800', letterSpacing: 0.5 },
  unverifiedBadge: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  unverifiedText: { fontSize: 10, color: C.gold, fontWeight: '700', letterSpacing: 0.2 },

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
    backgroundColor: C.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  detailChipEmoji: { fontSize: 13 },
  detailChipValue: { fontSize: 13, color: C.ink, fontWeight: '600' },

  // ── Delete Account Modal ──
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  deleteSheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  deleteHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  deleteIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(196,98,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteIconWrapRed: { backgroundColor: 'rgba(217,79,79,0.10)' },
  deleteTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 10,
    textAlign: 'center',
  },
  deleteBody: {
    fontSize: 14,
    color: C.brownMid,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
  },
  deleteBold: { fontWeight: '700', color: C.ink },
  deleteRestoreBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(196,98,45,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.18)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 22,
  },
  deleteRestoreTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.terracotta,
    marginBottom: 3,
  },
  deleteRestoreBody: {
    fontSize: 12,
    color: C.brownMid,
    lineHeight: 18,
  },
  deleteNote: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 22,
    marginTop: -4,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  deleteCancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelText: { fontSize: 15, fontWeight: '600', color: C.brownMid },
  deleteNextBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: C.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteNextText: { fontSize: 15, fontWeight: '700', color: C.white },
  deleteConfirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtnDisabled: { opacity: 0.55 },
  deleteConfirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },
}); }
