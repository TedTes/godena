import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { mockGroups } from '../../data/mock';

const CATEGORIES = ['All', 'Outdoors', 'Food & Drink', 'Professional', 'Language', 'Faith'];

export default function GroupsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());

  const filtered = mockGroups.filter((g) => {
    const matchSearch =
      search.length === 0 ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.category.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || g.category === activeCategory;
    const matchTab = tab === 'mine' ? g.isMember : !g.isMember;
    return matchSearch && matchCat && matchTab;
  });

  function formatNextEvent(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Groups</Text>
          <Text style={styles.subtitle}>Washington, DC</Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]}
            onPress={() => setTab('mine')}
          >
            <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>
              My Groups
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'discover' && styles.tabBtnActive]}
            onPress={() => setTab('discover')}
          >
            <Text style={[styles.tabText, tab === 'discover' && styles.tabTextActive]}>
              Discover
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={Colors.muted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search groups..."
            placeholderTextColor={Colors.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {/* Category chips */}
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
          renderItem={({ item: cat }) => (
            <TouchableOpacity
              style={[styles.chip, activeCategory === cat && styles.chipActive]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.chipText, activeCategory === cat && styles.chipTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No groups found</Text>
            </View>
          }
          renderItem={({ item: g }) => {
            const isJoined = g.isMember || joinedIds.has(g.id);
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  style={styles.cardPressable}
                  onPress={() => router.push(`/group/${g.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.cardAccent, { backgroundColor: g.coverColor }]}>
                    <Text style={styles.cardEmoji}>{g.emoji}</Text>
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <Text style={styles.cardName} numberOfLines={1}>{g.name}</Text>
                      {g.isVirtual && (
                        <View style={styles.virtualBadge}>
                          <Text style={styles.virtualText}>Virtual</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.cardDesc} numberOfLines={2}>{g.description}</Text>
                    <View style={styles.cardMeta}>
                      <View style={styles.cardMetaItem}>
                        <Ionicons name="people-outline" size={12} color={Colors.muted} />
                        <Text style={styles.cardMetaText}>{g.memberCount}</Text>
                      </View>
                      <View style={styles.cardMetaItem}>
                        <Ionicons name="calendar-outline" size={12} color={Colors.muted} />
                        <Text style={styles.cardMetaText}>{formatNextEvent(g.nextEventAt)}</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
                  onPress={() => {
                    if (!isJoined) {
                      setJoinedIds((prev) => new Set([...prev, g.id]));
                    }
                  }}
                  disabled={isJoined}
                >
                  <Text style={[styles.joinText, isJoined && styles.joinTextJoined]}>
                    {isJoined ? '✓ Joined' : 'Join'}
                  </Text>
                </TouchableOpacity>
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
    marginTop: Spacing.sm,
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    padding: 2,
    marginBottom: Spacing.sm,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: Colors.white },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    height: 44,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.ink },

  chipsScroll: {
    flexGrow: 0,
  },
  chips: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    alignItems: 'center',
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  chipActive: { backgroundColor: Colors.terracotta, borderColor: Colors.terracotta },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  chipTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 32, gap: 10 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cardPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAccent: {
    width: 70,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 28 },
  cardBody: { flex: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.ink, flex: 1 },
  virtualBadge: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  virtualText: { fontSize: 9, color: Colors.muted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cardDesc: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginBottom: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardMetaText: { fontSize: 11, color: Colors.muted },
  openPill: {
    backgroundColor: 'rgba(122,140,92,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(122,140,92,0.3)',
  },
  openPillText: { fontSize: 10, color: Colors.olive, fontWeight: '600' },
  joinBtn: {
    marginRight: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
  },
  joinBtnJoined: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  joinTextJoined: { color: Colors.olive },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { color: Colors.muted, fontSize: 14 },
});
