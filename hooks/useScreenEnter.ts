import { useCallback, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function useScreenEnter() {
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(1);
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }, [opacity, translateY])
  );

  return {
    opacity,
    transform: [{ translateY }],
  };
}
