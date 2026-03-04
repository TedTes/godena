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
  Image,
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
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | null>(null);
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
      if (mode === 'signup') {
        setPendingVerificationEmail(null);
      }

      if (mode === 'signin') {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        setLoading(false);
        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
            setError('Please verify your email first, then sign in.');
          } else {
            setError(signInError.message);
          }
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

      const identitiesCount = data.user?.identities?.length ?? 0;
      // Supabase can return user + no error for existing accounts when confirmations are enabled.
      if (identitiesCount === 0) {
        setInfo('This email is already registered. Check your inbox for verification, or sign in.');
        setPassword('');
        setConfirmPassword('');
        return;
      }

      // Keep flow explicit: verify email first, then sign in.
      // If project settings auto-create a session, clear it so user still verifies first.
      if (data.session) {
        await supabase.auth.signOut();
      }

      setPendingVerificationEmail(normalizedEmail);
      setInfo('');
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
              <Image source={require('../../assets/logo-temp.png')} style={styles.wordmarkLogo} resizeMode="contain" />
              <Text style={styles.title}>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </Text>
              <Text style={styles.subtitle}>
                {mode === 'signin'
                  ? 'Sign in with your email and password.'
                  : 'Use your email to create your account.'}
              </Text>
            </View>

            {mode === 'signup' && pendingVerificationEmail ? (
              <View style={styles.verifyCard}>
                <Text style={styles.verifyTitle}>Check your email</Text>
                <Text style={styles.verifyBody}>
                  We sent a verification link to{'\n'}
                  <Text style={styles.verifyEmail}>{pendingVerificationEmail}</Text>
                </Text>
                <Text style={styles.verifyHint}>
                  Verify your email, then continue to sign in.
                </Text>
                <TouchableOpacity
                  style={styles.btn}
                  onPress={() => {
                    setMode('signin');
                    setPendingVerificationEmail(null);
                    setInfo('');
                    setError('');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.btnText}>Go to Sign In</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
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
              </>
            )}
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
  wordmarkLogo: {
    width: 120,
    height: 30,
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
  verifyCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: 10,
  },
  verifyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.ink,
  },
  verifyBody: {
    fontSize: 14,
    color: Colors.brownMid,
    lineHeight: 22,
  },
  verifyEmail: {
    color: Colors.terracotta,
    fontWeight: '700',
  },
  verifyHint: {
    fontSize: 13,
    color: Colors.muted,
    lineHeight: 20,
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
