import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../../constants/theme';

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [timer, setTimer] = useState(30);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((t) => t - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const handleChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      // Auto-submit when full code entered
      setTimeout(() => router.replace('/(tabs)/home'), 300);
    }
  };

  const digits = code.split('').concat(Array(CODE_LENGTH - code.length).fill(''));

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <View style={styles.content}>
            <TouchableOpacity style={styles.back} onPress={() => router.back()}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>

            <Text style={styles.wordmark}>Godena</Text>
            <Text style={styles.title}>Enter the code</Text>
            <Text style={styles.subtitle}>
              We sent a 6-digit code to your number. It expires in 10 minutes.
            </Text>

            <TouchableOpacity
              style={styles.codeRow}
              onPress={() => inputRef.current?.focus()}
              activeOpacity={1}
            >
              {digits.map((d, i) => (
                <View
                  key={i}
                  style={[
                    styles.codeBox,
                    d ? styles.codeBoxFilled : null,
                    i === code.length ? styles.codeBoxActive : null,
                  ]}
                >
                  <Text style={styles.codeDigit}>{d}</Text>
                </View>
              ))}
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={handleChange}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoFocus
            />

            <View style={styles.resendRow}>
              {timer > 0 ? (
                <Text style={styles.timerText}>Resend code in {timer}s</Text>
              ) : (
                <TouchableOpacity onPress={() => setTimer(30)}>
                  <Text style={styles.resendText}>Resend code</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[styles.btn, code.length < CODE_LENGTH && styles.btnDisabled]}
              onPress={() => router.replace('/(tabs)/home')}
              disabled={code.length < CODE_LENGTH}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>Verify & Continue</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, padding: Spacing.lg, paddingTop: Spacing.md },
  back: { marginBottom: Spacing.xl },
  backText: { color: Colors.muted, fontSize: 15 },
  wordmark: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 28,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: Colors.ink,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.muted,
    lineHeight: 24,
    marginBottom: 40,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  codeBox: {
    flex: 1,
    height: 62,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxFilled: {
    borderColor: Colors.terracotta,
    backgroundColor: Colors.cream,
  },
  codeBoxActive: {
    borderColor: Colors.terracotta,
    borderWidth: 2,
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.ink,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 1,
    height: 1,
  },
  resendRow: {
    marginBottom: 32,
  },
  timerText: {
    fontSize: 14,
    color: Colors.muted,
  },
  resendText: {
    fontSize: 14,
    color: Colors.terracotta,
    fontWeight: '600',
  },
  btn: {
    height: 56,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { backgroundColor: Colors.border },
  btnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
