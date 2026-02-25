import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { resolvePostAuthRoute } from '../lib/services/auth';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

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

      const route = await resolvePostAuthRoute(session.user.id);
      router.replace(route);
      setLoading(false);
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={Colors.terracotta} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
