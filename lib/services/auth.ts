import { supabase } from '../supabase';

export async function hasProfile(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, deleted_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return Boolean(data?.user_id && !data.deleted_at);
}

export async function resolvePostAuthRoute(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, deleted_at, terms_accepted_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.user_id) return '/profile-setup';
  if (data.deleted_at) {
    await supabase.auth.signOut();
    return '/(auth)';
  }
  if (!data.terms_accepted_at) {
    return '/terms-accept?next=/(tabs)/home';
  }
  return '/(tabs)/home';
}
