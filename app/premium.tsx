import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Colors, Radius, Spacing } from '../constants/theme';
import { createStripeCheckoutSession, fetchMyPremiumStatus } from '../lib/services/billing';
import { supabase } from '../lib/supabase';

export default function PremiumScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id ?? null;
      if (!uid) {
        setLoading(false);
        return;
      }

      const { data: profileRow } = await fetchMyPremiumStatus(uid);
      setIsPremium(!!profileRow?.is_premium);
      setLoading(false);
    };

    void load();
  }, []);

  const startCheckout = () => {
    void (async () => {
      if (startingCheckout) return;
      setStartingCheckout(true);
      const { data, error } = await createStripeCheckoutSession();
      setStartingCheckout(false);

      const url = (data as { url?: string } | null)?.url;
      if (error || !url) return;
      await Linking.openURL(url);
    })();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Premium</Text>
          <View style={styles.backBtn} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>
        ) : (
          <View style={styles.content}>
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>
                {isPremium ? 'You are Premium' : 'Upgrade to Premium'}
              </Text>
              <Text style={styles.heroSub}>
                Unlimited groups, reveal history, and priority in the reveal queue.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Premium includes</Text>
              <Text style={styles.row}>• Unlimited group joins</Text>
              <Text style={styles.row}>• Reveal history in Connections</Text>
              <Text style={styles.row}>• Priority in reveal queue</Text>
            </View>

            {isPremium ? (
              <View style={styles.activePill}>
                <Text style={styles.activeText}>Active</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.cta}
                onPress={startCheckout}
                disabled={startingCheckout}
              >
                {startingCheckout ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.ctaText}>Continue to secure checkout</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: Colors.ink },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: 16 },
  hero: {
    backgroundColor: Colors.brown,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroTitle: { color: Colors.cream, fontSize: 22, fontWeight: '900' },
  heroSub: { color: Colors.brownLight, marginTop: 8, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 8,
  },
  cardTitle: { color: Colors.ink, fontSize: 14, fontWeight: '700' },
  row: { color: Colors.brownMid, fontSize: 13 },
  cta: {
    marginTop: 8,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: Colors.white, fontWeight: '800', fontSize: 14 },
  activePill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: Colors.olive,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeText: { color: Colors.white, fontWeight: '800', fontSize: 12 },
});
