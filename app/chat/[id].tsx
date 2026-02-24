import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../../constants/theme';
import {
  blockUser,
  fetchConnection,
  fetchConnectionMessages,
  fetchGroup,
  fetchProfile,
  getSessionUserId,
  insertConnectionMessage,
  markConnectionRead,
  removeChannel,
  reportUser,
  subscribeToConnectionMessages,
  updateConnectionStatus,
  type ConnectionMessageRow,
  type ConnectionRow,
  type GroupRow,
  type ProfileRow,
} from '../../lib/services/connectionChat';

type MessageItem = {
  id: string;
  senderId: string;
  content: string;
  sentAt: string;
  isOwn: boolean;
};

function groupEmoji(category?: string) {
  switch (category) {
    case 'outdoors': return '🥾';
    case 'food_drink': return '☕';
    case 'professional': return '💼';
    case 'language': return '🗣️';
    case 'faith': return '✝️';
    case 'culture': return '🎉';
    default: return '👥';
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ConnectionChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const listRef = useRef<FlatList>(null);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionRow | null>(null);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [counterpart, setCounterpart] = useState<ProfileRow | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState('');
  const [safetyBusy, setSafetyBusy] = useState(false);

  const canChat = connection?.status === 'accepted';

  const title = useMemo(() => counterpart?.full_name || 'Conversation', [counterpart]);
  const subtitle = useMemo(() => {
    if (!group) return 'Private connection';
    return `${groupEmoji(group.category)} ${group.name}`;
  }, [group]);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const uid = await getSessionUserId();
      setUserId(uid);
      if (!uid) {
        setLoading(false);
        return;
      }

      const connectionRes = await fetchConnection(id);
      const row = (connectionRes.data as ConnectionRow | null) ?? null;
      setConnection(row);
      if (!row) {
        setLoading(false);
        return;
      }

      const otherId = row.user_a_id === uid ? row.user_b_id : row.user_a_id;

      const [groupRes, profileRes, messageRes] = await Promise.all([
        fetchGroup(row.group_id),
        fetchProfile(otherId),
        fetchConnectionMessages(row.id),
      ]);

      setGroup((groupRes.data as GroupRow | null) ?? null);
      setCounterpart((profileRes.data as ProfileRow | null) ?? null);

      const messageRows = (messageRes.data as ConnectionMessageRow[] | null) ?? [];
      setMessages(
        messageRows.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          content: m.content,
          sentAt: m.sent_at,
          isOwn: m.sender_id === uid,
        }))
      );

      await markConnectionRead(row.id, uid);
      setLoading(false);
    };

    void load();
  }, [id]);

  useEffect(() => {
    if (!id || !userId) return;

    const channel = subscribeToConnectionMessages(id, async (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [
          ...prev,
          {
            id: row.id,
            senderId: row.sender_id,
            content: row.content,
            sentAt: row.sent_at,
            isOwn: row.sender_id === userId,
          },
        ];
      });

      if (row.sender_id !== userId) {
        await markConnectionRead(id, userId);
      }

      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });

    return () => {
      void removeChannel(channel);
    };
  }, [id, userId]);

  const send = () => {
    void (async () => {
      if (!id || !userId || !canChat || sending) return;
      const content = draft.trim();
      if (!content) return;

      setSending(true);
      setDraft('');

      const { data } = await insertConnectionMessage(id, userId, content);
      if (data) {
        const row = data as ConnectionMessageRow;
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          return [
            ...prev,
            {
              id: row.id,
              senderId: row.sender_id,
              content: row.content,
              sentAt: row.sent_at,
              isOwn: true,
            },
          ];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      } else {
        setDraft(content);
      }

      setSending(false);
    })();
  };

  const handleUnmatch = () => {
    void (async () => {
      if (!id || safetyBusy) return;
      setSafetyBusy(true);
      const { error } = await updateConnectionStatus(id, 'unmatched');
      setSafetyBusy(false);
      if (error) {
        Alert.alert('Something went wrong', "We couldn't end this connection. Please try again.");
        return;
      }
      router.replace('/(tabs)/connections');
    })();
  };

  const handleBlock = () => {
    void (async () => {
      if (!id || !userId || !counterpart?.user_id || safetyBusy) return;
      setSafetyBusy(true);
      const [blockRes, closeRes] = await Promise.all([
        blockUser(userId, counterpart.user_id, 'Blocked from private connection chat'),
        updateConnectionStatus(id, 'closed'),
      ]);
      setSafetyBusy(false);

      if (blockRes.error || closeRes.error) {
        Alert.alert('Something went wrong', "We couldn't complete the block. Please try again.");
        return;
      }
      router.replace('/(tabs)/connections');
    })();
  };

  const handleReport = () => {
    void (async () => {
      if (!id || !userId || !counterpart?.user_id || safetyBusy) return;
      setSafetyBusy(true);
      const { error } = await reportUser({
        reporterId: userId,
        reportedUserId: counterpart.user_id,
        connectionId: id,
        reason: 'Inappropriate behavior in private connection chat',
        details: 'Submitted from 1:1 connection chat safety menu.',
      });
      setSafetyBusy(false);

      if (error) {
        Alert.alert('Something went wrong', "We couldn't submit your report. Please try again.");
        return;
      }

      Alert.alert(
        'Report received',
        "Thank you — our team reviews every report carefully. You can also block this person if you feel unsafe."
      );
    })();
  };

  const openSafetyMenu = () => {
    const firstName = counterpart?.full_name?.split(' ')[0];
    Alert.alert(
      firstName ? `Options for ${firstName}` : 'Options',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          onPress: () =>
            Alert.alert(
              'Report this person?',
              'Your report is confidential. Our team reviews every report and takes action when guidelines are violated.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Submit report', onPress: handleReport },
              ]
            ),
        },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'End this connection?',
              "You'll both lose access to this conversation. This can't be undone.",
              [
                { text: 'Keep connection', style: 'cancel' },
                { text: 'End connection', style: 'destructive', onPress: handleUnmatch },
              ]
            ),
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Block this person?',
              "They won't be able to contact you and this conversation will close. You can unblock from your profile settings.",
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: handleBlock },
              ]
            ),
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.centerWrap}>
            <ActivityIndicator color={Colors.terracotta} />
            <Text style={styles.loadingText}>Opening your conversation…</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  if (!connection || !userId) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.centerWrap}>
            <Text style={styles.emptyTitle}>This conversation isn't available</Text>
            <Text style={styles.emptySub}>It may have been removed or is no longer active.</Text>
            <TouchableOpacity style={styles.quietBtn} onPress={() => router.replace('/(tabs)/connections')}>
              <Text style={styles.quietBtnText}>Back to Connections</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.ink} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            {counterpart?.avatar_url ? (
              <Image source={{ uri: counterpart.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={16} color={Colors.muted} />
              </View>
            )}
            <View>
              <Text style={styles.headerTitle}>{title}</Text>
              <Text style={styles.headerSub}>{subtitle}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={openSafetyMenu}
            style={styles.headerIconBtn}
            disabled={safetyBusy}
          >
            {safetyBusy ? (
              <ActivityIndicator size="small" color={Colors.muted} />
            ) : (
              <Ionicons name="ellipsis-vertical" size={18} color={Colors.muted} />
            )}
          </TouchableOpacity>
        </View>

        {!canChat && (
          <View style={styles.waitingBanner}>
            <Text style={styles.waitingText}>
              {connection.status === 'pending'
                ? "Chat opens once you've both accepted. No pressure — take your time."
                : 'This conversation has ended.'}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
        >
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            renderItem={({ item }) => (
              <View style={[styles.bubbleRow, item.isOwn ? styles.bubbleRowOwn : styles.bubbleRowOther]}>
                <View style={[styles.bubble, item.isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, item.isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>
                    {item.content}
                  </Text>
                  <Text style={[styles.timeText, item.isOwn ? styles.timeOwn : styles.timeOther]}>
                    {formatTime(item.sentAt)}
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyEmoji}>👋</Text>
                <Text style={styles.emptyTitle}>You're connected</Text>
                <Text style={styles.emptySub}>
                  {group
                    ? `You were introduced through ${group.name}. Be the first to say hello.`
                    : 'This is the beginning of your conversation. Send the first message.'}
                </Text>
              </View>
            }
          />

          <View style={styles.composerWrap}>
            <TextInput
              style={styles.input}
              placeholder={canChat ? 'Type a message...' : 'Chat opens after both of you accept…'}
              placeholderTextColor={Colors.muted}
              value={draft}
              onChangeText={setDraft}
              editable={canChat && !sending}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!canChat || sending || !draft.trim()) && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!canChat || sending || !draft.trim()}
            >
              {sending ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Ionicons name="send" size={16} color={Colors.white} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  body: { flex: 1 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },

  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmWhite,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconSpacer: { width: 36, height: 36 },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 8,
  },
  avatar: { width: 34, height: 34, borderRadius: Radius.full, backgroundColor: Colors.paper },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  headerSub: { fontSize: 11, color: Colors.muted, marginTop: 1 },

  waitingBanner: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  waitingText: { color: Colors.muted, fontSize: 12 },

  listContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: 8,
  },
  bubbleRow: { flexDirection: 'row', marginBottom: 2 },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '78%',
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  bubbleOwn: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: Colors.warmWhite,
    borderColor: Colors.border,
    borderBottomLeftRadius: 6,
  },
  bubbleText: { fontSize: 14, lineHeight: 19 },
  bubbleTextOwn: { color: Colors.white },
  bubbleTextOther: { color: Colors.ink },
  timeText: { marginTop: 4, fontSize: 10 },
  timeOwn: { color: 'rgba(255,255,255,0.82)', textAlign: 'right' },
  timeOther: { color: Colors.muted, textAlign: 'left' },

  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    gap: 4,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  emptySub: { fontSize: 13, color: Colors.muted, textAlign: 'center' },

  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    paddingHorizontal: Spacing.md,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.ink,
    fontSize: 14,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },

  backBtn: {
    marginTop: 12,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  backBtnText: { color: Colors.white, fontWeight: '700' },

  loadingText: { marginTop: 10, fontSize: 13, color: Colors.muted, textAlign: 'center' },
  emptyEmoji: { fontSize: 28, marginBottom: 4 },
  quietBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  quietBtnText: { color: Colors.muted, fontWeight: '600', fontSize: 14 },
});
