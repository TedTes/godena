import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { Colors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';

export default function OAuthCallbackScreen() {
  const router = useRouter();
  // expo-router parses ?code=, ?access_token=, ?error= from the deep link into params.
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  }>();
  const [message, setMessage] = useState('Finishing sign in...');
  const handledRef = useRef(false);

  useEffect(() => {
    const handleFromUrl = async (incomingUrl: string) => {
      if (handledRef.current) return;
      if (__DEV__) {
        const initialUrl = await Linking.getInitialURL();
        console.log('[Callback] params:', JSON.stringify(params));
        console.log('[Callback] initialURL:', initialUrl);
        console.log('[Callback] incomingURL:', incomingUrl);
      }

      // --- Provider error ---
      const parsed = Linking.parse(incomingUrl || 'godena://auth/callback');
      const query = (parsed.queryParams ?? {}) as Record<string, string | undefined>;
      const hash = incomingUrl?.includes('#') ? incomingUrl.slice(incomingUrl.indexOf('#') + 1) : '';
      const hp = new URLSearchParams(hash);

      const authError =
        params.error_description ??
        params.error ??
        query.error_description ??
        query.error ??
        null;
      if (authError) {
        setMessage(authError);
        setTimeout(() => router.replace('/(auth)'), 900);
        return;
      }

      // --- Guard: session already present (e.g. exchanged by another handler) ---
      const existing = await supabase.auth.getSession();
      if (existing.data.session?.user?.id) {
        if (__DEV__) console.log('[Callback] session already present — routing');
        const route = await resolvePostAuthRoute(existing.data.session.user.id);
        router.replace(route);
        return;
      }

      // --- PKCE flow: ?code=... (Supabase default for mobile) ---
      const code = params.code ?? query.code ?? hp.get('code') ?? null;
      const accessToken = params.access_token ?? query.access_token ?? hp.get('access_token') ?? null;
      const refreshToken = params.refresh_token ?? query.refresh_token ?? hp.get('refresh_token') ?? null;

      if (code) {
        if (__DEV__) console.log('[Callback] path: PKCE code exchange');
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          // Code may have been consumed in a concurrent render — re-check session before failing.
          const retry = await supabase.auth.getSession();
          if (retry.data.session?.user?.id) {
            const route = await resolvePostAuthRoute(retry.data.session.user.id);
            router.replace(route);
            return;
          }
          setMessage(exchangeError.message);
          setTimeout(() => router.replace('/(auth)'), 900);
          return;
        }
      }

      // --- Implicit flow: tokens in query params (expo-router parses these) ---
      if (accessToken && refreshToken) {
        if (__DEV__) console.log('[Callback] path: tokens from query params');
        const { error: setErr } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (setErr) {
          setMessage(setErr.message);
          setTimeout(() => router.replace('/(auth)'), 900);
          return;
        }
      }

      // --- Hydration wait: give AsyncStorage a moment to persist the session ---
      let userId: string | null = null;
      for (let i = 0; i < 3; i++) {
        const { data } = await supabase.auth.getSession();
        userId = data.session?.user.id ?? null;
        if (userId) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      if (!userId) {
        if (__DEV__) console.log('[Callback] no session after exchange yet');
        return;
      }

      try {
        handledRef.current = true;
        const route = await resolvePostAuthRoute(userId);
        router.replace(route);
      } catch {
        handledRef.current = true;
        router.replace('/(tabs)/home');
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleFromUrl(url);
    });

    void (async () => {
      const initialUrl = (await Linking.getInitialURL()) ?? 'godena://auth/callback';
      await handleFromUrl(initialUrl);
      if (!handledRef.current) {
        setTimeout(() => {
          if (!handledRef.current) router.replace('/(auth)');
        }, 5000);
      }
    })();

    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, params.access_token, params.refresh_token, params.error, params.error_description]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <ActivityIndicator size="large" color={Colors.terracotta} />
          <Text style={styles.message}>{message}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  message: {
    marginTop: 12,
    color: Colors.muted,
    fontSize: 14,
    textAlign: 'center',
  },
});
