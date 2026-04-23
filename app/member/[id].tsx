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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { fetchGroupMemberProfile } from '../../lib/services/groupDetail';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { blockUser, getSessionUserId, reportUser } from '../../lib/services/privacySafety';
import { supabase } from '../../lib/supabase';

type MemberProfileRow = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  city: string | null;
  gender: string | null;
  intent: string | null;
  languages: string[] | null;
  ethnicity: string | null;
  religion: string | null;
  birth_date: string | null;
};

function calcAge(birthDate: string | null) {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age > 0 ? age : null;
}

export default function MemberProfileScreen() {
  const router = useRouter();
  const { id, groupId } = useLocalSearchParams<{ id: string; groupId: string }>();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfileRow | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestState, setRequestState] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id || !groupId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const [profileRes, sessionRes] = await Promise.all([
        fetchGroupMemberProfile(groupId, id),
        supabase.auth.getSession(),
      ]);
      const { data, error } = profileRes;
      if (!error) {
        const row = ((data as MemberProfileRow[] | null) ?? [])[0] ?? null;
        setProfile(row);
        if (row?.avatar_url) {
          const resolved = await resolveProfilePhotoUrl(row.avatar_url);
          setAvatarUri(resolved);
        } else {
          setAvatarUri(null);
        }
      }

      const uid = sessionRes.data.session?.user.id ?? null;
      setCurrentUserId(uid);
      if (uid && id && groupId && uid !== id) {
        const userA = uid < id ? uid : id;
        const userB = uid < id ? id : uid;
        const { data: existing } = await supabase
          .from('connections')
          .select('id, status, requested_by')
          .eq('group_id', groupId)
          .eq('user_a_id', userA)
          .eq('user_b_id', userB)
          .maybeSingle();

        if (existing?.id) {
          setConnectionId(existing.id);
          if (existing.status === 'accepted') {
            setRequestState('accepted');
          } else if (existing.status === 'pending') {
            setRequestState(existing.requested_by === uid ? 'pending_sent' : 'pending_received');
          } else {
            setRequestState('none');
          }
        } else {
          setConnectionId(null);
          setRequestState('none');
        }
      }
      setLoading(false);
    };

    void load();
  }, [id, groupId]);

  const age = useMemo(() => calcAge(profile?.birth_date ?? null), [profile?.birth_date]);

  const requestConnection = () => {
    if (!id || !groupId || requestBusy || requestState !== 'none') return;
    void (async () => {
      setRequestBusy(true);
      const { data, error } = await supabase.rpc('request_group_connection', {
        p_group_id: groupId,
        p_target_user_id: id,
      });
      setRequestBusy(false);
      if (error) {
        Alert.alert('Could not request connection', error.message);
        return;
      }
      const row = data as { id?: string } | null;
      setConnectionId(row?.id ?? null);
      setRequestState('pending_sent');
      Alert.alert('Request sent', 'They can accept from their Connections screen.');
    })();
  };

  const acceptConnection = () => {
    if (!connectionId || requestBusy) return;
    void (async () => {
      setRequestBusy(true);
      const { error } = await supabase.rpc('respond_to_connection_request', {
        p_connection_id: connectionId,
        p_accept: true,
      });
      setRequestBusy(false);
      if (error) {
        Alert.alert('Could not accept connection', error.message);
        return;
      }
      setRequestState('accepted');
      Alert.alert('Connected', 'You can now start a 1:1 chat.');
    })();
  };

  const connectionCta = (() => {
    if (requestState === 'accepted') return { label: 'Open chat', icon: 'chatbubble-outline' as const };
    if (requestState === 'pending_sent') return { label: 'Request sent', icon: 'time-outline' as const };
    if (requestState === 'pending_received') return { label: 'Accept request', icon: 'checkmark-circle-outline' as const };
    return { label: 'Request connection', icon: 'person-add-outline' as const };
  })();

  const handleReport = (reason: string) => {
    if (!id || actionBusy) return;
    void (async () => {
      setActionBusy(true);
      const reporterId = await getSessionUserId();
      if (!reporterId) {
        setActionBusy(false);
        return;
      }
      const { error } = await reportUser({
        reporterId,
        reportedUserId: id,
        reason,
      });
      setActionBusy(false);
      if (error) {
        Alert.alert('Report failed', error.message);
        return;
      }
      Alert.alert('Report submitted', 'Thanks — our team will review this report.');
    })();
  };

  const confirmBlock = () => {
    if (!id || actionBusy) return;
    Alert.alert(
      'Block this user?',
      "They won't be able to contact you and will disappear from your feed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setActionBusy(true);
              const blockerId = await getSessionUserId();
              if (!blockerId) {
                setActionBusy(false);
                return;
              }
              const [blockRes, reportRes] = await Promise.all([
                blockUser({ blockerId, blockedId: id, reason: 'Blocked from member profile' }),
                reportUser({
                  reporterId: blockerId,
                  reportedUserId: id,
                  reason: 'Blocked user',
                }),
              ]);
              setActionBusy(false);
              if (blockRes.error || reportRes.error) {
                Alert.alert('Block failed', blockRes.error?.message || reportRes.error?.message || 'Please try again.');
                return;
              }
              Alert.alert('User blocked', 'They have been removed from your feed.');
              router.back();
            })();
          },
        },
      ]
    );
  };

  const openActions = () => {
    if (!id || actionBusy) return;
    Alert.alert(
      'Member actions',
      'What would you like to do?',
      [
        {
          text: 'Report',
          onPress: () => {
            Alert.alert('Report reason', 'Choose a reason', [
              { text: 'Harassment', onPress: () => handleReport('Harassment') },
              { text: 'Spam', onPress: () => handleReport('Spam') },
              { text: 'Inappropriate content', onPress: () => handleReport('Inappropriate content') },
              { text: 'Other', onPress: () => handleReport('Other') },
              { text: 'Cancel', style: 'cancel' },
            ]);
          },
        },
        { text: 'Block', style: 'destructive', onPress: confirmBlock },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.terracotta} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color={Colors.ink} />
            </TouchableOpacity>
            <Text style={styles.title}>Member Profile</Text>
            <View style={styles.backBtn} />
          </View>
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Could not load member profile.</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const infoRows = [
    { icon: 'location-outline' as const, label: 'City', value: profile.city },
    { icon: 'person-outline' as const, label: 'Gender', value: profile.gender },
    { icon: 'globe-outline' as const, label: 'Ethnicity', value: profile.ethnicity },
    { icon: 'leaf-outline' as const, label: 'Religion', value: profile.religion },
    {
      icon: 'chatbubble-ellipses-outline' as const,
      label: 'Languages',
      value: profile.languages?.length ? profile.languages.join(' • ') : null,
    },
  ].filter((row) => row.value && row.value !== 'Prefer not to say') as Array<{
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
  }>;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Member Profile</Text>
          <TouchableOpacity style={styles.moreBtn} onPress={openActions} disabled={actionBusy}>
            <Ionicons name="ellipsis-horizontal" size={18} color={Colors.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarInitial}>{(profile.full_name?.[0] || 'M').toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={styles.name}>{profile.full_name || 'Member'}</Text>
          {age ? <Text style={styles.subline}>{age} years old</Text> : null}

          {groupId && id && currentUserId !== id ? (
            <TouchableOpacity
              style={[
                styles.connectionBtn,
                requestState === 'pending_sent' && styles.connectionBtnMuted,
              ]}
              activeOpacity={0.86}
              disabled={requestBusy || requestState === 'pending_sent'}
              onPress={() => {
                if (requestState === 'accepted' && connectionId) {
                  router.push(`/chat/${connectionId}`);
                  return;
                }
                if (requestState === 'pending_received') {
                  acceptConnection();
                  return;
                }
                requestConnection();
              }}
            >
              {requestBusy ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name={connectionCta.icon} size={17} color={Colors.white} />
                  <Text style={styles.connectionBtnText}>{connectionCta.label}</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {profile.bio ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>About</Text>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : null}

          {infoRows.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>Info</Text>
              <View style={styles.infoList}>
                {infoRows.map((row, idx) => (
                  <View key={row.label} style={[styles.infoRow, idx > 0 && styles.infoRowDivider]}>
                    <View style={styles.infoIconWrap}>
                      <Ionicons name={row.icon} size={16} color={Colors.brownMid} />
                    </View>
                    <View style={styles.infoTextWrap}>
                      <Text style={styles.infoLabel}>{row.label}</Text>
                      <Text style={styles.infoValue}>{row.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: 12,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.muted, fontSize: 14 },
  avatarWrap: { alignItems: 'center', marginTop: 4 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarFallback: {
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: Colors.white, fontSize: 36, fontWeight: '800' },
  name: { textAlign: 'center', fontSize: 24, fontWeight: '800', color: Colors.ink },
  subline: { textAlign: 'center', color: Colors.muted, marginTop: -4, marginBottom: 2 },
  connectionBtn: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.terracotta,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 4,
  },
  connectionBtnMuted: {
    backgroundColor: Colors.brownLight,
  },
  connectionBtnText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  card: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bioText: { fontSize: 14, lineHeight: 21, color: Colors.brownMid },
  infoList: { gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoRowDivider: { paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border },
  infoIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoTextWrap: { flex: 1 },
  infoLabel: { fontSize: 11, color: Colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoValue: { fontSize: 14, color: Colors.brownMid, fontWeight: '600', marginTop: 2 },
});
