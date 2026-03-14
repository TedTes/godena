import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, Radius } from '../constants/theme';
import GodenaLogo from '../components/GodenaLogo';

const PERKS = [
  { emoji: '🏕️', label: 'Real-interest groups' },
  { emoji: '🌱', label: 'Connection grows naturally' },
  { emoji: '✨', label: 'Only mutual introductions' },
];

export default function Onboarding() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>

        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <GodenaLogo width={90} height={90} />
          </View>

          <Text style={styles.headline}>Find your people.</Text>
          <Text style={styles.sub}>
            Groups around real interests. Meet naturally. Connect only when it's mutual.
          </Text>

          <View style={styles.perks}>
            {PERKS.map(({ emoji, label }) => (
              <View key={label} style={styles.perkRow}>
                <Text style={styles.perkEmoji}>{emoji}</Text>
                <Text style={styles.perkText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.bottom}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.replace('/(auth)')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Get Started</Text>
          </TouchableOpacity>
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.brown },
  safe: { flex: 1 },

  content: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 24,
  },

  logoWrap: {
    width: 100,
    height: 100,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },

  headline: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 40,
    letterSpacing: -0.8,
    color: Colors.terraLight,
    marginBottom: 12,
    textAlign: 'center',
    alignSelf: 'stretch',
  },

  sub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
    marginBottom: 24,
    maxWidth: 320,
    textAlign: 'center',
    alignSelf: 'stretch',
  },

  perks: { gap: 8, alignSelf: 'stretch' },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  perkEmoji: { fontSize: 20 },
  perkText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    flex: 1,
  },

  bottom: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 20,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ctaBtn: {
    height: 56,
    borderRadius: Radius.full,
    backgroundColor: Colors.terraLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brown,
  },
});
