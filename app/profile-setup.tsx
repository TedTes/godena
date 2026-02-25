import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

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
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const;

type GenderValue = (typeof GENDER_OPTIONS)[number]['value'];

type SelectedPhoto = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
};

export default function ProfileSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [initialLoading, setInitialLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [religion, setReligion] = useState('');
  const [languagesInput, setLanguagesInput] = useState('');
  const [intent, setIntent] = useState<(typeof INTENT_OPTIONS)[number]['value']>('dating');
  const [gender, setGender] = useState<GenderValue>('prefer_not_to_say');
  const [preferredGenders, setPreferredGenders] = useState<GenderValue[]>([]);
  const [preferredAgeMin, setPreferredAgeMin] = useState('');
  const [preferredAgeMax, setPreferredAgeMax] = useState('');
  const [isOpenToConnections, setIsOpenToConnections] = useState(true);
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2>(1);

  const canSubmit =
    fullName.trim().length >= 2 &&
    city.trim().length >= 2 &&
    ethnicity.trim().length >= 2 &&
    !saving;
  const canProceedStep1 = fullName.trim().length >= 2 && city.trim().length >= 2;

  const parsedLanguages = languagesInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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
        .select('full_name, city, bio, ethnicity, religion, languages, intent, gender, preferred_genders, preferred_age_min, preferred_age_max, is_open_to_connections')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError || !existingProfile) {
        setInitialLoading(false);
        return;
      }

      setIsEditMode(true);
      setFullName(existingProfile.full_name ?? '');
      setCity(existingProfile.city ?? '');
      setBio(existingProfile.bio ?? '');
      setEthnicity(existingProfile.ethnicity ?? '');
      setReligion(existingProfile.religion ?? '');
      setLanguagesInput((existingProfile.languages ?? []).join(', '));
      setIntent((existingProfile.intent as typeof intent) ?? 'dating');
      setGender((existingProfile.gender as GenderValue) ?? 'prefer_not_to_say');
      setPreferredGenders((existingProfile.preferred_genders as GenderValue[] | null) ?? []);
      setPreferredAgeMin(existingProfile.preferred_age_min?.toString() ?? '');
      setPreferredAgeMax(existingProfile.preferred_age_max?.toString() ?? '');
      setIsOpenToConnections(existingProfile.is_open_to_connections ?? true);
      setInitialLoading(false);
    };

    void loadExistingProfile();
  }, []);

  const addPhoto = async () => {
    setError('');
    if (photos.length >= 4) {
      Alert.alert('Photo limit reached', 'You can upload up to 4 photos.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
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
      setPhotos((prev) => [
        ...prev,
        {
          uri: asset.uri,
          mimeType: asset.mimeType,
          base64: asset.base64,
        },
      ].slice(0, 4));
    }
    } catch (pickerError: any) {
      setError(pickerError?.message ?? 'Could not open photo library.');
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  };

  const saveProfile = async () => {
    if (!canSubmit) {
      return;
    }

    const minAge = preferredAgeMin.trim() ? Number(preferredAgeMin) : null;
    const maxAge = preferredAgeMax.trim() ? Number(preferredAgeMax) : null;
    if (
      (minAge !== null && Number.isNaN(minAge)) ||
      (maxAge !== null && Number.isNaN(maxAge))
    ) {
      setError('Preferred age range must be numeric.');
      return;
    }
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      setError('Preferred minimum age cannot be greater than maximum age.');
      return;
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
      .select('photo_urls')
      .eq('user_id', user.id)
      .maybeSingle();

    const uploadedPhotoPaths: string[] = [];
    for (let i = 0; i < photos.length; i += 1) {
      const picked = photos[i];
      const contentType = picked.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' :
        contentType === 'image/jpeg' ? 'jpg' :
        'jpg';
      const filePath = `${user.id}/${Date.now()}-${i}.${ext}`;

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

      uploadedPhotoPaths.push(filePath);
    }

    const nextPhotoUrls =
      uploadedPhotoPaths.length > 0
        ? uploadedPhotoPaths
        : (existingProfile?.photo_urls ?? []);

    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: fullName.trim(),
      city: city.trim(),
      bio: bio.trim() || null,
      ethnicity: ethnicity.trim(),
      religion: religion.trim() || null,
      languages: parsedLanguages,
      intent,
      gender,
      preferred_genders: preferredGenders,
      preferred_age_min: minAge,
      preferred_age_max: maxAge,
      is_open_to_connections: isOpenToConnections,
      photo_urls: nextPhotoUrls,
      last_active_at: new Date().toISOString(),
    });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.replace('/(tabs)/home');
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

  return (
    <View style={styles.container}>

      {/* ── Fixed header (never scrolls) ─────────────────── */}
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.fixedHeaderSafe}>
        <View style={styles.fixedHeader}>
          <Text style={styles.wordmark}>Godena</Text>
          <Text style={styles.title}>
            {isEditMode ? 'Edit your profile' : 'Set up your profile'}
          </Text>
          <Text style={styles.subtitle}>
            {isEditMode
              ? 'Update your details. Avatar and gallery are managed on Profile.'
              : 'This is your private foundation. You can edit everything later.'}
          </Text>
          <View style={styles.stepRow}>
            <View style={[styles.stepPill, step === 1 && styles.stepPillActive]}>
              <Text style={[styles.stepPillText, step === 1 && styles.stepPillTextActive]}>
                Step 1 · Basics
              </Text>
            </View>
            <View style={[styles.stepPill, step === 2 && styles.stepPillActive]}>
              <Text style={[styles.stepPillText, step === 2 && styles.stepPillTextActive]}>
                Step 2 · Preferences
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* ── Keyboard-aware body: scroll + pinned bottom bar ── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Full name</Text>
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
                <Text style={styles.label}>Bio (optional)</Text>
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

              <View style={styles.field}>
                <Text style={styles.label}>Ethnicity</Text>
                <TextInput
                  style={styles.input}
                  value={ethnicity}
                  onChangeText={setEthnicity}
                  placeholder="Ethiopian, Eritrean, Habesha..."
                  placeholderTextColor={Colors.muted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Religion (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={religion}
                  onChangeText={setReligion}
                  placeholder="Orthodox Christian, Muslim..."
                  placeholderTextColor={Colors.muted}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Languages (comma separated)</Text>
                <TextInput
                  style={styles.input}
                  value={languagesInput}
                  onChangeText={setLanguagesInput}
                  placeholder="Amharic, English, Tigrinya"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Intent</Text>
                <View style={styles.intentRow}>
                  {INTENT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.intentChip,
                        intent === option.value && styles.intentChipActive,
                      ]}
                      onPress={() => setIntent(option.value)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.intentChipText,
                          intent === option.value && styles.intentChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Gender</Text>
                <View style={styles.intentRow}>
                  {GENDER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.intentChip,
                        gender === option.value && styles.intentChipActive,
                      ]}
                      onPress={() => setGender(option.value)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.intentChipText,
                          gender === option.value && styles.intentChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={styles.label}>Preferred genders</Text>
                <View style={styles.intentRow}>
                  {GENDER_OPTIONS.filter((option) => option.value !== 'prefer_not_to_say').map((option) => {
                    const selected = preferredGenders.includes(option.value);
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.intentChip,
                          selected && styles.intentChipActive,
                        ]}
                        onPress={() =>
                          setPreferredGenders((prev) =>
                            selected
                              ? prev.filter((g) => g !== option.value)
                              : [...prev, option.value]
                          )
                        }
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.intentChipText,
                            selected && styles.intentChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Preferred age range</Text>
                <View style={styles.ageRow}>
                  <TextInput
                    style={[styles.input, styles.ageInput]}
                    value={preferredAgeMin}
                    onChangeText={setPreferredAgeMin}
                    keyboardType="number-pad"
                    placeholder="Min"
                    placeholderTextColor={Colors.muted}
                    maxLength={2}
                  />
                  <Text style={styles.ageDash}>—</Text>
                  <TextInput
                    style={[styles.input, styles.ageInput]}
                    value={preferredAgeMax}
                    onChangeText={setPreferredAgeMax}
                    keyboardType="number-pad"
                    placeholder="Max"
                    placeholderTextColor={Colors.muted}
                    maxLength={2}
                  />
                </View>
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchTitle}>Open to connections</Text>
                  <Text style={styles.switchSub}>
                    Global default. Group-level signals still apply.
                  </Text>
                </View>
                <Switch
                  value={isOpenToConnections}
                  onValueChange={setIsOpenToConnections}
                  trackColor={{ false: Colors.border, true: Colors.olive }}
                  thumbColor={Colors.white}
                />
              </View>

              {!isEditMode ? (
                <View style={styles.field}>
                  <View style={styles.photoHeader}>
                    <Text style={styles.label}>Photos</Text>
                    <Text style={styles.photoCount}>{photos.length}/4</Text>
                  </View>
                  <View style={styles.photoRow}>
                    {photos.map((photo) => (
                      <View key={photo.uri} style={styles.photoWrap}>
                        <Image source={{ uri: photo.uri }} style={styles.photo} />
                        <TouchableOpacity
                          style={styles.removePhotoBtn}
                          onPress={() => removePhoto(photo.uri)}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.removePhotoText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {photos.length < 4 ? (
                      <TouchableOpacity style={styles.addPhotoBtn} onPress={addPhoto} activeOpacity={0.85}>
                        <Text style={styles.addPhotoText}>+ Add</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </>
          )}
        </ScrollView>

        {/* ── Pinned bottom action bar (always above keyboard) ── */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, styles.actionFlex1]}
              onPress={step === 1 ? handleBack : () => setStep(1)}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>
                {step === 1 ? 'Back' : 'Step 1'}
              </Text>
            </TouchableOpacity>

            {step === 1 ? (
              <TouchableOpacity
                style={[styles.btn, styles.actionFlex2, !canProceedStep1 && styles.btnDisabled]}
                onPress={() => setStep(2)}
                disabled={!canProceedStep1}
                activeOpacity={0.85}
              >
                <Text style={styles.btnText}>Continue</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.btn, styles.actionFlex2, !canSubmit && styles.btnDisabled]}
                onPress={saveProfile}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.btnText}>{isEditMode ? 'Save Changes' : 'Save & Continue'}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

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
  wordmark: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepPill: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    backgroundColor: Colors.warmWhite,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepPillActive: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.terracotta,
  },
  stepPillText: {
    fontSize: 11,
    color: Colors.brownMid,
    fontWeight: '700',
  },
  stepPillTextActive: {
    color: Colors.white,
  },

  // Scrollable form area
  scrollContent: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    flexGrow: 1,
  },
  field: { marginBottom: 14 },
  label: { fontSize: 12, color: Colors.brownMid, fontWeight: '600', marginBottom: 6 },
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  intentChipActive: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
  },
  intentChipText: {
    fontSize: 12,
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
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  photoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoCount: {
    color: Colors.muted,
    fontSize: 12,
    fontWeight: '600',
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
  addPhotoText: {
    fontSize: 12,
    color: Colors.terracotta,
    fontWeight: '700',
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginBottom: 12,
  },

  // Pinned bottom action bar
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.cream,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
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
