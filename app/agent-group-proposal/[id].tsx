import React, { useEffect, useMemo, useState } from 'react';
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
import { fetchAgentProposals, fetchSuggestionReasons, updateAgentProposalStatus } from '../../lib/services/agentPipeline';
import { createGroup, getSessionUserId, upsertGroupMembership } from '../../lib/services/groups';

const DB_CATEGORY_BY_LABEL: Record<string, string> = {
  'Food & Drink': 'food_drink',
  Outdoors: 'outdoors',
  Professional: 'professional',
  Language: 'language',
  Faith: 'faith',
  Culture: 'culture',
};

function inferCategoryFromTitle(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes('food') || normalized.includes('drink') || normalized.includes('coffee')) return 'Food & Drink';
  if (normalized.includes('outdoor') || normalized.includes('run') || normalized.includes('hike')) return 'Outdoors';
  if (normalized.includes('professional') || normalized.includes('career') || normalized.includes('business')) return 'Professional';
  if (normalized.includes('language')) return 'Language';
  if (normalized.includes('faith')) return 'Faith';
  if (normalized.includes('culture')) return 'Culture';
  return 'Outdoors';
}

export default function AgentGroupProposalScreen() {
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
      const { data: proposals } = await fetchAgentProposals({ surface: 'groups', limit: 50 });
      const found = ((proposals ?? []) as any[]).find((row) => row.id === id) ?? null;
      setProposal(found);
      const { data: reasonRows } = await fetchSuggestionReasons(id);
      setReasons(((reasonRows ?? []) as Array<{ id: string; reason_label: string; reason_detail: string | null }>));
      setLoading(false);
    };
    void load();
  }, [id]);

  const categoryLabel = useMemo(() => inferCategoryFromTitle(proposal?.title ?? ''), [proposal?.title]);

  const handleCreate = async () => {
    if (!proposal || creating) return;
    const userId = await getSessionUserId();
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again.');
      return;
    }
    setCreating(true);
    const cityPrefix = proposal.city ? `${proposal.city} ` : '';
    const groupName = proposal.title.replace(cityPrefix, '').trim() || proposal.title;
    const { data, error } = await createGroup({
      userId,
      name: groupName,
      description: proposal.body ?? null,
      category: DB_CATEGORY_BY_LABEL[categoryLabel] ?? 'outdoors',
      city: proposal.city ?? null,
      isVirtual: false,
    });
    if (error || !data) {
      setCreating(false);
      Alert.alert('Could not create group', error?.message ?? 'Unknown error');
      return;
    }
    await upsertGroupMembership(data.id, userId, 'organizer');
    await updateAgentProposalStatus({
      proposalId: proposal.id,
      status: 'published',
      actorUserId: userId,
    });
    setCreating(false);
    router.replace(`/group/${data.id}`);
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
        <Text style={styles.emptyTitle}>Proposal not found</Text>
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
          <Text style={styles.title}>Group Proposal</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Agent proposal</Text>
            </View>
            <Text style={styles.cardTitle}>{proposal.title}</Text>
            {proposal.body ? <Text style={styles.cardBody}>{proposal.body}</Text> : null}
            <Text style={styles.metaText}>{proposal.city || 'No city'} • {Math.round(Number(proposal.confidence_score ?? 0))} fit</Text>
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
              <Text style={styles.createBtnText}>Create this group</Text>
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
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.cream,
    textTransform: 'uppercase',
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.ink, lineHeight: 28 },
  cardBody: { fontSize: 14, color: Colors.muted, lineHeight: 21 },
  metaText: { fontSize: 13, color: Colors.brownMid },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonPill: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
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
