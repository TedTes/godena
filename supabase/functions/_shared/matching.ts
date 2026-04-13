export type MatchProfile = {
  gender: string | null;
  preferred_genders: string[] | null;
  preferred_age_min: number | null;
  preferred_age_max: number | null;
  birth_date: string | null;
};

export function pairOrder(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function pairKey(groupId: string, a: string, b: string) {
  const [u1, u2] = pairOrder(a, b);
  return `${groupId}:${u1}:${u2}`;
}

export function ageFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

export function acceptsGender(preferred: string[] | null | undefined, targetGender: string | null | undefined) {
  if (!preferred || preferred.length === 0) return true;
  if (!targetGender) return false;
  return preferred.includes(targetGender);
}

export function acceptsAge(minAge: number | null, maxAge: number | null, targetAge: number | null) {
  if (minAge == null && maxAge == null) return true;
  if (targetAge == null) return false;
  if (minAge != null && targetAge < minAge) return false;
  if (maxAge != null && targetAge > maxAge) return false;
  return true;
}

export function preferencesMatch(a: MatchProfile, b: MatchProfile) {
  const ageA = ageFromBirthDate(a.birth_date);
  const ageB = ageFromBirthDate(b.birth_date);

  const aAcceptsB = acceptsGender(a.preferred_genders, b.gender)
    && acceptsAge(a.preferred_age_min, a.preferred_age_max, ageB);
  const bAcceptsA = acceptsGender(b.preferred_genders, a.gender)
    && acceptsAge(b.preferred_age_min, b.preferred_age_max, ageA);

  return aAcceptsB && bAcceptsA;
}
