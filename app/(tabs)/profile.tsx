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
  { icon: 'notifications-outline', label: 'Notifications', value: '' },
  { icon: 'shield-outline', label: 'Privacy & Safety', value: '' },
  { icon: 'star-outline', label: 'Upgrade to Premium', value: '', accent: true },
  { icon: 'help-circle-outline', label: 'Help & Feedback', value: '' },
  { icon: 'log-out-outline', label: 'Sign Out', value: '', danger: true },
];

function formatIntent(intent: string) {
  switch (intent) {
    case 'long_term':
      return 'Long-term';
    case 'friendship':
      return 'Friendship';
    case 'marriage':
      return 'Marriage';
    default:
      return 'Dating';
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const myGroups = mockGroups.filter((g) => g.isMember);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [galleryUris, setGalleryUris] = useState<string[]>([]);
  const [profile, setProfile] = useState<{
    full_name: string;
    city: string | null;
    bio: string | null;
    birth_date: string | null;
    ethnicity: string | null;
    religion: string | null;
    languages: string[] | null;
    intent: string;
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

    // Try signed URL first (works for both public and private buckets)
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(value, 60 * 60);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    // Fall back to public URL (works if bucket is set to public)
    const { data: publicData } = supabase.storage.from('profile-photos').getPublicUrl(value);
    if (publicData?.publicUrl) {
      return publicData.publicUrl;
    }

    return null;
  };

  const loadProfile = async (uid?: string) => {
    const resolvedUserId = uid ?? userId;
    if (!resolvedUserId) {
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('full_name, city, bio, birth_date, ethnicity, religion, languages, intent, avatar_url, photo_urls')
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

    const photoValues = data?.photo_urls ?? [];
    if (photoValues.length > 0) {
      const resolved = await Promise.all(photoValues.map((value: string) => resolvePhotoUri(value)));
      setGalleryUris(resolved.filter((v): v is string => Boolean(v)));
    } else {
      setGalleryUris([]);
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
    if (!profile?.birth_date) {
      return null;
    }
    const birthYear = new Date(profile.birth_date).getFullYear();
    if (!birthYear) {
      return null;
    }
    return new Date().getFullYear() - birthYear;
  }, [profile?.birth_date]);

  const name = profile?.full_name ?? 'New Member';
  const city = profile?.city ?? 'Unknown city';
  const bio = profile?.bio ?? 'No bio added yet.';
  const ethnicity = profile?.ethnicity ?? 'Habesha';
  const religion = profile?.religion ?? 'Not set';
  const languages = profile?.languages ?? [];
  const intent = formatIntent(profile?.intent ?? 'dating');
  const firstPhoto = avatarUri;

  const toggleGroup = (id: string, val: boolean) => {
    setOpenGroups((prev) => ({ ...prev, [id]: val }));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/onboarding');
  };

  const updatePhoto = async () => {
    if (!userId || updatingPhoto) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library permission is required to update your avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    try {
      setUpdatingPhoto(true);
      const asset = result.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' :
        contentType === 'image/jpeg' ? 'jpg' :
        'jpg';
      const filePath = `${userId}/${Date.now()}-avatar.${ext}`;

      let fileData: ArrayBuffer;
      if (asset.base64) {
        const dataUrl = `data:${contentType};base64,${asset.base64}`;
        const response = await fetch(dataUrl);
        fileData = await response.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        fileData = await response.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, fileData, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        Alert.alert('Upload failed', uploadError.message);
        setUpdatingPhoto(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('user_id', userId);

      if (updateError) {
        Alert.alert('Update failed', updateError.message);
        setUpdatingPhoto(false);
        return;
      }

      await loadProfile(userId);
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Could not update profile photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const openPhotoActions = () => {
    const hasPhoto = Boolean(firstPhoto);
    Alert.alert('Profile photo', 'Choose what you want to update.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Choose new photo',
        onPress: () => void updatePhoto(),
      },
      ...(hasPhoto
        ? [
            {
              text: 'Remove current photo',
              style: 'destructive' as const,
              onPress: async () => {
                if (!userId) {
                  return;
                }
                setUpdatingPhoto(true);
                const { error } = await supabase
                  .from('profiles')
                  .update({ avatar_url: null })
                  .eq('user_id', userId);
                setUpdatingPhoto(false);
                if (error) {
                  Alert.alert('Update failed', error.message);
                  return;
                }
                await loadProfile(userId);
              },
            },
          ]
        : []),
    ]);
  };

  if (loadingProfile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.headerBg}>
            <View style={styles.headerContent}>
              <TouchableOpacity style={styles.photoWrap} onPress={openPhotoActions} activeOpacity={0.85}>
                {firstPhoto ? (
                  <Image
                    key={firstPhoto}
                    source={{ uri: firstPhoto }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoInitial}>{name[0] ?? '?'}</Text>
                  </View>
                )}
                {updatingPhoto ? (
                  <View style={styles.photoLoadingOverlay}>
                    <ActivityIndicator color={Colors.white} />
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.editPhotoBtn}
                  onPress={openPhotoActions}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera" size={14} color={Colors.white} />
                </TouchableOpacity>
              </TouchableOpacity>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.subInfo}>
                {age ? `${age} · ` : ''}{city}
              </Text>
              <TouchableOpacity
                style={styles.editProfileBtn}
                onPress={() => router.push('/profile-setup')}
                activeOpacity={0.85}
              >
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bio */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.bioText}>{bio}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Profile Photos</Text>
            {galleryUris.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {galleryUris.map((uri) => (
                  <Image key={uri} source={{ uri }} style={styles.galleryPhoto} resizeMode="cover" />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyGalleryText}>No profile photos yet.</Text>
            )}
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Identity</Text>
            <View style={styles.tagRow}>
              <View style={styles.tag}><Text style={styles.tagText}>🇪🇹 {ethnicity}</Text></View>
              <View style={styles.tag}><Text style={styles.tagText}>✝️ {religion}</Text></View>
              {languages.map((l) => (
                <View key={l} style={styles.tag}><Text style={styles.tagText}>🗣️ {l}</Text></View>
              ))}
              <View style={styles.tag}><Text style={styles.tagText}>💛 {intent}</Text></View>
            </View>
          </View>

          {/* Openness per group */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Openness Signals</Text>
              <View style={styles.privateTag}>
                <Ionicons name="lock-closed" size={10} color={Colors.muted} />
                <Text style={styles.privateTagText}>Private</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtext}>
              Only visible to you. A reveal only fires when it's mutual and you've genuinely connected.
            </Text>
            {myGroups.map((g) => (
              <View key={g.id} style={styles.openRow}>
                <View style={[styles.openGroupDot, { backgroundColor: g.coverColor }]}>
                  <Text style={styles.openGroupEmoji}>{g.emoji}</Text>
                </View>
                <View style={styles.openGroupInfo}>
                  <Text style={styles.openGroupName}>{g.name}</Text>
                  <Text style={styles.openGroupState}>
                    {openGroups[g.id] ? '🌱 Open to a connection' : 'Not signalling'}
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

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.settingsCard}>
              {settingsRows.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[
                    styles.settingsRow,
                    i < settingsRows.length - 1 && styles.settingsRowBorder,
                  ]}
                  onPress={row.label === 'Sign Out' ? signOut : undefined}
                  activeOpacity={0.7}
                >
                  <View style={[styles.settingsIcon, row.accent && styles.settingsIconAccent, row.danger && styles.settingsIconDanger]}>
                    <Ionicons
                      name={row.icon as any}
                      size={18}
                      color={row.danger ? Colors.error : row.accent ? Colors.terracotta : Colors.brownMid}
                    />
                  </View>
                  <Text style={[styles.settingsLabel, row.danger && styles.settingsLabelDanger, row.accent && styles.settingsLabelAccent]}>
                    {row.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.border} />
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

  headerBg: { backgroundColor: Colors.brown, paddingBottom: 32 },
  headerContent: { alignItems: 'center', paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  photoWrap: { position: 'relative', marginBottom: 14, width: 90, height: 90 },
  photoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.terraLight,
  },
  photoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: Colors.terraLight,
    backgroundColor: Colors.paper,
  },
  photoLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: { fontSize: 38, fontWeight: '900', color: Colors.white },
  editPhotoBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brownMid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },
  name: { fontSize: 24, fontWeight: '900', color: Colors.cream, marginBottom: 4 },
  subInfo: { fontSize: 13, color: Colors.brownLight, marginBottom: 16 },
  editProfileBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  editProfileText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: Spacing.lg,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionSubtext: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  privateTag: {
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
  privateTagText: { fontSize: 9, color: Colors.muted, fontWeight: '600' },

  bioText: { fontSize: 14, color: Colors.brownMid, lineHeight: 22 },
  galleryPhoto: {
    width: 110,
    height: 140,
    borderRadius: Radius.md,
    marginRight: 10,
    backgroundColor: Colors.paper,
  },
  emptyGalleryText: {
    fontSize: 13,
    color: Colors.muted,
    fontStyle: 'italic',
  },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontSize: 12, color: Colors.brownMid, fontWeight: '500' },

  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  openGroupDot: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openGroupEmoji: { fontSize: 22 },
  openGroupInfo: { flex: 1 },
  openGroupName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  openGroupState: { fontSize: 11, color: Colors.muted },

  settingsCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: { backgroundColor: 'rgba(196,98,45,0.1)' },
  settingsIconDanger: { backgroundColor: 'rgba(217,79,79,0.1)' },
  settingsLabel: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '500' },
  settingsLabelDanger: { color: Colors.error },
  settingsLabelAccent: { color: Colors.terracotta, fontWeight: '600' },
});
