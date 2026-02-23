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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import {
  createGroup as createGroupRecord,
  fetchGroups,
  fetchRecentMessagesForGroups,
  fetchUserMemberships,
  getSessionUserId,
  joinGroup as joinGroupMembership,
  upsertGroupMembership,
  type GroupRow,
} from '../../lib/services/groups';

const CATEGORIES = ['All', 'Outdoors', 'Food & Drink', 'Professional', 'Language', 'Faith'];
const ALL_CITIES_LABEL = 'All Cities';
const VIRTUAL_CITY_LABEL = 'Virtual';
const DB_CATEGORY_BY_LABEL: Record<string, string | null> = {
  All: null,
  Outdoors: 'outdoors',
  'Food & Drink': 'food_drink',
  Professional: 'professional',
  Language: 'language',
  Faith: 'faith',
};
const CREATE_CATEGORY_OPTIONS = CATEGORIES.filter((c) => c !== 'All');

const CATEGORY_EMOJIS: Record<string, string | undefined> = {
  Outdoors: '🏕️',
  'Food & Drink': '☕',
  Professional: '💼',
  Language: '🗣️',
  Faith: '✝️',
};

function categoryLabelFromDb(category: string) {
  switch (category) {
    case 'food_drink':   return 'Food & Drink';
    case 'outdoors':     return 'Outdoors';
    case 'professional': return 'Professional';
    case 'language':     return 'Language';
    case 'faith':        return 'Faith';
    case 'culture':      return 'Culture';
    default:             return 'Other';
  }
}

function getGroupVisuals(category: string) {
  switch (category) {
    case 'outdoors':     return { emoji: '🏕️', coverColor: '#7a8c5c' };
    case 'food_drink':   return { emoji: '☕',  coverColor: '#c4622d' };
    case 'professional': return { emoji: '💼',  coverColor: '#3d2b1f' };
    case 'language':     return { emoji: '🗣️', coverColor: '#c9a84c' };
    case 'faith':        return { emoji: '✝️',  coverColor: '#8b4220' };
    case 'culture':      return { emoji: '🎉',  coverColor: '#a07820' };
    default:             return { emoji: '👥',  coverColor: '#6b4c3b' };
  }
}

export default function GroupsScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeCity, setActiveCity] = useState(ALL_CITIES_LABEL);
  const [tab, setTab] = useState<'mine' | 'discover'>('mine');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [justJoinedIds, setJustJoinedIds] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupCity, setNewGroupCity] = useState('');
  const [newGroupCategory, setNewGroupCategory] = useState('Outdoors');
  const [newGroupIsVirtual, setNewGroupIsVirtual] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [unreadByGroup, setUnreadByGroup] = useState<Record<string, number>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, { content: string; sentAt: string; isOwn: boolean }>>({});

  const joinGroup = async (groupId: string) => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again to join groups.');
      router.replace('/(auth)/phone');
      return;
    }
    if (joinedIds.has(groupId) || joiningId) return;

    setJoiningId(groupId);
    const { error } = await joinGroupMembership(groupId, userId);
    setJoiningId(null);

    if (error) { Alert.alert('Could not join group', error.message); return; }

    setJoinedIds((prev) => new Set([...prev, groupId]));
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, member_count: g.member_count + 1 } : g)
    );
    setJustJoinedIds((prev) => new Set([...prev, groupId]));
    setTimeout(() => {
      setJustJoinedIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }, 1400);
  };

  const createGroup = async () => {
    if (!userId) {
      Alert.alert('Sign in required', 'Please sign in again to create groups.');
      router.replace('/(auth)/phone');
      return;
    }
    if (creatingGroup) return;

    const name = newGroupName.trim();
    if (!name) { Alert.alert('Missing name', 'Group name is required.'); return; }

    const category = DB_CATEGORY_BY_LABEL[newGroupCategory];
    if (!category) { Alert.alert('Missing category', 'Please choose a category.'); return; }

    setCreatingGroup(true);
    const { data, error } = await createGroupRecord({
      userId,
      name,
      description: newGroupDescription.trim() || null,
      category,
      city: newGroupCity.trim() || null,
      isVirtual: newGroupIsVirtual,
    });

    if (error || !data) {
      setCreatingGroup(false);
      Alert.alert('Could not create group', error?.message || 'Unknown error.');
      return;
    }

    const membershipRes = await upsertGroupMembership(data.id, userId, 'organizer');
    setCreatingGroup(false);

    if (membershipRes.error) Alert.alert('Group created with warning', membershipRes.error.message);

    setGroups((prev) => [data as GroupRow, ...prev]);
    setJoinedIds((prev) => new Set([...prev, data.id]));
    setTab('mine');
    setShowCreateForm(false);
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupCity('');
    setNewGroupCategory('Outdoors');
    setNewGroupIsVirtual(false);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setLoadError('');

      const uid = await getSessionUserId();
      setUserId(uid);

      const [{ data: groupsData, error: groupsError }, membershipsResponse] = await Promise.all([
        fetchGroups(),
        fetchUserMemberships(uid),
      ]);

      if (groupsError) { setLoadError(groupsError.message); setLoading(false); return; }

      setGroups((groupsData ?? []) as GroupRow[]);
      const membershipRows = (membershipsResponse?.data ?? []) as Array<{ group_id: string; last_seen_at: string | null }>;
      setJoinedIds(new Set<string>(membershipRows.map((m) => m.group_id)));

      if (uid && membershipRows.length > 0) {
        const groupIds = membershipRows.map((m) => m.group_id);
        const seenMap = new Map(membershipRows.map((m) => [m.group_id, m.last_seen_at]));
        const { data: recentMessages } = await fetchRecentMessagesForGroups(groupIds);

        const unread: Record<string, number> = {};
        const lastMsg: Record<string, { content: string; sentAt: string; isOwn: boolean }> = {};
        for (const row of recentMessages ?? []) {
          const msg = row as { group_id: string; sender_id: string; sent_at: string; content: string };
          // Track last message per group (first seen since ordered desc)
          if (!lastMsg[msg.group_id]) {
            lastMsg[msg.group_id] = { content: msg.content, sentAt: msg.sent_at, isOwn: msg.sender_id === uid };
          }
          if (msg.sender_id === uid) continue;
          const seenAt = seenMap.get(msg.group_id);
          if (!seenAt || new Date(msg.sent_at).getTime() > new Date(seenAt).getTime()) {
            unread[msg.group_id] = (unread[msg.group_id] ?? 0) + 1;
          }
        }
        setUnreadByGroup(unread);
        setLastMessages(lastMsg);
      } else {
        setUnreadByGroup({});
      }
      setLoading(false);
    };
    void load();
  }, []);

  const cityOptions = useMemo(() => {
    const cities = Array.from(
      new Set(
        groups
          .map((g) => (g.city ?? '').trim())
          .filter((c) => c.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b));
    return [ALL_CITIES_LABEL, VIRTUAL_CITY_LABEL, ...cities];
  }, [groups]);

  const filtered = useMemo(() => groups.filter((g) => {
    const matchSearch =
      search.length === 0 ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      categoryLabelFromDb(g.category).toLowerCase().includes(search.toLowerCase());
    const dbCategory = DB_CATEGORY_BY_LABEL[activeCategory];
    const matchCat = !dbCategory || g.category === dbCategory;
    const normalizedCity = (g.city ?? '').trim();
    const matchCity =
      activeCity === ALL_CITIES_LABEL ||
      (activeCity === VIRTUAL_CITY_LABEL ? g.is_virtual : normalizedCity === activeCity);
    const isMember = joinedIds.has(g.id);
    const matchTab = tab === 'mine' ? isMember : (!isMember || justJoinedIds.has(g.id));
    // City filter only applies in Discover tab
    const effectiveMatchCity = tab === 'mine' || matchCity;
    return matchSearch && matchCat && effectiveMatchCity && matchTab;
  }), [groups, search, activeCategory, activeCity, tab, joinedIds, justJoinedIds]);

  const totalUnread = useMemo(
    () => Object.values(unreadByGroup).reduce((a, b) => a + b, 0),
    [unreadByGroup]
  );

  function formatNextEvent(iso: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Groups</Text>
            <Text style={styles.subtitle}>Washington, DC</Text>
          </View>
        </View>

        {/* ── Tab Toggle ── */}
        <View style={styles.tabRow}>
          {(['mine', 'discover'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
              onPress={() => setTab(t)}
            >
              {t === 'mine' && totalUnread > 0 ? (
                <View style={styles.tabBtnLabelRow}>
                  <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>My Groups</Text>
                  <View style={styles.tabUnreadPill}>
                    <Text style={styles.tabUnreadPillText}>{totalUnread > 99 ? '99+' : totalUnread}</Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                  {t === 'mine' ? 'My Groups' : 'Discover'}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Search + Create ── */}
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={Colors.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search groups..."
              placeholderTextColor={Colors.muted}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={Colors.muted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.createFab, showCreateForm && styles.createFabActive]}
            onPress={() => setShowCreateForm((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name={showCreateForm ? 'close' : 'add'} size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* ── Create Form ── */}
        {showCreateForm && (
          <View style={styles.createCard}>
            <Text style={styles.createTitle}>Start a new group</Text>
            <TextInput
              style={styles.createInput}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="Group name *"
              placeholderTextColor={Colors.muted}
            />
            <TextInput
              style={styles.createInput}
              value={newGroupDescription}
              onChangeText={setNewGroupDescription}
              placeholder="Short description"
              placeholderTextColor={Colors.muted}
            />
            <TextInput
              style={[styles.createInput, newGroupIsVirtual && styles.createInputDisabled]}
              value={newGroupCity}
              onChangeText={setNewGroupCity}
              editable={!newGroupIsVirtual}
              placeholder={newGroupIsVirtual ? 'Virtual — no city needed' : 'City'}
              placeholderTextColor={Colors.muted}
            />
            <View style={styles.virtualRow}>
              <Text style={styles.virtualRowLabel}>Virtual group</Text>
              <Switch
                value={newGroupIsVirtual}
                onValueChange={setNewGroupIsVirtual}
                trackColor={{ false: Colors.border, true: Colors.olive }}
                thumbColor={Colors.white}
              />
            </View>
            <View style={styles.createCats}>
              {CREATE_CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.createChip, newGroupCategory === cat && styles.createChipActive]}
                  onPress={() => setNewGroupCategory(cat)}
                >
                  <Text style={[styles.createChipText, newGroupCategory === cat && styles.createChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.createSubmit, creatingGroup && styles.createSubmitDisabled]}
              onPress={() => void createGroup()}
              disabled={creatingGroup}
            >
              {creatingGroup
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.createSubmitText}>Create Group</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Category Chips ── */}
        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(c) => c}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
          renderItem={({ item: cat }) => {
            const emoji = CATEGORY_EMOJIS[cat];
            const active = activeCategory === cat;
            return (
              <TouchableOpacity
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveCategory(cat)}
              >
                {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            );
          }}
        />

        {/* ── City Chips (Discover tab only) ── */}
        {tab === 'discover' && (
          <FlatList
            horizontal
            data={cityOptions}
            keyExtractor={(city) => city}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.cityChips}
            style={styles.cityChipsScroll}
            renderItem={({ item: city }) => (
              <TouchableOpacity
                style={[styles.cityChip, activeCity === city && styles.cityChipActive]}
                onPress={() => setActiveCity(city)}
              >
                <Text style={[styles.cityChipText, activeCity === city && styles.cityChipTextActive]}>
                  {city === ALL_CITIES_LABEL ? '📍 All' : city === VIRTUAL_CITY_LABEL ? '🌐 Virtual' : city}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}

        {/* ── Active Filters Summary ── */}
        {(activeCategory !== 'All' || (tab === 'discover' && activeCity !== ALL_CITIES_LABEL)) && (
          <View style={styles.activeFiltersRow}>
            {activeCategory !== 'All' && (
              <TouchableOpacity
                style={styles.activeFilterPill}
                onPress={() => setActiveCategory('All')}
              >
                <Text style={styles.activeFilterPillText}>{CATEGORY_EMOJIS[activeCategory]} {activeCategory}</Text>
                <Ionicons name="close-circle" size={12} color={Colors.terracotta} />
              </TouchableOpacity>
            )}
            {tab === 'discover' && activeCity !== ALL_CITIES_LABEL && (
              <TouchableOpacity
                style={styles.activeFilterPill}
                onPress={() => setActiveCity(ALL_CITIES_LABEL)}
              >
                <Text style={styles.activeFilterPillText}>
                  {activeCity === VIRTUAL_CITY_LABEL ? '🌐' : '📍'} {activeCity}
                </Text>
                <Ionicons name="close-circle" size={12} color={Colors.terracotta} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => { setActiveCategory('All'); setActiveCity(ALL_CITIES_LABEL); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── List ── */}
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
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIconBox}>
                  <Ionicons
                    name={tab === 'mine' ? 'people-outline' : 'compass-outline'}
                    size={30}
                    color={Colors.borderDark}
                  />
                </View>
                <Text style={styles.emptyTitle}>
                  {loadError ? 'Something went wrong' : tab === 'mine' ? 'No groups yet' : 'No groups found'}
                </Text>
                <Text style={styles.emptySubtext}>
                  {loadError || (tab === 'mine'
                    ? 'Discover and join a group to get started'
                    : (activeCategory !== 'All' || activeCity !== ALL_CITIES_LABEL)
                      ? 'Try clearing some filters'
                      : 'Try a different search or category')}
                </Text>
              </View>
            }
            renderItem={({ item: g }) => {
              const isJoined = joinedIds.has(g.id);
              const visuals = getGroupVisuals(g.category);
              const nextEvent = formatNextEvent(g.next_event_at);
              const unreadCount = unreadByGroup[g.id] ?? 0;
              const hasUnread = tab === 'mine' && unreadCount > 0;
              const lastMsg = tab === 'mine' ? lastMessages[g.id] : null;
              return (
                <TouchableOpacity
                  style={[styles.card, hasUnread && styles.cardUnread]}
                  onPress={() => {
                    if (hasUnread) {
                      setUnreadByGroup((prev) => { const next = { ...prev }; delete next[g.id]; return next; });
                    }
                    router.push(`/group/${g.id}`);
                  }}
                  activeOpacity={0.85}
                >
                  {/* Colored accent */}
                  <View style={[styles.cardAccent, { backgroundColor: visuals.coverColor }]}>
                    <Text style={styles.cardEmoji}>{visuals.emoji}</Text>
                  </View>

                  {/* Body */}
                  <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                      <Text style={[styles.cardName, hasUnread && styles.cardNameUnread]} numberOfLines={1}>
                        {g.name}
                      </Text>
                      {g.is_virtual && (
                        <View style={styles.virtualBadge}>
                          <Text style={styles.virtualText}>Virtual</Text>
                        </View>
                      )}
                    </View>
                    {/* Last message preview (My Groups) or description (Discover) */}
                    {lastMsg ? (
                      <Text style={[styles.cardDesc, styles.cardLastMsg]} numberOfLines={1}>
                        {lastMsg.isOwn ? 'You: ' : ''}{lastMsg.content}
                      </Text>
                    ) : (
                      <Text style={styles.cardDesc} numberOfLines={1}>
                        {g.description || 'No description yet.'}
                      </Text>
                    )}
                    <View style={styles.cardMeta}>
                      <View style={styles.cardMetaItem}>
                        <Ionicons name="people-outline" size={11} color={Colors.muted} />
                        <Text style={styles.cardMetaText}>{g.member_count}</Text>
                      </View>
                      {nextEvent && (
                        <View style={styles.cardMetaItem}>
                          <Ionicons name="calendar-outline" size={11} color={Colors.muted} />
                          <Text style={styles.cardMetaText}>{nextEvent}</Text>
                        </View>
                      )}
                      {lastMsg && (
                        <Text style={styles.cardLastMsgTime}>{formatRelativeTime(lastMsg.sentAt)}</Text>
                      )}
                    </View>
                  </View>

                  {/* Right action */}
                  {tab === 'mine' ? (
                    <View style={styles.mineRightCol}>
                      {unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={18} color={Colors.borderDark} />
                    </View>
                  ) : justJoinedIds.has(g.id) ? (
                    <View style={styles.joinBtnSuccess}>
                      <Ionicons name="checkmark" size={13} color={Colors.success} />
                      <Text style={styles.joinTextSuccess}>Joined!</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.joinBtn, isJoined && styles.joinBtnJoined]}
                      onPress={() => void joinGroup(g.id)}
                      disabled={isJoined || !userId || !!joiningId}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
                    >
                      {joiningId === g.id
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <Text style={[styles.joinText, isJoined && styles.joinTextJoined]}>
                            {isJoined ? '✓' : 'Join'}
                          </Text>
                      }
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
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

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 6,
  },
  title: { fontSize: 28, fontWeight: '900', color: Colors.ink },
  subtitle: { fontSize: 13, color: Colors.muted, marginTop: 1 },

  // ── Tabs ──
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
    paddingVertical: 8,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: { backgroundColor: Colors.white },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },

  // ── Search + Create ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.ink },
  createFab: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createFabActive: { backgroundColor: Colors.brownMid },

  // ── Create Form ──
  createCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 10,
  },
  createTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  createInput: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.ink,
    backgroundColor: Colors.cream,
  },
  createInputDisabled: { opacity: 0.5 },
  virtualRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  virtualRowLabel: { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  createCats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  createChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.paper,
  },
  createChipActive: { backgroundColor: Colors.terracotta, borderColor: Colors.terracotta },
  createChipText: { fontSize: 12, color: Colors.brownMid, fontWeight: '600' },
  createChipTextActive: { color: Colors.white },
  createSubmit: {
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubmitDisabled: { opacity: 0.6 },
  createSubmitText: { color: Colors.white, fontSize: 14, fontWeight: '700' },

  // ── Category Chips ──
  chipsScroll: { flexGrow: 0 },
  chips: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: Radius.full,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.terracotta, borderColor: Colors.terracotta },
  chipEmoji: { fontSize: 13 },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  chipTextActive: { color: Colors.white },

  // ── City Chips (secondary / Discover only) ──
  cityChipsScroll: { flexGrow: 0 },
  cityChips: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: 6,
    alignItems: 'center',
  },
  cityChip: {
    paddingHorizontal: 11,
    height: 27,
    borderRadius: Radius.full,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityChipActive: { backgroundColor: Colors.brownLight, borderColor: Colors.brownLight },
  cityChipText: { fontSize: 11, fontWeight: '600', color: Colors.muted },
  cityChipTextActive: { color: Colors.white },

  // ── Active Filters Summary ──
  activeFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(196,98,45,0.05)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.15)',
  },
  activeFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.25)',
  },
  activeFilterPillText: { fontSize: 11, fontWeight: '700', color: Colors.terracotta },
  clearAllText: { fontSize: 11, fontWeight: '600', color: Colors.muted, textDecorationLine: 'underline' },

  // ── Loading ──
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ── Empty ──
  emptyWrap: { alignItems: 'center', paddingTop: 52, paddingHorizontal: 32, gap: 8 },
  emptyIconBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  emptySubtext: { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 20 },

  // ── Cards ──
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 32, gap: 10 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  cardAccent: {
    width: 64,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEmoji: { fontSize: 26 },
  cardBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  cardName: { fontSize: 14, fontWeight: '700', color: Colors.ink, flex: 1 },
  virtualBadge: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  virtualText: { fontSize: 9, color: Colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardDesc: { fontSize: 12, color: Colors.muted, lineHeight: 17, marginBottom: 7 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardMetaText: { fontSize: 11, color: Colors.muted },
  unreadBadge: {
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  unreadBadgeText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  cardChevron: { marginRight: 14 },

  // Unread card treatment
  cardUnread: { borderColor: 'rgba(196,98,45,0.3)', backgroundColor: 'rgba(196,98,45,0.02)' },
  cardNameUnread: { fontWeight: '800' },
  cardLastMsg: { fontStyle: 'italic', color: Colors.brownMid },
  cardLastMsgTime: { fontSize: 11, color: Colors.muted, marginLeft: 'auto' as any },

  // Right column for My Groups (badge + chevron)
  mineRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 12,
  },

  // Tab label with unread pill
  tabBtnLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabUnreadPill: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: 'center',
  },
  tabUnreadPillText: { fontSize: 9, fontWeight: '800', color: Colors.white },

  // Join button (discover tab only)
  joinBtn: {
    marginRight: 12,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    minWidth: 52,
    alignItems: 'center',
  },
  joinBtnJoined: {
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  joinTextJoined: { color: Colors.olive },
  joinBtnSuccess: {
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(90,158,111,0.12)',
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(90,158,111,0.3)',
  },
  joinTextSuccess: { fontSize: 12, fontWeight: '700', color: Colors.success },
});
