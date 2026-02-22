import React, { useEffect, useState } from 'react';
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
import { mockGroups, mockEvents, mockReveal } from '../../data/mock';
import { supabase } from '../../lib/supabase';

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function HomeScreen() {
  const router = useRouter();
  const myGroups = mockGroups.filter((g) => g.isMember);
  const [firstName, setFirstName] = useState('there');
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        setLoadingProfile(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', userId)
        .maybeSingle();

      if (profile?.full_name) {
        setFirstName(profile.full_name.split(' ')[0] ?? profile.full_name);
      }

      setLoadingProfile(false);
    };

    void loadProfile();
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark}>Godena</Text>
            <Text style={styles.greeting}>
              Good morning, {loadingProfile ? '...' : firstName} 👋
            </Text>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <Ionicons name="notifications-outline" size={22} color={Colors.brown} />
            <View style={styles.notifDot} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Reveal Banner */}
          <TouchableOpacity
            style={styles.revealBanner}
            onPress={() => router.push('/reveal')}
            activeOpacity={0.88}
          >
            <View style={styles.revealLeft}>
              <Text style={styles.revealEyebrow}>✨  New Connection</Text>
              <Text style={styles.revealTitle}>You and Dawit might connect</Text>
              <Text style={styles.revealSub}>via {mockReveal.groupName}</Text>
            </View>
            <View style={styles.revealImgWrap}>
              <Image source={{ uri: mockReveal.matchPhoto }} style={styles.revealImg} />
              <View style={styles.revealImgBorder} />
            </View>
          </TouchableOpacity>

          {/* My Groups */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>My Groups</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/groups')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {myGroups.map((g) => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupCard, { backgroundColor: g.coverColor }]}
                  onPress={() => router.push(`/group/${g.id}`)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.groupEmoji}>{g.emoji}</Text>
                  <Text style={styles.groupCardName}>{g.name}</Text>
                  <Text style={styles.groupCardMeta}>{g.memberCount} members</Text>
                  {g.isOpenToConnect && (
                    <View style={styles.openBadge}>
                      <Text style={styles.openBadgeText}>🌱 Open</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addGroupCard}
                onPress={() => router.push('/(tabs)/groups')}
              >
                <Ionicons name="add" size={28} color={Colors.muted} />
                <Text style={styles.addGroupText}>Join a Group</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Upcoming Events */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Upcoming Events</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/events')}>
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {mockEvents.slice(0, 2).map((ev) => (
              <TouchableOpacity key={ev.id} style={styles.eventCard} activeOpacity={0.85}>
                <View style={styles.eventIconWrap}>
                  <Text style={styles.eventIcon}>{ev.emoji}</Text>
                </View>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{ev.title}</Text>
                  <Text style={styles.eventMeta}>
                    {ev.date} · {ev.time}
                  </Text>
                  <Text style={styles.eventLocation} numberOfLines={1}>
                    {ev.location}
                  </Text>
                </View>
                <View style={styles.eventRight}>
                  <View style={[styles.rsvpPill, ev.isRsvped && styles.rsvpPillActive]}>
                    <Text style={[styles.rsvpText, ev.isRsvped && styles.rsvpTextActive]}>
                      {ev.isRsvped ? 'Going' : 'RSVP'}
                    </Text>
                  </View>
                  <Text style={styles.attendeeCount}>{ev.attendeeCount} going</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Activity Hint */}
          <View style={styles.hintBox}>
            <Text style={styles.hintIcon}>🌱</Text>
            <Text style={styles.hintText}>
              You're open to a connection in{' '}
              <Text style={styles.hintBold}>Habesha Hikers</Text>. Keep showing up — it matters.
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.terracotta,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
  },
  notifBtn: { position: 'relative', padding: 6 },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.terracotta,
    borderWidth: 1.5,
    borderColor: Colors.cream,
  },
  scroll: { paddingTop: Spacing.md },

  // Reveal banner
  revealBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    backgroundColor: Colors.brown,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  revealLeft: { flex: 1, paddingRight: Spacing.md },
  revealEyebrow: {
    fontSize: 11,
    color: Colors.terraLight,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  revealTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.cream,
    marginBottom: 4,
    lineHeight: 24,
  },
  revealSub: {
    fontSize: 13,
    color: Colors.brownLight,
  },
  revealImgWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  revealImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  revealImgBorder: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: Colors.terraLight,
  },

  // Sections
  section: { marginBottom: Spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.ink,
  },
  seeAll: {
    fontSize: 13,
    color: Colors.terracotta,
    fontWeight: '600',
  },

  // Group cards (horizontal)
  hScroll: { paddingLeft: Spacing.lg },
  groupCard: {
    width: 140,
    height: 160,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginRight: 10,
    justifyContent: 'flex-end',
  },
  groupEmoji: { fontSize: 28, marginBottom: 'auto' as any, paddingTop: 4 },
  groupCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.white,
    lineHeight: 18,
    marginBottom: 2,
  },
  groupCardMeta: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  openBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  openBadgeText: { fontSize: 10, color: Colors.white, fontWeight: '600' },
  addGroupCard: {
    width: 120,
    height: 160,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.lg,
    gap: 8,
  },
  addGroupText: { fontSize: 12, color: Colors.muted, fontWeight: '600' },

  // Event cards
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: 10,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  eventIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventIcon: { fontSize: 22 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  eventMeta: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginBottom: 2 },
  eventLocation: { fontSize: 11, color: Colors.muted },
  eventRight: { alignItems: 'flex-end', gap: 4 },
  rsvpPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.cream,
  },
  rsvpPillActive: {
    backgroundColor: Colors.terracotta,
    borderColor: Colors.terracotta,
  },
  rsvpText: { fontSize: 11, fontWeight: '700', color: Colors.muted },
  rsvpTextActive: { color: Colors.white },
  attendeeCount: { fontSize: 10, color: Colors.muted },

  // Hint box
  hintBox: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.paper,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    borderLeftWidth: 3,
    borderLeftColor: Colors.olive,
  },
  hintIcon: { fontSize: 18, marginTop: 1 },
  hintText: { flex: 1, fontSize: 13, color: Colors.muted, lineHeight: 20 },
  hintBold: { color: Colors.brown, fontWeight: '700' },
});
