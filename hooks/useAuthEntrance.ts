import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  useReducedMotion,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';

/**
 * Staggered entrance animation for auth screens.
 * Uses Reanimated's synchronous useReducedMotion() so there is zero
 * delay before elements become visible — no flash of invisible content.
 *
 * Returns animated styles for: logo, title, subtitle, buttons.
 */
export function useAuthEntrance() {
  const prefersReducedMotion = useReducedMotion();

  // Initialise at full opacity when reduce-motion is on so elements
  // are immediately visible with no animation.
  const logo     = useSharedValue(prefersReducedMotion ? 1 : 0);
  const title    = useSharedValue(prefersReducedMotion ? 1 : 0);
  const subtitle = useSharedValue(prefersReducedMotion ? 1 : 0);
  const buttons  = useSharedValue(prefersReducedMotion ? 1 : 0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const easing = Easing.out(Easing.cubic);
    logo.value     = withTiming(1, { duration: 600, easing });
    title.value    = withDelay(120, withTiming(1, { duration: 380, easing }));
    subtitle.value = withDelay(220, withTiming(1, { duration: 380, easing }));
    buttons.value  = withDelay(340, withTiming(1, { duration: 380, easing }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [
      { translateY: (1 - logo.value) * 14 },
      { scale: 0.96 + logo.value * 0.04 },
    ],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: title.value,
    transform: [{ translateY: (1 - title.value) * 10 }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitle.value,
    transform: [{ translateY: (1 - subtitle.value) * 8 }],
  }));

  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttons.value,
    transform: [{ translateY: (1 - buttons.value) * 8 }],
  }));

  return { logoStyle, titleStyle, subtitleStyle, buttonsStyle };
}
