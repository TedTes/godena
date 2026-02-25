import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolvePostAuthRoute } from '../lib/services/auth';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [routeError, setRouteError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setRouteError('');

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const getStableSession = async () => {
      for (let i = 0; i < 6; i += 1) {
        const { data, error } = await supabase.auth.getSession();
        if (error) return { session: null, error };
        if (data.session) return { session: data.session, error: null };
        // Fresh login can take a moment to hydrate persisted session on native.
        await wait(250);
      }
      return { session: null, error: null };
    };

    const bootstrap = async () => {
      const { session, error } = await getStableSession();

      if (!mounted) {
        return;
      }

      if (error) {
        router.replace('/(auth)');
        setLoading(false);
        return;
      }

      if (!session) {
        router.replace('/(auth)');
        setLoading(false);
        return;
      }

      try {
        const route = await resolvePostAuthRoute(session.user.id);
        router.replace(route);
      } catch (profileError) {
        if (!mounted) return;
        setRouteError('Could not load your profile. Check your connection and retry.');
        setLoading(false);
        return;
      }
      setLoading(false);
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [router, retryNonce]);

  if (routeError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Unable to continue</Text>
        <Text style={styles.errorText}>{routeError}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => setRetryNonce((prev) => prev + 1)}
          activeOpacity={0.85}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={Colors.terracotta} />
      </View>
    );
  }

  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: Colors.muted,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
