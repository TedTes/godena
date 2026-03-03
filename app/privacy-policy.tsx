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

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Privacy Policy</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Section
            title="What We Collect"
            body="We collect profile details, group activity signals, chat content, and event participation data needed to run introductions and conversations."
          />
          <Section
            title="How We Use Data"
            body="Your data is used to power matching, group participation, safety review, and product reliability. We do not expose private data publicly."
          />
          <Section
            title="Who Can See What"
            body="Access is controlled by authentication and row-level security policies. Users can only access data they are permitted to view."
          />
          <Section
            title="Safety & Moderation"
            body="Reports and blocks are private. We review reports for policy violations and may restrict accounts to protect community safety."
          />
          <Section
            title="Account Deletion"
            body="Deleting your account starts a deactivation window. During this period your account is disabled and can be restored before final deletion."
          />
          <Section
            title="Contact"
            body="For data, privacy, or safety questions, use Help & Feedback in the profile screen."
          />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.warmWhite,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.ink },
  headerSpacer: { width: 36, height: 36 },
  content: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, gap: 10 },
  sectionCard: {
    backgroundColor: Colors.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.ink, marginBottom: 5 },
  sectionBody: { fontSize: 13, lineHeight: 19, color: Colors.brownMid },
});

