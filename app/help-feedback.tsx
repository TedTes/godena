import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';
import {
  fetchMyFeedback,
  getSessionUserId,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackRow,
} from '../lib/services/helpFeedback';

const CATEGORIES: Array<{ label: string; value: FeedbackCategory }> = [
  { label: 'Bug', value: 'bug' },
  { label: 'Feedback', value: 'feedback' },
  { label: 'Account', value: 'account' },
  { label: 'Billing', value: 'billing' },
  { label: 'Other', value: 'other' },
];

export default function HelpFeedbackScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>('feedback');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [tickets, setTickets] = useState<FeedbackRow[]>([]);

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
      const { data } = await fetchMyFeedback(uid);
      setTickets(((data as FeedbackRow[] | null) ?? []));
      setLoading(false);
    };
    void load();
  }, [router]);

  const sendDisabled = useMemo(
    () => sending || !subject.trim() || !message.trim() || !userId,
    [sending, subject, message, userId]
  );

  const handleSubmit = () => {
    if (!userId || sendDisabled) return;
    void (async () => {
      setSending(true);
      const { data, error } = await submitFeedback({
        userId,
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSending(false);
      if (error || !data) {
        Alert.alert('Could not submit', error?.message || 'Unknown error');
        return;
      }
      setTickets((prev) => [data as FeedbackRow, ...prev]);
      setSubject('');
      setMessage('');
      Alert.alert('Submitted', "Thanks — we'll review your message soon.");
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
          <Text style={styles.title}>Help & Feedback</Text>
          <View style={styles.spacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.faqCard}>
            <Text style={styles.faqTitle}>Quick Help</Text>
            <Text style={styles.faqText}>1. Login issues: try sign out/sign in once, then retry OAuth.</Text>
            <Text style={styles.faqText}>2. Missing matches: check openness toggles and profile preferences.</Text>
            <Text style={styles.faqText}>3. Chat delay: reopen chat once to refresh realtime channel.</Text>
          </View>

          <Text style={styles.sectionLabel}>Send a message</Text>
          <View style={styles.formCard}>
            <View style={styles.chipsWrap}>
              {CATEGORIES.map((c) => {
                const active = c.value === category;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setCategory(c.value)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="Subject"
              placeholderTextColor={Colors.muted}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your issue or feedback..."
              placeholderTextColor={Colors.muted}
              multiline
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, sendDisabled && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={sendDisabled}
            >
              {sending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.submitText}>Submit</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Recent submissions</Text>
          <View style={styles.listCard}>
            {tickets.length === 0 ? (
              <Text style={styles.emptyText}>No submissions yet.</Text>
            ) : (
              tickets.map((t, i) => (
                <View key={t.id} style={[styles.ticketRow, i > 0 && styles.rowDivider]}>
                  <View style={styles.ticketTop}>
                    <Text style={styles.ticketSubject}>{t.subject}</Text>
                    <Text style={styles.ticketStatus}>{t.status}</Text>
                  </View>
                  <Text style={styles.ticketMeta}>
                    {t.category} • {new Date(t.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
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
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.md,
    marginBottom: 8,
  },
  faqCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 6,
  },
  faqTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink },
  faqText: { fontSize: 12, color: Colors.brownMid, lineHeight: 18 },
  formCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 10,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipActive: { borderColor: Colors.terracotta, backgroundColor: 'rgba(196,98,45,0.12)' },
  chipText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },
  chipTextActive: { color: Colors.terracotta },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.ink,
    backgroundColor: Colors.paper,
  },
  textArea: { minHeight: 120 },
  submitBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },
  listCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  ticketRow: { padding: Spacing.md },
  ticketTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ticketSubject: { flex: 1, fontSize: 14, color: Colors.ink, fontWeight: '700' },
  ticketStatus: { fontSize: 11, color: Colors.terracotta, fontWeight: '700', textTransform: 'capitalize' },
  ticketMeta: { marginTop: 4, fontSize: 11, color: Colors.muted, textTransform: 'capitalize' },
  emptyText: { padding: Spacing.md, fontSize: 13, color: Colors.muted },
});

