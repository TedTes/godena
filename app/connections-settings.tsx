import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import { getSessionUserId } from '../lib/services/notifications';
import { supabase } from '../lib/supabase';

export default function ConnectionsSettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<'open' | 'bulk_on' | 'bulk_off' | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showInGroups, setShowInGroups] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const uid = await getSessionUserId();
      if (!uid) {
        setLoading(false);
        router.replace('/(auth)');
        return;
      }

      setUserId(uid);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('is_open_to_connections')
        .eq('user_id', uid)
        .maybeSingle();

      setShowInGroups(profileData?.is_open_to_connections ?? true);
      setLoading(false);
    };

    void load();
  }, [router]);

  const updateShowInGroups = async (value: boolean) => {
    if (!userId || busyKey) return;
    const prev = showInGroups;
    setBusyKey('open');
    setShowInGroups(value);

    const { error } = await supabase
      .from('profiles')
      .update({ is_open_to_connections: value })
      .eq('user_id', userId);

    if (error) {
      setShowInGroups(prev);
      Alert.alert('Update failed', error.message);
    }

    setBusyKey(null);
  };

  const bulkSetGroupOpenness = async (value: boolean) => {
    if (!userId || busyKey) return;
    setBusyKey(value ? 'bulk_on' : 'bulk_off');

    const { error } = await supabase
      .from('group_memberships')
      .update({ is_open_to_connect: value, openness_set_at: value ? new Date().toISOString() : null })
      .eq('user_id', userId);

    setBusyKey(null);

    if (error) {
      Alert.alert('Update failed', error.message);
    } else {
      Alert.alert(
        value ? 'Opened in all groups' : 'Closed in all groups',
        value
          ? 'You are now open to introductions in all your groups.'
          : 'Your open signal has been removed from all groups.'
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Connections</Text>
          <View style={styles.spacer} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(196,98,45,0.12)' }]}>
                <Ionicons name="sparkles-outline" size={18} color={Colors.terracotta} />
              </View>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>Visible in Groups</Text>
                <Text style={styles.rowSub}>Allow others to know you're open to introductions. You still choose per group whether to signal openness.</Text>
              </View>
              <View style={styles.rowRight}>
                {busyKey === 'open' ? (
                  <ActivityIndicator size="small" color={Colors.terracotta} />
                ) : (
                  <Switch
                    value={showInGroups}
                    onValueChange={(value) => { void updateShowInGroups(value); }}
                    trackColor={{ false: Colors.borderDark, true: Colors.terracotta }}
                    thumbColor={Colors.warmWhite}
                    ios_backgroundColor={Colors.borderDark}
                  />
                )}
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Group openness</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() => {
                Alert.alert(
                  'Turn on for all groups?',
                  "You'll be marked as open to introductions in every group you belong to.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Turn on', onPress: () => { void bulkSetGroupOpenness(true); } },
                  ]
                );
              }}
            >
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(196,98,45,0.12)' }]}>
                {busyKey === 'bulk_on' ? (
                  <ActivityIndicator size="small" color={Colors.terracotta} />
                ) : (
                  <Ionicons name="leaf-outline" size={18} color={Colors.terracotta} />
                )}
              </View>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>Open in all groups</Text>
                <Text style={styles.rowSub}>Signal openness to introductions across every group at once.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, styles.rowDivider]}
              activeOpacity={0.75}
              onPress={() => {
                Alert.alert(
                  'Turn off for all groups?',
                  'Your open signal will be removed from every group you belong to.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Turn off', style: 'destructive', onPress: () => { void bulkSetGroupOpenness(false); } },
                  ]
                );
              }}
            >
              <View style={[styles.iconWrap, { backgroundColor: 'rgba(100,100,100,0.08)' }]}>
                {busyKey === 'bulk_off' ? (
                  <ActivityIndicator size="small" color={Colors.muted} />
                ) : (
                  <Ionicons name="eye-off-outline" size={18} color={Colors.muted} />
                )}
              </View>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>Close in all groups</Text>
                <Text style={styles.rowSub}>Remove your open signal from every group at once.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  scroll: { paddingTop: Spacing.sm, paddingBottom: 40 },
  sectionLabel: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  loadingWrap: { flex: 1, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
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
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  spacer: { width: 36, height: 36 },
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    gap: 12,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLeft: { flex: 1 },
  rowRight: { minWidth: 46, alignItems: 'flex-end' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  rowSub: { marginTop: 2, fontSize: 12, color: Colors.muted, lineHeight: 17 },
});
