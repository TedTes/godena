import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
  fetchBlockedUsers,
  fetchMyReports,
  fetchProfilesByIds,
  getSessionUserId,
  unblockUser,
  type BlockedProfile,
  type BlockedUserRow,
  type ReportRow,
} from '../lib/services/privacySafety';

type BlockedWithProfile = BlockedUserRow & { profile?: BlockedProfile };

export default function PrivacySafetyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busyUnblockId, setBusyUnblockId] = useState<string | null>(null);
  const [rows, setRows] = useState<BlockedWithProfile[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

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

      const [blockedRes, reportsRes] = await Promise.all([
        fetchBlockedUsers(uid),
        fetchMyReports(uid),
      ]);

      const blocked = ((blockedRes.data as BlockedUserRow[] | null) ?? []);
      const profileRes = await fetchProfilesByIds(blocked.map((b) => b.blocked_id));
      const profileMap = new Map(
        (((profileRes.data as BlockedProfile[] | null) ?? []).map((p) => [p.user_id, p]))
      );
      setRows(blocked.map((b) => ({ ...b, profile: profileMap.get(b.blocked_id) })));
      setReports(((reportsRes.data as ReportRow[] | null) ?? []));
      setLoading(false);
    };
    void load();
  }, [router]);

  const handleUnblock = (blockedId: string, displayName: string) => {
    if (!userId || busyUnblockId) return;
    Alert.alert(
      'Unblock user',
      `Allow ${displayName} to interact with you again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => {
            void (async () => {
              setBusyUnblockId(blockedId);
              const { error } = await unblockUser(userId, blockedId);
              setBusyUnblockId(null);
              if (error) {
                Alert.alert('Could not unblock', error.message);
                return;
              }
              setRows((prev) => prev.filter((r) => r.blocked_id !== blockedId));
            })();
          },
        },
      ]
    );
  };

  const reportStatusLabel = useMemo(
    () => ({
      open: 'Open',
      reviewing: 'Reviewing',
      resolved: 'Resolved',
      dismissed: 'Dismissed',
    }),
    []
  );

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
          <Text style={styles.title}>Safety Controls</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.policyLinkCard}
            onPress={() => router.push('/privacy-policy')}
            activeOpacity={0.8}
          >
            <View style={styles.policyLinkLeft}>
              <Ionicons name="document-text-outline" size={18} color={Colors.brownMid} />
              <Text style={styles.policyLinkText}>Privacy Policy & Safety Guidelines</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
          </TouchableOpacity>

          <Text style={styles.sectionLabel}>Blocked Users</Text>
          {rows.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="shield-outline" size={20} color={Colors.muted} />
              </View>
              <Text style={styles.emptyTitle}>No blocked users</Text>
              <Text style={styles.emptySubtext}>People you block will appear here.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {rows.map((row, i) => {
                const name = row.profile?.full_name || 'User';
                const avatar = row.profile?.avatar_url;
                return (
                  <View key={row.blocked_id} style={[styles.blockedRow, i > 0 && styles.rowDivider]}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={styles.avatar} />
                    ) : (
                      <View style={styles.avatarFallback}>
                        <Ionicons name="person-outline" size={16} color={Colors.muted} />
                      </View>
                    )}
                    <View style={styles.blockedInfo}>
                      <Text style={styles.blockedName}>{name}</Text>
                      {row.reason ? <Text style={styles.blockedReason}>{row.reason}</Text> : null}
                    </View>
                    <TouchableOpacity
                      style={styles.unblockBtn}
                      onPress={() => handleUnblock(row.blocked_id, name)}
                      disabled={busyUnblockId === row.blocked_id}
                    >
                      {busyUnblockId === row.blocked_id ? (
                        <ActivityIndicator size="small" color={Colors.ink} />
                      ) : (
                        <Text style={styles.unblockText}>Unblock</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          <Text style={styles.sectionLabel}>Recent Reports</Text>
          {reports.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="flag-outline" size={20} color={Colors.muted} />
              </View>
              <Text style={styles.emptyTitle}>No reports yet</Text>
              <Text style={styles.emptySubtext}>Submitted reports will show their review status here.</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {reports.map((r, i) => (
                <View key={r.id} style={[styles.reportRow, i > 0 && styles.rowDivider]}>
                  <View style={styles.reportTop}>
                    <Text style={styles.reportTarget}>{r.target_type.replace('_', ' ')}</Text>
                    <Text style={styles.reportStatus}>{reportStatusLabel[r.status]}</Text>
                  </View>
                  <Text style={styles.reportReason}>{r.reason}</Text>
                  <Text style={styles.reportDate}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
  headerSpacer: { width: 36, height: 36 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  policyLinkCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  policyLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  policyLinkText: { fontSize: 13, color: Colors.ink, fontWeight: '600' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: 8,
  },
  emptyState: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 24,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  emptySubtext: { fontSize: 12, color: Colors.muted, textAlign: 'center', lineHeight: 18 },
  card: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.md,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.paper },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedInfo: { flex: 1 },
  blockedName: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  blockedReason: { marginTop: 2, fontSize: 12, color: Colors.muted },
  unblockBtn: {
    borderWidth: 1,
    borderColor: Colors.borderDark,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 76,
    alignItems: 'center',
  },
  unblockText: { fontSize: 12, fontWeight: '700', color: Colors.ink },
  reportRow: { padding: Spacing.md },
  reportTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reportTarget: { fontSize: 11, color: Colors.muted, textTransform: 'capitalize' },
  reportStatus: { fontSize: 11, color: Colors.terracotta, fontWeight: '700' },
  reportReason: { marginTop: 4, fontSize: 14, color: Colors.ink, fontWeight: '600' },
  reportDate: { marginTop: 4, fontSize: 11, color: Colors.muted },
});
