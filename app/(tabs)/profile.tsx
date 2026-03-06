import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Alert,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  UIManager,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import RAnimated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const LAYOUT_SPRING = {
  duration: 280,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};
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

const COMPLETENESS_TOTAL = 7;
const INTENT_OPTIONS = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating', label: 'Dating' },
  { value: 'long_term', label: 'Long-term' },
  { value: 'marriage', label: 'Marriage' },
] as const;
const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
] as const;

type EditableField =
  | 'bio'
  | 'birth_date'
  | 'ethnicity'
  | 'gender'
  | 'religion'
  | 'languages'
  | 'intent'
  | 'preferred_genders'
  | 'preferred_age';

type ProfileData = {
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
  dating_mode_enabled: boolean | null;
  verification_status: string | null;
  avatar_url: string | null;
  photo_urls: string[] | null;
};

const PROFILE_BASE_SELECT =
  'full_name, city, bio, birth_date, ethnicity, religion, languages, intent, gender, preferred_genders, preferred_age_min, preferred_age_max, is_open_to_connections, verification_status, avatar_url, photo_urls';
const PROFILE_SELECT_WITH_DATING_MODE = `${PROFILE_BASE_SELECT}, dating_mode_enabled`;

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
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingSecondaryValue, setEditingSecondaryValue] = useState('');
  const [editingMultiValue, setEditingMultiValue] = useState<string[]>([]);
  const [editingDate, setEditingDate] = useState<Date>(new Date());
  const [showBirthDateSheet, setShowBirthDateSheet] = useState(false);

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

    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_WITH_DATING_MODE)
      .eq('user_id', resolvedUserId)
      .maybeSingle();

    let profileData = data as ProfileData | null;
    if (error?.message?.toLowerCase().includes('dating_mode_enabled')) {
      const { data: fallbackData } = await supabase
        .from('profiles')
        .select(PROFILE_BASE_SELECT)
        .eq('user_id', resolvedUserId)
        .maybeSingle();
      profileData = fallbackData ? ({ ...fallbackData, dating_mode_enabled: false } as ProfileData) : null;
    }

    setProfile(profileData ?? null);

    const avatarValue = profileData?.avatar_url ?? null;
    if (avatarValue) {
      const uri = await resolvePhotoUri(avatarValue);
      setAvatarUri(uri ?? null);
    } else {
      setAvatarUri(null);
    }

    const mergedPaths = [
      ...(profileData?.avatar_url ? [profileData.avatar_url] : []),
      ...(profileData?.photo_urls ?? []),
    ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

    if (mergedPaths.length > 0) {
      const resolved = await Promise.all(mergedPaths.map((v) => resolvePhotoUri(v)));
      const photos = mergedPaths
        .map((path, index) => ({
          path,
          uri: resolved[index],
          isAvatar: Boolean(profileData?.avatar_url && path === profileData.avatar_url),
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

  const name            = profile?.full_name?.trim() || 'Complete Profile';
  const city            = profile?.city ?? 'Unknown city';
  const ethnicity       = profile?.ethnicity ?? null;
  const religion        = profile?.religion ?? null;
  const languages       = profile?.languages ?? [];
  const preferredGenders = profile?.preferred_genders ?? [];
  const intentLabelMap: Record<string, string> = {
    friendship: 'Friendship',
    dating: 'Dating',
    long_term: 'Long-term',
    marriage: 'Marriage',
  };
  const intentLabel = profile?.intent ? (intentLabelMap[profile.intent] ?? profile.intent) : null;
  const birthDateLabel = profile?.birth_date
    ? new Date(`${profile.birth_date}T00:00:00.000Z`).toLocaleDateString()
    : null;

  const preferredAgeLabel     =
    profile?.preferred_age_min != null && profile?.preferred_age_max != null
      ? `${profile.preferred_age_min}–${profile.preferred_age_max} years`
      : null;

  const aboutMeRows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string | null; field: EditableField }[] = [
    { icon: 'calendar-outline',             label: 'Birth Date', value: birthDateLabel, field: 'birth_date' },
    { icon: 'globe-outline',                label: 'Ethnicity',  value: ethnicity, field: 'ethnicity' },
    { icon: 'person-outline',               label: 'Gender',     value: profile?.gender ?? null, field: 'gender' },
    { icon: 'leaf-outline',                 label: 'Religion',   value: religion, field: 'religion' },
    { icon: 'chatbubble-ellipses-outline',  label: 'Languages',  value: languages.length > 0 ? languages.join(', ') : null, field: 'languages' },
  ];

  const preferencesRows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string | null; field: EditableField }[] = [
    { icon: 'sparkles-outline', label: 'Connection Goal', value: intentLabel, field: 'intent' },
    { icon: 'heart-outline',    label: 'Interested in',  value: preferredGenders.length > 0 ? preferredGenders.join(', ') : null, field: 'preferred_genders' },
    { icon: 'calendar-outline', label: 'Preferred Age',  value: preferredAgeLabel, field: 'preferred_age' },
  ];

  const enterStyle = useScreenEnter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);

  const reducedMotion   = useReducedMotion();
  // Edit row — slides down into the expanding row, exits quickly so LayoutAnimation can spring-close cleanly
  const editEnterAnim   = reducedMotion ? FadeIn.duration(60)     : FadeInDown.duration(200);
  const editExitAnim    = reducedMotion ? FadeOut.duration(60)    : FadeOut.duration(80);
  // View row — fades back in after row collapses, fades out quickly when opening edit
  const viewEnterAnim   = reducedMotion ? FadeIn.duration(60)     : FadeIn.duration(180);
  const viewExitAnim    = reducedMotion ? FadeOut.duration(60)    : FadeOut.duration(60);
  // Inner controls stagger (fires after the row wrapper animation begins)
  const inputEnterAnim  = reducedMotion ? FadeIn.duration(60)     : FadeIn.duration(160).delay(60);

  // Toggle thumb position (off=0, on=18)
  const isOpen  = profile?.is_open_to_connections ?? true;
  const thumbStyle = { transform: [{ translateX: isOpen ? 18 : 0 }] as const };
  const datingModeOn = profile?.dating_mode_enabled ?? false;

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

  const updateProfilePatch = async (patch: Partial<ProfileData>) => {
    if (!userId || !profile) return false;
    const prev = profile;
    setProfile({ ...prev, ...patch });
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
    if (error) {
      setProfile(prev);
      Alert.alert('Update failed', error.message);
      return false;
    }
    return true;
  };

  const closeEditRow = () => {
    LayoutAnimation.configureNext(LAYOUT_SPRING);
    setEditingField(null);
  };

  const openInlineEditor = (field: EditableField) => {
    if (!profile) return;
    if (field === 'birth_date') {
      const parsed = profile.birth_date ? new Date(`${profile.birth_date}T00:00:00.000Z`) : new Date();
      setEditingDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
      setShowBirthDateSheet(true);
      return;
    }
    LayoutAnimation.configureNext(LAYOUT_SPRING);
    setEditingField(field);
    if (field === 'preferred_age') {
      setEditingValue(profile.preferred_age_min?.toString() ?? '');
      setEditingSecondaryValue(profile.preferred_age_max?.toString() ?? '');
    } else if (field === 'preferred_genders') {
      setEditingMultiValue(profile.preferred_genders ?? []);
      setEditingValue('');
    } else if (field === 'languages') {
      setEditingValue((profile.languages ?? []).join(', '));
    } else if (field === 'bio') {
      setEditingValue(profile.bio ?? '');
    } else if (field === 'ethnicity') {
      setEditingValue(profile.ethnicity ?? '');
    } else if (field === 'religion') {
      setEditingValue(profile.religion ?? '');
    } else if (field === 'gender') {
      setEditingValue(profile.gender ?? '');
    } else if (field === 'intent') {
      setEditingValue(profile.intent ?? '');
    }
  };

  const saveBirthDateFromSheet = async () => {
    const iso = `${editingDate.getUTCFullYear()}-${String(editingDate.getUTCMonth() + 1).padStart(2, '0')}-${String(editingDate.getUTCDate()).padStart(2, '0')}`;
    const ok = await updateProfilePatch({ birth_date: iso });
    if (ok) setShowBirthDateSheet(false);
  };

  const renderFieldInput = (field: EditableField) => {
    // ── Single-select chips: save immediately on tap ──
    if (field === 'gender') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {GENDER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingValue === opt.value && styles.inlineOptionChipActive]}
              onPress={() => {
                setEditingValue(opt.value);
                void updateProfilePatch({ gender: opt.value }).then(closeEditRow);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingValue === opt.value && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (field === 'intent') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {INTENT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingValue === opt.value && styles.inlineOptionChipActive]}
              onPress={() => {
                setEditingValue(opt.value);
                void updateProfilePatch({ intent: opt.value }).then(closeEditRow);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingValue === opt.value && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    // ── Multi-select chips: Done chip to commit ──
    if (field === 'preferred_genders') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {GENDER_OPTIONS.map((opt) => {
            const selected = editingMultiValue.includes(opt.value);
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.inlineOptionChip, selected && styles.inlineOptionChipActive]}
                onPress={() => setEditingMultiValue((prev) =>
                  prev.includes(opt.value) ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                )}
                activeOpacity={0.8}
              >
                <Text style={[styles.inlineOptionText, selected && styles.inlineOptionTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      );
    }
    // ── Two-input preferred age with Done chip ──
    if (field === 'preferred_age') {
      return (
        <View style={styles.inlineAgeRow}>
          <TextInput
            value={editingValue}
            onChangeText={setEditingValue}
            placeholder="Min age"
            keyboardType="number-pad"
            style={[styles.inlineInput, styles.inlineInputHalf]}
            autoFocus
            placeholderTextColor={C.muted}
          />
          <TextInput
            value={editingSecondaryValue}
            onChangeText={setEditingSecondaryValue}
            placeholder="Max age"
            keyboardType="number-pad"
            style={[styles.inlineInput, styles.inlineInputHalf]}
            placeholderTextColor={C.muted}
          />
        </View>
      );
    }
    // ── Text input with auto-save on blur ──
    const handleBlur = () => {
      if (field === 'languages') {
        const parsed = editingValue.split(',').map((v) => v.trim()).filter(Boolean);
        void updateProfilePatch({ languages: parsed }).then(closeEditRow);
      } else if (field === 'ethnicity') {
        void updateProfilePatch({ ethnicity: editingValue.trim() || null }).then(closeEditRow);
      } else if (field === 'religion') {
        void updateProfilePatch({ religion: editingValue.trim() || null }).then(closeEditRow);
      }
    };
    return (
      <TextInput
        value={editingValue}
        onChangeText={setEditingValue}
        onBlur={handleBlur}
        placeholder={field === 'languages' ? 'e.g. English, Amharic' : 'Enter value'}
        style={styles.inlineInput}
        autoFocus
        autoCapitalize="sentences"
        placeholderTextColor={C.muted}
      />
    );
  };

  const commitActiveEdit = async () => {
    if (!editingField) return;
    if (editingField === 'bio') return;

    if (editingField === 'preferred_genders') {
      await updateProfilePatch({ preferred_genders: editingMultiValue });
      closeEditRow();
      return;
    }

    if (editingField === 'preferred_age') {
      const min = editingValue.trim() ? Number(editingValue.trim()) : null;
      const max = editingSecondaryValue.trim() ? Number(editingSecondaryValue.trim()) : null;
      if ((min !== null && Number.isNaN(min)) || (max !== null && Number.isNaN(max)) || (min !== null && max !== null && min > max)) {
        closeEditRow();
        return;
      }
      await updateProfilePatch({ preferred_age_min: min, preferred_age_max: max });
      closeEditRow();
      return;
    }

    if (editingField === 'languages') {
      const parsed = editingValue.split(',').map((v) => v.trim()).filter(Boolean);
      await updateProfilePatch({ languages: parsed });
      closeEditRow();
      return;
    }

    if (editingField === 'ethnicity') {
      await updateProfilePatch({ ethnicity: editingValue.trim() || null });
      closeEditRow();
      return;
    }

    if (editingField === 'religion') {
      await updateProfilePatch({ religion: editingValue.trim() || null });
      closeEditRow();
      return;
    }

    closeEditRow();
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

  const toggleDatingMode = async (value: boolean) => {
    if (!userId || updatingGlobalOpen) return;
    const prevValue = profile?.dating_mode_enabled ?? false;

    setUpdatingGlobalOpen(true);
    setProfile((prev) => (prev ? { ...prev, dating_mode_enabled: value } : prev));

    const { error } = await supabase
      .from('profiles')
      .update({ dating_mode_enabled: value })
      .eq('user_id', userId);

    if (error) {
      setProfile((prev) => (prev ? { ...prev, dating_mode_enabled: prevValue } : prev));
      if (error.message?.toLowerCase().includes('dating_mode_enabled')) {
        Alert.alert('Update failed', 'Dating Mode is not available yet. Please run the latest database migration.');
      } else {
        Alert.alert('Update failed', error.message);
      }
    } else if (value) {
      router.push('/dating-mode');
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
    if (label === 'Notifications') {
      router.push('/notifications');
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

  const verificationLabel = (() => {
    const status = profile?.verification_status ?? 'unverified';
    if (status === 'verified') return 'Verified';
    if (status === 'pending') return 'Pending';
    if (status === 'requires_input') return 'Needs action';
    if (status === 'failed') return 'Failed';
    if (status === 'canceled') return 'Canceled';
    return 'Unverified';
  })();

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
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onTouchStart={() => {
            if (editingField && editingField !== 'bio') {
              void commitActiveEdit();
            }
          }}
        >

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
                    <Text style={styles.headerActionLabel}>Open to Connect</Text>
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

          {/* ── Bio + Identity merged under "About" ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            {editingField === 'bio' ? (
              <RAnimated.View key="bio-edit" entering={editEnterAnim} exiting={editExitAnim} style={styles.bioDashedCard}>
                <RAnimated.View entering={inputEnterAnim}>
                  <TextInput
                    value={editingValue}
                    onChangeText={setEditingValue}
                    onBlur={() => void updateProfilePatch({ bio: editingValue.trim() || null }).then(closeEditRow)}
                    multiline
                    style={styles.bioInput}
                    autoFocus
                    placeholder="Write something about yourself..."
                    placeholderTextColor={C.muted}
                  />
                </RAnimated.View>
              </RAnimated.View>
            ) : (
              <RAnimated.View key="bio-view" entering={viewEnterAnim} exiting={viewExitAnim}>
                <TouchableOpacity style={styles.bioDashedCard} activeOpacity={0.85} onPress={() => openInlineEditor('bio')}>
                  <Text style={profile?.bio?.trim() ? styles.bioText : styles.bioEmpty}>
                    {profile?.bio?.trim() || 'No bio yet. Tap to add.'}
                  </Text>
                </TouchableOpacity>
              </RAnimated.View>
            )}
          </View>

          {/* ── About Me (identity) ── */}
          <View style={styles.section}>
            <View style={[styles.card, styles.cardNoPad]}>
              {aboutMeRows.map((row, i) => {
                const isEditing = editingField === row.field;
                if (isEditing) {
                  return (
                    <RAnimated.View
                      key={`${row.label}-edit`}
                      entering={editEnterAnim}
                      exiting={editExitAnim}
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, styles.infoRowEditing, { paddingHorizontal: Spacing.md }]}
                    >
                      <View style={[styles.infoIconBox, { alignSelf: 'flex-start', marginTop: 2 }]}>
                        <Ionicons name={row.icon} size={18} color={C.terracotta} />
                      </View>
                      <View style={[styles.infoText, { gap: 8 }]}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <RAnimated.View entering={inputEnterAnim}>
                          {renderFieldInput(row.field)}
                        </RAnimated.View>
                      </View>
                    </RAnimated.View>
                  );
                }
                return (
                  <RAnimated.View
                    key={`${row.label}-view`}
                    entering={viewEnterAnim}
                    exiting={viewExitAnim}
                  >
                    <TouchableOpacity
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, { paddingHorizontal: Spacing.md }]}
                      activeOpacity={0.8}
                      onPress={() => openInlineEditor(row.field)}
                    >
                      <View style={styles.infoIconBox}>
                        <Ionicons name={row.icon} size={18} color={C.brownMid} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <Text style={[styles.infoValue, !row.value && styles.infoValueEmpty]} numberOfLines={2}>
                          {row.value ?? 'Not set'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                    </TouchableOpacity>
                  </RAnimated.View>
                );
              })}
            </View>
          </View>

          {/* ── Preferences ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Preferences</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {preferencesRows.map((row, i) => {
                const isEditing = editingField === row.field;
                if (isEditing) {
                  return (
                    <RAnimated.View
                      key={`${row.label}-edit`}
                      entering={editEnterAnim}
                      exiting={editExitAnim}
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, styles.infoRowEditing, { paddingHorizontal: Spacing.md }]}
                    >
                      <View style={[styles.infoIconBox, { alignSelf: 'flex-start', marginTop: 2 }]}>
                        <Ionicons name={row.icon} size={18} color={C.terracotta} />
                      </View>
                      <View style={[styles.infoText, { gap: 8 }]}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <RAnimated.View entering={inputEnterAnim}>
                          {renderFieldInput(row.field)}
                        </RAnimated.View>
                      </View>
                    </RAnimated.View>
                  );
                }
                return (
                  <RAnimated.View
                    key={`${row.label}-view`}
                    entering={viewEnterAnim}
                    exiting={viewExitAnim}
                  >
                    <TouchableOpacity
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, { paddingHorizontal: Spacing.md }]}
                      activeOpacity={0.8}
                      onPress={() => openInlineEditor(row.field)}
                    >
                      <View style={styles.infoIconBox}>
                        <Ionicons name={row.icon} size={18} color={C.brownMid} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <Text style={[styles.infoValue, !row.value && styles.infoValueEmpty]} numberOfLines={1}>
                          {row.value ?? 'Not set'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                    </TouchableOpacity>
                  </RAnimated.View>
                );
              })}
            </View>
          </View>

          {/* ── Account ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              <View style={[styles.settingsRow, styles.settingsRowDivider]}>
                <View style={styles.settingsIcon}>
                  <Ionicons name="heart-outline" size={18} color={C.brownMid} />
                </View>
                <View style={styles.settingsToggleLabelWrap}>
                  <Text style={styles.settingsLabel}>Dating Mode</Text>
                  <Text style={styles.settingsSubLabel}>
                    {datingModeOn ? 'On' : 'Off'}
                  </Text>
                </View>
                <Switch
                  value={datingModeOn}
                  onValueChange={(value) => { void toggleDatingMode(value); }}
                  disabled={updatingGlobalOpen}
                  thumbColor={Platform.OS === 'android' ? C.white : undefined}
                  trackColor={{ false: C.borderDark, true: C.olive }}
                />
              </View>
              {datingModeOn ? (
                <TouchableOpacity
                  style={[styles.settingsRow, styles.settingsRowDivider]}
                  onPress={() => router.push('/dating-mode')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.settingsIcon, { backgroundColor: 'rgba(122,140,92,0.14)' }]}>
                    <Ionicons name="flame-outline" size={18} color={C.olive} />
                  </View>
                  <Text style={styles.settingsLabel}>Open Dating Mode</Text>
                  <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.settingsRow, styles.settingsRowDivider]}
                onPress={() => router.push('/verify-identity')}
                activeOpacity={0.7}
              >
                <View style={[styles.settingsIcon, { backgroundColor: 'rgba(201,168,76,0.12)' }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={C.gold} />
                </View>
                <Text style={styles.settingsLabel}>Photo Verification</Text>
                <View style={[styles.unverifiedBadge, verificationLabel === 'Verified' && styles.verifiedBadge]}>
                  <Text style={[styles.unverifiedText, verificationLabel === 'Verified' && styles.verifiedText]}>
                    {verificationLabel}
                  </Text>
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

      {/* ── Birth Date Picker Sheet ── */}
      <Modal
        visible={showBirthDateSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBirthDateSheet(false)}
      >
        <View style={styles.dateSheetOverlay}>
          <TouchableOpacity
            style={styles.dateSheetBackdrop}
            activeOpacity={1}
            onPress={() => setShowBirthDateSheet(false)}
          />
          <View style={styles.dateSheet}>
            <View style={styles.dateSheetHeader}>
              <TouchableOpacity onPress={() => setShowBirthDateSheet(false)} activeOpacity={0.8}>
                <Text style={styles.dateSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.dateSheetTitle}>Select Birth Date</Text>
              <TouchableOpacity onPress={() => void saveBirthDateFromSheet()} activeOpacity={0.8}>
                <Text style={styles.dateSheetSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={editingDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(event, date) => {
                if (date) setEditingDate(date);
                if (Platform.OS === 'android') {
                  if (event.type === 'set' && date) {
                    void updateProfilePatch({
                      birth_date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
                    }).then((ok) => {
                      if (ok) setShowBirthDateSheet(false);
                    });
                  } else if (event.type === 'dismissed') {
                    setShowBirthDateSheet(false);
                  }
                }
              }}
            />
          </View>
        </View>
      </Modal>

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
  bioDashedCard: {
    backgroundColor: C.warmWhite,
    borderWidth: 1,
    borderColor: C.borderDark,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    padding: Spacing.md,
    minHeight: 94,
    justifyContent: 'flex-start',
  },
  bioInput: {
    fontSize: 14,
    color: C.ink,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    padding: 0,
  },
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
  infoRowEditing: { alignItems: 'flex-start', paddingVertical: 14, backgroundColor: 'rgba(196,98,45,0.03)' },
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
  infoValueEmpty: { color: C.muted, fontStyle: 'italic', fontWeight: '400' },

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
  settingsToggleLabelWrap: { flex: 1, gap: 2 },
  settingsSubLabel: { fontSize: 12, color: C.muted, fontWeight: '500' },
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
  verifiedBadge: {
    backgroundColor: 'rgba(126,150,94,0.16)',
    borderColor: 'rgba(126,150,94,0.6)',
  },
  verifiedText: { color: C.olive },

  // ── Inline Edit (in-place) ──
  inlineInput: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
    backgroundColor: C.paper,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: C.ink,
  },
  inlineAgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineInputHalf: {
    flex: 1,
  },
  inlineOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineOptionChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.warmWhite,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inlineOptionChipActive: {
    borderColor: C.terracotta,
    backgroundColor: 'rgba(196,98,45,0.1)',
  },
  inlineOptionText: {
    fontSize: 13,
    color: C.brownMid,
    fontWeight: '600',
  },
  inlineOptionTextActive: {
    color: C.terracotta,
  },
  inlineDoneChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  inlineDoneChipText: {
    fontSize: 13,
    color: C.white,
    fontWeight: '700',
  },

  // ── Birth Date Sheet ──
  dateSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  dateSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dateSheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  dateSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  dateSheetTitle: {
    fontSize: 14,
    color: C.ink,
    fontWeight: '700',
  },
  dateSheetCancel: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '600',
  },
  dateSheetSave: {
    fontSize: 14,
    color: C.terracotta,
    fontWeight: '700',
  },

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
