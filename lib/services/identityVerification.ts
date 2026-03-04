import { supabase } from '../supabase';

export type VerificationStatus = 'unverified' | 'pending' | 'requires_input' | 'verified' | 'failed' | 'canceled';

export type IdentityVerificationSummary = {
  verification_status: VerificationStatus;
  verification_provider: string | null;
  verification_submitted_at: string | null;
  verified_at: string | null;
};

export type IdentityVerificationAttempt = {
  status: VerificationStatus;
  created_at: string;
  updated_at: string;
  failure_reason: string | null;
};

export async function getSessionUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function fetchVerificationSummary(userId: string) {
  return supabase
    .from('profiles')
    .select('verification_status, verification_provider, verification_submitted_at, verified_at')
    .eq('user_id', userId)
    .maybeSingle<IdentityVerificationSummary>();
}

export async function fetchLatestVerificationAttempt(userId: string) {
  return supabase
    .from('identity_verifications')
    .select('status, created_at, updated_at, failure_reason')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<IdentityVerificationAttempt>();
}

export async function submitPhotoVerification(userId: string, localUri: string) {
  const response = await fetch(localUri);
  const bytes = await response.arrayBuffer();
  const filePath = `${userId}/verification/${Date.now()}-selfie.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('profile-photos')
    .upload(filePath, bytes, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) return { error: uploadError };

  const now = new Date().toISOString();

  const { error: attemptError } = await supabase.from('identity_verifications').insert({
    user_id: userId,
    provider: 'photo_manual_review',
    status: 'pending',
    submitted_at: now,
    metadata: { photo_path: filePath },
  });
  if (attemptError) return { error: attemptError };

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      verification_status: 'pending',
      verification_provider: 'photo_manual_review',
      verification_submitted_at: now,
      verified_at: null,
    })
    .eq('user_id', userId);

  if (profileError) return { error: profileError };
  return { error: null };
}
