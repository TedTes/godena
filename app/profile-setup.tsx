import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

const INTENT_OPTIONS = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating', label: 'Dating' },
  { value: 'long_term', label: 'Long-term' },
  { value: 'marriage', label: 'Marriage' },
] as const;

type SelectedPhoto = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
};

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [ethnicity, setEthnicity] = useState('');
  const [religion, setReligion] = useState('');
  const [languagesInput, setLanguagesInput] = useState('');
  const [intent, setIntent] = useState<(typeof INTENT_OPTIONS)[number]['value']>('dating');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    fullName.trim().length >= 2 &&
    city.trim().length >= 2 &&
    ethnicity.trim().length >= 2 &&
    !saving;

  const parsedLanguages = languagesInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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

    setError('');
    setSaving(true);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setSaving(false);
      setError('Session expired. Please sign in again.');
      router.replace('/(auth)/phone');
      return;
    }

    const user = sessionData.session.user;

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('photo_urls, avatar_url')
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
    const nextAvatarUrl =
      existingProfile?.avatar_url
      ?? uploadedPhotoPaths[0]
      ?? null;

    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: fullName.trim(),
      city: city.trim(),
      bio: bio.trim() || null,
      ethnicity: ethnicity.trim(),
      religion: religion.trim() || null,
      languages: parsedLanguages,
      intent,
      photo_urls: nextPhotoUrls,
      avatar_url: nextAvatarUrl,
      last_active_at: new Date().toISOString(),
    });

    setSaving(false);

    if (upsertError) {
      setError(upsertError.message);
      return;
    }

    router.replace('/(tabs)/home');
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.topRow}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-back" size={18} color={Colors.brown} />
                <Text style={styles.backText}>Back</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.wordmark}>Godena</Text>
            <Text style={styles.title}>Set up your profile</Text>
            <Text style={styles.subtitle}>
              This is your private foundation. You can edit everything later.
            </Text>

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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
              onPress={saveProfile}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.btnText}>Save & Continue</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingTop: Spacing.xl, flexGrow: 1 },
  topRow: {
    marginBottom: 16,
  },
  backBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backText: {
    fontSize: 13,
    color: Colors.brownMid,
    fontWeight: '600',
  },
  wordmark: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.ink,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.muted,
    lineHeight: 22,
    marginBottom: 28,
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
  photo: {
    width: '100%',
    height: '100%',
  },
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
  btn: {
    marginTop: 8,
    height: 56,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: Colors.border },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
