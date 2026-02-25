import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';

type Provider = 'google' | 'apple';

export default function AuthChoiceScreen() {
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<Provider | null>(null);
  const [error, setError] = useState('');
  const oauthRedirectTo = 'godena://auth/callback';

  const routeSignedInUser = async () => {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    try {
      const route = await resolvePostAuthRoute(userId);
      router.replace(route);
    } catch {
      router.replace('/');
    }
  };

  const exchangeCodeFromUrl = async (url: string) => {
    const parsed = Linking.parse(url);
    const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
    if (!code) return;
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      setError(exchangeError.message);
      return;
    }
    await routeSignedInUser();
  };

  const openOAuthSession = async (url: string) => {
    // Prefer in-app auth session when available.
    try {
      const WebBrowser = require('expo-web-browser');
      if (typeof WebBrowser?.maybeCompleteAuthSession === 'function') {
        WebBrowser.maybeCompleteAuthSession();
      }
      if (typeof WebBrowser?.openAuthSessionAsync === 'function') {
        const result = await WebBrowser.openAuthSessionAsync(url, oauthRedirectTo);
        if (result?.type === 'success' && typeof result?.url === 'string') {
          await exchangeCodeFromUrl(result.url);
          return true;
        }
        if (result?.type === 'cancel' || result?.type === 'dismiss') {
          return false;
        }
      }
    } catch {
      // Fallback below to deep-link browser open.
    }

    const opened = await Linking.openURL(url).catch(() => false);
    return !!opened;
  };

  const continueWithAppleNative = async () => {
    // Use runtime require so app can still compile even before package install.
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

      const opened = await openOAuthSession(data.url);
      setLoadingProvider(null);
      if (!opened) {
        setError(`Could not open ${provider} sign in.`);
      }
    })();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.wordmark}>Godena</Text>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Choose the fastest way to continue.
            </Text>
          </View>

          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              activeOpacity={0.85}
              onPress={() => continueWithOAuth('apple')}
              disabled={loadingProvider !== null}
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

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => continueWithOAuth('google')}
            disabled={loadingProvider !== null}
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

          <TouchableOpacity
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/(auth)/phone')}
            disabled={loadingProvider !== null}
          >
            <Ionicons name="call-outline" size={18} color={Colors.ink} />
            <Text style={styles.secondaryBtnText}>Continue with Phone</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tertiaryBtn}
            activeOpacity={0.75}
            onPress={() => router.push('/(auth)/email')}
            disabled={loadingProvider !== null}
          >
            <Text style={styles.tertiaryBtnText}>Continue with Email</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  header: { marginBottom: 28 },
  wordmark: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  title: { fontSize: 34, fontWeight: '900', color: Colors.ink, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.muted, lineHeight: 24 },
  primaryBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
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
    marginBottom: 10,
  },
  secondaryBtnText: { color: Colors.ink, fontSize: 15, fontWeight: '700' },
  tertiaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  tertiaryBtnText: { color: Colors.muted, fontSize: 14, fontWeight: '600' },
  errorText: {
    marginTop: 8,
    color: Colors.error,
    fontSize: 12,
  },
});
