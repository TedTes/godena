import { supabase } from '../supabase';

export const DEFAULT_FREE_GROUP_LIMIT = 5;

export async function fetchMyPremiumStatus(userId: string) {
  return supabase
    .from('profiles')
    .select('is_premium')
    .eq('user_id', userId)
    .maybeSingle();
}

export async function fetchMyGroupMembershipCount(userId: string) {
  return supabase
    .from('group_memberships')
    .select('group_id', { count: 'exact', head: true })
    .eq('user_id', userId);
}

export async function fetchFreeGroupJoinLimit() {
  const { data, error } = await supabase
    .from('matching_config')
    .select('free_group_join_limit')
    .eq('id', 1)
    .single();

  if (error) return { limit: DEFAULT_FREE_GROUP_LIMIT, error };
  return { limit: Number(data?.free_group_join_limit ?? DEFAULT_FREE_GROUP_LIMIT), error: null };
}

export async function canUserJoinAnotherGroup(userId: string) {
  const [{ data: premiumRow }, countRes, limitRes] = await Promise.all([
    fetchMyPremiumStatus(userId),
    fetchMyGroupMembershipCount(userId),
    fetchFreeGroupJoinLimit(),
  ]);

  const isPremium = !!premiumRow?.is_premium;
  const membershipCount = countRes.count ?? 0;
  const freeLimit = limitRes.limit;

  if (isPremium) {
    return { allowed: true, isPremium: true, membershipCount, freeLimit };
  }

  return {
    allowed: membershipCount < freeLimit,
    isPremium: false,
    membershipCount,
    freeLimit,
  };
}

export async function createStripeCheckoutSession() {
  return supabase.functions.invoke('stripe-create-checkout', {
    body: {},
  });
}
