import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  fetchAgentProposals,
  fetchSuggestionReasons,
  updateAgentProposalStatus,
} from '../lib/services/agentPipeline';
import { supabase } from '../lib/supabase';

type FilterStatus = 'draft' | 'approved' | 'rejected';

type ProposalRow = {
  id: string;
  title: string;
  body: string | null;
  status: FilterStatus | 'published' | 'expired';
  approval_policy: 'auto_suggest' | 'organizer_confirm' | 'manual_only';
  target_surface: 'home' | 'groups' | 'events' | 'connections' | 'profile';
  confidence_score: number;
  city: string | null;
  created_at: string;
};

type ReasonRow = {
  id: string;
  reason_label: string;
  reason_detail: string | null;
};

const FILTERS: FilterStatus[] = ['draft', 'approved', 'rejected'];

export default function AgentReviewScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('draft');
  const [userId, setUserId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [reasonsByProposal, setReasonsByProposal] = useState<Record<string, ReasonRow[]>>({});
  const [stats, setStats] = useState({
    draftCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    feedbackCount: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const uid = sessionData.session?.user.id ?? null;
    setUserId(uid);

    const { data, error } = await fetchAgentProposals({
      status: filter,
      limit: 50,
    });

    const [{ count: draftCount }, { count: approvedCount }, { count: rejectedCount }, { count: feedbackCount }] = await Promise.all([
      supabase.from('agent_proposals').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase.from('agent_proposals').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('agent_proposals').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabase.from('agent_feedback_events').select('id', { count: 'exact', head: true }),
    ]);
    setStats({
      draftCount: draftCount ?? 0,
      approvedCount: approvedCount ?? 0,
      rejectedCount: rejectedCount ?? 0,
      feedbackCount: feedbackCount ?? 0,
    });

    if (error) {
      Alert.alert('Could not load proposals', error.message);
      setProposals([]);
      setReasonsByProposal({});
      setLoading(false);
      return;
    }

    const rows = ((data ?? []) as ProposalRow[]);
    setProposals(rows);

    const nextReasons: Record<string, ReasonRow[]> = {};
    await Promise.all(
      rows.map(async (row) => {
        const { data: reasonRows } = await fetchSuggestionReasons(row.id, uid);
        nextReasons[row.id] = ((reasonRows ?? []) as ReasonRow[]);
      })
    );
    setReasonsByProposal(nextReasons);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpdate = async (proposalId: string, status: 'approved' | 'rejected') => {
    if (!userId || actingId) return;
    setActingId(proposalId);
    const { error } = await updateAgentProposalStatus({
      proposalId,
      status,
      actorUserId: userId,
      rejectionReason: status === 'rejected' ? 'Rejected in agent review screen.' : undefined,
    });
    setActingId(null);
    if (error) {
      Alert.alert(`Could not ${status}`, error.message);
      return;
    }
    await load();
  };

  const title = useMemo(() => {
    if (filter === 'draft') return 'Draft proposals waiting for review';
    if (filter === 'approved') return 'Approved proposals';
    return 'Rejected proposals';
  }, [filter]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agent Review</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()} activeOpacity={0.8}>
            <Ionicons name="refresh" size={18} color={Colors.terracotta} />
          </TouchableOpacity>
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = item === filter;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(item)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.draftCount}</Text>
                <Text style={styles.statLabel}>Drafts</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.approvedCount}</Text>
                <Text style={styles.statLabel}>Approved</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.rejectedCount}</Text>
                <Text style={styles.statLabel}>Rejected</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{stats.feedbackCount}</Text>
                <Text style={styles.statLabel}>Feedback</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>{title}</Text>

            {proposals.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Nothing here right now</Text>
                <Text style={styles.emptyText}>Switch filters or generate more proposals.</Text>
              </View>
            ) : (
              proposals.map((proposal) => {
                const reasons = reasonsByProposal[proposal.id] ?? [];
                const isActing = actingId === proposal.id;
                return (
                  <View key={proposal.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.metaPills}>
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>{proposal.status}</Text>
                        </View>
                        <View style={styles.metaPill}>
                          <Text style={styles.metaPillText}>{proposal.target_surface}</Text>
                        </View>
                        <View style={styles.metaPill}>
                          <Text style={styles.metaPillText}>{proposal.approval_policy}</Text>
                        </View>
                      </View>
                      <Text style={styles.scoreText}>{Math.round(proposal.confidence_score)} fit</Text>
                    </View>

                    <Text style={styles.cardTitle}>{proposal.title}</Text>
                    {proposal.body ? <Text style={styles.cardBody}>{proposal.body}</Text> : null}

                    <View style={styles.cardMetaRow}>
                      <Text style={styles.cardMetaText}>{proposal.city || 'No city'}</Text>
                      <Text style={styles.cardMetaDot}>•</Text>
                      <Text style={styles.cardMetaText}>
                        {new Date(proposal.created_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {reasons.length > 0 ? (
                      <View style={styles.reasonWrap}>
                        {reasons.slice(0, 4).map((reason) => (
                          <View key={reason.id} style={styles.reasonPill}>
                            <Text style={styles.reasonLabel}>{reason.reason_label}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    {proposal.status === 'draft' ? (
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.rejectBtn]}
                          onPress={() => void handleUpdate(proposal.id, 'rejected')}
                          activeOpacity={0.85}
                          disabled={isActing}
                        >
                          {isActing ? (
                            <ActivityIndicator size="small" color={Colors.error} />
                          ) : (
                            <Text style={[styles.actionBtnText, styles.rejectBtnText]}>Reject</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.approveBtn]}
                          onPress={() => void handleUpdate(proposal.id, 'approved')}
                          activeOpacity={0.85}
                          disabled={isActing}
                        >
                          {isActing ? (
                            <ActivityIndicator size="small" color={Colors.white} />
                          ) : (
                            <Text style={[styles.actionBtnText, styles.approveBtnText]}>Approve</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  filterChip: {
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: Colors.brown,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brownMid,
    textTransform: 'capitalize',
  },
  filterChipTextActive: { color: Colors.cream },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 12 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47%',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.muted,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.muted },
  emptyCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  emptyText: { fontSize: 13, color: Colors.muted, lineHeight: 19 },
  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  statusPill: {
    borderRadius: Radius.full,
    backgroundColor: 'rgba(196,98,45,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.terracotta,
    textTransform: 'uppercase',
  },
  metaPill: {
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.brownMid,
  },
  scoreText: { fontSize: 12, fontWeight: '700', color: Colors.olive },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.ink, lineHeight: 22 },
  cardBody: { fontSize: 13, color: Colors.muted, lineHeight: 19 },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardMetaText: { fontSize: 12, color: Colors.brownMid },
  cardMetaDot: { fontSize: 12, color: Colors.borderDark },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reasonPill: {
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  reasonLabel: { fontSize: 11, fontWeight: '700', color: Colors.brownMid },
  actionRow: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  actionBtn: {
    flex: 1,
    height: 42,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    backgroundColor: 'rgba(217,79,79,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(217,79,79,0.18)',
  },
  approveBtn: {
    backgroundColor: Colors.terracotta,
  },
  actionBtnText: { fontSize: 14, fontWeight: '800' },
  rejectBtnText: { color: Colors.error },
  approveBtnText: { color: Colors.white },
});
