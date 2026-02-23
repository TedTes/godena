import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

const CATEGORIES = ['All', 'Outdoors', 'Food & Drink', 'Professional', 'Language', 'Faith'];
const DB_CATEGORY_BY_LABEL: Record<string, string | null> = {
  All: null,
  Outdoors: 'outdoors',
  'Food & Drink': 'food_drink',
  Professional: 'professional',
  Language: 'language',
  Faith: 'faith',
};

function categoryLabelFromDb(category: string) {
  switch (category) {
    case 'food_drink':
      return 'Food & Drink';
    case 'outdoors':
      return 'Outdoors';
    case 'professional':
      return 'Professional';
    case 'language':
      return 'Language';
    case 'faith':
      return 'Faith';
    case 'culture':
      return 'Culture';
    default:
      return 'Other';
  }
}

function getGroupVisuals(category: string) {
  switch (category) {
    case 'outdoors':
      return { emoji: '🏕️', coverColor: '#7a8c5c' };
    case 'food_drink':
      return { emoji: '☕', coverColor: '#c4622d' };
    case 'professional':
      return { emoji: '💼', coverColor: '#3d2b1f' };
    case 'language':
      return { emoji: '🗣️', coverColor: '#c9a84c' };
    case 'faith':
      return { emoji: '✝️', coverColor: '#8b4220' };
    case 'culture':
      return { emoji: '🎉', coverColor: '#a07820' };
    default:
      return { emoji: '👥', coverColor: '#6b4c3b' };
  }
}

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  city: string | null;
  is_virtual: boolean;
  member_count: number;
  next_event_at: string | null;
};

export default function GroupsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');

  const joinGroup = async (groupId: string) => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again to join groups.');
      router.replace('/(auth)/phone');
      return;
    }
    if (joinedIds.has(groupId) || joiningId) {
      return;
    }

    setJoiningId(groupId);

    const { error } = await supabase
      .from('group_memberships')
      .upsert(
        { group_id: groupId, user_id: userId },
        { onConflict: 'group_id,user_id', ignoreDuplicates: true }
      );

    setJoiningId(null);

    if (error) {
      Alert.alert('Could not join group', error.message);
      return;
    }

    setJoinedIds((prev) => new Set([...prev, groupId]));
    setGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? { ...group, member_count: group.member_count + 1 }
          : group
      )
    );
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');

      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      setUserId(uid);

      const [{ data: groupsData, error: groupsError }, membershipsResponse] = await Promise.all([
        supabase
          .from('groups')
          .select('id, name, description, category, city, is_virtual, member_count, next_event_at')
          .order('created_at', { ascending: false }),
        uid
          ? supabase.from('group_memberships').select('group_id').eq('user_id', uid)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (groupsError) {
        setLoadError(groupsError.message);
        setLoading(false);
        return;
      }

      const membershipIds = new Set<string>(
        (membershipsResponse?.data ?? []).map((m: { group_id: string }) => m.group_id)
      );

      setGroups((groupsData ?? []) as GroupRow[]);
      setJoinedIds(membershipIds);
      setLoading(false);
    };

    void load();
  }, []);

  const filtered = useMemo(() => groups.filter((g) => {
    const matchSearch =
      search.length === 0 ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      categoryLabelFromDb(g.category).toLowerCase().includes(search.toLowerCase());
    const dbCategory = DB_CATEGORY_BY_LABEL[activeCategory];
    const matchCat = !dbCategory || g.category === dbCategory;
    const isMember = joinedIds.has(g.id);
    const matchTab = tab === 'mine' ? isMember : !isMember;
    return matchSearch && matchCat && matchTab;
  }), [groups, search, activeCategory, tab, joinedIds]);

  function formatNextEvent(iso: string | null) {
    if (!iso) return 'TBD';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'TBD';
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

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={Colors.terracotta} />
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(g) => g.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>{loadError || 'No groups found'}</Text>
              </View>
            }
            renderItem={({ item: g }) => {
              const isJoined = joinedIds.has(g.id);
              const visuals = getGroupVisuals(g.category);
              return (
                <View style={styles.card}>
                  <TouchableOpacity
                    style={styles.cardPressable}
                    onPress={() => router.push(`/group/${g.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.cardAccent, { backgroundColor: visuals.coverColor }]}>
                      <Text style={styles.cardEmoji}>{visuals.emoji}</Text>
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardTop}>
                        <Text style={styles.cardName} numberOfLines={1}>{g.name}</Text>
                        {g.is_virtual && (
                          <View style={styles.virtualBadge}>
                            <Text style={styles.virtualText}>Virtual</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.cardDesc} numberOfLines={2}>{g.description || 'No description yet.'}</Text>
                      <View style={styles.cardMeta}>
                        <View style={styles.cardMetaItem}>
                          <Ionicons name="people-outline" size={12} color={Colors.muted} />
                          <Text style={styles.cardMetaText}>{g.member_count}</Text>
                        </View>
                        <View style={styles.cardMetaItem}>
                          <Ionicons name="calendar-outline" size={12} color={Colors.muted} />
                          <Text style={styles.cardMetaText}>{formatNextEvent(g.next_event_at)}</Text>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
                    onPress={() => void joinGroup(g.id)}
                    disabled={isJoined || !userId || !!joiningId}
                  >
                    <Text style={[styles.joinText, isJoined && styles.joinTextJoined]}>
                      {isJoined ? '✓ Joined' : joiningId === g.id ? '...' : 'Join'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
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
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
