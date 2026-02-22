import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

export default function ProfileSetupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = fullName.trim().length >= 2 && city.trim().length >= 2 && !saving;

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
    const { error: upsertError } = await supabase.from('profiles').upsert({
      user_id: user.id,
      full_name: fullName.trim(),
      city: city.trim(),
      bio: bio.trim() || null,
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
