import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  createAgentIntroConnection,
  fetchAgentProposals,
  fetchSuggestionReasons,
} from '../../lib/services/agentPipeline';

export default function AgentIntroScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [proposal, setProposal] = useState<any | null>(null);
  const [reasons, setReasons] = useState<Array<{ id: string; reason_label: string; reason_detail: string | null }>>([]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data: proposals } = await fetchAgentProposals({ surface: 'connections', limit: 50 });
      const found = ((proposals ?? []) as any[]).find((row) => row.id === id) ?? null;
      setProposal(found);
      const { data: reasonRows } = await fetchSuggestionReasons(id);
      setReasons(((reasonRows ?? []) as Array<{ id: string; reason_label: string; reason_detail: string | null }>));
      setLoading(false);
    };
    void load();
  }, [id]);

  const handleCreate = async () => {
    if (!proposal || creating) return;
    setCreating(true);
    const { data, error } = await createAgentIntroConnection(proposal.id);
    setCreating(false);
    if (error || !data) {
      Alert.alert('Could not create introduction', error?.message ?? 'Unknown error');
      return;
    }
    router.replace(`/reveal?connectionId=${data}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} size="large" />
      </View>
    );
  }

  if (!proposal) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyTitle}>Introduction not found</Text>
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
          <Text style={styles.title}>Warm Intro</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Suggested intro</Text>
            </View>
            <Text style={styles.cardTitle}>{proposal.title}</Text>
            {proposal.body ? <Text style={styles.cardBody}>{proposal.body}</Text> : null}
            <View style={styles.reasonWrap}>
              {reasons.map((reason) => (
                <View key={reason.id} style={styles.reasonPill}>
                  <Text style={styles.reasonText}>{reason.reason_label}</Text>
                </View>
              ))}
            </View>
          </View>
          <TouchableOpacity style={styles.createBtn} onPress={() => void handleCreate()} activeOpacity={0.88} disabled={creating}>
            {creating ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.createBtnText}>Start this introduction</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: Colors.ink },
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
  headerSpacer: { width: 36, height: 36 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 16 },
  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.brown,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: Colors.cream, textTransform: 'uppercase' },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.ink, lineHeight: 28 },
  cardBody: { fontSize: 14, color: Colors.muted, lineHeight: 21 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonPill: { backgroundColor: Colors.paper, borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 5 },
  reasonText: { fontSize: 11, fontWeight: '700', color: Colors.brownMid },
  createBtn: {
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 15, fontWeight: '800', color: Colors.white },
});
