import React, { useEffect, useMemo, useState } from 'react';
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
import {
  fetchNotificationPrefs,
  getSessionUserId,
  updateNotificationPrefs,
  type NotificationPrefs,
} from '../lib/services/notifications';

export default function NotificationsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<keyof NotificationPrefs | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    notify_group_messages: true,
    notify_connection_messages: true,
    notify_events: true,
    notify_marketing: false,
  });

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
      const { data, error } = await fetchNotificationPrefs(uid);
      if (!error && data) {
        setPrefs({
          notify_group_messages: data.notify_group_messages,
          notify_connection_messages: data.notify_connection_messages,
          notify_events: data.notify_events,
          notify_marketing: data.notify_marketing,
        });
      }
      setLoading(false);
    };
    void load();
  }, [router]);

  const rows = useMemo(
    () => [
      { key: 'notify_group_messages' as const, title: 'Group messages', subtitle: 'New messages in your joined groups' },
      { key: 'notify_connection_messages' as const, title: 'Connection messages', subtitle: '1:1 chat messages from accepted connections' },
      { key: 'notify_events' as const, title: 'Events', subtitle: 'RSVP and upcoming event reminders' },
      { key: 'notify_marketing' as const, title: 'Product updates', subtitle: 'Tips, release notes, and optional announcements' },
    ],
    []
  );

  const toggle = (key: keyof NotificationPrefs, value: boolean) => {
    if (!userId || busyKey) return;
    const prev = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    setBusyKey(key);
    void (async () => {
      const { error } = await updateNotificationPrefs(userId, { [key]: value });
      setBusyKey(null);
      if (error) {
        setPrefs((p) => ({ ...p, [key]: prev }));
        Alert.alert('Update failed', error.message);
      }
    })();
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Notifications</Text>
          <View style={styles.spacer} />
        </View>

        <View style={styles.card}>
          {rows.map((row, i) => (
            <View key={row.key} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={styles.rowLeft}>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <Text style={styles.rowSub}>{row.subtitle}</Text>
              </View>
              <View style={styles.rowRight}>
                {busyKey === row.key ? (
                  <ActivityIndicator size="small" color={Colors.muted} />
                ) : (
                  <Switch
                    value={prefs[row.key]}
                    onValueChange={(v) => toggle(row.key, v)}
                    trackColor={{ false: Colors.border, true: Colors.olive }}
                    thumbColor={Colors.white}
                  />
                )}
              </View>
            </View>
          ))}
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
    gap: 10,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  rowLeft: { flex: 1 },
  rowRight: { minWidth: 46, alignItems: 'flex-end' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  rowSub: { marginTop: 2, fontSize: 12, color: Colors.muted, lineHeight: 17 },
});
