import { supabase } from '../supabase';

export async function hasProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data?.user_id);
}

export async function resolvePostAuthRoute(userId: string): Promise<'/(tabs)/home' | '/profile-setup'> {
  const exists = await hasProfile(userId);
  return exists ? '/(tabs)/home' : '/profile-setup';
}
