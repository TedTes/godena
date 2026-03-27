import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import { supabase } from '../lib/supabase';

const TERMS_VERSION = '2026-03-27';

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

export default function TermsAcceptScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const nextRoute = useMemo(() => (next && next.length > 0 ? next : '/(tabs)/home'), [next]);

  const handleAccept = async () => {
    if (!accepted || saving) return;
    setSaving(true);
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) {
      setSaving(false);
      router.replace('/(auth)');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION })
      .eq('user_id', uid);

    setSaving(false);
    if (error) {
      Alert.alert('Could not continue', error.message);
      return;
    }
    router.replace(nextRoute);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Terms & Safety</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.updated}>Last updated: March 2026</Text>
          <Section
            title="Community Standards"
            body="You must treat other members respectfully and avoid abusive or illegal content. We may remove content or accounts that violate these standards."
          />
          <Section
            title="User-Generated Content"
            body="Posts, group chats, and event discussions are user-generated. You can report or block members who violate these terms."
          />
          <Section
            title="Safety"
            body="Meet others safely and use in-app reporting if you see inappropriate behavior."
          />

          <TouchableOpacity onPress={() => router.push('/terms')} style={styles.linkRow}>
            <Ionicons name="document-text-outline" size={16} color={Colors.brownMid} />
            <Text style={styles.linkText}>Read full Terms of Service</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/privacy-policy')} style={styles.linkRow}>
            <Ionicons name="shield-outline" size={16} color={Colors.brownMid} />
            <Text style={styles.linkText}>Read Privacy Policy</Text>
          </TouchableOpacity>

          <View style={styles.acceptRow}>
            <Switch
              value={accepted}
              onValueChange={setAccepted}
              trackColor={{ false: Colors.border, true: Colors.olive }}
              thumbColor={Colors.white}
            />
            <Text style={styles.acceptText}>I agree to the Terms of Service and Privacy Policy.</Text>
          </View>

          <TouchableOpacity
            style={[styles.acceptBtn, (!accepted || saving) && styles.acceptBtnDisabled]}
            onPress={handleAccept}
            disabled={!accepted || saving}
            activeOpacity={0.85}
          >
            <Text style={styles.acceptBtnText}>{saving ? 'Saving…' : 'Agree & Continue'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },
  updated: { fontSize: 12, color: Colors.muted, marginBottom: 4 },
  sectionCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  sectionBody: { fontSize: 13, color: Colors.brownMid, lineHeight: 20 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  linkText: { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  acceptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  acceptText: { flex: 1, fontSize: 13, color: Colors.brownMid, lineHeight: 18 },
  acceptBtn: {
    height: 50,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnDisabled: { backgroundColor: Colors.border },
  acceptBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
