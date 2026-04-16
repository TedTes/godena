import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../../constants/theme';
import { supabase } from '../../../lib/supabase';
import {
  fetchGroup,
  fetchGroupMemberCount,
  fetchGroupMessages,
  fetchProfiles,
  getSessionUserId,
  insertGroupMessage,
  markGroupSeen as markGroupSeenMembership,
  removeChannel,
  subscribeToGroupMessages,
  triggerGroupMessagePush,
  type GroupChatMessageRow,
} from '../../../lib/services/groupChat';

// ── Sender color palette — deterministic per user ──────────────────────────
const SENDER_COLORS = ['#7a8c5c', '#c9a84c', '#5b7fa6', '#8b4220', '#6b5b8c'];

function getSenderColor(senderId: string) {
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

// ── Time / date helpers ────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// A new visual group begins when sender changes or gap > 5 min
const GROUP_GAP_MS = 5 * 60 * 1000;
function isGroupBreak(
  a: { senderId: string; sentAt: string },
  b: { senderId: string; sentAt: string }
) {
  if (a.senderId !== b.senderId) return true;
  return new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime() > GROUP_GAP_MS;
}

// ── Types ──────────────────────────────────────────────────────────────────
type RawMsg = {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  content: string;
  sentAt: string;
  isOwn: boolean;
};

type DateDivider = { _kind: 'date'; id: string; label: string };
type ChatMsg = RawMsg & { _kind: 'msg'; isFirstInGroup: boolean; isLastInGroup: boolean };
type ChatItem = DateDivider | ChatMsg;

// ── Component ──────────────────────────────────────────────────────────────
export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<{
    id: string;
    name: string;
    member_count: number;
    category: string;
    icon_emoji: string | null;
    is_active: boolean;
  } | null>(null);
  const [liveMemberCount, setLiveMemberCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<RawMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const listRef = useRef<FlatList>(null);
  const profileMapRef = useRef<Record<string, { name: string; avatar: string }>>({});
  const atBottomRef = useRef(true);
  const pillAnim = useRef(new Animated.Value(0)).current;

  const groupVisuals = useMemo(() => {
    const icon = group?.icon_emoji;
    switch (group?.category) {
      case 'outdoors':     return { emoji: icon || '🏕️', coverColor: '#7a8c5c' };
      case 'food_drink':   return { emoji: icon || '☕',  coverColor: '#c4622d' };
      case 'professional': return { emoji: icon || '💼',  coverColor: '#3d2b1f' };
      case 'language':     return { emoji: icon || '🗣️', coverColor: '#c9a84c' };
      case 'faith':        return { emoji: icon || '✝️',  coverColor: '#8b4220' };
      case 'culture':      return { emoji: icon || '🎉',  coverColor: '#a07820' };
      default:             return { emoji: icon || '👥',  coverColor: Colors.terracotta };
    }
  }, [group?.category, group?.icon_emoji]);

  // Preprocess: inject date dividers + compute per-message group position
  const chatItems = useMemo<ChatItem[]>(() => {
    const items: ChatItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const prev = i > 0 ? messages[i - 1] : null;
      const next = i < messages.length - 1 ? messages[i + 1] : null;

      // Date divider when day changes
      if (!prev || !isSameDay(prev.sentAt, msg.sentAt)) {
        items.push({ _kind: 'date', id: `date-${i}`, label: formatDateLabel(msg.sentAt) });
      }

      const isFirstInGroup = !prev || isGroupBreak(prev, msg);
      const isLastInGroup  = !next || isGroupBreak(msg, next);

      items.push({ ...msg, _kind: 'msg', isFirstInGroup, isLastInGroup });
    }
    return items;
  }, [messages]);

  const hydrateSenderProfiles = async (senderIds: string[]) => {
    const idsNeedingFetch = senderIds.filter((sid) => !profileMapRef.current[sid]);
    if (idsNeedingFetch.length === 0) return;

    const { data } = await fetchProfiles(idsNeedingFetch);

    for (const p of data ?? []) {
      const row = p as { user_id: string; full_name: string | null; avatar_url: string | null };
      profileMapRef.current[row.user_id] = {
        name: row.full_name || 'Member',
        avatar: row.avatar_url || '',
      };
    }
  };

  const mapDbMessages = (
    rows: Array<{ id: string; group_id: string; sender_id: string; content: string; sent_at: string }>,
    currentUserId: string | null
  ): RawMsg[] =>
    rows.map((row) => {
      const sender = profileMapRef.current[row.sender_id];
      return {
        id: row.id,
        groupId: row.group_id,
        senderId: row.sender_id,
        senderName: sender?.name || 'Member',
        senderPhoto: sender?.avatar || '',
        content: row.content,
        sentAt: row.sent_at,
        isOwn: !!currentUserId && row.sender_id === currentUserId,
      };
    });

  const markGroupSeen = async () => {
    if (!id || !userId) return;
    await markGroupSeenMembership(id, userId);
  };

  const handleReportMessage = (msg: RawMsg) => {
    if (!userId || msg.senderId === userId) return;
    Alert.alert('Report message', 'Choose a reason', [
      { text: 'Harassment', onPress: () => void submitMessageReport(msg, 'Harassment') },
      { text: 'Spam', onPress: () => void submitMessageReport(msg, 'Spam') },
      { text: 'Inappropriate content', onPress: () => void submitMessageReport(msg, 'Inappropriate content') },
      { text: 'Other', onPress: () => void submitMessageReport(msg, 'Other') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitMessageReport = async (msg: RawMsg, reason: string) => {
    if (!userId) return;
    const { error } = await supabase.from('reports').insert({
      reporter_id: userId,
      reported_user_id: msg.senderId,
      target_type: 'group_message',
      target_id: msg.id,
      reason,
    });
    if (error) {
      Alert.alert('Report failed', error.message);
      return;
    }
    Alert.alert('Report submitted', 'Thanks — our team will review this report.');
  };

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);

      const [uid, groupRes, messageRes, countRes] = await Promise.all([
        getSessionUserId(),
        fetchGroup(id),
        fetchGroupMessages(id),
        fetchGroupMemberCount(id),
      ]);

      setUserId(uid);
      setGroup((groupRes.data as any) ?? null);
      setLiveMemberCount(countRes.data ?? null);

      const messageRows =
        (messageRes.data as Array<{ id: string; group_id: string; sender_id: string; content: string; sent_at: string }> | null) ?? [];
      await hydrateSenderProfiles(Array.from(new Set(messageRows.map((m) => m.sender_id))));
      setMessages(mapDbMessages(messageRows, uid));
      setLoading(false);
    };

    void load();
  }, [id]);

  useEffect(() => {
    if (!id) return;

    const syncLatest = async () => {
      const { data } = await fetchGroupMessages(id);
      const rows =
        (data as Array<{ id: string; group_id: string; sender_id: string; content: string; sent_at: string }> | null) ?? [];
      if (rows.length === 0) return;
      await hydrateSenderProfiles(Array.from(new Set(rows.map((m) => m.sender_id))));
      const mappedRows = mapDbMessages(rows, userId);
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of mappedRows) byId.set(m.id, m);
        return Array.from(byId.values()).sort(
          (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
        );
      });
    };

    const channel = subscribeToGroupMessages(id, async (row: GroupChatMessageRow) => {
      await hydrateSenderProfiles([row.sender_id]);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, ...mapDbMessages([row], userId)];
      });
      if (atBottomRef.current) {
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      } else if (row.sender_id !== userId) {
        // Only count messages from others as "pending unread"
        setPendingCount((n) => n + 1);
      }
    }, (status) => {
      if (status === 'SUBSCRIBED') {
        void syncLatest();
      }
    });

    // Fallback: keep the receiver in sync if websocket delivery is delayed.
    const fallbackSync = setInterval(() => {
      void syncLatest();
    }, 1500);

    return () => {
      clearInterval(fallbackSync);
      void removeChannel(channel);
    };
  }, [id, userId]);

  useEffect(() => {
    if (!id || !userId) return;
    // Mark seen shortly after initial load/new messages while chat is open.
    const timer = setTimeout(() => {
      void markGroupSeen();
    }, 350);
    return () => clearTimeout(timer);
  }, [id, userId, messages.length]);

  // Animate the new-messages pill in when it first appears, reset instantly on dismiss.
  const prevHasPending = useRef(false);
  useEffect(() => {
    const hasPending = pendingCount > 0;
    if (hasPending && !prevHasPending.current) {
      pillAnim.setValue(0);
      Animated.timing(pillAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else if (!hasPending) {
      pillAnim.setValue(0);
    }
    prevHasPending.current = hasPending;
  }, [pendingCount]);

  const handleScroll = useCallback((e: {
    nativeEvent: { contentSize: { height: number }; layoutMeasurement: { height: number }; contentOffset: { y: number } }
  }) => {
    const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
    const dist = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const nowAtBottom = dist < 60;
    if (nowAtBottom && !atBottomRef.current) {
      // User scrolled back to bottom — clear pending pill
      setPendingCount(0);
    }
    atBottomRef.current = nowAtBottom;
  }, []);

  const send = () => {
    void (async () => {
      if (!id || !userId || group?.is_active === false) return;
      const text = input.trim();
      if (!text) return;

      const optimisticId = `local-${Date.now()}`;
      const optimisticSentAt = new Date().toISOString();
      setInput('');
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          groupId: id,
          senderId: userId,
          senderName: 'You',
          senderPhoto: '',
          content: text,
          sentAt: optimisticSentAt,
          isOwn: true,
        },
      ]);
      setPendingCount(0);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 20);

      const { data: insertedMessage, error } = await insertGroupMessage(id, userId, text);
      if (error || !insertedMessage) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setInput(text);
        return;
      }

      const normalizedInsertedRow: GroupChatMessageRow = {
        id: (insertedMessage as any).id,
        group_id: (insertedMessage as any).group_id ?? id,
        sender_id: (insertedMessage as any).sender_id ?? userId,
        content: (insertedMessage as any).content ?? text,
        sent_at: (insertedMessage as any).sent_at ?? optimisticSentAt,
      };
      const mapped = mapDbMessages([normalizedInsertedRow], userId)[0];
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticId);
        if (withoutOptimistic.some((m) => m.id === mapped.id)) return withoutOptimistic;
        return [...withoutOptimistic, mapped];
      });

      // Fire-and-forget push fan-out for other group members.
      if (insertedMessage?.id) {
        void triggerGroupMessagePush(id, insertedMessage.id);
      }

      void markGroupSeen();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    })();
  };

  const isArchived = group?.is_active === false;
  const sendDisabled = !input.trim() || !userId || isArchived;

  const headerContent = (
    <View style={[styles.header, { backgroundColor: groupVisuals.coverColor }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={22} color={Colors.white} />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <Text style={styles.headerEmoji}>{groupVisuals.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {group?.name ?? 'Group Chat'}
          </Text>
          <Text style={styles.headerSub}>
            {loading ? 'Loading…' : `${liveMemberCount ?? group?.member_count ?? ''} members`}
          </Text>
        </View>
      </View>
      {group && (
        <TouchableOpacity
          style={styles.headerRight}
          onPress={() => router.push(`/group/${group.id}`)}
        >
          <Ionicons name="information-circle-outline" size={24} color={Colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView
          edges={['top']}
          style={{ backgroundColor: groupVisuals.coverColor }}
        >
          {headerContent}
        </SafeAreaView>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.terracotta} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <SafeAreaView
        edges={['top']}
        style={{ backgroundColor: groupVisuals.coverColor }}
      >
        {headerContent}
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <View style={styles.flex}>
        <FlatList
          ref={listRef}
          data={chatItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={100}
          onScroll={handleScroll}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {

            // ── Date divider ──
            if (item._kind === 'date') {
              return (
                <View style={styles.dateDivider}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateLabel}>{item.label}</Text>
                  <View style={styles.dateLine} />
                </View>
              );
            }

            // ── Message bubble ──
            const { isFirstInGroup, isLastInGroup } = item;
            const senderColor = getSenderColor(item.senderId);

            return (
              <View style={[
                styles.msgWrap,
                item.isOwn && styles.msgWrapOwn,
                isLastInGroup ? styles.msgWrapGroupEnd : styles.msgWrapInGroup,
              ]}>

                {/* Avatar — only for other senders */}
                {!item.isOwn && (
                  <View style={styles.avatarWrap}>
                    {isFirstInGroup ? (
                      item.senderPhoto ? (
                        <Image source={{ uri: item.senderPhoto }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: senderColor }]}>
                          <Text style={styles.avatarInitial}>{item.senderName[0]}</Text>
                        </View>
                      )
                    ) : (
                      <View style={styles.avatarSpacer} />
                    )}
                  </View>
                )}

                {/* Bubble column */}
                <View style={[styles.msgColumn, item.isOwn && styles.msgColumnOwn]}>

                  {/* Sender name — only at top of each group */}
                  {isFirstInGroup && !item.isOwn && (
                    <Text style={[styles.senderName, { color: senderColor }]}>
                      {item.senderName}
                    </Text>
                  )}

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={item.isOwn}
                    onLongPress={() => handleReportMessage(item)}
                  >
                    <View style={[
                      styles.bubble,
                      item.isOwn ? styles.bubbleOwn : styles.bubbleOther,
                      // Tail only on the last bubble in a visual group
                      item.isOwn && isLastInGroup  && styles.bubbleTailOwn,
                      !item.isOwn && isLastInGroup && styles.bubbleTailOther,
                    ]}>
                      <Text style={[styles.bubbleText, item.isOwn && styles.bubbleTextOwn]}>
                        {item.content}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Timestamp + sent tick — only at bottom of each group */}
                  {isLastInGroup && (
                    <View style={[styles.timestampRow, item.isOwn && styles.timestampRowOwn]}>
                      <Text style={styles.timestamp}>{formatTime(item.sentAt)}</Text>
                      {item.isOwn && (
                        <Ionicons name="checkmark" size={11} color={Colors.muted} style={styles.sentIcon} />
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />

        {/* ── New messages pill ── */}
        {pendingCount > 0 && (
          <Animated.View
            style={[
              styles.newMsgPillWrap,
              {
                opacity: pillAnim,
                transform: [{ translateY: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
              },
            ]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.newMsgPill}
              onPress={() => {
                listRef.current?.scrollToEnd({ animated: true });
                setPendingCount(0);
                atBottomRef.current = true;
              }}
            >
              <Ionicons name="chevron-down" size={13} color={Colors.white} />
              <Text style={styles.newMsgPillText}>
                {pendingCount === 1 ? '1 new message' : `${pendingCount} new messages`}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        </View>

        {isArchived ? (
          <View style={styles.archiveNotice}>
            <Ionicons name="archive-outline" size={16} color={Colors.muted} />
            <Text style={styles.archiveNoticeText}>This event thread is archived.</Text>
          </View>
        ) : null}

        {/* ── Input bar ── */}
        <SafeAreaView edges={['bottom']} style={styles.inputSafe}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn}>
              <Ionicons name="add" size={22} color={Colors.muted} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder={isArchived ? 'Thread archived' : 'Message the group...'}
              placeholderTextColor={Colors.muted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!isArchived}
            />
            <TouchableOpacity
              style={[styles.sendBtn, sendDisabled && styles.sendBtnDisabled]}
              onPress={send}
              disabled={sendDisabled}
            >
              <Ionicons name="send" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  flex: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 22 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 1 },
  headerRight: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Message list ──
  messageList: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: 8,
  },

  // Date divider
  dateDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dateLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // Message row
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgWrapOwn: { flexDirection: 'row-reverse' },
  msgWrapInGroup:  { marginBottom: 2 },   // tight within a run
  msgWrapGroupEnd: { marginBottom: 10 },  // breathing room after a run

  // Avatar
  avatarWrap: { width: 32, alignSelf: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  avatarSpacer: { width: 32 },

  // Bubble column
  msgColumn: { maxWidth: '72%' },
  msgColumnOwn: { alignItems: 'flex-end' },

  senderName: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
    marginLeft: 12,
  },

  // Bubbles — no tail by default; tail added on last in group only
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleOwn: {
    backgroundColor: Colors.terracotta,
    borderBottomRightRadius: 18, // no tail by default
  },
  bubbleTailOwn: { borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 18, // no tail by default
  },
  bubbleTailOther: { borderBottomLeftRadius: 4 },

  bubbleText: { fontSize: 14, color: Colors.ink, lineHeight: 20 },
  bubbleTextOwn: { color: Colors.white },

  // Timestamp row — only rendered on last bubble of a group
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
    marginLeft: 12,
  },
  timestampRowOwn: { justifyContent: 'flex-end', marginLeft: 0, marginRight: 4 },
  timestamp: { fontSize: 10, color: Colors.muted },
  sentIcon: { opacity: 0.65 },

  // ── Input bar ──
  inputSafe: { backgroundColor: Colors.warmWhite },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 100,
    backgroundColor: Colors.cream,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontSize: 14,
    color: Colors.ink,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.borderDark },
  archiveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: Colors.paper,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  archiveNoticeText: {
    fontSize: 12,
    color: Colors.muted,
    fontWeight: '600',
  },

  // ── New messages pill ──
  newMsgPillWrap: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  newMsgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  newMsgPillText: { fontSize: 12, fontWeight: '700', color: Colors.white },
});
