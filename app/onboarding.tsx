import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../constants/theme';

const { width } = Dimensions.get('window');

const slides = [
  {
    id: '1',
    emoji: '🏕️',
    title: 'Community\nFirst.',
    subtitle: 'Join groups built around things you actually love — hiking, coffee, faith, language, and more.',
    bg: Colors.brown,
    accent: Colors.terraLight,
  },
  {
    id: '2',
    emoji: '🌱',
    title: 'Romance\nEmerges.',
    subtitle: 'No swiping on strangers. When you\'re open to a connection, you quietly signal it — only within a group you\'re part of.',
    bg: Colors.terraDim,
    accent: Colors.goldLight,
  },
  {
    id: '3',
    emoji: '✨',
    title: 'Always\nMutual.',
    subtitle: 'We only make an introduction when both people are open and have genuinely connected in the group. Nobody is ever rejected.',
    bg: Colors.ink,
    accent: Colors.terraLight,
  },
  {
    id: '4',
    emoji: '🇪🇹🇪🇷',
    title: 'Built for\nus.',
    subtitle: 'Godena is made for the Habesha diaspora community — with the culture, values, and intention that matter to us.',
    bg: Colors.olive,
    accent: Colors.cream,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (activeIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1 });
      setActiveIndex(activeIndex + 1);
    } else {
      router.replace('/(auth)/phone');
    }
  };

  const handleSkip = () => {
    router.replace('/(auth)/phone');
  };

  const currentSlide = slides[activeIndex];

  return (
    <View style={[styles.container, { backgroundColor: currentSlide.bg }]}>
      <SafeAreaView style={styles.safe}>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={[styles.skipText, { color: currentSlide.accent }]}>Skip</Text>
        </TouchableOpacity>

        <FlatList
          ref={flatListRef}
          data={slides}
          horizontal
          pagingEnabled
          scrollEnabled={false}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setActiveIndex(index);
          }}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.emojiWrap}>
                <Text style={styles.emoji}>{item.emoji}</Text>
              </View>
              <Text style={[styles.title, { color: item.accent }]}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          )}
        />

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {slides.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    width: i === activeIndex ? 24 : 8,
                    backgroundColor:
                      i === activeIndex ? currentSlide.accent : 'rgba(255,255,255,0.25)',
                  },
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: currentSlide.accent }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={[styles.nextText, { color: currentSlide.bg }]}>
              {activeIndex === slides.length - 1 ? 'Get Started' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
    opacity: 0.7,
    fontWeight: '500',
  },
  slide: {
    flex: 1,
    paddingHorizontal: 36,
    justifyContent: 'center',
  },
  emojiWrap: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 52,
    fontWeight: '900',
    lineHeight: 56,
    marginBottom: 20,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 26,
    maxWidth: 320,
  },
  bottom: {
    paddingHorizontal: 36,
    paddingBottom: 40,
    gap: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextBtn: {
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
