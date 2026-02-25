import React, { useState } from 'react';
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

export default function PhoneScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isValid = phone.replace(/\D/g, '').length >= 10;

  const normalizedPhone = `${countryCode}${phone.replace(/\D/g, '')}`;

  const handleContinue = async () => {
    if (!isValid || loading) {
      return;
    }
    setError('');
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: normalizedPhone,
    });
    setLoading(false);

    if (otpError) {
      setError(otpError.message);
      return;
    }

    router.push({
      pathname: '/(auth)/otp',
      params: { phone: normalizedPhone },
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.wordmark}>Godena</Text>
              <Text style={styles.title}>What's your{'\n'}phone number?</Text>
              <Text style={styles.subtitle}>
                We'll send a one-time code. Your number is never shown to other members.
              </Text>
            </View>

            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.countryCode}>
                <Text style={styles.countryCodeText}>{countryCode}</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="(202) 555-0123"
                placeholderTextColor={Colors.muted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                maxLength={14}
                autoFocus
              />
            </View>

            <Text style={styles.note}>
              By continuing, you agree to our Terms of Service and Privacy Policy.
            </Text>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.btn, !isValid && styles.btnDisabled]}
              onPress={handleContinue}
              disabled={!isValid || loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.btnText}>Send Code</Text>
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
  header: { marginBottom: 40 },
  wordmark: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.ink,
    lineHeight: 42,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.muted,
    lineHeight: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  countryCode: {
    height: 58,
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  countryCodeText: {
    fontSize: 16,
    color: Colors.brown,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    height: 58,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 18,
    color: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.border,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 12,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginBottom: 12,
  },
  btn: {
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
