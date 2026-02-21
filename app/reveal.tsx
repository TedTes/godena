import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../constants/theme';
import { mockReveal } from '../data/mock';

export default function RevealScreen() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const handleAccept = () => {
    setAccepted(true);
    setTimeout(() => {
      router.replace('/chat/c1');
    }, 1200);
  };

  const handleDecline = () => {
    router.back();
  };

  if (accepted) {
    return (
      <View style={styles.successContainer}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.successContent}>
            <Text style={styles.successEmoji}>🎉</Text>
            <Text style={styles.successTitle}>It's a match!</Text>
            <Text style={styles.successSub}>
              Opening your conversation with {mockReveal.matchName}…
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
          {/* Photo */}
          <View style={styles.photoSection}>
            <View style={styles.photoRing3} />
            <View style={styles.photoRing2} />
            <View style={styles.photoRing1} />
            <Image source={{ uri: mockReveal.matchPhoto }} style={styles.photo} />
            <View style={styles.sparkle}>
              <Text style={styles.sparkleText}>✨</Text>
            </View>
          </View>

          {/* Context chip */}
          <View style={styles.contextChip}>
            <Text style={styles.contextEmoji}>{mockReveal.groupEmoji}</Text>
            <Text style={styles.contextText}>via {mockReveal.groupName}</Text>
          </View>

          {/* Name + message */}
          <Text style={styles.name}>{mockReveal.matchName}, {mockReveal.matchAge}</Text>
          <View style={styles.messageBubble}>
            <Text style={styles.messageText}>{mockReveal.message}</Text>
          </View>

          {/* Activity suggestion */}
          <View style={styles.activityCard}>
            <View style={styles.activityHeader}>
              <Ionicons name="calendar-outline" size={16} color={Colors.terracotta} />
              <Text style={styles.activityLabel}>Suggested First Meeting</Text>
            </View>
            <Text style={styles.activityTitle}>{mockReveal.activitySuggestion}</Text>
            <Text style={styles.activityDate}>{mockReveal.activityDate}</Text>
          </View>

          {/* Note */}
          <View style={styles.noteRow}>
            <Ionicons name="lock-closed-outline" size={12} color={Colors.muted} />
            <Text style={styles.noteText}>
              This introduction is mutual. {mockReveal.matchName} is seeing the same message right now.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={handleAccept}
              activeOpacity={0.85}
            >
              <Text style={styles.acceptText}>Yes, I'd love to meet 👋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineBtn}
              onPress={handleDecline}
              activeOpacity={0.85}
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

  // Photo rings
  photoSection: {
    position: 'relative',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    marginTop: 8,
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

  // Activity card
  activityCard: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.md,
    padding: Spacing.md,
    width: '100%',
    marginBottom: 16,
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
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 2,
  },
  activityDate: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 32,
    paddingHorizontal: Spacing.md,
  },
  noteText: { fontSize: 12, color: Colors.muted, lineHeight: 18, flex: 1 },

  // Actions
  actions: { width: '100%', gap: 12 },
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
  },
  declineText: { fontSize: 14, color: Colors.muted },

  successContainer: { flex: 1, backgroundColor: Colors.terracotta },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successEmoji: { fontSize: 72, marginBottom: 24 },
  successTitle: { fontSize: 40, fontWeight: '900', color: Colors.white, marginBottom: 12 },
  successSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24 },
});
