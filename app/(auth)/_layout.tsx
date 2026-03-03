import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { resolvePostAuthRoute } from '../../lib/services/auth';

export default function AuthLayout() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    // Prevent double-navigation when callback.tsx and this layout both try to route
    // simultaneously after an OAuth exchange.
    const navigating = { current: false };

    const navigateIfSignedIn = async (userId: string) => {
      if (navigating.current || !mounted) return;
      navigating.current = true;
      try {
        const route = await resolvePostAuthRoute(userId);
        if (mounted) router.replace(route);
      } catch {
        if (mounted) router.replace('/');
      }
    };

    const routeIfSignedIn = async () => {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) return;
      await navigateIfSignedIn(userId);
    };

    void routeIfSignedIn();

    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      // Only react to a new sign-in; ignore token refreshes and other state changes.
      if (event !== 'SIGNED_IN') return;
      const userId = session?.user.id;
      if (!userId) return;
      void navigateIfSignedIn(userId);
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
