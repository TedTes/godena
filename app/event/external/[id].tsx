import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../../constants/theme';
import { fetchExternalEventById, type ExternalEventRow } from '../../../lib/services/events';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function ExternalEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [eventRow, setEventRow] = useState<ExternalEventRow | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const { data, error } = await fetchExternalEventById(id);
      if (error) {
        setEventRow(null);
      } else {
        setEventRow((data ?? null) as ExternalEventRow | null);
      }
      setLoading(false);
    };
    void load();
  }, [id]);

  const locationLine = useMemo(() => {
    if (!eventRow) return '';
    if (eventRow.venue_name) return eventRow.venue_name;
    if (eventRow.city && eventRow.country) return `${eventRow.city}, ${eventRow.country}`;
    return eventRow.city ?? 'Location TBA';
  }, [eventRow]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.terracotta} />
      </View>
    );
  }

  if (!eventRow) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.emptyTitle}>Event not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backIcon} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color={Colors.ink} />
          </TouchableOpacity>

          <Text style={styles.title}>{eventRow.title}</Text>
          <Text style={styles.subText}>
            {formatDate(eventRow.start_at)} · {formatTime(eventRow.start_at)}
          </Text>

          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={16} color={Colors.muted} />
            <Text style={styles.metaText}>{locationLine}</Text>
          </View>

          {eventRow.organizer_name && (
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={16} color={Colors.muted} />
              <Text style={styles.metaText}>{eventRow.organizer_name}</Text>
            </View>
          )}

          {eventRow.description && (
            <View style={styles.descriptionCard}>
              <Text style={styles.descriptionText}>{eventRow.description}</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => eventRow.source_url && Linking.openURL(eventRow.source_url)}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Open event</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.white} />
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  backBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
  },
  backBtnText: { fontSize: 13, color: Colors.ink, fontWeight: '600' },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  backIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.ink, marginBottom: 6 },
  subText: { fontSize: 13, color: Colors.muted, marginBottom: Spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  metaText: { fontSize: 14, color: Colors.brownMid },
  descriptionCard: {
    marginTop: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    padding: Spacing.md,
  },
  descriptionText: { fontSize: 14, color: Colors.ink, lineHeight: 20 },
  ctaBtn: {
    marginTop: Spacing.lg,
    backgroundColor: Colors.terracotta,
    paddingVertical: 14,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
});
