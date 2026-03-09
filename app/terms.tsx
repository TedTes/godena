import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '../constants/theme';

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  );
}

export default function TermsScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Terms of Service</Text>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.updated}>Last updated: March 2026</Text>
          <Section
            title="Acceptance"
            body="By creating an account or using Godena, you agree to these Terms of Service and our Privacy Policy. If you do not agree, please do not use the app."
          />
          <Section
            title="Eligibility"
            body="You must be at least 18 years old to use Godena. By using the app, you represent that you meet this requirement."
          />
          <Section
            title="Your Account"
            body="You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account."
          />
          <Section
            title="Community Standards"
            body="You agree not to post content that is abusive, harassing, fraudulent, or illegal. We reserve the right to remove content and suspend accounts that violate these standards."
          />
          <Section
            title="Dating Mode"
            body="Dating Mode is an opt-in feature. By enabling it, you consent to your profile being shown to other members who have also enabled Dating Mode within shared groups."
          />
          <Section
            title="Termination"
            body="We may suspend or terminate your account at our discretion if you violate these terms. You may delete your account at any time from the Profile settings."
          />
          <Section
            title="Disclaimer"
            body="Godena is provided as-is. We are not responsible for the conduct of other users. Always exercise caution when meeting people in person."
          />
          <Text style={styles.contact}>Questions? Contact us at support@godena.app</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.ink },
  scroll: { padding: Spacing.lg, gap: 12, paddingBottom: 40 },
  updated: { fontSize: 12, color: Colors.muted, marginBottom: 4 },
  sectionCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: 6,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.ink },
  sectionBody: { fontSize: 13, color: Colors.brownMid, lineHeight: 20 },
  contact: { fontSize: 12, color: Colors.muted, textAlign: 'center', marginTop: 8 },
});
