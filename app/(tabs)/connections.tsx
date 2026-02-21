import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockReveal, mockConnectionMessages } from '../../data/mock';

const pastConnections = [
  {
    id: 'c2',
    name: 'Meron Tadesse',
    photo: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=200&q=80',
    groupName: 'Addis Coffee Circle',
    groupEmoji: '☕',
    lastMessage: 'That ceremony was so beautiful ✨',
    lastAt: '2026-02-18',
    status: 'active',
  },
];

export default function ConnectionsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Connections</Text>
          <Text style={styles.subtitle}>People you've been introduced to</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* New reveal */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>New Introduction</Text>
              <View style={styles.newBadge}><Text style={styles.newBadgeText}>1 new</Text></View>
            </View>

            <TouchableOpacity
              style={styles.revealCard}
              onPress={() => router.push('/reveal')}
              activeOpacity={0.88}
            >
              <View style={styles.revealGlow} />
              <View style={styles.revealTop}>
                <Image source={{ uri: mockReveal.matchPhoto }} style={styles.revealPhoto} />
                <View style={styles.revealBadge}>
                  <Text style={styles.revealBadgeText}>✨</Text>
                </View>
              </View>
              <Text style={styles.revealName}>{mockReveal.matchName}</Text>
              <Text style={styles.revealGroup}>
                {mockReveal.groupEmoji} via {mockReveal.groupName}
              </Text>
              <Text style={styles.revealMsg} numberOfLines={2}>{mockReveal.message}</Text>
              <TouchableOpacity
                style={styles.revealBtn}
                onPress={() => router.push('/reveal')}
                activeOpacity={0.85}
              >
                <Text style={styles.revealBtnText}>See Introduction →</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </View>

          {/* Active connections */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Active Connections</Text>
            {pastConnections.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.connectionCard}
                onPress={() => router.push(`/chat/${c.id}`)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: c.photo }} style={styles.connPhoto} />
                <View style={styles.connInfo}>
                  <Text style={styles.connName}>{c.name}</Text>
                  <Text style={styles.connGroup}>
                    {c.groupEmoji} {c.groupName}
                  </Text>
                  <Text style={styles.connLast} numberOfLines={1}>{c.lastMessage}</Text>
                </View>
                <View style={styles.connRight}>
                  <Text style={styles.connDate}>{c.lastAt}</Text>
                  <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* How it works */}
          <View style={styles.howBox}>
            <Text style={styles.howTitle}>How introductions work</Text>
            <View style={styles.howSteps}>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>1</Text>
                <Text style={styles.howStepText}>
                  You toggle "Open" in a group you're active in
                </Text>
              </View>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>2</Text>
                <Text style={styles.howStepText}>
                  We watch for organic engagement between open members
                </Text>
              </View>
              <View style={styles.howStep}>
                <Text style={styles.howStepNum}>3</Text>
                <Text style={styles.howStepText}>
                  When both signals align — we make a warm introduction. Always mutual.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  title: { fontSize: 28, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 2 },

  section: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  newBadge: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '700' },

  // Reveal card
  revealCard: {
    backgroundColor: Colors.brown,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  revealGlow: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(196,98,45,0.2)',
  },
  revealTop: { position: 'relative', width: 80, height: 80, marginBottom: 14 },
  revealPhoto: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: Colors.terraLight },
  revealBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.brown,
  },
  revealBadgeText: { fontSize: 12 },
  revealName: { fontSize: 22, fontWeight: '900', color: Colors.cream, marginBottom: 4 },
  revealGroup: { fontSize: 13, color: Colors.brownLight, marginBottom: 12 },
  revealMsg: { fontSize: 13, color: 'rgba(245,240,232,0.7)', lineHeight: 20, marginBottom: 18 },
  revealBtn: {
    backgroundColor: Colors.terraLight,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  revealBtnText: { fontSize: 13, fontWeight: '700', color: Colors.brown },

  // Connection cards
  connectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  connPhoto: { width: 52, height: 52, borderRadius: 26 },
  connInfo: { flex: 1 },
  connName: { fontSize: 15, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  connGroup: { fontSize: 11, color: Colors.terracotta, fontWeight: '600', marginBottom: 3 },
  connLast: { fontSize: 12, color: Colors.muted },
  connRight: { alignItems: 'flex-end', gap: 4 },
  connDate: { fontSize: 11, color: Colors.muted },

  // How it works
  howBox: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderDark,
  },
  howTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brownMid,
    marginBottom: 12,
  },
  howSteps: { gap: 10 },
  howStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  howStepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.terracotta,
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 22,
    flexShrink: 0,
  },
  howStepText: { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 19 },
});
