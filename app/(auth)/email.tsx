import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';

type Mode = 'signin' | 'signup';

export default function EmailAuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /\S+@\S+\.\S+/.test(normalizedEmail);
  const passwordValid = password.length >= 8;
  const confirmValid = mode === 'signin' || password === confirmPassword;
  const canSubmit = useMemo(
    () => emailValid && passwordValid && confirmValid && !loading,
    [emailValid, passwordValid, confirmValid, loading]
  );

  const submit = () => {
    void (async () => {
      if (!canSubmit) return;
      setLoading(true);
      setError('');
      setInfo('');

      if (mode === 'signin') {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        setLoading(false);
        if (signInError) {
          setError(signInError.message);
          return;
        }
        const userId = signInData.session?.user.id;
        if (!userId) {
          router.replace('/');
          return;
        }
        try {
          const route = await resolvePostAuthRoute(userId);
          router.replace(route);
        } catch {
          router.replace('/');
        }
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
      });
      setLoading(false);

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // If email confirmations are disabled, session is immediate.
      if (data.session) {
        try {
          const route = await resolvePostAuthRoute(data.session.user.id);
          router.replace(route);
        } catch {
          router.replace('/');
        }
        return;
      }

      setInfo('Account created. Check your email to confirm, then sign in.');
      setMode('signin');
      setPassword('');
      setConfirmPassword('');
    })();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.wordmark}>Godena</Text>
              <Text style={styles.title}>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text style={styles.subtitle}>
                {mode === 'signin'
                  ? 'Sign in with your email and password.'
                  : 'Use your email to create your account.'}
              </Text>
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]}
                onPress={() => setMode('signin')}
              >
                <Text style={[styles.modeText, mode === 'signin' && styles.modeTextActive]}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
                onPress={() => setMode('signup')}
              >
                <Text style={[styles.modeText, mode === 'signup' && styles.modeTextActive]}>Create Account</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              autoCorrect={false}
            />

            <TextInput
              style={styles.input}
              placeholder="Password (min 8 chars)"
              placeholderTextColor={Colors.muted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
            />

            {mode === 'signup' ? (
              <TextInput
                style={styles.input}
                placeholder="Confirm password"
                placeholderTextColor={Colors.muted}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
              />
            ) : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {info ? <Text style={styles.infoText}>{info}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, !canSubmit && styles.btnDisabled]}
              onPress={submit}
              disabled={!canSubmit}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.btnText}>{mode === 'signin' ? 'Sign In' : 'Create Account'}</Text>
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
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  backText: {
    fontSize: 14,
    color: Colors.muted,
    fontWeight: '600',
  },
  header: { marginBottom: 28 },
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
    lineHeight: 40,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.muted,
    lineHeight: 24,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtnActive: {
    backgroundColor: Colors.terracotta,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brownMid,
  },
  modeTextActive: {
    color: Colors.white,
  },
  input: {
    height: 56,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
    color: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  infoText: {
    color: Colors.olive,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  btn: {
    marginTop: 8,
    height: 56,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    backgroundColor: Colors.border,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
});
