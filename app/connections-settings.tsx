import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  const [busyKey, setBusyKey] = useState<'dating' | 'open' | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [datingModeOn, setDatingModeOn] = useState(false);
  const [openToConnections, setOpenToConnections] = useState(true);

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

      const [{ data: profileData }, { data: datingData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('is_open_to_connections')
          .eq('user_id', uid)
          .maybeSingle(),
        supabase
          .from('dating_profiles')
          .select('is_enabled')
          .eq('user_id', uid)
          .maybeSingle(),
      ]);

      setOpenToConnections(profileData?.is_open_to_connections ?? true);
      setDatingModeOn(datingData?.is_enabled ?? false);
      setLoading(false);
    };

    void load();
  }, [router]);

  const updateOpenToConnections = async (value: boolean) => {
    if (!userId || busyKey) return;
    const prev = openToConnections;
    setBusyKey('open');
    setOpenToConnections(value);

    const { error } = await supabase
      .from('profiles')
      .update({ is_open_to_connections: value })
      .eq('user_id', userId);

    if (error) {
      setOpenToConnections(prev);
      Alert.alert('Update failed', error.message);
    }

    setBusyKey(null);
  };

  const persistDatingMode = async (value: boolean) => {
    if (!userId || busyKey) return;
    const prev = datingModeOn;
    setBusyKey('dating');
    setDatingModeOn(value);

    const { error } = await supabase
      .from('dating_profiles')
      .upsert({ user_id: userId, is_enabled: value }, { onConflict: 'user_id' });

    if (error) {
      setDatingModeOn(prev);
      Alert.alert('Update failed', error.message);
    }

    setBusyKey(null);
  };

  const updateDatingMode = async (value: boolean) => {
    if (!userId || busyKey) return;
    if (value && !datingModeOn) {
      Alert.alert(
        'Enable Dating Mode?',
        'Dating Mode uses your dating preferences to show swipe candidates and create matches.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => { void persistDatingMode(true); } },
        ]
      );
      return;
    }

    await persistDatingMode(value);
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

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(92,143,98,0.14)' }]}>
              <Ionicons name="heart-half-outline" size={18} color={Colors.success} />
            </View>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTitle}>Dating Mode</Text>
              <Text style={styles.rowSub}>Use your dating preferences to show swipe candidates and match with potential partners.</Text>
            </View>
            <View style={styles.rowRight}>
              {busyKey === 'dating' ? (
                <ActivityIndicator size="small" color={Colors.success} />
              ) : (
                <Switch
                  value={datingModeOn}
                  onValueChange={(value) => { void updateDatingMode(value); }}
                  trackColor={{ false: Colors.borderDark, true: Colors.success }}
                  thumbColor={Colors.warmWhite}
                  ios_backgroundColor={Colors.borderDark}
                />
              )}
            </View>
          </View>

          <View style={[styles.row, styles.rowDivider]}>
            <View style={[styles.iconWrap, { backgroundColor: 'rgba(92,143,98,0.14)' }]}>
              <Ionicons name="sparkles-outline" size={18} color={Colors.success} />
            </View>
            <View style={styles.rowLeft}>
              <Text style={styles.rowTitle}>Open to Connect</Text>
              <Text style={styles.rowSub}>Find potential partner through shared groups, events, and mutual community introductions.</Text>
            </View>
            <View style={styles.rowRight}>
              {busyKey === 'open' ? (
                <ActivityIndicator size="small" color={Colors.success} />
              ) : (
                <Switch
                  value={openToConnections}
                  onValueChange={(value) => { void updateOpenToConnections(value); }}
                  trackColor={{ false: Colors.borderDark, true: Colors.success }}
                  thumbColor={Colors.warmWhite}
                  ios_backgroundColor={Colors.borderDark}
                />
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
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
