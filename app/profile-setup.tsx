import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolveProfilePhotoUrl } from '../lib/services/photoUrls';

const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
] as const;

const RELIGION_OPTIONS = [
  { value: 'Christian', label: 'Christian' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Orthodox', label: 'Orthodox' },
  { value: 'Protestant', label: 'Protestant' },
  { value: 'Muslim', label: 'Muslim' },
  { value: 'Jewish', label: 'Jewish' },
  { value: 'Hindu', label: 'Hindu' },
  { value: 'Buddhist', label: 'Buddhist' },
  { value: 'Sikh', label: 'Sikh' },
  { value: 'Spiritual', label: 'Spiritual' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
] as const;

const ETHNICITY_OPTIONS = [
  { value: 'African', label: 'African' },
  { value: 'Black', label: 'Black' },
  { value: 'Caribbean', label: 'Caribbean' },
  { value: 'East Asian', label: 'East Asian' },
  { value: 'South Asian', label: 'South Asian' },
  { value: 'Southeast Asian', label: 'Southeast Asian' },
  { value: 'Middle Eastern', label: 'Middle Eastern' },
  { value: 'North African', label: 'North African' },
  { value: 'Latino/Hispanic', label: 'Latino/Hispanic' },
  { value: 'White', label: 'White' },
  { value: 'Indigenous', label: 'Indigenous' },
  { value: 'Mixed', label: 'Mixed' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Amharic', label: 'Amharic' },
  { value: 'Tigrinya', label: 'Tigrinya' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Urdu', label: 'Urdu' },
  { value: 'Somali', label: 'Somali' },
  { value: 'Mandarin', label: 'Mandarin' },
  { value: 'Cantonese', label: 'Cantonese' },
  { value: 'Tagalog', label: 'Tagalog' },
  { value: 'Swahili', label: 'Swahili' },
  { value: 'Other', label: 'Other' },
] as const;

type GenderValue = (typeof GENDER_OPTIONS)[number]['value'];

type SelectedPhoto = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
  storagePath?: string | null;
};

const PROFILE_SETUP_BASE_SELECT =
  'full_name, city, birth_date, bio, ethnicity, religion, languages, gender, is_open_to_connections';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [bio, setBio] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [religion, setReligion] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [isOpenToConnections, setIsOpenToConnections] = useState(true);
  const [datingModeEnabled, setDatingModeEnabled] = useState(false);
  const [avatarPhoto, setAvatarPhoto] = useState<SelectedPhoto | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const canSubmit =
    fullName.trim().length >= 2 &&
    !!gender &&
    !saving;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/');
  };

  useEffect(() => {
    const loadExistingProfile = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (sessionError || !user) {
        setInitialLoading(false);
        return;
      }

      const { data: existingProfile, error: profileError } = await supabase
        .from('profiles')
        .select(`${PROFILE_SETUP_BASE_SELECT}, avatar_url`)
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError || !existingProfile) {
        const meta = user.user_metadata ?? {};
        const metaName =
          (meta.full_name as string | undefined) ||
          (meta.name as string | undefined) ||
          ([meta.given_name, meta.family_name].filter(Boolean).join(' ') || '') ||
          '';
        if (metaName) setFullName(metaName);
        setInitialLoading(false);
        return;
      }

      setIsEditMode(true);
      setFullName(existingProfile.full_name ?? '');
      setCity(existingProfile.city ?? '');
      setBirthDate(existingProfile.birth_date ?? '');
      setBio(existingProfile.bio ?? '');
      const existingEthnicity = existingProfile.ethnicity ?? '';
      setEthnicity(
        ETHNICITY_OPTIONS.some((opt) => opt.value === existingEthnicity)
          ? existingEthnicity
          : existingEthnicity
            ? 'Other'
            : ''
      );
      const existingReligion = existingProfile.religion ?? '';
      setReligion(
        RELIGION_OPTIONS.some((opt) => opt.value === existingReligion)
          ? existingReligion
          : existingReligion
            ? 'Other'
            : ''
      );
      const existingLanguages = (existingProfile.languages ?? []) as string[];
      const normalizedLanguages = existingLanguages.filter((lang) =>
        LANGUAGE_OPTIONS.some((opt) => opt.value === lang)
      );
      if (existingLanguages.length > normalizedLanguages.length && !normalizedLanguages.includes('Other')) {
        normalizedLanguages.push('Other');
      }
      setSelectedLanguages(normalizedLanguages);
      const existingGender = existingProfile.gender as GenderValue | null;
      setGender(existingGender && GENDER_OPTIONS.some((g) => g.value === existingGender) ? existingGender : null);
      setIsOpenToConnections(existingProfile.is_open_to_connections ?? true);
      if (existingProfile.avatar_url) {
        const resolvedAvatarUri = await resolveProfilePhotoUrl(existingProfile.avatar_url);
        if (resolvedAvatarUri) {
          setAvatarPhoto({
            uri: resolvedAvatarUri,
            storagePath: existingProfile.avatar_url,
          });
        }
      }
      const { data: datingProfile } = await supabase
        .from('dating_profiles')
        .select('is_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      setDatingModeEnabled(datingProfile?.is_enabled ?? false);
      setInitialLoading(false);
    };

    void loadExistingProfile();
  }, []);

  const addPhoto = async () => {
    if (pickingPhoto) return;
    setError('');

    try {
      setPickingPhoto(true);

      const existingPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
      const permission = existingPermission.granted
        ? existingPermission
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo library permission is required to add profile photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        const asset = result.assets[0];
        setAvatarPhoto({
          uri: asset.uri,
          mimeType: asset.mimeType,
          base64: asset.base64,
        });
      }
    } catch (pickerError: any) {
      setError(pickerError?.message ?? 'Could not open photo library.');
    } finally {
      setPickingPhoto(false);
    }
  };

  const removePhoto = () => {
    setAvatarPhoto(null);
  };

  const handleDatingModeToggle = (value: boolean) => {
    if (value && !datingModeEnabled) {
      Alert.alert(
        'Enable Dating Mode?',
        'Dating Mode uses your dating preferences to show swipe candidates and create matches.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => setDatingModeEnabled(true) },
        ]
      );
      return;
    }
    setDatingModeEnabled(value);
  };

  const saveProfile = async () => {
    if (!canSubmit) {
      return;
    }

    const normalizedBirthDate = birthDate.trim();
    if (normalizedBirthDate.length > 0) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedBirthDate)) {
        setError('Birth date must use YYYY-MM-DD format.');
        return;
      }
      const parsedBirthDate = new Date(`${normalizedBirthDate}T00:00:00.000Z`);
      if (Number.isNaN(parsedBirthDate.getTime())) {
        setError('Birth date is invalid.');
        return;
      }
      if (parsedBirthDate > new Date()) {
        setError('Birth date cannot be in the future.');
        return;
      }
      const now = new Date();
      let age = now.getFullYear() - parsedBirthDate.getUTCFullYear();
      const monthDiff = now.getMonth() - parsedBirthDate.getUTCMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < parsedBirthDate.getUTCDate())) {
        age -= 1;
      }
      if (age < 18) {
        setError('You must be at least 18 years old.');
        return;
      }
    }
    setError('');
    setSaving(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setSaving(false);
      setError('Session expired. Please sign in again.');
      router.replace('/(auth)');
      return;
    }

    const user = sessionData.session.user;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .maybeSingle();

    let nextAvatarUrl = existingProfile?.avatar_url ?? null;
    if (avatarPhoto?.base64 || avatarPhoto?.uri?.startsWith('file://')) {
      const picked = avatarPhoto;
      const contentType = picked.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' :
        contentType === 'image/jpeg' ? 'jpg' :
        'jpg';
      const filePath = `${user.id}/${Date.now()}-avatar.${ext}`;

      let fileData: ArrayBuffer;
      if (picked.base64) {
        const dataUrl = `data:${contentType};base64,${picked.base64}`;
        const response = await fetch(dataUrl);
        fileData = await response.arrayBuffer();
      } else {
        const response = await fetch(picked.uri);
        fileData = await response.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, fileData, {
          contentType,
          upsert: false,
        });

      if (uploadError) {
        setSaving(false);
        setError(uploadError.message);
        return;
      }

      nextAvatarUrl = filePath;
    } else if (!avatarPhoto) {
      nextAvatarUrl = null;
    }

    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: fullName.trim(),
      city: city.trim() || null,
      birth_date: normalizedBirthDate || null,
      bio: bio.trim() || null,
      ethnicity: ethnicity.trim() || null,
      religion: religion.trim() || null,
      languages: selectedLanguages,
      gender,
      is_open_to_connections: isOpenToConnections,
      avatar_url: nextAvatarUrl,
      last_active_at: new Date().toISOString(),
    });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    const { error: datingProfileError } = await supabase
      .from('dating_profiles')
      .upsert({ user_id: user.id, is_enabled: datingModeEnabled }, { onConflict: 'user_id' });
    if (datingProfileError) {
      setError(datingProfileError.message);
      return;
    }
    // Keep global openness and per-group signals consistent:
    // when global is turned off, clear all group-level open signals.
    if (!isOpenToConnections) {
      const { error: clearSignalsError } = await supabase
        .from('group_memberships')
        .update({ is_open_to_connect: false, openness_set_at: null })
        .eq('user_id', user.id)
        .eq('is_open_to_connect', true);

      if (clearSignalsError) {
        setError(clearSignalsError.message);
        return;
      }
    }

    if (isEditMode) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/profile');
      }
      return;
    }

    const nextRoute = datingModeEnabled ? '/dating-mode' : '/(tabs)/home';
    router.replace(`/terms-accept?next=${encodeURIComponent(nextRoute)}`);
  };

  if (initialLoading) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']} style={styles.safe}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const birthDateObj = birthDate
    ? new Date(`${birthDate}T00:00:00.000Z`)
    : new Date(new Date().setFullYear(new Date().getFullYear() - 25));

  const displayBirthDate = birthDate
    ? new Date(`${birthDate}T00:00:00.000Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <View style={styles.container}>

      {/* ── Fixed header ── */}
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.fixedHeaderSafe}>
        <View style={styles.fixedHeader}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={22} color={Colors.ink} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.wordmark}>Godena</Text>
              <Text style={styles.title}>
                {isEditMode ? 'Edit profile' : 'Set up profile'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.saveHeaderBtn, !canSubmit && styles.saveHeaderBtnDisabled]}
              onPress={saveProfile}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.saveHeaderBtnText}>{isEditMode ? 'Save' : 'Done'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Keyboard-aware body ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Basic Info ── */}
          <Text style={styles.sectionHeader}>Basic Info</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Full name <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Tigist Haile"
              placeholderTextColor={Colors.muted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>City</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Washington, DC"
              placeholderTextColor={Colors.muted}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Birth date</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.dateInputText, !displayBirthDate && styles.dateInputPlaceholder]}>
                {displayBirthDate || 'Select your birth date'}
              </Text>
              <Ionicons name="calendar-outline" size={18} color={Colors.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Bio</Text>
              <Text style={styles.charCount}>{bio.length}/300</Text>
            </View>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell people a little about yourself..."
              placeholderTextColor={Colors.muted}
              multiline
              maxLength={300}
            />
          </View>

          {/* ── Culture & Identity ── */}
          <Text style={styles.sectionHeader}>Culture &amp; Identity</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Ethnicity</Text>
            <View style={styles.intentRow}>
              {ETHNICITY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.intentChip, ethnicity === option.value && styles.intentChipActive]}
                  onPress={() => setEthnicity(option.value)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.intentChipText, ethnicity === option.value && styles.intentChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Religion</Text>
            <View style={styles.intentRow}>
              {RELIGION_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.intentChip, religion === option.value && styles.intentChipActive]}
                  onPress={() => setReligion(option.value)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.intentChipText, religion === option.value && styles.intentChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Languages</Text>
            <View style={styles.intentRow}>
              {LANGUAGE_OPTIONS.map((option) => {
                const isSelected = selectedLanguages.includes(option.value);
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.intentChip, isSelected && styles.intentChipActive]}
                    onPress={() => {
                      setSelectedLanguages((prev) => (
                        prev.includes(option.value)
                          ? prev.filter((v) => v !== option.value)
                          : [...prev, option.value]
                      ));
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.intentChipText, isSelected && styles.intentChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Gender <Text style={styles.required}>*</Text></Text>
            <View style={styles.intentRow}>
              {GENDER_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.intentChip, gender === option.value && styles.intentChipActive]}
                  onPress={() => setGender(option.value)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.intentChipText, gender === option.value && styles.intentChipTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Privacy ── */}
          <Text style={styles.sectionHeader}>Privacy</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchIconWrap}>
              <Ionicons name="git-network-outline" size={18} color={Colors.olive} />
            </View>
            <View style={styles.switchInfo}>
              <Text style={styles.switchTitle}>Open to connections</Text>
              <Text style={styles.switchSub}>Used for group and event-based matching.</Text>
            </View>
            <Switch
              value={isOpenToConnections}
              onValueChange={setIsOpenToConnections}
              trackColor={{ false: Colors.border, true: Colors.olive }}
              thumbColor={Colors.white}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={[styles.switchIconWrap, { backgroundColor: 'rgba(196,98,45,0.1)' }]}>
              <Ionicons name="flame-outline" size={18} color={Colors.terracotta} />
            </View>
            <View style={styles.switchInfo}>
              <Text style={styles.switchTitle}>Dating Mode</Text>
              <Text style={styles.switchSub}>Turns on swipe-based dating profiles.</Text>
            </View>
            <Switch
              value={datingModeEnabled}
              onValueChange={handleDatingModeToggle}
              trackColor={{ false: Colors.border, true: Colors.terracotta }}
              thumbColor={Colors.white}
            />
          </View>

          {!isEditMode && (
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Profile photo</Text>
              </View>
              <View style={styles.photoRow}>
                {avatarPhoto ? (
                  <View key={avatarPhoto.uri} style={styles.photoWrap}>
                    <Image source={{ uri: avatarPhoto.uri }} style={styles.photo} />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={removePhoto}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.removePhotoText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {!avatarPhoto && (
                  <TouchableOpacity
                    style={[styles.addPhotoBtn, pickingPhoto && styles.addPhotoBtnDisabled]}
                    onPress={addPhoto}
                    activeOpacity={0.85}
                    disabled={pickingPhoto}
                  >
                    {pickingPhoto ? (
                      <ActivityIndicator size="small" color={Colors.terracotta} />
                    ) : (
                      <Text style={styles.addPhotoText}>+ Add</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Date picker modal ── */}
      {showDatePicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
          <TouchableOpacity style={styles.datePickerBackdrop} activeOpacity={1} onPress={() => setShowDatePicker(false)} />
          <View style={[styles.datePickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.datePickerHandle} />
            <View style={styles.datePickerHeader}>
              <Text style={styles.datePickerTitle}>Birth date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Text style={styles.datePickerDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={birthDateObj}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date(new Date().setFullYear(new Date().getFullYear() - 18))}
              onChange={(event, date) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (event.type === 'set' && date) {
                  const y = date.getUTCFullYear();
                  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
                  const d = String(date.getUTCDate()).padStart(2, '0');
                  setBirthDate(`${y}-${m}-${d}`);
                }
              }}
              style={styles.datePicker}
            />
          </View>
        </Modal>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Fixed header
  fixedHeaderSafe: { backgroundColor: Colors.cream },
  fixedHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1 },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.ink,
  },
  saveHeaderBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 18,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  saveHeaderBtnDisabled: { backgroundColor: Colors.border },
  saveHeaderBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Scrollable form area
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 12,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: Colors.brownMid, fontWeight: '600', marginBottom: 6 },
  required: { color: Colors.terracotta },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  charCount: { fontSize: 11, color: Colors.muted, fontWeight: '500' },
  input: {
    height: 52,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    fontSize: 15,
    color: Colors.ink,
  },
  inputMultiline: {
    height: 110,
    textAlignVertical: 'top',
    paddingTop: 12,
    paddingBottom: 12,
  },
  dateInput: {
    height: 52,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateInputText: { fontSize: 15, color: Colors.ink },
  dateInputPlaceholder: { color: Colors.muted },
  intentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  intentChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  intentChipActive: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
  },
  intentChipText: {
    fontSize: 13,
    color: Colors.brownMid,
    fontWeight: '600',
  },
  intentChipTextActive: {
    color: Colors.white,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ageInput: { flex: 1 },
  ageDash: {
    color: Colors.muted,
    fontSize: 20,
    lineHeight: 20,
    marginTop: -2,
  },
  switchRow: {
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(122,140,92,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchInfo: { flex: 1 },
  switchTitle: {
    fontSize: 13,
    color: Colors.ink,
    fontWeight: '700',
    marginBottom: 2,
  },
  switchSub: {
    fontSize: 11,
    color: Colors.muted,
    lineHeight: 16,
  },
  photoRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  photo: { width: '100%', height: '100%' },
  removePhotoBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: Colors.white,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.borderDark,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoBtnDisabled: { opacity: 0.6 },
  addPhotoText: {
    fontSize: 12,
    color: Colors.terracotta,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginBottom: 12,
    marginTop: 4,
  },

  // Date picker sheet
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  datePickerSheet: {
    backgroundColor: Colors.warmWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: Spacing.lg,
  },
  datePickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  datePickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  datePickerDone: { fontSize: 15, fontWeight: '700', color: Colors.terracotta },
  datePicker: { width: '100%' },

  // Unused legacy styles kept for compatibility
  actionFlex1: { flex: 1 },
  actionFlex2: { flex: 2 },
  btn: {
    height: 52,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: Colors.border },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  secondaryBtn: {
    height: 52,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brownMid,
  },
});
