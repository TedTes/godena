import { Easing } from 'react-native-reanimated';

export const Duration = {
  fast:   140,
  normal: 260,
  slow:   380,
} as const;

export const Spring = {
  snappy: { damping: 18, stiffness: 280 },
  gentle: { damping: 22, stiffness: 180 },
  bouncy: { damping: 12, stiffness: 300 },
} as const;

export const MotionEasing = {
  out:   Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.cubic),
} as const;
