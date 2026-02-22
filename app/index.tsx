import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/theme';
import { supabase } from '../lib/supabase';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!mounted) {
        return;
      }

      if (error) {
        router.replace('/onboarding');
        setLoading(false);
        return;
      }

      if (!data.session) {
        router.replace('/onboarding');
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('user_id', data.session.user.id)
        .maybeSingle();

      router.replace(profile ? '/(tabs)/home' : '/profile-setup');
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
