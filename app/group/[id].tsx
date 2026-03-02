import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../../constants/theme';
import { GROUP_ICON_CHOICES } from '../../lib/services/groupIcons';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import {
  createGroupEvent,
  createGroupPost,
  deletePostReaction,
  fetchEventRsvps,
  fetchGroup,
  fetchGroupPosts,
  fetchMembers,
  fetchMembership,
  fetchPostReactions,
  fetchUpcomingEvents,
  getSessionUserId,
  insertPostReaction,
  joinGroup as joinGroupMembership,
  logInteractionEvent,
  markEventAttended,
  setOpenSignal,
  updateGroupIcon,
  upsertEventRsvp,
} from '../../lib/services/groupDetail';
import { canUserJoinAnotherGroup } from '../../lib/services/billing';

function getGroupVisuals(category: string, iconEmoji?: string | null): { emoji: string; coverColor: string; label: string } {
  let base: { emoji: string; coverColor: string; label: string };
  switch (category) {
    case 'outdoors':     base = { emoji: '🏕️', coverColor: '#7a8c5c', label: 'Outdoors' }; break;
    case 'food_drink':   base = { emoji: '☕',  coverColor: '#c4622d', label: 'Food & Drink' }; break;
    case 'professional': base = { emoji: '💼',  coverColor: '#3d2b1f', label: 'Professional' }; break;
    case 'language':     base = { emoji: '🗣️', coverColor: '#c9a84c', label: 'Language' }; break;
    case 'faith':        base = { emoji: '✝️',  coverColor: '#8b4220', label: 'Faith' }; break;
    case 'culture':      base = { emoji: '🎉',  coverColor: '#a07820', label: 'Culture' }; break;
    default:             base = { emoji: '👥',  coverColor: '#6b4c3b', label: 'Other' }; break;
  }
  return { ...base, emoji: iconEmoji || base.emoji };
}

type Group = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon_emoji: string | null;
  city: string | null;
  is_virtual: boolean;
  member_count: number;
};

type Membership = {
  role: 'member' | 'organizer' | 'moderator';
  is_open_to_connect: boolean;
};

type Member = {
  user_id: string;
  role: 'member' | 'organizer' | 'moderator';
  full_name?: string | null;
  avatar_url?: string | null;
};

type Event = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  location_name: string | null;
  is_virtual: boolean;
  created_by: string;
};

type Post = {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
};

type ReactionRow = {
  post_id: string;
  reaction: string;
  user_id: string;
};

type EventRsvpRow = {
  event_id: string;
  user_id: string;
  status: 'going' | 'interested' | 'not_going';
  attended_at: string | null;
};

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'about' | 'members' | 'events' | 'activity'>('about');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<Group | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, { name: string; avatar: string | null }>>({});
  const [groupEvents, setGroupEvents] = useState<Event[]>([]);
  const [eventRsvps, setEventRsvps] = useState<EventRsvpRow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reactionRows, setReactionRows] = useState<ReactionRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinSuccess, setJoinSuccess] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [eventTitleDraft, setEventTitleDraft] = useState('');
  const [eventDescriptionDraft, setEventDescriptionDraft] = useState('');
  const [eventDateDraft, setEventDateDraft] = useState('');
  const [eventTimeDraft, setEventTimeDraft] = useState('');
  const [eventLocationDraft, setEventLocationDraft] = useState('');
  const [eventVirtualDraft, setEventVirtualDraft] = useState(false);
  const [postDraft, setPostDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [pendingReactions, setPendingReactions] = useState<Set<string>>(new Set());
  const [pendingRsvps, setPendingRsvps] = useState<Set<string>>(new Set());
  const [pendingAttendance, setPendingAttendance] = useState<Set<string>>(new Set());

  const visuals = useMemo(
    () => getGroupVisuals(group?.category ?? 'other', group?.icon_emoji),
    [group?.category, group?.icon_emoji]
  );

  const tabFade = useRef(new Animated.Value(1)).current;
  const switchTab = (t: typeof activeTab) => {
    if (t === activeTab) return;
    Animated.timing(tabFade, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setActiveTab(t);
      Animated.timing(tabFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const isOpen = membership?.is_open_to_connect ?? false;
  const canEditGroupIcon = membership?.role === 'organizer' || membership?.role === 'moderator';
  const displayMemberCount = membership ? members.length : group?.member_count ?? 0;
  const lockedPreviewCount = group?.member_count ?? 0;

  const load = async () => {
    if (!id) return;
    setLoading(true);

    const uid = await getSessionUserId();
    setUserId(uid);

    const { data: groupData, error: groupError } = await fetchGroup(id);

    if (groupError || !groupData) { setLoading(false); return; }
    setGroup(groupData as Group);

    if (!uid) { setLoading(false); return; }

    const [membershipRes, membersRes, eventsRes, postsRes] = await Promise.all([
      fetchMembership(id, uid),
      fetchMembers(id),
      fetchUpcomingEvents(id),
      fetchGroupPosts(id),
    ]);

    setMembership((membershipRes.data as Membership | null) ?? null);
    const membersData = (membersRes.data as Member[] | null) ?? [];
    const eventsData = (eventsRes.data as Event[] | null) ?? [];
    const postsData = (postsRes.data as Post[] | null) ?? [];
    setMembers(membersData);
    setGroupEvents(eventsData);
    setPosts(postsData);

    const postIds = postsData.map((p) => p.id);
    const { data: reactionsData } = await fetchPostReactions(postIds);
    setReactionRows((reactionsData as ReactionRow[] | null) ?? []);

    const eventIds = eventsData.map((e) => e.id);
    const { data: rsvpsData } = await fetchEventRsvps(eventIds);
    setEventRsvps((rsvpsData as EventRsvpRow[] | null) ?? []);

    const map: Record<string, { name: string; avatar: string | null }> = {};
    const resolved = await Promise.all(
      membersData.map(async (m) => ({
        user_id: m.user_id,
        name: m.full_name || 'Member',
        avatar: await resolveProfilePhotoUrl(m.avatar_url || null),
      }))
    );
    for (const item of resolved) {
      map[item.user_id] = { name: item.name, avatar: item.avatar };
    }
    setMemberNames(map);

    setLoading(false);
  };

  useEffect(() => { void load(); }, [id]);

  const handleCreatePost = async () => {
    if (!id || !userId || !membership || posting) return;
    const content = postDraft.trim();
    if (!content) return;

    setPosting(true);
    const { data, error } = await createGroupPost(id, userId, content);
    setPosting(false);

    if (error || !data) {
      Alert.alert('Could not post', error?.message || 'Unknown error');
      return;
    }

    setPosts((prev) => [data as Post, ...prev]);
    setPostDraft('');
  };

  const logInteraction = async (
    eventType: 'post_reaction' | 'same_event_rsvp' | 'same_event_attendance',
    targetId: string | null,
    sourcePostId?: string,
    sourceEventId?: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!id || !userId || !targetId || targetId === userId) return;
    const { error } = await logInteractionEvent(id, eventType, targetId, sourcePostId, sourceEventId, metadata);
    if (error) {
      // Non-blocking: core UX should still succeed if analytics logging fails.
      console.warn('log_interaction_event failed', error.message);
    }
  };

  const handleReactionToggle = async (postId: string, reaction: string) => {
    if (!membership || !userId) return;
    const pendingKey = `${postId}-${reaction}`;
    if (pendingReactions.has(pendingKey)) return;

    const alreadyReacted = reactionRows.some(
      (r) => r.post_id === postId && r.reaction === reaction && r.user_id === userId
    );
    const snapshot = reactionRows;

    // Optimistic update
    if (alreadyReacted) {
      setReactionRows((prev) =>
        prev.filter((r) => !(r.post_id === postId && r.user_id === userId && r.reaction === reaction))
      );
    } else {
      setReactionRows((prev) => [...prev, { post_id: postId, user_id: userId, reaction }]);
    }
    setPendingReactions((prev) => new Set([...prev, pendingKey]));

    let error: { message: string } | null = null;
    if (alreadyReacted) {
      ({ error } = await deletePostReaction(postId, userId, reaction));
    } else {
      ({ error } = await insertPostReaction(postId, userId, reaction));
    }

    setPendingReactions((prev) => {
      const next = new Set(prev);
      next.delete(pendingKey);
      return next;
    });

    if (error) {
      setReactionRows(snapshot);
      return;
    }

    if (!alreadyReacted) {
      const targetAuthorId = posts.find((p) => p.id === postId)?.author_id ?? null;
      void logInteraction('post_reaction', targetAuthorId, postId, undefined, { reaction });
    }
  };

  const handleOpenToggle = (val: boolean) => {
    if (!id || !membership || !userId) return;
    if (val) {
      Alert.alert(
        'Signal your openness?',
        `You'll quietly signal that you're open to meeting someone from ${group?.name}. Only a mutual signal leads to an introduction — and it's always private.`,
        [
          { text: 'Not yet', style: 'cancel' },
          {
            text: "Yes, I'm open",
            onPress: async () => {
              const { error } = await setOpenSignal(id, userId, true);
              if (error) { Alert.alert('Could not update signal', error.message); return; }
              setMembership((prev) => (prev ? { ...prev, is_open_to_connect: true } : prev));
            },
          },
        ]
      );
    } else {
      void (async () => {
        const { error } = await setOpenSignal(id, userId, false);
        if (error) { Alert.alert('Could not update signal', error.message); return; }
        setMembership((prev) => (prev ? { ...prev, is_open_to_connect: false } : prev));
      })();
    }
  };

  const joinGroup = async () => {
    if (!userId || !id || joining) return;
    const gate = await canUserJoinAnotherGroup(userId);
    if (!gate.allowed) {
      Alert.alert(
        'Premium required',
        `Free plan allows up to ${gate.freeLimit} group joins. Upgrade to Premium for unlimited groups.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/premium') },
        ]
      );
      return;
    }
    setJoining(true);
    const { error } = await joinGroupMembership(id, userId);
    setJoining(false);
    if (error) { Alert.alert('Could not join group', error.message); return; }
    // Optimistic updates — avoids full reload flash
    setMembership({ role: 'member', is_open_to_connect: false });
    setGroup((prev) => prev ? { ...prev, member_count: prev.member_count + 1 } : prev);
    setMembers((prev) => [{ user_id: userId, role: 'member' }, ...prev]);
    setJoinSuccess(true);
    setTimeout(() => setJoinSuccess(false), 2500);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const getEventStats = (eventId: string) => {
    const rows = eventRsvps.filter((r) => r.event_id === eventId);
    return {
      going: rows.filter((r) => r.status === 'going').length,
      interested: rows.filter((r) => r.status === 'interested').length,
      attended: rows.filter((r) => !!r.attended_at).length,
      mine: rows.find((r) => r.user_id === userId),
    };
  };

  const handleCreateEvent = async () => {
    if (!membership || !userId || !id || creatingEvent) return;
    const title = eventTitleDraft.trim();
    const description = eventDescriptionDraft.trim();
    const date = eventDateDraft.trim();
    const time = eventTimeDraft.trim();
    if (!title || !description || !date || !time) {
      Alert.alert('Missing fields', 'Title, description, date, and time are required.');
      return;
    }

    const startsAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startsAt.getTime())) {
      Alert.alert('Invalid date/time', 'Use YYYY-MM-DD and HH:mm.');
      return;
    }

    setCreatingEvent(true);
    const { data, error } = await createGroupEvent(
      id,
      userId,
      title,
      description,
      startsAt.toISOString(),
      eventVirtualDraft,
      eventLocationDraft.trim() || null
    );
    setCreatingEvent(false);

    if (error || !data) {
      Alert.alert('Could not create event', error?.message || 'Unknown error');
      return;
    }

    setGroupEvents((prev) => [data as Event, ...prev].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    setShowEventForm(false);
    setEventTitleDraft('');
    setEventDescriptionDraft('');
    setEventDateDraft('');
    setEventTimeDraft('');
    setEventLocationDraft('');
    setEventVirtualDraft(false);
  };

  const handleRsvp = async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
    if (!membership || !userId) return;
    if (pendingRsvps.has(eventId)) return;

    const snapshot = eventRsvps;
    // Optimistic update
    setEventRsvps((prev) => {
      const rest = prev.filter((r) => !(r.event_id === eventId && r.user_id === userId));
      return [...rest, { event_id: eventId, user_id: userId, status, attended_at: null }];
    });
    setPendingRsvps((prev) => new Set([...prev, eventId]));

    const { data, error } = await upsertEventRsvp(eventId, userId, status);

    setPendingRsvps((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });

    if (error || !data) {
      setEventRsvps(snapshot);
      return;
    }

    // Sync with server response (e.g. attended_at preserved correctly)
    setEventRsvps((prev) => {
      const rest = prev.filter((r) => !(r.event_id === eventId && r.user_id === userId));
      return [...rest, data as EventRsvpRow];
    });

    if (status === 'going' || status === 'interested') {
      const targetId = groupEvents.find((ev) => ev.id === eventId)?.created_by ?? null;
      void logInteraction('same_event_rsvp', targetId, undefined, eventId, { status });
    }
  };

  const handleMarkAttended = async (eventId: string) => {
    if (!membership || !userId) return;
    const mine = eventRsvps.find((r) => r.event_id === eventId && r.user_id === userId);
    if (!mine || mine.status !== 'going') return; // button only shown when going
    if (pendingAttendance.has(eventId)) return;

    const attendedAt = new Date().toISOString();
    const snapshot = eventRsvps;
    // Optimistic update
    setEventRsvps((prev) =>
      prev.map((r) =>
        r.event_id === eventId && r.user_id === userId ? { ...r, attended_at: attendedAt } : r
      )
    );
    setPendingAttendance((prev) => new Set([...prev, eventId]));

    const { data, error } = await markEventAttended(eventId, userId);

    setPendingAttendance((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });

    if (error || !data) {
      setEventRsvps(snapshot);
      return;
    }

    setEventRsvps((prev) => {
      const rest = prev.filter((r) => !(r.event_id === eventId && r.user_id === userId));
      return [...rest, data as EventRsvpRow];
    });

    const targetId = groupEvents.find((ev) => ev.id === eventId)?.created_by ?? null;
    void logInteraction('same_event_attendance', targetId, undefined, eventId);
  };

  const setGroupIcon = async (nextIcon: string) => {
    if (!group || !canEditGroupIcon) return;
    if (nextIcon === group.icon_emoji) return;
    const { error } = await updateGroupIcon(group.id, nextIcon);
    if (error) {
      Alert.alert('Could not update icon', error.message);
      return;
    }
    setGroup((prev) => (prev ? { ...prev, icon_emoji: nextIcon } : prev));
  };

  const openGroupIconPicker = () => {
    if (!group || !canEditGroupIcon) return;
    const current = group.icon_emoji || visuals.emoji;
    const choices = GROUP_ICON_CHOICES.slice(0, 8);
    Alert.alert(
      'Choose group icon',
      `Current: ${current}`,
      [
        ...choices.map((icon) => ({
          text: icon,
          onPress: () => {
            void setGroupIcon(icon);
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  if (loading || !group) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── Hero ── */}
      <View style={[styles.hero, { backgroundColor: visuals.coverColor }]}>
        <SafeAreaView edges={['top']}>
          <View style={styles.heroNavRow}>
            <TouchableOpacity
              style={styles.heroBackBtn}
              onPress={() => router.back()}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="arrow-back" size={20} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.heroNavTitle} numberOfLines={1}>{group.name}</Text>
            <View style={styles.heroNavSpacer} />
          </View>
        </SafeAreaView>
        <View style={styles.heroContent}>
          <View style={styles.heroIconGroup}>
            <TouchableOpacity
              style={styles.heroEmojiWrap}
              onPress={openGroupIconPicker}
              activeOpacity={canEditGroupIcon ? 0.75 : 1}
              disabled={!canEditGroupIcon}
            >
              <Text style={styles.heroEmoji}>{visuals.emoji}</Text>
              {canEditGroupIcon ? (
                <View style={styles.heroEmojiEditBadge}>
                  <Ionicons name="pencil" size={11} color={Colors.white} />
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
          <View style={styles.heroMeta}>
            <View style={styles.heroMetaItem}>
              <Ionicons name="people-outline" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText}>{displayMemberCount} members</Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroMetaItem}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.75)" />
              <Text style={styles.heroMetaText}>
                {group.is_virtual ? 'Virtual' : group.city || 'Unknown city'}
              </Text>
            </View>
            <View style={styles.heroDot} />
            <View style={styles.heroCategoryChip}>
              <Text style={styles.heroCategoryText}>{visuals.label}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Join Success Banner ── */}
        {joinSuccess && (
          <View style={styles.joinSuccessBanner}>
            <View style={styles.joinSuccessIconWrap}>
              <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.joinSuccessTitle}>You joined {group.name}!</Text>
              <Text style={styles.joinSuccessSubtext}>Explore events, join the chat, and quietly signal who you're open to meeting.</Text>
            </View>
          </View>
        )}

        {/* ── Join Prompt ── */}
        {!membership && !joinSuccess && (
          <View style={styles.joinPrompt}>
            <View style={styles.joinPromptIcon}>
              <Ionicons name="people" size={22} color={Colors.terracotta} />
            </View>
            <Text style={styles.joinPromptTitle}>Join to participate</Text>
            <Text style={styles.joinPromptText}>
              Members can join group chat, RSVP to events, and quietly signal who they're open to meeting.
            </Text>
            <TouchableOpacity
              style={[styles.joinGroupBtn, joining && styles.joinGroupBtnDisabled]}
              onPress={() => void joinGroup()}
              disabled={joining}
            >
              {joining
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.joinGroupBtnText}>Join Group</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        {/* ── Openness Signal ── */}
        <View style={[styles.openCard, isOpen && styles.openCardActive]}>
          <View style={styles.openLeft}>
            <Text style={styles.openTitle}>
              {isOpen ? '🌱 Open to connect here' : 'Open to a connection?'}
            </Text>
            <Text style={styles.openDesc}>
              {isOpen
                ? "Your signal is private. We'll introduce you when both of you have been genuinely active here together."
                : 'Signal quietly. Introductions only happen when both of you are open — and have been showing up together recently.'}
            </Text>
          </View>
          <Switch
            value={isOpen}
            onValueChange={handleOpenToggle}
            disabled={!membership}
            trackColor={{ false: Colors.border, true: Colors.olive }}
            thumbColor={Colors.white}
          />
        </View>

        {/* ── Chat CTA ── */}
        <TouchableOpacity
          style={[styles.chatCta, !membership && styles.chatCtaDisabled]}
          onPress={() => router.push(`/group/chat/${group.id}`)}
          disabled={!membership}
          activeOpacity={0.85}
        >
          <View style={styles.chatCtaIcon}>
            <Ionicons name="chatbubbles-outline" size={18} color={Colors.terracotta} />
          </View>
          <Text style={styles.chatCtaText}>Group Chat</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.borderDark} />
        </TouchableOpacity>

        {/* ── Tabs ── */}
        <View style={styles.tabs}>
          {(['about', 'members', 'events', 'activity'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, activeTab === t && styles.tabActive]}
              onPress={() => switchTab(t)}
            >
              <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View style={{ opacity: tabFade }}>

        {/* ── About ── */}
        {activeTab === 'about' && (
          <View style={styles.tabContent}>
            <View style={styles.aboutCard}>
              <Text style={styles.aboutText}>
                {group.description || 'No description provided yet.'}
              </Text>
            </View>

            {groupEvents[0] && (
              <>
                <Text style={styles.sectionLabel}>Next Event</Text>
                <View style={styles.eventCard}>
                  <View style={styles.eventDateBlock}>
                    <Text style={styles.eventDateMonth}>
                      {new Date(groupEvents[0].starts_at).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                    </Text>
                    <Text style={styles.eventDateDay}>
                      {new Date(groupEvents[0].starts_at).getDate()}
                    </Text>
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{groupEvents[0].title}</Text>
                    <Text style={styles.eventTime}>{formatTime(groupEvents[0].starts_at)}</Text>
                    <Text style={styles.eventLocation}>
                      {groupEvents[0].is_virtual ? 'Virtual' : (groupEvents[0].location_name || 'TBD')}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.rsvpBtn} onPress={() => setActiveTab('events')}>
                    <Text style={styles.rsvpText}>RSVP</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* ── Members ── */}
        {activeTab === 'members' && (
          <View style={styles.tabContent}>
            <View style={styles.membersLabelRow}>
              {!membership && (
                <View style={styles.membersAvatarStack}>
                  <View style={styles.memberAvatarPreview} />
                  <View style={[styles.memberAvatarPreview, styles.memberAvatarPreviewOffset]} />
                </View>
              )}
              <Text style={[styles.sectionLabel, styles.membersLabelText]}>
                {displayMemberCount} {displayMemberCount === 1 ? 'member' : 'members'}
              </Text>
            </View>
            <View style={styles.membersCard}>
              {!membership ? (
                /* ── Locked preview: ghost rows + overlay CTA ── */
                <View style={styles.membersLockedWrap}>
                  {Array.from({ length: Math.min(Math.max(lockedPreviewCount, 3), 5) }).map((_, i) => (
                    <View
                      key={i}
                      style={[styles.memberRow, i > 0 && styles.memberRowDivider, styles.memberRowGhost]}
                    >
                      <View style={[styles.memberAvatar, styles.memberAvatarGhost]} />
                      <View style={styles.memberInfo}>
                        <View style={[styles.memberGhostBar, { width: [88, 116, 72, 104, 92][i % 5] }]} />
                      </View>
                    </View>
                  ))}
                  <View style={styles.membersLockedOverlay}>
                    <View style={styles.membersLockedIconWrap}>
                      <Ionicons name="lock-closed" size={20} color={Colors.terracotta} />
                    </View>
                    <Text style={styles.membersLockedCount}>
                      {lockedPreviewCount} {lockedPreviewCount === 1 ? 'member' : 'members'}
                    </Text>
                    <Text style={styles.membersLockedHint}>Join to see who's here</Text>
                    <TouchableOpacity
                      style={[styles.membersLockedBtn, joining && { opacity: 0.6 }]}
                      onPress={() => void joinGroup()}
                      disabled={joining}
                    >
                      {joining
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <Text style={styles.membersLockedBtnText}>Join Group</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : members.length === 0 ? (
                <View style={styles.membersEmpty}>
                  <Text style={styles.membersEmptyText}>Could not load members right now.</Text>
                </View>
              ) : (
                members.map((m, i) => {
                  const info = memberNames[m.user_id];
                  const initial = (info?.name?.[0] || 'M').toUpperCase();
                  return (
                    <View key={m.user_id} style={[styles.memberRow, i > 0 && styles.memberRowDivider]}>
                      {info?.avatar ? (
                        <Image source={{ uri: info.avatar }} style={styles.memberAvatar} />
                      ) : (
                        <View style={[styles.memberAvatar, styles.memberAvatarPlaceholder]}>
                          <Text style={styles.memberInitial}>{initial}</Text>
                        </View>
                      )}
                      <View style={styles.memberInfo}>
                        <Text style={styles.memberName}>{info?.name || 'Member'}</Text>
                        {(m.role === 'organizer' || m.role === 'moderator') && (
                          <Text
                            style={[
                              styles.memberRole,
                              m.role === 'organizer' && styles.memberRoleOrganizer,
                            ]}
                          >
                            {m.role === 'organizer' ? 'Organizer' : 'Moderator'}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}

        {/* ── Events ── */}
        {activeTab === 'events' && (
          <View style={styles.tabContent}>

            {/* Header row: count label + create toggle */}
            <View style={styles.eventsHeaderRow}>
              <Text style={[styles.sectionLabel, { marginBottom: 0, marginTop: 0 }]}>
                {groupEvents.length > 0 ? `${groupEvents.length} upcoming` : 'Upcoming events'}
              </Text>
              {membership && (
                <TouchableOpacity
                  style={styles.eventCreateToggle}
                  onPress={() => setShowEventForm(true)}
                >
                  <Ionicons name="add" size={13} color={Colors.terracotta} />
                  <Text style={styles.eventCreateToggleText}>New Event</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Events list or empty state */}
            {groupEvents.length > 0 ? (
              <View style={styles.membersCard}>
                {groupEvents.map((ev, i) => {
                  const stats = getEventStats(ev.id);
                  return (
                    <View key={ev.id} style={[styles.eventBlock, i > 0 && styles.memberRowDivider]}>
                      <View style={styles.eventRow}>
                        <View style={styles.eventDateBlock}>
                          <Text style={styles.eventDateMonth}>
                            {new Date(ev.starts_at).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                          </Text>
                          <Text style={styles.eventDateDay}>{new Date(ev.starts_at).getDate()}</Text>
                        </View>
                        <View style={styles.eventInfo}>
                          <Text style={styles.eventTitle}>{ev.title}</Text>
                          <Text style={styles.eventTime}>{formatTime(ev.starts_at)}</Text>
                          <Text style={styles.eventLocation}>
                            {ev.is_virtual ? 'Virtual' : (ev.location_name || 'TBD')}
                          </Text>
                          {(stats.going > 0 || stats.interested > 0 || stats.attended > 0) && (
                            <View style={styles.eventStatsRow}>
                              {stats.going > 0 && (
                                <View style={styles.eventStatChip}>
                                  <Text style={styles.eventStatChipText}>✅ {stats.going} going</Text>
                                </View>
                              )}
                              {stats.interested > 0 && (
                                <View style={styles.eventStatChip}>
                                  <Text style={styles.eventStatChipText}>👀 {stats.interested}</Text>
                                </View>
                              )}
                              {stats.attended > 0 && (
                                <View style={[styles.eventStatChip, styles.eventStatChipAttended]}>
                                  <Text style={styles.eventStatChipAttendedText}>✓ {stats.attended} attended</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      </View>

                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.eventsEmpty}>
                <View style={styles.eventsEmptyIcon}>
                  <Ionicons name="calendar-outline" size={28} color={Colors.borderDark} />
                </View>
                <Text style={styles.eventsEmptyTitle}>No upcoming events</Text>
                <Text style={styles.eventsEmptyText}>
                  {membership ? 'Be the first to create an event for this group.' : 'Join the group to create events.'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Activity ── */}
        {activeTab === 'activity' && (
          <View style={styles.tabContent}>
            {membership && (
              <View style={styles.postComposer}>
                <TextInput
                  style={styles.postInput}
                  value={postDraft}
                  onChangeText={setPostDraft}
                  placeholder="Share something with the group..."
                  placeholderTextColor={Colors.muted}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.postBtn,
                    (posting || postDraft.trim().length === 0) && styles.postBtnDisabled,
                  ]}
                  onPress={() => void handleCreatePost()}
                  disabled={posting || postDraft.trim().length === 0}
                >
                  {posting
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.postBtnText}>Post</Text>
                  }
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionLabel}>
              {posts.length > 0 ? `${posts.length} recent posts` : 'No recent activity'}
            </Text>
            {posts.length > 0 ? (
              <View style={{ gap: 10 }}>
                {posts.map((p) => {
                  const author = memberNames[p.author_id];
                  const initial = (author?.name?.[0] || 'M').toUpperCase();
                  const reactionsForPost = reactionRows.filter((r) => r.post_id === p.id);
                  const reactionTypes = Array.from(new Set(reactionsForPost.map((r) => r.reaction)));
                  return (
                    <View key={p.id} style={styles.postCard}>
                      <View style={styles.postHeader}>
                        {author?.avatar ? (
                          <Image source={{ uri: author.avatar }} style={styles.postAvatar} />
                        ) : (
                          <View style={[styles.postAvatar, { backgroundColor: visuals.coverColor + '44' }]}>
                            <Text style={styles.postAvatarInitial}>{initial}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={styles.postAuthor}>{author?.name || 'Member'}</Text>
                          <Text style={styles.postMeta}>{formatDate(p.created_at)}</Text>
                        </View>
                      </View>
                      <Text style={styles.postText}>{p.content}</Text>
                      <View style={styles.reactionsWrap}>
                        {(() => {
                          const PINNED = ['❤️', '👍', '🔥'];
                          const extraReactions = reactionTypes.filter((r) => !PINNED.includes(r));
                          return (
                            <>
                              {PINNED.map((reaction) => {
                                const count = reactionsForPost.filter((r) => r.reaction === reaction).length;
                                const mine = reactionsForPost.some(
                                  (r) => r.reaction === reaction && r.user_id === userId
                                );
                                const isPending = pendingReactions.has(`${p.id}-${reaction}`);
                                return (
                                  <TouchableOpacity
                                    key={`${p.id}-${reaction}`}
                                    style={[
                                      styles.reactionChip,
                                      mine && styles.reactionChipActive,
                                      isPending && styles.reactionChipPending,
                                    ]}
                                    onPress={() => void handleReactionToggle(p.id, reaction)}
                                    disabled={!membership || isPending}
                                  >
                                    <Text style={[styles.reactionText, mine && styles.reactionTextActive]}>
                                      {reaction}{count > 0 ? ` ${count}` : ''}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                              {extraReactions.map((reaction) => {
                                const count = reactionsForPost.filter((r) => r.reaction === reaction).length;
                                const mine = reactionsForPost.some(
                                  (r) => r.reaction === reaction && r.user_id === userId
                                );
                                const isPending = pendingReactions.has(`${p.id}-${reaction}`);
                                return (
                                  <TouchableOpacity
                                    key={`${p.id}-${reaction}`}
                                    style={[
                                      styles.reactionChip,
                                      mine && styles.reactionChipActive,
                                      isPending && styles.reactionChipPending,
                                    ]}
                                    onPress={() => void handleReactionToggle(p.id, reaction)}
                                    disabled={!membership || isPending}
                                  >
                                    <Text style={[styles.reactionText, mine && styles.reactionTextActive]}>
                                      {reaction} {count}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyText}>No posts yet</Text>
            )}
          </View>
        )}

        </Animated.View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Create Event Modal ── */}
      <Modal
        visible={showEventForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEventForm(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowEventForm(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.eventFormTitle}>New Event</Text>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalScrollContent}
            >
              <View style={styles.eventFieldGroup}>
                <Text style={styles.eventFieldLabel}>Title</Text>
                <TextInput
                  style={styles.eventInput}
                  value={eventTitleDraft}
                  onChangeText={setEventTitleDraft}
                  placeholder="e.g. Coffee & Catch-up"
                  placeholderTextColor={Colors.muted}
                />
              </View>

              <View style={styles.eventFieldGroup}>
                <Text style={styles.eventFieldLabel}>Description</Text>
                <TextInput
                  style={[styles.eventInput, styles.eventInputMultiline]}
                  value={eventDescriptionDraft}
                  onChangeText={setEventDescriptionDraft}
                  placeholder="What is this event about? What should people expect?"
                  placeholderTextColor={Colors.muted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.eventInputRow}>
                <View style={[styles.eventFieldGroup, { flex: 1 }]}>
                  <Text style={styles.eventFieldLabel}>Date</Text>
                  <TextInput
                    style={styles.eventInput}
                    value={eventDateDraft}
                    onChangeText={setEventDateDraft}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={Colors.muted}
                    autoCapitalize="none"
                  />
                </View>
                <View style={[styles.eventFieldGroup, { flex: 1 }]}>
                  <Text style={styles.eventFieldLabel}>Time</Text>
                  <TextInput
                    style={styles.eventInput}
                    value={eventTimeDraft}
                    onChangeText={setEventTimeDraft}
                    placeholder="HH:mm"
                    placeholderTextColor={Colors.muted}
                    autoCapitalize="none"
                  />
                </View>
              </View>

              {!eventVirtualDraft && (
                <View style={styles.eventFieldGroup}>
                  <Text style={styles.eventFieldLabel}>Location</Text>
                  <TextInput
                    style={styles.eventInput}
                    value={eventLocationDraft}
                    onChangeText={setEventLocationDraft}
                    placeholder="Where will it happen?"
                    placeholderTextColor={Colors.muted}
                  />
                </View>
              )}

              <View style={styles.eventVirtualRow}>
                <Text style={styles.eventVirtualLabel}>Virtual event</Text>
                <Switch
                  value={eventVirtualDraft}
                  onValueChange={setEventVirtualDraft}
                  trackColor={{ false: Colors.border, true: Colors.olive }}
                  thumbColor={Colors.white}
                />
              </View>

              <TouchableOpacity
                style={[styles.eventSaveBtn, creatingEvent && styles.eventSaveBtnDisabled]}
                onPress={() => void handleCreateEvent()}
                disabled={creatingEvent}
              >
                {creatingEvent
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.eventSaveBtnText}>Save Event</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { flex: 1, backgroundColor: Colors.cream, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: Colors.cream },

  // ── Hero ──
  hero: { paddingBottom: Spacing.xl },
  heroNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  heroBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroNavTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
    marginHorizontal: 8,
  },
  heroNavSpacer: { width: 36 },
  heroContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: 'center',
  },
  heroIconGroup: {
    alignItems: 'center',
    marginBottom: 10,
  },
  heroEmojiWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroEmoji: { fontSize: 36 },
  heroEmojiEditBadge: {
    position: 'absolute',
    bottom: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  heroMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.75)' },
  heroDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.35)' },
  heroCategoryChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  heroCategoryText: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '700' },

  // ── Join Success Banner ──
  joinSuccessBanner: {
    margin: Spacing.lg,
    marginBottom: 0,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(90,158,111,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(90,158,111,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  joinSuccessIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(90,158,111,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinSuccessTitle: { fontSize: 14, fontWeight: '800', color: Colors.success, marginBottom: 2 },
  joinSuccessSubtext: { fontSize: 12, color: Colors.brownMid, lineHeight: 17 },

  // ── Join Prompt ──
  joinPrompt: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    gap: 6,
  },
  joinPromptIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(196,98,45,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  joinPromptTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink },
  joinPromptText: { fontSize: 13, color: Colors.muted, lineHeight: 19, textAlign: 'center', marginBottom: 4 },
  joinGroupBtn: {
    borderRadius: Radius.full,
    backgroundColor: Colors.terracotta,
    paddingHorizontal: 28,
    paddingVertical: 11,
    minWidth: 140,
    alignItems: 'center',
  },
  joinGroupBtnDisabled: { opacity: 0.6 },
  joinGroupBtnText: { fontSize: 14, color: Colors.white, fontWeight: '700' },

  // ── Openness Card ──
  openCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.border,
  },
  openCardActive: {
    backgroundColor: 'rgba(122,140,92,0.07)',
    borderLeftColor: Colors.olive,
    borderColor: 'rgba(122,140,92,0.25)',
  },
  openLeft: { flex: 1 },
  openTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 3 },
  openDesc: { fontSize: 12, color: Colors.muted, lineHeight: 18 },

  // ── Chat CTA ──
  chatCta: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  chatCtaDisabled: { opacity: 0.5 },
  chatCtaIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196,98,45,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatCtaText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.ink },

  // ── Tabs ──
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  tab: {
    flex: 1,
    paddingBottom: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.terracotta },
  tabText: { fontSize: 12, fontWeight: '600', color: Colors.muted },
  tabTextActive: { color: Colors.terracotta },

  // ── Tab Content ──
  tabContent: { paddingHorizontal: Spacing.lg },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },
  emptyText: { fontSize: 13, color: Colors.muted, fontStyle: 'italic' },

  // About
  aboutCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  aboutText: { fontSize: 14, color: Colors.brownMid, lineHeight: 22 },

  // ── Shared Card Wrapper ──
  membersCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },

  // ── Members ──
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
  },
  memberRowDivider: { borderTopWidth: 1, borderTopColor: Colors.border },
  memberAvatar: { width: 46, height: 46, borderRadius: 23 },
  memberAvatarPlaceholder: {
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '600', color: Colors.ink },
  memberRole: { fontSize: 12, fontWeight: '500', color: Colors.muted, marginTop: 2 },
  memberRoleOrganizer: { color: Colors.gold },
  membersEmpty: { paddingVertical: 28, alignItems: 'center' },
  membersEmptyText: { fontSize: 13, color: Colors.muted, fontStyle: 'italic' },
  membersLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  membersLabelText: { marginBottom: 0, marginTop: 0 },
  membersAvatarStack: { flexDirection: 'row' },
  memberAvatarPreview: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.borderDark,
    borderWidth: 2,
    borderColor: Colors.cream,
    opacity: 0.45,
  },
  memberAvatarPreviewOffset: { marginLeft: -10 },

  // ── Members locked (non-member preview) ──
  membersLockedWrap: { overflow: 'hidden' },
  memberRowGhost: { opacity: 0.3 },
  memberAvatarGhost: { backgroundColor: Colors.borderDark },
  memberGhostBar: { height: 11, borderRadius: 6, backgroundColor: Colors.borderDark },
  membersLockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,250,245,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    gap: 6,
  },
  membersLockedIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(196,98,45,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  membersLockedCount: { fontSize: 16, fontWeight: '800', color: Colors.ink },
  membersLockedHint: {
    fontSize: 13,
    color: Colors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 4,
  },
  membersLockedBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 28,
    paddingVertical: 11,
    minWidth: 140,
    alignItems: 'center',
  },
  membersLockedBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // ── Events ──
  eventsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  eventCreateToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eventCreateToggleText: { fontSize: 12, color: Colors.terracotta, fontWeight: '700' },
  eventFormTitle: { fontSize: 15, fontWeight: '800', color: Colors.ink, marginBottom: 4 },

  // ── Event Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalSheet: {
    backgroundColor: Colors.warmWhite,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalScrollContent: { gap: 10, paddingBottom: 8 },
  eventFieldGroup: { gap: 5 },
  eventFieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  eventInputRow: { flexDirection: 'row', gap: 8 },
  eventInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.paper,
    color: Colors.ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  eventInputMultiline: {
    minHeight: 88,
    paddingTop: 10,
  },
  eventInputHalf: { flex: 1 },
  eventVirtualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventVirtualLabel: { fontSize: 13, color: Colors.brownMid, fontWeight: '600' },
  eventSaveBtn: {
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingVertical: 11,
    alignItems: 'center',
  },
  eventSaveBtnDisabled: { opacity: 0.6 },
  eventSaveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
    marginBottom: Spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
  },
  eventBlock: { paddingVertical: 4 },
  eventDateBlock: {
    width: 44,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateMonth: { fontSize: 9, fontWeight: '800', color: Colors.terracotta, letterSpacing: 0.5 },
  eventDateDay: { fontSize: 18, fontWeight: '900', color: Colors.ink, lineHeight: 22 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink, marginBottom: 2 },
  eventTime: { fontSize: 12, color: Colors.terracotta, fontWeight: '600', marginBottom: 1 },
  eventLocation: { fontSize: 11, color: Colors.muted },
  eventStatsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  eventStatChip: {
    backgroundColor: Colors.paper,
    borderRadius: Radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eventStatChipText: { fontSize: 10, color: Colors.brownMid, fontWeight: '600' },
  eventStatChipAttended: {
    backgroundColor: 'rgba(90,158,111,0.1)',
    borderColor: 'rgba(90,158,111,0.3)',
  },
  eventStatChipAttendedText: { fontSize: 10, color: Colors.success, fontWeight: '600' },
  rsvpBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.terracotta,
  },
  rsvpText: { fontSize: 11, fontWeight: '700', color: Colors.terracotta },
  rsvpRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    alignItems: 'center',
  },
  rsvpChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    alignItems: 'center',
  },
  rsvpChipGoing: { borderColor: Colors.olive, backgroundColor: 'rgba(122,140,92,0.1)' },
  rsvpChipInterested: { borderColor: Colors.gold, backgroundColor: 'rgba(201,168,76,0.1)' },
  rsvpChipNotGoing: { borderColor: Colors.borderDark },
  rsvpChipPending: { opacity: 0.55 },
  rsvpChipText: { fontSize: 12, fontWeight: '700', color: Colors.muted },
  rsvpChipTextGoing: { color: Colors.olive },
  rsvpChipTextInterested: { color: Colors.gold },
  rsvpChipTextMuted: { color: Colors.muted },
  attendedBtn: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderDark,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.paper,
  },
  attendedBtnText: { fontSize: 11, color: Colors.brownMid, fontWeight: '600' },
  attendedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(90,158,111,0.1)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(90,158,111,0.3)',
  },
  attendedChipText: { fontSize: 11, color: Colors.success, fontWeight: '700' },
  eventsJoinHint: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 12,
    fontSize: 11,
    color: Colors.muted,
    fontStyle: 'italic',
  },
  eventsEmpty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  eventsEmptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  eventsEmptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.ink },
  eventsEmptyText: { fontSize: 13, color: Colors.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },

  // ── Posts ──
  postComposer: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  postInput: {
    minHeight: 72,
    fontSize: 14,
    color: Colors.ink,
    textAlignVertical: 'top',
  },
  postBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    backgroundColor: Colors.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 68,
    alignItems: 'center',
  },
  postBtnDisabled: { opacity: 0.5 },
  postBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },
  postCard: {
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: 10,
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarInitial: { fontSize: 14, fontWeight: '700', color: Colors.brownMid },
  postAuthor: { fontSize: 13, fontWeight: '700', color: Colors.ink },
  postMeta: { fontSize: 11, color: Colors.muted, marginTop: 1 },
  postText: { fontSize: 13, color: Colors.brownMid, lineHeight: 20 },
  reactionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reactionChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.paper,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reactionChipActive: {
    borderColor: Colors.terracotta,
    backgroundColor: 'rgba(196,98,45,0.1)',
  },
  reactionChipPending: { opacity: 0.5 },
  reactionText: { fontSize: 11, fontWeight: '600', color: Colors.brownMid },
  reactionTextActive: { color: Colors.terracotta },
});
