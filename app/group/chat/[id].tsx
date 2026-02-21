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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../../constants/theme';
import { mockGroupMessages, mockGroups } from '../../../data/mock';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const group = mockGroups.find((g) => g.id === id) || mockGroups[0];
  const [messages, setMessages] = useState(mockGroupMessages);
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList>(null);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `m${Date.now()}`,
        groupId: id || 'g1',
        senderId: 'user-1',
        senderName: 'Tigist Haile',
        senderPhoto: '',
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
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={[styles.header, { backgroundColor: group.coverColor }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerEmoji}>{group.emoji}</Text>
            <View>
              <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
              <Text style={styles.headerSub}>{group.memberCount} members</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.headerRight}
            onPress={() => router.push(`/group/${group.id}`)}
          >
            <Ionicons name="information-circle-outline" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: msg, index }) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showSender = !msg.isOwn && prevMsg?.senderId !== msg.senderId;

            return (
              <View style={[styles.msgWrap, msg.isOwn && styles.msgWrapOwn]}>
                {!msg.isOwn && (
                  <View style={styles.avatarWrap}>
                    {showSender ? (
                      msg.senderPhoto ? (
                        <Image source={{ uri: msg.senderPhoto }} style={styles.avatar} />
                      ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                          <Text style={styles.avatarInitial}>{msg.senderName[0]}</Text>
                        </View>
                      )
                    ) : (
                      <View style={styles.avatarSpacer} />
                    )}
                  </View>
                )}
                <View style={styles.msgColumn}>
                  {showSender && !msg.isOwn && (
                    <Text style={styles.senderName}>{msg.senderName}</Text>
                  )}
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
            );
          }}
        />

        {/* Input */}
        <SafeAreaView edges={['bottom']} style={styles.inputSafe}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn}>
              <Ionicons name="add" size={22} color={Colors.muted} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Message the group..."
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
  headerSafe: { backgroundColor: Colors.terracotta },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 24 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: Colors.white },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)' },
  headerRight: { padding: 4 },

  messageList: { padding: Spacing.md, paddingBottom: 8, gap: 4 },

  msgWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 },
  msgWrapOwn: { flexDirection: 'row-reverse' },

  avatarWrap: { width: 32 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: {
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  avatarSpacer: { width: 32, height: 32 },

  msgColumn: { maxWidth: '72%' },
  senderName: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
    marginBottom: 3,
    marginLeft: 12,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: Colors.terracotta,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: Colors.warmWhite,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bubbleText: { fontSize: 14, color: Colors.ink, lineHeight: 20 },
  bubbleTextOwn: { color: Colors.white },
  timestamp: {
    fontSize: 10,
    color: Colors.muted,
    marginTop: 3,
    marginLeft: 12,
  },
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
  sendBtnDisabled: { backgroundColor: Colors.border },
});
