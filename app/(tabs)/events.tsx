import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockEvents, mockGroups } from '../../data/mock';

const allEvents = [
  ...mockEvents,
  {
    id: 'ev4',
    groupId: 'g4',
    title: 'Virtual Conversation Hour',
    date: 'Wednesday, Feb 26',
    time: '8:00 PM',
    location: 'Zoom',
    attendeeCount: 22,
    isRsvped: false,
    emoji: '🗣️',
  },
  {
    id: 'ev5',
    groupId: 'g5',
    title: 'Timkat Celebration',
    date: 'Saturday, Mar 7',
    time: '8:00 AM',
    location: 'St. Mary Church, DC',
    attendeeCount: 56,
    isRsvped: false,
    emoji: '✝️',
  },
];

export default function EventsScreen() {
  const [filter, setFilter] = useState<'all' | 'mine'>('all');

  const events = filter === 'mine'
    ? allEvents.filter((e) => mockGroups.find((g) => g.id === e.groupId)?.isMember)
    : allEvents;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.title}>Events</Text>
          <Text style={styles.subtitle}>Washington, DC</Text>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, filter === 'all' && styles.tabBtnActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>All Events</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, filter === 'mine' && styles.tabBtnActive]}
            onPress={() => setFilter('mine')}
          >
            <Text style={[styles.tabText, filter === 'mine' && styles.tabTextActive]}>My Groups</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={events}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: ev }) => {
            const group = mockGroups.find((g) => g.id === ev.groupId);
            return (
              <View style={styles.card}>
                <View style={[styles.dateStrip, { backgroundColor: group?.coverColor || Colors.brown }]}>
                  <Text style={styles.dateEmoji}>{ev.emoji}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.groupLabel}>{group?.name}</Text>
                  <Text style={styles.eventTitle}>{ev.title}</Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={12} color={Colors.muted} />
                    <Text style={styles.metaText}>{ev.date} · {ev.time}</Text>
                  </View>
                  <View style={styles.metaRow}>
                    <Ionicons name="location-outline" size={12} color={Colors.muted} />
                    <Text style={styles.metaText} numberOfLines={1}>{ev.location}</Text>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.attendeeText}>{ev.attendeeCount} going</Text>
                    <TouchableOpacity
                      style={[styles.rsvpBtn, ev.isRsvped && styles.rsvpBtnActive]}
                    >
                      <Text style={[styles.rsvpBtnText, ev.isRsvped && styles.rsvpBtnTextActive]}>
                        {ev.isRsvped ? '✓ Going' : 'RSVP'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 4 },
  title: { fontSize: 28, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 2 },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabBtn: {
    flex: 1,
    height: 38,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: Colors.white },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },
  list: { paddingHorizontal: Spacing.lg, gap: 12, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dateStrip: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateEmoji: { fontSize: 26 },
  cardBody: { flex: 1, padding: 12 },
  groupLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.terracotta,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  eventTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  metaText: { fontSize: 12, color: Colors.muted, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  attendeeText: { fontSize: 12, color: Colors.muted },
  rsvpBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.terracotta,
  },
  rsvpBtnActive: { backgroundColor: Colors.terracotta },
  rsvpBtnText: { fontSize: 12, fontWeight: '700', color: Colors.terracotta },
  rsvpBtnTextActive: { color: Colors.white },
});
