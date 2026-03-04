import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { fetchNotificationInboxItems, type InboxItem } from '../lib/services/notificationInbox';

export default function NotificationInboxScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InboxItem[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id;
      if (!uid) {
        setLoading(false);
        router.replace('/(auth)');
        return;
      }

      const nextItems = await fetchNotificationInboxItems(uid);
      setItems(nextItems);
      setLoading(false);
    };

    void load();
  }, [router]);

  const title = useMemo(() => (items.length > 0 ? `Notifications (${items.length})` : 'Notifications'), [items.length]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.spacer} />
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={30} color={Colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No new notifications</Text>
            <Text style={styles.emptySub}>You’re all caught up.</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.item}
                onPress={() => router.push(item.kind === 'intro' ? '/reveal' : `/chat/${item.connectionId}`)}
                activeOpacity={0.85}
              >
                <View style={[styles.itemIcon, item.kind === 'intro' ? styles.itemIconIntro : styles.itemIconMsg]}>
                  <Ionicons
                    name={item.kind === 'intro' ? 'sparkles-outline' : 'chatbubble-ellipses-outline'}
                    size={16}
                    color={item.kind === 'intro' ? Colors.terracotta : Colors.brownMid}
                  />
                </View>
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.itemSub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                <Text style={styles.itemAt}>{item.at}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
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
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 24, gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconIntro: { backgroundColor: 'rgba(196,98,45,0.12)' },
  itemIconMsg: { backgroundColor: Colors.paper },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  itemSub: { marginTop: 2, fontSize: 12, color: Colors.muted },
  itemAt: { fontSize: 11, color: Colors.muted, fontWeight: '600' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  emptySub: { marginTop: 4, fontSize: 13, color: Colors.muted },
});
