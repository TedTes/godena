import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../constants/theme';
import {
  fetchGroups,
  fetchPendingConnections,
  fetchProfiles,
  getSessionUserId,
  updateConnectionDecision,
  type GroupMini,
  type PendingConnection,
  type ProfileMini,
} from '../lib/services/reveal';

function getGroupEmoji(category?: string) {
  switch (category) {
    case 'outdoors': return '🏕️';
    case 'food_drink': return '☕';
    case 'professional': return '💼';
    case 'language': return '🗣️';
    case 'faith': return '✝️';
    case 'culture': return '🎉';
    default: return '👥';
  }
}

function ageFromBirthDate(birthDate: string | null) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 18 && age <= 99 ? age : null;
}

export default function RevealScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [connection, setConnection] = useState<PendingConnection | null>(null);
  const [counterpart, setCounterpart] = useState<ProfileMini | null>(null);
  const [group, setGroup] = useState<GroupMini | null>(null);
  const [successState, setSuccessState] = useState<'waiting' | 'connected' | null>(null);

  useEffect(() => {
    if (successState !== 'waiting') return;
    const timer = setTimeout(() => {
      router.replace('/(tabs)/connections');
    }, 1200);
    return () => clearTimeout(timer);
  }, [successState, router]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const uid = await getSessionUserId();
      if (!uid) {
        setLoading(false);
        return;
      }
      setUserId(uid);

      const { data: pendingRows } = await fetchPendingConnections(uid);
      const pending = ((pendingRows ?? []) as PendingConnection[])[0] ?? null;
      if (!pending) {
        setConnection(null);
        setCounterpart(null);
        setGroup(null);
        setLoading(false);
        return;
      }
      setConnection(pending);
      const hasResponded =
        (pending.user_a_id === uid && !!pending.responded_a_at) ||
        (pending.user_b_id === uid && !!pending.responded_b_at);
      setSuccessState(hasResponded ? 'waiting' : null);

      const counterpartId = pending.user_a_id === uid ? pending.user_b_id : pending.user_a_id;
      const [{ data: profiles }, { data: groups }] = await Promise.all([
        fetchProfiles([counterpartId]),
        fetchGroups([pending.group_id]),
      ]);

      setCounterpart(((profiles ?? []) as ProfileMini[])[0] ?? null);
      setGroup(((groups ?? []) as GroupMini[])[0] ?? null);
      setLoading(false);
    };

    void load();
  }, []);

  const revealData = useMemo(() => {
    const matchName = counterpart?.full_name || 'Someone';
    const matchAge = ageFromBirthDate(counterpart?.birth_date ?? null);
    const groupName = group?.name || 'your group';
    const groupEmoji = getGroupEmoji(group?.category);
    return {
      matchName,
      matchAge,
      matchPhoto: counterpart?.avatar_url || 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=300&q=80',
      groupName,
      groupEmoji,
      message: `You and ${matchName} have both been showing up in ${groupName}. Want a gentle introduction?`,
      activitySuggestion: connection?.activity_suggested || `Try a simple meetup through ${groupName}`,
      activityDate: 'This week',
      sharedSignals: [
        'Mutual openness in this group',
        'Recent shared activity',
      ],
    };
  }, [counterpart, group, connection]);

  const handleAccept = () => {
    void (async () => {
      if (!userId || !connection || saving) return;
      setSaving(true);
      const { data, error } = await updateConnectionDecision(connection, userId, 'accept');
      setSaving(false);
      if (error || !data) return;
      setConnection(data as PendingConnection);

      if (data.status === 'accepted') {
        setSuccessState('connected');
        setTimeout(() => {
          router.replace(`/chat/${data.id}`);
        }, 1200);
      } else {
        setSuccessState('waiting');
      }
    })();
  };

  const handleDecline = () => {
    void (async () => {
      if (!userId || !connection || saving) return;
      setSaving(true);
      const { error } = await updateConnectionDecision(connection, userId, 'pass');
      setSaving(false);
      if (!error) router.replace('/(tabs)/connections');
    })();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.fullCenter}>
            <ActivityIndicator size="large" color={Colors.terraLight} />
            <Text style={styles.loadingText}>Finding your introduction…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!connection) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.fullCenter}>
            <Text style={styles.emptyEmoji}>🌱</Text>
            <Text style={styles.emptyTitle}>Nothing waiting yet</Text>
            <Text style={styles.emptySub}>
              Introductions happen when both sides are open and genuinely active together. Keep showing up in your groups.
            </Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace('/(tabs)/groups')}>
              <Text style={styles.emptyBtnText}>Back to Groups</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (successState === 'connected') {
    return (
      <View style={styles.successContainer}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.fullCenter}>
            <Text style={styles.successEmoji}>{'🎉'}</Text>
            <Text style={styles.successTitle}>{"You're both connected!"}</Text>
            <Text style={styles.successSub}>
              {'Opening your conversation with '}{revealData.matchName}{'...'}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (successState === 'waiting') {
    return (
      <View style={styles.successContainer}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.fullCenter}>
            <Text style={styles.successEmoji}>{'✨'}</Text>
            <Text style={styles.successTitle}>Response sent</Text>
            <Text style={styles.successSub}>
              {"We'll let "}{revealData.matchName}{' take their time too.'}
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.cream} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Pending label */}
          <View style={styles.pendingChip}>
            <View style={styles.pendingDot} />
            <Text style={styles.pendingLabel}>New introduction</Text>
          </View>

          {/* Photo */}
          <View style={styles.photoSection}>
            <View style={styles.photoRing3} />
            <View style={styles.photoRing2} />
            <View style={styles.photoRing1} />
            <Image source={{ uri: revealData.matchPhoto }} style={styles.photo} />
            <View style={styles.sparkle}>
              <Text style={styles.sparkleText}>✨</Text>
            </View>
          </View>

          {/* Context chip */}
          <View style={styles.contextChip}>
            <Text style={styles.contextEmoji}>{revealData.groupEmoji}</Text>
            <Text style={styles.contextText}>via {revealData.groupName}</Text>
          </View>

          {/* Name + message */}
          <Text style={styles.name}>
            {revealData.matchName}{revealData.matchAge ? `, ${revealData.matchAge}` : ''}
          </Text>
          <View style={styles.messageBubble}>
            <Text style={styles.messageText}>{revealData.message}</Text>
          </View>

          {/* Why */}
          <View style={styles.whyCard}>
            <Text style={styles.whyTitle}>What brought this about</Text>
            <View style={styles.reasonRow}>
              <Ionicons name="people-circle-outline" size={14} color={Colors.oliveLight} />
              <Text style={styles.reasonText}>Both of you quietly signaled openness here</Text>
            </View>
            <View style={styles.reasonRow}>
              <Ionicons name="flame-outline" size={14} color={Colors.oliveLight} />
              <Text style={styles.reasonText}>
                You've been genuinely active together recently
              </Text>
            </View>
            <View style={styles.signalChips}>
              {revealData.sharedSignals.map((signal) => (
                <View key={signal} style={styles.signalChip}>
                  <Text style={styles.signalChipText}>{signal}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Activity suggestion — soft, not prescriptive */}
          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Ionicons name="leaf-outline" size={15} color={Colors.terraLight} />
              <Text style={styles.activityLabel}>A natural first step</Text>
            </View>
            <Text style={styles.activityTitle}>{revealData.activitySuggestion}</Text>
            <Text style={styles.activityDate}>{revealData.activityDate}</Text>
          </View>

          {/* Note */}
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed-outline" size={12} color={Colors.muted} />
            <Text style={styles.noteText}>
              This introduction is mutual — {revealData.matchName} is considering it too. No rush.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.acceptBtn, saving && { opacity: 0.6 }]}
              onPress={handleAccept}
              activeOpacity={0.85}
              disabled={saving}
            >
              <Text style={styles.acceptText}>{saving ? 'Saving...' : "Yes, let's meet 👋"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.declineBtn, saving && { opacity: 0.6 }]}
              onPress={handleDecline}
              activeOpacity={0.7}
              disabled={saving}
            >
              <Text style={styles.declineText}>Not right now</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brown },
  safe: { flex: 1 },
  closeBtn: {
    alignSelf: 'flex-end',
    margin: Spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 48,
    alignItems: 'center',
  },

  // Pending framing
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 20,
    marginTop: 4,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.terraLight,
    opacity: 0.85,
  },
  pendingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terraLight,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
    opacity: 0.8,
  },

  // Photo rings
  photoSection: {
    position: 'relative',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  photoRing3: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(196,98,45,0.08)',
  },
  photoRing2: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: 'rgba(196,98,45,0.12)',
  },
  photoRing1: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: Colors.terraLight,
  },
  photo: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  sparkle: {
    position: 'absolute',
    bottom: 12,
    right: 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },
  sparkleText: { fontSize: 16 },

  // Context chip
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  contextEmoji: { fontSize: 14 },
  contextText: { fontSize: 12, color: Colors.brownLight, fontWeight: '600' },

  name: {
    fontSize: 32,
    fontWeight: '900',
    color: Colors.cream,
    marginBottom: 16,
    textAlign: 'center',
  },

  messageBubble: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  messageText: {
    fontSize: 15,
    color: 'rgba(245,240,232,0.8)',
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Why card
  whyCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },
  whyTitle: {
    fontSize: 11,
    color: Colors.terraLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  reasonRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  reasonText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(245,240,232,0.78)',
    lineHeight: 18,
  },
  signalChips: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  signalChipText: {
    fontSize: 11,
    color: 'rgba(245,240,232,0.65)',
    fontWeight: '600',
  },

  // Activity card — soft outlined, not prescriptive
  activityCard: {
    backgroundColor: 'rgba(196,98,45,0.07)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: '100%',
    marginTop: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.2)',
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  activityLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.terraLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.cream,
    marginBottom: 3,
  },
  activityDate: { fontSize: 13, color: 'rgba(245,240,232,0.55)' },

  // Note
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 28,
    paddingHorizontal: Spacing.sm,
  },
  noteText: { fontSize: 12, color: Colors.muted, lineHeight: 18, flex: 1 },

  // Actions
  actions: { width: '100%', gap: 10 },
  acceptBtn: {
    height: 56,
    backgroundColor: Colors.terraLight,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { fontSize: 16, fontWeight: '700', color: Colors.brown },
  declineBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  declineText: { fontSize: 14, color: 'rgba(245,240,232,0.45)' },

  // Shared centered layout for loading / empty / success full-screen states
  fullCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  // Loading state
  loadingText: { fontSize: 14, color: Colors.brownLight, marginTop: 16, textAlign: 'center' },

  // Empty state
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: Colors.cream, marginBottom: 10, textAlign: 'center' },
  emptySub: {
    fontSize: 14,
    color: Colors.brownLight,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  emptyBtnText: { fontSize: 14, color: Colors.brownLight, fontWeight: '600' },

  // Success
  successContainer: { flex: 1, backgroundColor: Colors.terracotta },
  successEmoji: { fontSize: 72, marginBottom: 24 },
  successTitle: { fontSize: 34, fontWeight: '900', color: Colors.white, marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24 },
});
