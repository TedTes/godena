import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Radius, Spacing } from '../constants/theme';
import {
  fetchLatestVerificationAttempt,
  fetchVerificationSummary,
  getSessionUserId,
  submitPhotoVerification,
  type VerificationStatus,
} from '../lib/services/identityVerification';

const STATUS_LABEL: Record<VerificationStatus, string> = {
  unverified: 'Unverified',
  pending: 'Pending review',
  requires_input: 'Needs action',
  verified: 'Verified',
  failed: 'Verification failed',
  canceled: 'Canceled',
};

const STATUS_COLOR: Record<VerificationStatus, string> = {
  unverified: Colors.muted,
  pending: Colors.terracotta,
  requires_input: Colors.gold,
  verified: Colors.olive,
  failed: Colors.error,
  canceled: Colors.muted,
};

export default function VerifyIdentityScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus>('unverified');
  const [provider, setProvider] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [lastReason, setLastReason] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = await getSessionUserId();
    if (!uid) {
      router.replace('/(auth)');
      return;
    }

    setUserId(uid);

    const [summaryRes, attemptRes] = await Promise.all([
      fetchVerificationSummary(uid),
      fetchLatestVerificationAttempt(uid),
    ]);

    if (summaryRes.data) {
      setStatus(summaryRes.data.verification_status ?? 'unverified');
      setProvider(summaryRes.data.verification_provider ?? null);
      setSubmittedAt(summaryRes.data.verification_submitted_at ?? null);
      setVerifiedAt(summaryRes.data.verified_at ?? null);
    }

    setLastReason(attemptRes.data?.failure_reason ?? null);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      setRefreshing(true);
      void load().finally(() => setRefreshing(false));
    }, [load])
  );

  const startButtonLabel = useMemo(() => {
    if (status === 'verified') return 'Already verified';
    if (status === 'pending') return 'Retake selfie';
    if (status === 'requires_input' || status === 'failed' || status === 'canceled') return 'Take new selfie';
    return 'Take selfie';
  }, [status]);

  const onStart = async () => {
    if (!userId || starting || status === 'verified') return;
    let picked: ImagePicker.ImagePickerResult;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to verify with a selfie.');
        return;
      }

      picked = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        aspect: [3, 4],
        cameraType: ImagePicker.CameraType.front,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Camera unavailable';
      // iOS simulator has no camera device; gracefully fallback to library.
      if (message.toLowerCase().includes('camera not available')) {
        Alert.alert('Simulator detected', 'Camera is not available in simulator. Choose a selfie from your library.');
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission needed', 'Please allow photo access to continue verification in simulator.');
          return;
        }
        picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          quality: 0.85,
          aspect: [3, 4],
        });
      } else {
        Alert.alert('Camera error', message);
        return;
      }
    }

    if (picked.canceled || !picked.assets[0]?.uri) return;
    const localUri = picked.assets[0].uri;
    setPreviewUri(localUri);

    setStarting(true);
    const { error } = await submitPhotoVerification(userId, localUri);
    setStarting(false);

    if (error) {
      Alert.alert('Could not submit photo', error.message || 'Unknown error');
      return;
    }

    Alert.alert('Submitted', 'Your photo was sent for manual verification review.');
    void load();
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={Colors.terracotta} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color={Colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Photo Verification</Text>
          <TouchableOpacity style={styles.refreshBtn} onPress={() => void load()} disabled={refreshing}>
            {refreshing ? (
              <ActivityIndicator size="small" color={Colors.muted} />
            ) : (
              <Ionicons name="refresh" size={16} color={Colors.brownMid} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={[styles.statusValue, { color: STATUS_COLOR[status] }]}>{STATUS_LABEL[status]}</Text>
          </View>
          {provider ? (
            <Text style={styles.metaText}>Provider: {provider.replace(/_/g, ' ')}</Text>
          ) : null}
          {submittedAt ? (
            <Text style={styles.metaText}>Submitted: {new Date(submittedAt).toLocaleString()}</Text>
          ) : null}
          {verifiedAt ? (
            <Text style={styles.metaText}>Verified: {new Date(verifiedAt).toLocaleString()}</Text>
          ) : null}
          {lastReason ? <Text style={styles.errorText}>Last issue: {lastReason}</Text> : null}
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={styles.preview} />
          ) : null}

          <TouchableOpacity
            style={[styles.startBtn, status === 'verified' && styles.startBtnDisabled]}
            disabled={starting || status === 'verified'}
            onPress={onStart}
          >
            {starting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.startBtnText}>{startButtonLabel}</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.helper}>
            Take a clear selfie. Our team reviews authenticity and marks your profile as verified.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  safe: { flex: 1 },
  loadingWrap: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
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
  title: { fontSize: 28, fontWeight: '800', color: Colors.ink },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.warmWhite,
  },
  card: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.warmWhite,
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: { fontSize: 13, color: Colors.muted, fontWeight: '700' },
  statusValue: { fontSize: 14, fontWeight: '800' },
  metaText: { fontSize: 12, color: Colors.muted },
  errorText: { fontSize: 12, color: Colors.error, fontWeight: '600' },
  preview: {
    width: 92,
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 4,
  },
  startBtn: {
    marginTop: 8,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtnDisabled: {
    backgroundColor: Colors.borderDark,
  },
  startBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  helper: {
    marginTop: 6,
    fontSize: 12,
    color: Colors.muted,
    lineHeight: 18,
  },
});
