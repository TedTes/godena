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

const skStyles = StyleSheet.create({
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
