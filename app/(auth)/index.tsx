import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';
import { useAuthEntrance } from '../../hooks/useAuthEntrance';
type Provider = 'google' | 'apple';

export default function AuthChoiceScreen() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState('');

  const isExpoGo = Constants.executionEnvironment === 'storeClient';
  const oauthRedirectTo =
    process.env.EXPO_PUBLIC_OAUTH_REDIRECT?.trim() ??
    (isExpoGo ? Linking.createURL('auth/callback') : 'godena://auth/callback');

  if (__DEV__) {
    console.log('[Auth] OAuth redirectTo:', oauthRedirectTo);
  }

  const continueWithAppleNative = async () => {
    let AppleAuthentication: any;
    try {
      AppleAuthentication = require('expo-apple-authentication');
    } catch {
      setError('Apple sign in module is not installed in this build.');
      return false;
    }

    if (Platform.OS !== 'ios') return false;

    const available = await AppleAuthentication.isAvailableAsync();
    if (!available) {
      setError('Apple Sign In is not available on this device.');
      return false;
    }

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!credential?.identityToken) {
      setError('Missing Apple identity token.');
      return false;
    }

    const { data: idTokenData, error: idTokenError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });

    if (idTokenError) {
      setError(idTokenError.message);
      return false;
    }

    const fullNameParts = [
      credential?.fullName?.givenName,
      credential?.fullName?.familyName,
    ].filter(Boolean);
    if (fullNameParts.length > 0) {
      const fullName = fullNameParts.join(' ');
      await supabase.auth.updateUser({ data: { full_name: fullName, name: fullName } });
    }

    const userId = idTokenData.user?.id;
    if (!userId) {
      router.replace('/');
      return true;
    }
    try {
      const route = await resolvePostAuthRoute(userId);
      router.replace(route);
    } catch {
      router.replace('/');
    }
    return true;
  };

  const continueWithOAuth = (provider: Provider) => {
    void (async () => {
      if (loadingProvider) return;
      setError('');
      setLoadingProvider(provider);

      if (provider === 'apple' && Platform.OS === 'ios') {
        try {
          const ok = await continueWithAppleNative();
          setLoadingProvider(null);
          if (!ok) return;
          return;
        } catch (nativeError: any) {
          if (nativeError?.code === 'ERR_REQUEST_CANCELED') {
            setLoadingProvider(null);
            return;
          }
          setLoadingProvider(null);
          setError(nativeError?.message || 'Apple sign in failed.');
          return;
        }
      }

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: oauthRedirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (oauthError || !data?.url) {
        const msg = oauthError?.message ?? '';
        if (msg.toLowerCase().includes('provider is not enabled')) {
          setError(`${provider[0].toUpperCase()}${provider.slice(1)} sign-in is not enabled in Supabase yet.`);
        } else {
          setError(oauthError?.message || `Could not continue with ${provider}.`);
        }
        setLoadingProvider(null);
        return;
      }

      if (__DEV__) console.log('[Auth] opening OAuth URL:', data.url);

      const result = await WebBrowser.openAuthSessionAsync(data.url, oauthRedirectTo);

      if (__DEV__) console.log('[Auth] OAuth result:', result.type, (result as any).url ?? '');

      if (result.type !== 'success') {
        setLoadingProvider(null);
        return;
      }

      const callbackUrl = result.url;
      const parsed = Linking.parse(callbackUrl);
      const q = (parsed.queryParams ?? {}) as Record<string, string | undefined>;

      const hash = callbackUrl.includes('#') ? callbackUrl.slice(callbackUrl.indexOf('#') + 1) : '';
      const hp = new URLSearchParams(hash);

      const authError = q.error_description ?? q.error ?? hp.get('error_description') ?? hp.get('error');
      if (authError) {
        setLoadingProvider(null);
        setError(authError);
        return;
      }

      const code = q.code ?? hp.get('code');
      const accessToken = q.access_token ?? hp.get('access_token');
      const refreshToken = q.refresh_token ?? hp.get('refresh_token');

      if (code) {
        if (__DEV__) console.log('[Auth] exchanging PKCE code');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setLoadingProvider(null);
          setError(exchangeError.message);
          return;
        }
      } else if (accessToken && refreshToken) {
        if (__DEV__) console.log('[Auth] setting session from tokens');
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) {
          setLoadingProvider(null);
          setError(setErr.message);
          return;
        }
      } else {
        setLoadingProvider(null);
        setError('OAuth callback missing auth payload. Check Supabase redirect URL configuration.');
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setLoadingProvider(null);
        setError('Sign-in failed — no session. Please try again.');
        return;
      }

      setLoadingProvider(null);
      try {
        const route = await resolvePostAuthRoute(userId);
        router.replace(route);
      } catch {
        router.replace('/');
      }
    })();
  };

  const isLoading = loadingProvider !== null;
  const { titleStyle, subtitleStyle, buttonsStyle } = useAuthEntrance();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        {/* Top: branding + buttons */}
        <View style={styles.content}>
          <View style={styles.header}>
            <Animated.Text style={[styles.title, titleStyle]}>Sign in</Animated.Text>
            <Animated.Text style={[styles.subtitle, subtitleStyle]}>Choose the fastest way to continue.</Animated.Text>
          </View>

          <Animated.View style={[styles.buttons, buttonsStyle]}>
            {/* Apple — iOS only */}
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                style={[styles.primaryBtn, isLoading && loadingProvider !== 'apple' && styles.btnDisabled]}
                activeOpacity={0.85}
                onPress={() => continueWithOAuth('apple')}
                disabled={isLoading}
                accessibilityLabel="Continue with Apple"
                accessibilityRole="button"
              >
                {loadingProvider === 'apple' ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={18} color={Colors.white} />
                    <Text style={styles.primaryBtnText}>Continue with Apple</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Google */}
            <TouchableOpacity
              style={[styles.secondaryBtn, isLoading && loadingProvider !== 'google' && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={() => continueWithOAuth('google')}
              disabled={isLoading}
              accessibilityLabel="Continue with Google"
              accessibilityRole="button"
            >
              {loadingProvider === 'google' ? (
                <ActivityIndicator color={Colors.ink} />
              ) : (
                <>
                  <Ionicons name="logo-google" size={18} color={Colors.ink} />
                  <Text style={styles.secondaryBtnText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {/* Bottom: legal footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By continuing, you agree to our{' '}
            <Text
              style={styles.footerLink}
              onPress={() => router.push('/terms')}
              accessibilityRole="link"
            >
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text
              style={styles.footerLink}
              onPress={() => router.push('/privacy-policy')}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            .
          </Text>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1, justifyContent: 'space-between' },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    paddingBottom: 24,
  },

  header: { marginBottom: 24, alignItems: 'center' },
  title: { fontSize: 30, fontWeight: '900', color: Colors.ink, marginBottom: 8, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 15, color: Colors.muted, lineHeight: 22, textAlign: 'center' },

  buttons: { gap: 10 },

  // Apple (dark primary)
  primaryBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },

  // Google / Phone (outlined)
  secondaryBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnText: { color: Colors.ink, fontSize: 15, fontWeight: '700' },

  // Disabled overlay (non-active buttons while another is loading)
  btnDisabled: { opacity: 0.4 },

  errorText: {
    marginTop: 12,
    color: Colors.error,
    fontSize: 12,
    textAlign: 'center',
  },

  // Legal footer — pinned to bottom via SafeAreaView bottom edge
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  footerLink: {
    color: Colors.terracotta,
    fontWeight: '600',
  },
});
