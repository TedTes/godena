import React, { ReactNode } from 'react';
import { StyleProp, ViewStyle, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Scale target on press-in. Default: 0.96 */
  scaleTo?: number;
  /** Trigger light haptic on press-in. Default: false */
  haptic?: boolean;
  disabled?: boolean;
  activeOpacity?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.96,
  haptic  = false,
  disabled = false,
}: Props) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      style={[animStyle, style]}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 280 });
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 280 });
      }}
      onPress={onPress}
    >
      {children}
    </AnimatedPressable>
  );
}
