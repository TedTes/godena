import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';

export default function AuthLayout() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;

    const routeIfSignedIn = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!mounted || !userId) return;
      try {
        const route = await resolvePostAuthRoute(userId);
        router.replace(route);
      } catch {
        router.replace('/');
      }
    };

    void routeIfSignedIn();

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user.id;
      if (!userId) return;
      void (async () => {
        try {
          const route = await resolvePostAuthRoute(userId);
          router.replace(route);
        } catch {
          router.replace('/');
        }
      })();
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="email" />
      <Stack.Screen name="phone" />
      <Stack.Screen name="otp" />
    </Stack>
  );
}
