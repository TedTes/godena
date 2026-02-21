import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockGroups, mockGroupMembers, mockEvents } from '../../data/mock';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const group = mockGroups.find((g) => g.id === id) || mockGroups[0];
  const groupEvents = mockEvents.filter((e) => e.groupId === id);
  const [isOpen, setIsOpen] = useState(group.isOpenToConnect);
  const [activeTab, setActiveTab] = useState<'about' | 'members' | 'events'>('about');

  const handleOpenToggle = (val: boolean) => {
    if (val) {
      Alert.alert(
        'Set openness signal?',
        `You'll quietly signal that you're open to a connection from ${group.name}. Only a mutual signal triggers a reveal — nobody will know unless it's both of you.`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: 'Yes, I\'m open',
            onPress: () => setIsOpen(true),
          },
        ]
      );
    } else {
      setIsOpen(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: group.coverColor }]}>
        <SafeAreaView edges={['top']}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.heroContent}>
          <Text style={styles.heroEmoji}>{group.emoji}</Text>
          <Text style={styles.heroTitle}>{group.name}</Text>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.heroMetaText}>{group.memberCount} members</Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroMetaItem}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.heroMetaText}>{group.isVirtual ? 'Virtual' : group.city}</Text>
            </View>
            <View style={styles.heroDot} />
            <Text style={styles.heroMetaText}>{group.category}</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Openness toggle */}
        <View style={styles.openCard}>
          <View style={styles.openLeft}>
            <Text style={styles.openTitle}>
              {isOpen ? '🌱 You\'re open in this group' : 'Open to a connection?'}
            </Text>
            <Text style={styles.openDesc}>
              {isOpen
                ? 'Your signal is private. We\'ll only reveal when it\'s mutual and the time feels right.'
                : 'Signal quietly. Only fires when both people are open and have genuinely connected.'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={handleOpenToggle}
            trackColor={{ false: Colors.border, true: Colors.olive }}
            thumbColor={Colors.white}
          />
        </View>

        {/* Chat CTA */}
        <TouchableOpacity
          style={styles.chatCta}
          onPress={() => router.push(`/group/chat/${group.id}`)}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubbles-outline" size={18} color={Colors.terracotta} />
          <Text style={styles.chatCtaText}>Open Group Chat</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.muted} />
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['about', 'members', 'events'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => setActiveTab(t)}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'about' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>About</Text>
            <Text style={styles.aboutText}>{group.description}</Text>

            {groupEvents[0] && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Next Event</Text>
                <View style={styles.nextEventCard}>
                  <Text style={styles.nextEventEmoji}>{groupEvents[0].emoji}</Text>
                  <View style={styles.nextEventInfo}>
                    <Text style={styles.nextEventTitle}>{groupEvents[0].title}</Text>
                    <Text style={styles.nextEventMeta}>
                      {groupEvents[0].date} · {groupEvents[0].time}
                    </Text>
                    <Text style={styles.nextEventLocation}>{groupEvents[0].location}</Text>
                  </View>
                  <TouchableOpacity style={[styles.rsvpBtn, groupEvents[0].isRsvped && styles.rsvpBtnActive]}>
                    <Text style={[styles.rsvpText, groupEvents[0].isRsvped && styles.rsvpTextActive]}>
                      {groupEvents[0].isRsvped ? '✓ Going' : 'RSVP'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'members' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>{mockGroupMembers.length} members</Text>
            {mockGroupMembers.map((m) => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.memberAvatar}>
                  {m.photo ? (
                    <Image source={{ uri: m.photo }} style={styles.memberAvatarImg} />
                  ) : (
                    <View style={[styles.memberAvatarImg, styles.memberAvatarPlaceholder]}>
                      <Text style={styles.memberInitial}>{m.name[0]}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{m.name}</Text>
                  {m.role === 'organizer' && (
                    <Text style={styles.memberRole}>Organizer</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'events' && (
          <View style={styles.tabContent}>
            <Text style={styles.sectionLabel}>
              {groupEvents.length > 0 ? `${groupEvents.length} upcoming` : 'No upcoming events'}
            </Text>
            {groupEvents.map((ev) => (
              <View key={ev.id} style={styles.eventCard}>
                <Text style={styles.eventEmoji}>{ev.emoji}</Text>
                <View style={styles.eventInfo}>
                  <Text style={styles.eventTitle}>{ev.title}</Text>
                  <Text style={styles.eventMeta}>{ev.date} · {ev.time}</Text>
                  <Text style={styles.eventLocation}>{ev.location}</Text>
                </View>
                <TouchableOpacity style={[styles.rsvpBtn, ev.isRsvped && styles.rsvpBtnActive]}>
                  <Text style={[styles.rsvpText, ev.isRsvped && styles.rsvpTextActive]}>
                    {ev.isRsvped ? '✓' : 'RSVP'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
            {groupEvents.length === 0 && (
              <Text style={styles.emptyText}>No events scheduled yet</Text>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  hero: { paddingBottom: Spacing.xl },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    margin: Spacing.md,
  },
  heroContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  heroEmoji: { fontSize: 44, marginBottom: 10 },
  heroTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.white,
    marginBottom: 10,
    lineHeight: 34,
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  heroDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.4)' },

  openCard: {
    margin: Spacing.lg,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.olive,
  },
  openLeft: { flex: 1 },
  openTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 4 },
  openDesc: { fontSize: 12, color: Colors.muted, lineHeight: 18 },

  chatCta: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  chatCtaText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.brown },

  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingBottom: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.terracotta },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },

  tabContent: { paddingHorizontal: Spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  aboutText: { fontSize: 14, color: Colors.brownMid, lineHeight: 22 },

  nextEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  nextEventEmoji: { fontSize: 28 },
  nextEventInfo: { flex: 1 },
  nextEventTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  nextEventMeta: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginBottom: 1 },
  nextEventLocation: { fontSize: 11, color: Colors.muted },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  memberAvatar: { width: 44, height: 44 },
  memberAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  memberAvatarPlaceholder: {
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: Colors.ink },
  memberRole: { fontSize: 11, color: Colors.terracotta, fontWeight: '600', marginTop: 2 },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  eventEmoji: { fontSize: 24 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  eventMeta: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginBottom: 1 },
  eventLocation: { fontSize: 11, color: Colors.muted },
  rsvpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.terracotta,
  },
  rsvpBtnActive: { backgroundColor: Colors.terracotta },
  rsvpText: { fontSize: 11, fontWeight: '700', color: Colors.terracotta },
  rsvpTextActive: { color: Colors.white },
  emptyText: { color: Colors.muted, fontSize: 13, fontStyle: 'italic' },
});
