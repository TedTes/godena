import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { Colors, Radius } from '../constants/theme';

// ── Generic pulsing rectangle ────────────────────────────────────────────────

type SkeletonBoxProps = {
  width?: number | string;
  height: number;
  radius?: number;
  style?: object;
};

export function SkeletonBox({ width = '100%', height, radius = Radius.sm, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: Colors.border },
        { opacity },
        style,
      ]}
    />
  );
}

// ── Event card skeleton (mirrors EventItem layout) ────────────────────────────

export function EventCardSkeleton() {
  return (
    <View style={skStyles.card}>
      {/* Date block */}
      <View style={skStyles.dateBlock}>
        <SkeletonBox width={22} height={9} radius={3} />
        <SkeletonBox width={28} height={26} radius={4} style={{ marginTop: 4 }} />
      </View>
      {/* Body */}
      <View style={skStyles.body}>
        <SkeletonBox width={80} height={16} radius={Radius.full} />
        <SkeletonBox width="88%" height={15} radius={4} style={{ marginTop: 8 }} />
        <SkeletonBox width="60%" height={12} radius={4} style={{ marginTop: 5 }} />
        <SkeletonBox width="50%" height={12} radius={4} style={{ marginTop: 4 }} />
        <View style={skStyles.footer}>
          <SkeletonBox width={64} height={14} radius={Radius.full} />
          <SkeletonBox width={52} height={22} radius={Radius.full} />
        </View>
      </View>
    </View>
  );
}

// ── Group row skeleton (mirrors group card in groups.tsx list) ────────────────

export function GroupRowSkeleton() {
  return (
    <View style={skStyles.groupRow}>
      {/* Colored accent */}
      <View style={skStyles.groupAccent}>
        <SkeletonBox width={32} height={32} radius={Radius.sm} />
      </View>
      {/* Body */}
      <View style={skStyles.groupBody}>
        <SkeletonBox width="55%" height={14} radius={4} />
        <SkeletonBox width="80%" height={12} radius={4} style={{ marginTop: 6 }} />
        <View style={skStyles.groupMeta}>
          <SkeletonBox width={48} height={11} radius={4} />
        </View>
      </View>
    </View>
  );
}

// ── Group detail skeleton (mirrors group/[id].tsx layout) ────────────────────

export function GroupDetailSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream }}>
      {/* Hero */}
      <View style={skStyles.groupDetailHero}>
        <View style={skStyles.groupDetailNavRow}>
          <View style={skStyles.groupDetailBackBtn} />
          <SkeletonBox width="45%" height={16} radius={5} />
          <View style={{ width: 36 }} />
        </View>
        <View style={skStyles.groupDetailHeroBody}>
          <SkeletonBox width={64} height={64} radius={18} style={{ marginBottom: 14 }} />
          <SkeletonBox width="40%" height={11} radius={3} style={{ alignSelf: 'center' }} />
        </View>
      </View>

      {/* Body */}
      <View style={skStyles.groupDetailBody}>
        {/* Open signal card */}
        <View style={skStyles.groupDetailCard}>
          <View style={{ flex: 1, gap: 7 }}>
            <SkeletonBox width="55%" height={13} radius={4} />
            <SkeletonBox width="85%" height={11} radius={4} />
            <SkeletonBox width="70%" height={11} radius={4} />
          </View>
          <SkeletonBox width={44} height={26} radius={13} />
        </View>

        {/* Chat CTA */}
        <View style={[skStyles.groupDetailCard, { paddingVertical: 14 }]}>
          <SkeletonBox width={36} height={36} radius={10} />
          <SkeletonBox width="40%" height={13} radius={4} style={{ flex: 1 }} />
          <SkeletonBox width={16} height={16} radius={4} />
        </View>

        {/* Tab bar */}
        <View style={skStyles.groupDetailTabs}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBox key={i} width={60} height={13} radius={4} />
          ))}
        </View>

        {/* Tab content rows */}
        <View style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[skStyles.groupDetailCard, { paddingVertical: 14 }]}>
              <SkeletonBox width={38} height={38} radius={19} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonBox width="50%" height={13} radius={4} />
                <SkeletonBox width="35%" height={11} radius={4} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Event detail skeleton (mirrors event/[id].tsx layout) ────────────────────

export function EventDetailSkeleton() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.cream }}>
      {/* Hero */}
      <View style={skStyles.detailHero}>
        <View style={skStyles.detailBackBtn} />
        <View style={skStyles.detailHeroBody}>
          <SkeletonBox width={68} height={68} radius={20} style={{ alignSelf: 'center', marginBottom: 16 }} />
          <SkeletonBox width="70%" height={22} radius={6} style={{ alignSelf: 'center', marginBottom: 10 }} />
          <SkeletonBox width="40%" height={16} radius={Radius.full} style={{ alignSelf: 'center' }} />
        </View>
        <View style={skStyles.detailStrip}>
          <SkeletonBox width={52} height={22} radius={Radius.full} />
          <SkeletonBox width={36} height={12} radius={4} />
          <SkeletonBox width={48} height={12} radius={4} />
        </View>
      </View>

      {/* Cards */}
      <View style={skStyles.detailScroll}>
        {/* Detail card */}
        <View style={skStyles.detailCard}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={[skStyles.detailRow, i < 2 && skStyles.detailRowBorder]}>
              <SkeletonBox width={38} height={38} radius={11} />
              <View style={{ flex: 1, gap: 6 }}>
                <SkeletonBox width="30%" height={10} radius={3} />
                <SkeletonBox width="60%" height={14} radius={4} />
              </View>
            </View>
          ))}
        </View>

        {/* About card */}
        <View style={skStyles.detailCard}>
          <SkeletonBox width="20%" height={10} radius={3} style={{ marginBottom: 12 }} />
          <SkeletonBox width="100%" height={13} radius={4} style={{ marginBottom: 6 }} />
          <SkeletonBox width="90%" height={13} radius={4} style={{ marginBottom: 6 }} />
          <SkeletonBox width="65%" height={13} radius={4} />
        </View>

        {/* RSVP card */}
        <View style={skStyles.detailCard}>
          <SkeletonBox width="35%" height={10} radius={3} style={{ marginBottom: 14 }} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={[skStyles.detailRow, i < 2 && skStyles.detailRowBorder]}>
              <SkeletonBox width={22} height={22} radius={11} />
              <SkeletonBox width="50%" height={14} radius={4} style={{ flex: 1 }} />
              <SkeletonBox width={20} height={20} radius={10} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const skStyles = StyleSheet.create({
  // Group detail skeleton
  groupDetailHero: {
    borderBottomLeftRadius: 0,
    backgroundColor: Colors.paper,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  groupDetailNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  groupDetailBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    opacity: 0.5,
  },
  groupDetailHeroBody: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  groupDetailBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  groupDetailCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupDetailTabs: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },

  // Event detail skeleton
  detailHero: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: Colors.paper,
    overflow: 'hidden',
  },
  detailBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    margin: 14,
    marginBottom: 0,
    opacity: 0.6,
  },
  detailHeroBody: {
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  detailStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: Colors.border,
    opacity: 0.45,
  },
  detailScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  detailCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
  },
  detailRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  // Event card
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  dateBlock: {
    width: 58,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.paper,
    paddingVertical: 16,
    gap: 4,
  },
  body: {
    flex: 1,
    padding: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },

  // Group row
  groupRow: {
    flexDirection: 'row',
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    alignItems: 'center',
  },
  groupAccent: {
    width: 64,
    alignSelf: 'stretch',
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  groupMeta: {
    flexDirection: 'row',
    marginTop: 8,
  },
});
