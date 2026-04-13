import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function getSessionUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Keep Realtime auth in sync with the current session JWT so RLS-based
// postgres_changes subscriptions receive events for authenticated users.
void supabase.auth.getSession().then(({ data }) => {
  const token = data.session?.access_token ?? supabaseAnonKey;
  supabase.realtime.setAuth(token);
});

supabase.auth.onAuthStateChange((_event, session) => {
  const token = session?.access_token ?? supabaseAnonKey;
  supabase.realtime.setAuth(token);
});
