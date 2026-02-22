import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockGroups } from '../../data/mock';
import { supabase } from '../../lib/supabase';

const settingsRows = [
  { icon: 'notifications-outline', label: 'Notifications', value: '' },
  { icon: 'shield-outline', label: 'Privacy & Safety', value: '' },
  { icon: 'star-outline', label: 'Upgrade to Premium', value: '', accent: true },
  { icon: 'help-circle-outline', label: 'Help & Feedback', value: '' },
  { icon: 'log-out-outline', label: 'Sign Out', value: '', danger: true },
];

function formatIntent(intent: string) {
  switch (intent) {
    case 'long_term':
      return 'Long-term';
    case 'friendship':
      return 'Friendship';
    case 'marriage':
      return 'Marriage';
    default:
      return 'Dating';
  }
}

export default function ProfileScreen() {
  const router = useRouter();
  const myGroups = mockGroups.filter((g) => g.isMember);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState<{
    full_name: string;
    city: string | null;
    bio: string | null;
    birth_date: string | null;
    ethnicity: string | null;
    religion: string | null;
    languages: string[] | null;
    intent: string;
  } | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(myGroups.map((g) => [g.id, g.isOpenToConnect]))
  );

  useEffect(() => {
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setLoadingProfile(false);
        router.replace('/(auth)/phone');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('full_name, city, bio, birth_date, ethnicity, religion, languages, intent')
        .eq('user_id', userId)
        .maybeSingle();

      setProfile(data ?? null);
      setLoadingProfile(false);
    };

    void loadProfile();
  }, [router]);

  const age = useMemo(() => {
    if (!profile?.birth_date) {
      return null;
    }
    const birthYear = new Date(profile.birth_date).getFullYear();
    if (!birthYear) {
      return null;
    }
    return new Date().getFullYear() - birthYear;
  }, [profile?.birth_date]);

  const name = profile?.full_name ?? 'New Member';
  const city = profile?.city ?? 'Unknown city';
  const bio = profile?.bio ?? 'No bio added yet.';
  const ethnicity = profile?.ethnicity ?? 'Habesha';
  const religion = profile?.religion ?? 'Not set';
  const languages = profile?.languages ?? [];
  const intent = formatIntent(profile?.intent ?? 'dating');

  const toggleGroup = (id: string, val: boolean) => {
    setOpenGroups((prev) => ({ ...prev, [id]: val }));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/onboarding');
  };

  if (loadingProfile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.headerBg}>
            <View style={styles.headerContent}>
              <View style={styles.photoWrap}>
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoInitial}>{name[0] ?? '?'}</Text>
                </View>
                <TouchableOpacity style={styles.editPhotoBtn}>
                  <Ionicons name="camera" size={14} color={Colors.white} />
                </TouchableOpacity>
              </View>
              <Text style={styles.name}>{name}</Text>
              <Text style={styles.subInfo}>
                {age ? `${age} · ` : ''}{city}
              </Text>
              <TouchableOpacity style={styles.editProfileBtn}>
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bio */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.bioText}>{bio}</Text>
          </View>

          {/* Tags */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Identity</Text>
            <View style={styles.tagRow}>
              <View style={styles.tag}><Text style={styles.tagText}>🇪🇹 {ethnicity}</Text></View>
              <View style={styles.tag}><Text style={styles.tagText}>✝️ {religion}</Text></View>
              {languages.map((l) => (
                <View key={l} style={styles.tag}><Text style={styles.tagText}>🗣️ {l}</Text></View>
              ))}
              <View style={styles.tag}><Text style={styles.tagText}>💛 {intent}</Text></View>
            </View>
          </View>

          {/* Openness per group */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>Openness Signals</Text>
              <View style={styles.privateTag}>
                <Ionicons name="lock-closed" size={10} color={Colors.muted} />
                <Text style={styles.privateTagText}>Private</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtext}>
              Only visible to you. A reveal only fires when it's mutual and you've genuinely connected.
            </Text>
            {myGroups.map((g) => (
              <View key={g.id} style={styles.openRow}>
                <View style={[styles.openGroupDot, { backgroundColor: g.coverColor }]}>
                  <Text style={styles.openGroupEmoji}>{g.emoji}</Text>
                </View>
                <View style={styles.openGroupInfo}>
                  <Text style={styles.openGroupName}>{g.name}</Text>
                  <Text style={styles.openGroupState}>
                    {openGroups[g.id] ? '🌱 Open to a connection' : 'Not signalling'}
                  </Text>
                </View>
                <Switch
                  value={openGroups[g.id] || false}
                  onValueChange={(val) => toggleGroup(g.id, val)}
                  trackColor={{ false: Colors.border, true: Colors.olive }}
                  thumbColor={Colors.white}
                />
              </View>
            ))}
          </View>

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={styles.settingsCard}>
              {settingsRows.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[
                    styles.settingsRow,
                    i < settingsRows.length - 1 && styles.settingsRowBorder,
                  ]}
                  onPress={row.label === 'Sign Out' ? signOut : undefined}
                  activeOpacity={0.7}
                >
                  <View style={[styles.settingsIcon, row.accent && styles.settingsIconAccent, row.danger && styles.settingsIconDanger]}>
                    <Ionicons
                      name={row.icon as any}
                      size={18}
                      color={row.danger ? Colors.error : row.accent ? Colors.terracotta : Colors.brownMid}
                    />
                  </View>
                  <Text style={[styles.settingsLabel, row.danger && styles.settingsLabelDanger, row.accent && styles.settingsLabelAccent]}>
                    {row.label}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },

  headerBg: { backgroundColor: Colors.brown, paddingBottom: 32 },
  headerContent: { alignItems: 'center', paddingTop: Spacing.lg, paddingHorizontal: Spacing.lg },
  photoWrap: { position: 'relative', marginBottom: 14 },
  photoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.terraLight,
  },
  photoInitial: { fontSize: 38, fontWeight: '900', color: Colors.white },
  editPhotoBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brownMid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },
  name: { fontSize: 24, fontWeight: '900', color: Colors.cream, marginBottom: 4 },
  subInfo: { fontSize: 13, color: Colors.brownLight, marginBottom: 16 },
  editProfileBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  editProfileText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: Spacing.lg,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionSubtext: {
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
    marginBottom: 12,
    marginTop: -4,
  },
  privateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  privateTagText: { fontSize: 9, color: Colors.muted, fontWeight: '600' },

  bioText: { fontSize: 14, color: Colors.brownMid, lineHeight: 22 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: { fontSize: 12, color: Colors.brownMid, fontWeight: '500' },

  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  openGroupDot: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openGroupEmoji: { fontSize: 22 },
  openGroupInfo: { flex: 1 },
  openGroupName: { fontSize: 13, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  openGroupState: { fontSize: 11, color: Colors.muted },

  settingsCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  settingsRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: { backgroundColor: 'rgba(196,98,45,0.1)' },
  settingsIconDanger: { backgroundColor: 'rgba(217,79,79,0.1)' },
  settingsLabel: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '500' },
  settingsLabelDanger: { color: Colors.error },
  settingsLabelAccent: { color: Colors.terracotta, fontWeight: '600' },
});
