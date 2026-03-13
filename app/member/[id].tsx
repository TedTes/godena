import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { fetchGroupMemberProfile } from '../../lib/services/groupDetail';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';

type MemberProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  gender: string | null;
  intent: string | null;
  languages: string[] | null;
  ethnicity: string | null;
  religion: string | null;
  birth_date: string | null;
};

function calcAge(birthDate: string | null) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age > 0 ? age : null;
}

export default function MemberProfileScreen() {
  const router = useRouter();
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfileRow | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id || !groupId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await fetchGroupMemberProfile(groupId, id);
      if (!error) {
        const row = ((data as MemberProfileRow[] | null) ?? [])[0] ?? null;
        setProfile(row);
        if (row?.avatar_url) {
          const resolved = await resolveProfilePhotoUrl(row.avatar_url);
          setAvatarUri(resolved);
        } else {
          setAvatarUri(null);
        }
      }
      setLoading(false);
    };

    void load();
  }, [id, groupId]);

  const age = useMemo(() => calcAge(profile?.birth_date ?? null), [profile?.birth_date]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.terracotta} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={Colors.ink} />
            </TouchableOpacity>
            <Text style={styles.title}>Member Profile</Text>
            <View style={styles.backBtn} />
          </View>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Could not load member profile.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const chips = [
    profile.city,
    profile.gender,
    profile.ethnicity,
    profile.religion,
    profile.languages?.length ? profile.languages.join(', ') : null,
  ].filter(Boolean) as string[];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Member Profile</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(profile.full_name?.[0] || 'M').toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{profile.full_name || 'Member'}</Text>
          {age ? <Text style={styles.subline}>{age} years old</Text> : null}

          {profile.bio ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>About</Text>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : null}

          {chips.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Info</Text>
              <View style={styles.chipsWrap}>
                {chips.map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: 12,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.muted, fontSize: 14 },
  avatarWrap: { alignItems: 'center', marginTop: 4 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarFallback: {
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: Colors.white, fontSize: 36, fontWeight: '800' },
  name: { textAlign: 'center', fontSize: 24, fontWeight: '800', color: Colors.ink },
  subline: { textAlign: 'center', color: Colors.muted, marginTop: -4, marginBottom: 2 },
  card: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bioText: { fontSize: 14, lineHeight: 21, color: Colors.brownMid },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipText: { fontSize: 12, color: Colors.ink, fontWeight: '600' },
});
