import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';

type ConnectionMessage = {
  id: string;
  senderId: string;
  content: string;
  sentAt: string;
  isOwn: boolean;
};

const mockConnectionMessages: ConnectionMessage[] = [
  {
    id: 'cm1',
    senderId: 'u2',
    content: 'Hey! Glad we got introduced through the hikers group.',
    sentAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    isOwn: false,
  },
];

const mockReveal = {
  matchName: 'Dawit',
  matchPhoto: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&q=80',
  groupEmoji: '🥾',
  groupName: 'Habesha Hikers',
  activitySuggestion: 'Rock Creek weekend walk',
  activityDate: 'This Saturday',
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function DirectChatScreen() {
  const router = useRouter();
  const [messages, setMessages] = useState<ConnectionMessage[]>(mockConnectionMessages);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `cm${Date.now()}`,
        senderId: 'user-1',
        content: text,
        sentAt: new Date().toISOString(),
        isOwn: true,
      },
    ]);
    setInput('');
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.ink} />
          </TouchableOpacity>
          <Image source={{ uri: mockReveal.matchPhoto }} style={styles.headerPhoto} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{mockReveal.matchName}</Text>
            <Text style={styles.headerSub}>
              {mockReveal.groupEmoji} {mockReveal.groupName}
            </Text>
          </View>
          <TouchableOpacity style={styles.headerAction}>
            <Ionicons name="ellipsis-horizontal" size={20} color={Colors.muted} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {/* Activity card at top */}
        <View style={styles.activityBanner}>
          <Text style={styles.activityBannerEmoji}>⛰️</Text>
          <View style={styles.activityBannerInfo}>
            <Text style={styles.activityBannerTitle}>{mockReveal.activitySuggestion}</Text>
            <Text style={styles.activityBannerDate}>{mockReveal.activityDate}</Text>
          </View>
          <TouchableOpacity style={styles.activityBannerBtn}>
            <Text style={styles.activityBannerBtnText}>Plan it</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: msg }) => (
            <View style={[styles.msgWrap, msg.isOwn && styles.msgWrapOwn]}>
              {!msg.isOwn && (
                <Image source={{ uri: mockReveal.matchPhoto }} style={styles.msgAvatar} />
              )}
              <View style={styles.msgColumn}>
                <View style={[styles.bubble, msg.isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, msg.isOwn && styles.bubbleTextOwn]}>
                    {msg.content}
                  </Text>
                </View>
                <Text style={[styles.timestamp, msg.isOwn && styles.timestampOwn]}>
                  {formatTime(msg.sentAt)}
                </Text>
              </View>
            </View>
          )}
        />

        <SafeAreaView edges={['bottom']} style={styles.inputSafe}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder={`Message ${mockReveal.matchName}…`}
              placeholderTextColor={Colors.muted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={send}
              disabled={!input.trim()}
            >
              <Ionicons name="send" size={18} color={Colors.white} />
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
  headerSafe: { backgroundColor: Colors.warmWhite, borderBottomWidth: 1, borderBottomColor: Colors.border },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerPhoto: { width: 40, height: 40, borderRadius: 20 },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  headerSub: { fontSize: 11, color: Colors.muted },
  headerAction: { padding: 4 },

  activityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    padding: Spacing.md,
  },
  activityBannerEmoji: { fontSize: 20 },
  activityBannerInfo: { flex: 1 },
  activityBannerTitle: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  activityBannerDate: { fontSize: 11, color: Colors.muted },
  activityBannerBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  activityBannerBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  messageList: { padding: Spacing.md, gap: 8, paddingBottom: 8 },
  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgWrapOwn: { flexDirection: 'row-reverse' },
  msgAvatar: { width: 30, height: 30, borderRadius: 15 },
  msgColumn: { maxWidth: '72%' },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: { backgroundColor: Colors.terracotta, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: Colors.warmWhite,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: { fontSize: 14, color: Colors.ink, lineHeight: 20 },
  bubbleTextOwn: { color: Colors.white },
  timestamp: { fontSize: 10, color: Colors.muted, marginTop: 3, marginLeft: 4 },
  timestampOwn: { textAlign: 'right', marginRight: 4, marginLeft: 0 },

  inputSafe: { backgroundColor: Colors.warmWhite },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
  sendBtnDisabled: { backgroundColor: Colors.border },
});
