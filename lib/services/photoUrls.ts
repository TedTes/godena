import { supabase } from '../supabase';

export async function resolveProfilePhotoUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;

  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
    return value;
  }

  // Local device paths are not shareable/readable across users/devices.
  // Treat them as unresolved so callers can show fallback UI instead of warnings.
  if (value.startsWith('file://') || value.startsWith('content://') || value.startsWith('/')) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from('profile-photos')
    .createSignedUrl(value, 60 * 60);
  if (!error && data?.signedUrl) return data.signedUrl;

  const { data: publicData } = supabase.storage.from('profile-photos').getPublicUrl(value);
  return publicData?.publicUrl ?? null;
}
