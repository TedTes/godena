import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
  Dimensions,
  Image,
  LayoutAnimation,
  Modal,
  Platform,
  Switch,
  UIManager,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import RAnimated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, useThemeColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { resolveProfilePhotoUrl } from '../../lib/services/photoUrls';
import { useScreenEnter } from '../../hooks/useScreenEnter';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const LAYOUT_SPRING = {
  duration: 280,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.spring, springDamping: 0.8 },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

type SignalGroup = {
  id: string;
  name: string;
  coverColor: string;
  emoji: string;
  isMember: boolean;
  isOpenToConnect: boolean;
};

const mockGroups: SignalGroup[] = [];

const settingsRows = [
  { icon: 'git-compare-outline', label: 'Connections' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'shield-outline', label: 'Privacy & Safety' },
  { icon: 'sparkles-outline', label: 'Agent Review' },
  { icon: 'help-circle-outline', label: 'Help & Feedback' },
  { icon: 'trash-outline', label: 'Delete Account', danger: true },
  { icon: 'log-out-outline', label: 'Sign Out', danger: true },
] as const;

const COMPLETENESS_TOTAL = 6;
const GENDER_OPTIONS = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'non_binary', label: 'Non-binary' },
] as const;

const RELIGION_OPTIONS = [
  { value: 'Christian', label: 'Christian' },
  { value: 'Catholic', label: 'Catholic' },
  { value: 'Orthodox', label: 'Orthodox' },
  { value: 'Protestant', label: 'Protestant' },
  { value: 'Muslim', label: 'Muslim' },
  { value: 'Jewish', label: 'Jewish' },
  { value: 'Hindu', label: 'Hindu' },
  { value: 'Buddhist', label: 'Buddhist' },
  { value: 'Sikh', label: 'Sikh' },
  { value: 'Spiritual', label: 'Spiritual' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
] as const;

const ETHNICITY_OPTIONS = [
  { value: 'African', label: 'African' },
  { value: 'Black', label: 'Black' },
  { value: 'Caribbean', label: 'Caribbean' },
  { value: 'East Asian', label: 'East Asian' },
  { value: 'South Asian', label: 'South Asian' },
  { value: 'Southeast Asian', label: 'Southeast Asian' },
  { value: 'Middle Eastern', label: 'Middle Eastern' },
  { value: 'North African', label: 'North African' },
  { value: 'Latino/Hispanic', label: 'Latino/Hispanic' },
  { value: 'White', label: 'White' },
  { value: 'Indigenous', label: 'Indigenous' },
  { value: 'Mixed', label: 'Mixed' },
  { value: 'Other', label: 'Other' },
  { value: 'Prefer not to say', label: 'Prefer not to say' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: 'English', label: 'English' },
  { value: 'French', label: 'French' },
  { value: 'Spanish', label: 'Spanish' },
  { value: 'Amharic', label: 'Amharic' },
  { value: 'Tigrinya', label: 'Tigrinya' },
  { value: 'Arabic', label: 'Arabic' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Urdu', label: 'Urdu' },
  { value: 'Somali', label: 'Somali' },
  { value: 'Mandarin', label: 'Mandarin' },
  { value: 'Cantonese', label: 'Cantonese' },
  { value: 'Tagalog', label: 'Tagalog' },
  { value: 'Swahili', label: 'Swahili' },
  { value: 'Other', label: 'Other' },
] as const;

type EditableField =
  | 'bio'
  | 'birth_date'
  | 'ethnicity'
  | 'gender'
  | 'religion'
  | 'languages';

// ── Dating tab types & constants ──────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const D_PHOTO_GAP  = 8;
const D_PHOTO_COLS = 3;
// scroll paddingH (16*2) + section border (1*2) = 34
const D_PHOTO_SIDE = Spacing.md * 2 + 2;
const D_PHOTO_W    = Math.floor((SCREEN_WIDTH - D_PHOTO_SIDE - D_PHOTO_GAP * (D_PHOTO_COLS - 1)) / D_PHOTO_COLS);
const D_PHOTO_H    = Math.round(D_PHOTO_W * 1.35);

const DATING_GENDER_OPTIONS = [
  { value: 'man',        label: 'Men'        },
  { value: 'woman',      label: 'Women'      },
  { value: 'non_binary', label: 'Non-binary' },
];
const DATING_INTENT_OPTIONS = [
  { value: 'friendship', label: 'Friendship' },
  { value: 'dating',     label: 'Dating'     },
  { value: 'long_term',  label: 'Long term'  },
  { value: 'marriage',   label: 'Marriage'   },
];

type MyDatingSummary = {
  fullName: string;
  city: string;
  about: string;
  avatarUrl: string | null;
  preferredGenders: string[];
  preferredIntents: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  isGloballyVisible: boolean;
};

type PrefDraft = {
  preferredGenders: string[];
  preferredIntents: string[];
  preferredAgeMin: number | null;
  preferredAgeMax: number | null;
  isGloballyVisible: boolean;
};

type DatingSaveState = 'idle' | 'saving' | 'saved' | 'error';

function toggle<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
}

function serializePrefDraft(d: PrefDraft): string {
  return JSON.stringify({
    preferredGenders: [...d.preferredGenders].sort(),
    preferredIntents: [...d.preferredIntents].sort(),
    preferredAgeMin:  d.preferredAgeMin,
    preferredAgeMax:  d.preferredAgeMax,
    isGloballyVisible: d.isGloballyVisible,
  });
}

type ProfileData = {
  full_name: string;
  city: string | null;
  bio: string | null;
  birth_date: string | null;
  ethnicity: string | null;
  religion: string | null;
  languages: string[] | null;
  gender: string | null;
  is_open_to_connections: boolean | null;
  verification_status: string | null;
  avatar_url: string | null;
};

const PROFILE_BASE_SELECT =
  'full_name, city, bio, birth_date, ethnicity, religion, languages, gender, is_open_to_connections, verification_status, avatar_url';

function AvatarImage({ uri, style, onError }: { uri: string; style: object; onError: () => void }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  return (
    <Animated.Image
      source={{ uri }}
      style={[style, { opacity }]}
      resizeMode="cover"
      onLoad={() => Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start()}
      onError={onError}
    />
  );
}

export default function ProfileScreen() {
  const router = useRouter();

  // ── Dating profile visible flag ───────────────────────────────────────────────
  const [showDatingProfile, setShowDatingProfile] = useState(false);

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [isBioFocused, setIsBioFocused] = useState(false);
  const [editingValue, setEditingValue] = useState('');
  const [editingLanguages, setEditingLanguages] = useState<string[]>([]);
  const [editingDate, setEditingDate] = useState<Date>(new Date());
  const [showBirthDateSheet, setShowBirthDateSheet] = useState(false);

  // ── Dating tab state ──────────────────────────────────────────────────────────
  const [datingLoaded,        setDatingLoaded]        = useState(false);
  const [datingLoading,       setDatingLoading]       = useState(false);
  const [mySummary,           setMySummary]           = useState<MyDatingSummary | null>(null);
  const [myPhotoPaths,        setMyPhotoPaths]        = useState<string[]>([]);
  const [myPhotoUrls,         setMyPhotoUrls]         = useState<string[]>([]);
  const [updatingDatingPhotos, setUpdatingDatingPhotos] = useState(false);
  const [prefDraft,           setPrefDraft]           = useState<PrefDraft>({
    preferredGenders: [], preferredIntents: [],
    preferredAgeMin: null, preferredAgeMax: null, isGloballyVisible: true,
  });
  const [prefSaveState,  setPrefSaveState]  = useState<DatingSaveState>('idle');
  const [datingBioSaveState, setDatingBioSaveState] = useState<DatingSaveState>('idle');
  const [datingBioText,        setDatingBioText]        = useState('');
  const [datingBioFocused,     setDatingBioFocused]     = useState(false);
  const [datingBioInputHeight, setDatingBioInputHeight] = useState(96);
  const datingBioHeightRef = useRef(96);

  const prefsHydrated  = useRef(false);
  const lastSavedPrefs = useRef(serializePrefDraft({
    preferredGenders: [], preferredIntents: [],
    preferredAgeMin: null, preferredAgeMax: null, isGloballyVisible: true,
  }));
  const datingScrollRef = useRef<ScrollView>(null);

  type BioSaveState = 'idle' | 'saving' | 'saved' | 'error';
  const [bioSaveState, setBioSaveState] = useState<BioSaveState>('idle');
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (bioSaveState !== 'saved') return;
    badgeScale.setValue(0.3);
    badgeOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 200 }),
      Animated.timing(badgeOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      Animated.parallel([
        Animated.timing(badgeOpacity, { toValue: 0, duration: 350, delay: 1800, useNativeDriver: true }),
        Animated.timing(badgeScale, { toValue: 0.7, duration: 350, delay: 1800, useNativeDriver: true }),
      ]).start();
    });
  }, [bioSaveState, badgeOpacity, badgeScale]);

  useEffect(() => {
    if (bioSaveState !== 'saved' && bioSaveState !== 'error') return;
    const timer = setTimeout(() => setBioSaveState('idle'), 3500);
    return () => clearTimeout(timer);
  }, [bioSaveState]);

  useEffect(() => {
    if (editingField !== 'bio') return;
    const current = editingValue.trim();
    if (current === (profile?.bio ?? '').trim()) return;
    const timer = setTimeout(() => {
      setBioSaveState('saving');
      void updateProfilePatch({ bio: current || null })
        .then((ok) => setBioSaveState(ok ? 'saved' : 'error'))
        .catch(() => setBioSaveState('error'));
    }, 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingValue, editingField, profile?.bio]);

  const resolvePhotoUri = async (value: string): Promise<string | null> => {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(value, 60 * 60);
    if (!error && data?.signedUrl) return data.signedUrl;

    const { data: publicData } = supabase.storage.from('profile-photos').getPublicUrl(value);
    if (publicData?.publicUrl) return publicData.publicUrl;
    return null;
  };

  const loadProfile = async (uid?: string) => {
    const resolvedUserId = uid ?? userId;
    if (!resolvedUserId) return;

    const { data } = await supabase
      .from('profiles')
      .select(PROFILE_BASE_SELECT)
      .eq('user_id', resolvedUserId)
      .maybeSingle();

    const profileData = data as ProfileData | null;

    setProfile(profileData ?? null);

    const avatarValue = profileData?.avatar_url ?? null;
    if (avatarValue) {
      const uri = await resolvePhotoUri(avatarValue);
      setAvatarUri(uri ?? null);
    } else {
      setAvatarUri(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      const boot = async () => {
        setLoadingProfile(true);
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData.session?.user.id;
        if (!uid) {
          setLoadingProfile(false);
          router.replace('/(auth)');
          return;
        }
        setUserId(uid);
        await loadProfile(uid);
        setLoadingProfile(false);
      };
      void boot();
    }, [router])
  );

  const age = useMemo(() => {
    if (!profile?.birth_date) return null;
    const birthYear = new Date(profile.birth_date).getFullYear();
    if (!birthYear) return null;
    return new Date().getFullYear() - birthYear;
  }, [profile?.birth_date]);

  const name            = profile?.full_name?.trim() || 'Complete Profile';
  const city            = profile?.city ?? 'Unknown city';
  const ethnicity       = profile?.ethnicity ?? null;
  const religion        = profile?.religion ?? null;
  const languages       = profile?.languages ?? [];
  const birthDateLabel = profile?.birth_date
    ? new Date(`${profile.birth_date}T00:00:00.000Z`).toLocaleDateString()
    : null;

  const aboutMeRows: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string | null; field: EditableField }[] = [
    { icon: 'calendar-outline',             label: 'Birth Date', value: birthDateLabel, field: 'birth_date' },
    { icon: 'globe-outline',                label: 'Ethnicity',  value: ethnicity, field: 'ethnicity' },
    { icon: 'person-outline',               label: 'Gender',     value: profile?.gender ?? null, field: 'gender' },
    { icon: 'leaf-outline',                 label: 'Religion',   value: religion, field: 'religion' },
    { icon: 'chatbubble-ellipses-outline',  label: 'Languages',  value: languages.length > 0 ? languages.join(', ') : null, field: 'languages' },
  ];

  const enterStyle = useScreenEnter();
  const C = useThemeColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const reducedMotion = useReducedMotion();
  const editEnterAnim = reducedMotion ? FadeIn.duration(60) : FadeInDown.duration(200);
  const editExitAnim = reducedMotion ? FadeOut.duration(60) : FadeOut.duration(80);
  const viewEnterAnim = reducedMotion ? FadeIn.duration(60) : FadeIn.duration(180);
  const viewExitAnim = reducedMotion ? FadeOut.duration(60) : FadeOut.duration(60);
  const inputEnterAnim = reducedMotion ? FadeIn.duration(60) : FadeIn.duration(160).delay(60);

  // Profile completeness
  const completenessScore = [
    Boolean(profile?.full_name?.trim()),
    Boolean(profile?.bio?.trim()),
    Boolean(profile?.avatar_url),
    Boolean(profile?.ethnicity?.trim()),
    Boolean(profile?.religion?.trim()),
    languages.length > 0,
  ].filter(Boolean).length;

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/onboarding');
  };

  const updateProfilePatch = async (patch: Partial<ProfileData>) => {
    if (!userId || !profile) return false;
    const prev = profile;
    const next = { ...prev, ...patch };
    setProfile(next);
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', userId);
    if (error) {
      setProfile(prev);
      Alert.alert('Update failed', error.message);
      return false;
    }

    return true;
  };

  const closeEditRow = () => {
    LayoutAnimation.configureNext(LAYOUT_SPRING);
    setEditingField(null);
  };

  const openInlineEditor = (field: EditableField) => {
    if (!profile) return;
    if (field === 'birth_date') {
      const parsed = profile.birth_date ? new Date(`${profile.birth_date}T00:00:00.000Z`) : new Date();
      setEditingDate(Number.isNaN(parsed.getTime()) ? new Date() : parsed);
      setShowBirthDateSheet(true);
      return;
    }
    LayoutAnimation.configureNext(LAYOUT_SPRING);
    setEditingField(field);
    if (field === 'languages') {
      setEditingLanguages(profile.languages ?? []);
    } else if (field === 'bio') {
      setEditingValue(profile.bio ?? '');
    } else if (field === 'ethnicity') {
      setEditingValue(profile.ethnicity ?? '');
    } else if (field === 'religion') {
      setEditingValue(profile.religion ?? '');
    } else if (field === 'gender') {
      setEditingValue(profile.gender ?? '');
    }
  };

  const saveBirthDateFromSheet = async () => {
    const iso = `${editingDate.getUTCFullYear()}-${String(editingDate.getUTCMonth() + 1).padStart(2, '0')}-${String(editingDate.getUTCDate()).padStart(2, '0')}`;
    const ok = await updateProfilePatch({ birth_date: iso });
    if (ok) setShowBirthDateSheet(false);
  };

  const renderFieldInput = (field: EditableField) => {
    if (field === 'gender') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {GENDER_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingValue === opt.value && styles.inlineOptionChipActive]}
              onPress={() => {
                setEditingValue(opt.value);
                void updateProfilePatch({ gender: opt.value }).then(closeEditRow);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingValue === opt.value && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (field === 'religion') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {RELIGION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingValue === opt.value && styles.inlineOptionChipActive]}
              onPress={() => {
                setEditingValue(opt.value);
                void updateProfilePatch({ religion: opt.value }).then(closeEditRow);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingValue === opt.value && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (field === 'ethnicity') {
      return (
        <View style={styles.inlineOptionsWrap}>
          {ETHNICITY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingValue === opt.value && styles.inlineOptionChipActive]}
              onPress={() => {
                setEditingValue(opt.value);
                void updateProfilePatch({ ethnicity: opt.value }).then(closeEditRow);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingValue === opt.value && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    if (field === 'languages') {
      const toggleLanguage = (value: string) => {
        setEditingLanguages((prev) => {
          const next = prev.includes(value)
            ? prev.filter((v) => v !== value)
            : [...prev, value];
          void updateProfilePatch({ languages: next }).then(closeEditRow);
          return next;
        });
      };
      return (
        <View style={styles.inlineOptionsWrap}>
          {LANGUAGE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.inlineOptionChip, editingLanguages.includes(opt.value) && styles.inlineOptionChipActive]}
              onPress={() => toggleLanguage(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.inlineOptionText, editingLanguages.includes(opt.value) && styles.inlineOptionTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    const handleBlur = () => {
      if (field === 'languages') {
        const parsed = editingValue.split(',').map((v) => v.trim()).filter(Boolean);
        void updateProfilePatch({ languages: parsed }).then(closeEditRow);
      } else if (field === 'ethnicity') {
        void updateProfilePatch({ ethnicity: editingValue.trim() || null }).then(closeEditRow);
      } else if (field === 'religion') {
        void updateProfilePatch({ religion: editingValue.trim() || null }).then(closeEditRow);
      }
    };

    return (
      <TextInput
        value={editingValue}
        onChangeText={setEditingValue}
        onBlur={handleBlur}
        placeholder={field === 'languages' ? 'e.g. English, Amharic' : 'Enter value'}
        style={styles.inlineInput}
        autoFocus
        autoCapitalize="sentences"
        placeholderTextColor={C.muted}
      />
    );
  };

  const commitActiveEdit = async () => {
    if (!editingField) return;
    if (editingField === 'bio') return;

    if (editingField === 'languages') {
      await updateProfilePatch({ languages: editingLanguages });
      closeEditRow();
      return;
    }

    if (editingField === 'ethnicity') {
      await updateProfilePatch({ ethnicity: editingValue.trim() || null });
      closeEditRow();
      return;
    }

    if (editingField === 'religion') {
      await updateProfilePatch({ religion: editingValue.trim() || null });
      closeEditRow();
      return;
    }

    closeEditRow();
  };

  const deleteAccount = async () => {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: {},
      });
      if (error || (data as any)?.ok === false) {
        Alert.alert('Could not delete account', error?.message || (data as any)?.error || 'Unknown error');
        setDeletingAccount(false);
        return;
      }
      await supabase.auth.signOut();
      setShowDeleteModal(false);
      const restoreUntil = (data as any)?.restore_until as string | undefined;
      const restoreText = restoreUntil
        ? ` You can request account restore until ${new Date(restoreUntil).toLocaleDateString()}.`
        : '';
      Alert.alert('Account deletion scheduled', `Your account has been deactivated.${restoreText}`);
      router.replace('/onboarding');
    } finally {
      setDeletingAccount(false);
    }
  };

  const onPressSettingRow = (label: string) => {
    if (label === 'Delete Account') {
      setDeleteStep(1);
      setShowDeleteModal(true);
      return;
    }
    if (label === 'Sign Out') {
      void signOut();
      return;
    }
    if (label === 'Upgrade to Premium') {
      router.push('/premium');
      return;
    }
    if (label === 'Connections') {
      router.push('/connections-settings');
      return;
    }
    if (label === 'Notifications') {
      router.push('/notifications');
      return;
    }
    if (label === 'Privacy & Safety') {
      router.push('/privacy-safety');
      return;
    }
    if (label === 'Agent Review') {
      router.push('/agent-review');
      return;
    }
    if (label === 'Help & Feedback') {
      router.push('/help-feedback');
    }
  };

  const verificationLabel = (() => {
    const status = profile?.verification_status ?? 'unverified';
    if (status === 'verified') return 'Verified';
    if (status === 'pending') return 'Pending';
    if (status === 'requires_input') return 'Needs action';
    if (status === 'failed') return 'Failed';
    if (status === 'canceled') return 'Canceled';
    return 'Unverified';
  })();

  const updatePhoto = async () => {
    if (!userId || updatingPhoto) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Photo library access is required to update your photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets[0]?.uri) return;

    try {
      setUpdatingPhoto(true);
      const asset = result.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext =
        contentType === 'image/png' ? 'png' :
        contentType === 'image/webp' ? 'webp' : 'jpg';
      const filePath = `${userId}/${Date.now()}-avatar.${ext}`;

      let fileData: ArrayBuffer;
      if (asset.base64) {
        const response = await fetch(`data:${contentType};base64,${asset.base64}`);
        fileData = await response.arrayBuffer();
      } else {
        const response = await fetch(asset.uri);
        fileData = await response.arrayBuffer();
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-photos')
        .upload(filePath, fileData, { contentType, upsert: false });

      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('user_id', userId);

      if (updateError) { Alert.alert('Update failed', updateError.message); return; }

      const resolvedAvatarUri = await resolvePhotoUri(filePath);
      setAvatarUri(resolvedAvatarUri ?? null);
      setProfile((prev) => (prev ? { ...prev, avatar_url: filePath } : prev));
    } catch (err: any) {
      Alert.alert('Update failed', err?.message ?? 'Could not update profile photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const openPhotoActions = () => {
    const hasPhoto = Boolean(avatarUri);
    Alert.alert('Profile photo', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose new photo', onPress: () => void updatePhoto() },
      ...(hasPhoto ? [{
        text: 'Remove photo',
        style: 'destructive' as const,
        onPress: async () => {
          if (!userId) return;
          setUpdatingPhoto(true);
          const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null })
            .eq('user_id', userId);
          setUpdatingPhoto(false);
          if (error) { Alert.alert('Update failed', error.message); return; }
          setAvatarUri(null);
          setProfile((prev) => (prev ? { ...prev, avatar_url: null } : prev));
        },
      }] : []),
    ]);
  };

  // ── Dating tab: load data ────────────────────────────────────────────────────

  const loadDatingData = useCallback(async (uid: string) => {
    if (datingLoading) return;
    setDatingLoading(true);
    try {
      const [{ data: dp }, { data: dprefs }] = await Promise.all([
        supabase.from('dating_profiles')
          .select('is_enabled, about, photos')
          .eq('user_id', uid).maybeSingle(),
        supabase.from('dating_preferences')
          .select('preferred_genders, preferred_intents, preferred_age_min, preferred_age_max, is_globally_visible')
          .eq('user_id', uid).maybeSingle(),
      ]);

      const paths   = (dp?.photos as string[] | null | undefined) ?? [];
      const urls    = await Promise.all(paths.map((p) => resolveProfilePhotoUrl(p)));
      setMyPhotoPaths(paths);
      setMyPhotoUrls(urls.map((u) => u ?? ''));

      // Resolve avatar from existing profile state
      const avatarPath = profile?.avatar_url ?? null;
      const resolvedAvatar = avatarPath ? await resolveProfilePhotoUrl(avatarPath) : null;

      const pg  = (dprefs?.preferred_genders  as string[] | null | undefined) ?? [];
      const pi  = (dprefs?.preferred_intents  as string[] | null | undefined) ?? [];
      const pam = dprefs?.preferred_age_min   ?? null;
      const pax = dprefs?.preferred_age_max   ?? null;
      const vis = dprefs?.is_globally_visible ?? true;

      setMySummary({
        fullName:          profile?.full_name?.trim() || 'You',
        city:              profile?.city?.trim()       || 'City not set',
        about:             dp?.about?.trim()           || '',
        avatarUrl:         resolvedAvatar ?? null,
        preferredGenders:  pg,
        preferredIntents:  pi,
        preferredAgeMin:   pam,
        preferredAgeMax:   pax,
        isGloballyVisible: vis,
      });
      setDatingBioText(dp?.about?.trim() || '');

      const loadedDraft = { preferredGenders: pg, preferredIntents: pi, preferredAgeMin: pam, preferredAgeMax: pax, isGloballyVisible: vis };
      prefsHydrated.current = false;
      setPrefDraft(loadedDraft);
      lastSavedPrefs.current = serializePrefDraft(loadedDraft);
      setPrefSaveState('idle');
      prefsHydrated.current = true;

      setDatingLoaded(true);
    } finally {
      setDatingLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.avatar_url, profile?.full_name, profile?.city]);

  // Lazy load dating data when the user first opens the Dating Profile view
  useEffect(() => {
    if (showDatingProfile && !datingLoaded && !datingLoading && userId) {
      void loadDatingData(userId);
    }
  }, [showDatingProfile, datingLoaded, datingLoading, userId, loadDatingData]);

  // ── Dating tab: prefs auto-save ──────────────────────────────────────────────

  useEffect(() => {
    if (!userId || !prefsHydrated.current) return;
    const serialized = serializePrefDraft(prefDraft);
    if (serialized === lastSavedPrefs.current) { if (prefSaveState !== 'idle') setPrefSaveState('idle'); return; }
    const timer = setTimeout(() => {
      setPrefSaveState('saving');
      void supabase.from('dating_preferences').upsert(
        { user_id: userId, preferred_genders: prefDraft.preferredGenders, preferred_intents: prefDraft.preferredIntents,
          preferred_age_min: prefDraft.preferredAgeMin, preferred_age_max: prefDraft.preferredAgeMax, is_globally_visible: prefDraft.isGloballyVisible },
        { onConflict: 'user_id' }
      ).then(({ error }) => {
        if (error) { setPrefSaveState('error'); return; }
        lastSavedPrefs.current = serialized;
        setPrefSaveState('saved');
      });
    }, 4000);
    return () => clearTimeout(timer);
  }, [prefDraft, prefSaveState, userId]);

  useEffect(() => {
    if (prefSaveState !== 'saved' && prefSaveState !== 'error') return;
    const t = setTimeout(() => setPrefSaveState('idle'), prefSaveState === 'error' ? 4500 : 3500);
    return () => clearTimeout(t);
  }, [prefSaveState]);

  // ── Dating tab: bio auto-save ────────────────────────────────────────────────

  useEffect(() => {
    const expected = mySummary?.about ?? '';
    if (datingBioText.trim() === expected.trim()) { setDatingBioSaveState('idle'); return; }
    const timer = setTimeout(() => {
      if (!userId) return;
      setDatingBioSaveState('saving');
      void supabase.from('dating_profiles')
        .upsert({ user_id: userId, is_enabled: true, about: datingBioText.trim() }, { onConflict: 'user_id' })
        .then(({ error }) => {
          if (error) { setDatingBioSaveState('error'); return; }
          setMySummary((prev) => prev ? { ...prev, about: datingBioText.trim() } : prev);
          setDatingBioSaveState('saved');
        });
    }, 4000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datingBioText, userId]);

  useEffect(() => {
    if (datingBioSaveState !== 'saved' && datingBioSaveState !== 'error') return;
    const t = setTimeout(() => setDatingBioSaveState('idle'), datingBioSaveState === 'error' ? 4500 : 3500);
    return () => clearTimeout(t);
  }, [datingBioSaveState]);

  // ── Dating tab: photo management ─────────────────────────────────────────────

  const addDatingPhoto = async () => {
    if (!userId || updatingDatingPhotos) return;
    if (myPhotoPaths.length >= 6) { Alert.alert('Photo limit reached', 'You can upload up to 6 dating photos.'); return; }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.8, base64: true,
    });
    if (picked.canceled || !picked.assets[0]?.uri) return;
    try {
      setUpdatingDatingPhotos(true);
      const asset       = picked.assets[0];
      const contentType = asset.mimeType || 'image/jpeg';
      const ext         = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const filePath    = `${userId}/${Date.now()}-dating.${ext}`;
      const fileData    = asset.base64
        ? await (await fetch(`data:${contentType};base64,${asset.base64}`)).arrayBuffer()
        : await (await fetch(asset.uri)).arrayBuffer();
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(filePath, fileData, { contentType, upsert: false });
      if (upErr) { Alert.alert('Upload failed', upErr.message); return; }
      const nextPaths = [...myPhotoPaths, filePath];
      const { error: dbErr } = await supabase.from('dating_profiles')
        .upsert({ user_id: userId, is_enabled: true, photos: nextPaths }, { onConflict: 'user_id' });
      if (dbErr) { Alert.alert('Update failed', dbErr.message); return; }
      const resolved = await resolveProfilePhotoUrl(filePath);
      setMyPhotoPaths(nextPaths);
      setMyPhotoUrls((prev) => [...prev, resolved ?? '']);
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not upload photo.');
    } finally {
      setUpdatingDatingPhotos(false);
    }
  };

  const removeDatingPhoto = async (path: string, idx: number) => {
    if (!userId || updatingDatingPhotos) return;
    const nextPaths = myPhotoPaths.filter((p) => p !== path);
    setUpdatingDatingPhotos(true);
    const { error } = await supabase.from('dating_profiles')
      .upsert({ user_id: userId, is_enabled: true, photos: nextPaths }, { onConflict: 'user_id' });
    if (error) { setUpdatingDatingPhotos(false); Alert.alert('Update failed', error.message); return; }
    await supabase.storage.from('profile-photos').remove([path]);
    setMyPhotoPaths(nextPaths);
    setMyPhotoUrls((prev) => prev.filter((_, i) => i !== idx));
    setUpdatingDatingPhotos(false);
  };

  if (loadingProfile) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={C.terracotta} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <Animated.View style={[{ flex: 1 }, enterStyle]}>

        {!showDatingProfile ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onTouchStart={() => {
            if (editingField && editingField !== 'bio') {
              void commitActiveEdit();
            }
          }}
        >

          {/* ── Hero Header ── */}
          <View style={styles.headerBg}>
            <View style={styles.headerContent}>

              {/* Avatar + completion ring */}
              <View style={styles.avatarRingWrap}>
                {/* Track */}
                <View style={styles.ringTrack} />
                {(() => {
                  const frac = completenessScore / COMPLETENESS_TOTAL;
                  const arcColor = completenessScore === COMPLETENESS_TOTAL ? C.success : C.terracotta;
                  const rightRot = (Math.min(frac, 0.5) / 0.5) * 180 - 180;
                  const leftRot  = frac > 0.5 ? ((frac - 0.5) / 0.5) * 180 - 180 : -180;
                  return (
                    <>
                      {/* Right half — covers 0–50% of arc (12 o'clock → 6 o'clock CW) */}
                      <View style={styles.ringHalfClipRight}>
                        <View style={[styles.ringArc, {
                          left: -60,
                          borderTopColor: arcColor,
                          borderRightColor: arcColor,
                          borderBottomColor: 'transparent',
                          borderLeftColor: 'transparent',
                          transform: [{ rotate: `${rightRot}deg` }],
                        }]} />
                      </View>
                      {/* Left half — covers 50–100% of arc (6 o'clock → 12 o'clock CW) */}
                      <View style={styles.ringHalfClipLeft}>
                        <View style={[styles.ringArc, {
                          left: 0,
                          borderTopColor: 'transparent',
                          borderRightColor: 'transparent',
                          borderBottomColor: arcColor,
                          borderLeftColor: arcColor,
                          transform: [{ rotate: `${leftRot}deg` }],
                        }]} />
                      </View>
                    </>
                  );
                })()}
                <TouchableOpacity style={styles.photoWrap} onPress={openPhotoActions} activeOpacity={0.85}>
                  {avatarUri ? (
                    <AvatarImage
                      key={avatarUri}
                      uri={avatarUri}
                      style={styles.photoImage}
                      onError={() => setAvatarUri(null)}
                    />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <Text style={styles.photoInitial}>{name[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  {updatingPhoto && (
                    <View style={styles.photoLoadingOverlay}>
                      <ActivityIndicator color={C.white} />
                    </View>
                  )}
                  <View style={styles.cameraBtn}>
                    <Ionicons name="camera" size={13} color={C.white} />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={styles.name}>{name}</Text>

              {/* Meta row */}
              <View style={styles.metaRow}>
                {age ? <Text style={styles.metaText}>{age}</Text> : null}
                {age ? <View style={styles.metaDot} /> : null}
                <Ionicons name="location-outline" size={12} color={C.brownLight} />
                <Text style={styles.metaText}>{city}</Text>
              </View>

            </View>
          </View>

          {/* ── Bio + Identity merged under "About" ── */}
          <View style={styles.section}>
            <View style={styles.bioLabelRow}>
              <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>About</Text>
              <Animated.View style={[styles.bioSaveBadge, { opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}>
                <Ionicons name="checkmark" size={13} color={C.success} />
              </Animated.View>
            </View>
            {editingField === 'bio' ? (
              <RAnimated.View
                key="bio-edit"
                entering={editEnterAnim}
                exiting={editExitAnim}
                style={[styles.bioDashedCard, (editingField === 'bio' || isBioFocused) && styles.bioDashedCardActive]}
              >
                <RAnimated.View entering={inputEnterAnim}>
                  <TextInput
                    value={editingValue}
                    onChangeText={setEditingValue}
                    onFocus={() => setIsBioFocused(true)}
                    onBlur={() => {
                      setIsBioFocused(false);
                      const current = editingValue.trim();
                      if (current !== (profile?.bio ?? '').trim()) {
                        setBioSaveState('saving');
                        void updateProfilePatch({ bio: current || null })
                          .then((ok) => { setBioSaveState(ok ? 'saved' : 'error'); closeEditRow(); })
                          .catch(() => { setBioSaveState('error'); closeEditRow(); });
                      } else {
                        closeEditRow();
                      }
                    }}
                    multiline
                    style={styles.bioInput}
                    autoFocus
                    placeholder="Write something about yourself..."
                    placeholderTextColor={C.muted}
                  />
                </RAnimated.View>
              </RAnimated.View>
            ) : (
              <RAnimated.View key="bio-view" entering={viewEnterAnim} exiting={viewExitAnim}>
                <TouchableOpacity style={styles.bioDashedCard} activeOpacity={0.85} onPress={() => openInlineEditor('bio')}>
                  <Text style={profile?.bio?.trim() ? styles.bioText : styles.bioEmpty}>
                    {profile?.bio?.trim() || 'No bio yet. Tap to add.'}
                  </Text>
                </TouchableOpacity>
              </RAnimated.View>
            )}
          </View>

          {/* ── About Me (identity) ── */}
          <View style={styles.section}>
            <View style={[styles.card, styles.cardNoPad]}>
              {aboutMeRows.map((row, i) => {
                const isEditing = editingField === row.field;
                if (isEditing) {
                  return (
                    <RAnimated.View
                      key={`${row.label}-edit`}
                      entering={editEnterAnim}
                      exiting={editExitAnim}
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, styles.infoRowEditing, { paddingHorizontal: Spacing.md }]}
                    >
                      <View style={[styles.infoIconBox, { alignSelf: 'flex-start', marginTop: 2 }]}>
                        <Ionicons name={row.icon} size={18} color={C.terracotta} />
                      </View>
                      <View style={[styles.infoText, { gap: 8 }]}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <RAnimated.View entering={inputEnterAnim}>
                          {renderFieldInput(row.field)}
                        </RAnimated.View>
                      </View>
                    </RAnimated.View>
                  );
                }
                return (
                  <RAnimated.View
                    key={`${row.label}-view`}
                    entering={viewEnterAnim}
                    exiting={viewExitAnim}
                  >
                    <TouchableOpacity
                      style={[styles.infoRow, i > 0 && styles.infoRowDivider, { paddingHorizontal: Spacing.md }]}
                      activeOpacity={0.8}
                      onPress={() => openInlineEditor(row.field)}
                    >
                      <View style={styles.infoIconBox}>
                        <Ionicons name={row.icon} size={18} color={C.brownMid} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoFieldLabel}>{row.label}</Text>
                        <Text style={[styles.infoValue, !row.value && styles.infoValueEmpty]} numberOfLines={2}>
                          {row.value ?? 'Not set'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                    </TouchableOpacity>
                  </RAnimated.View>
                );
              })}
            </View>
          </View>

          {/* ── Account ── */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Account</Text>
            <View style={[styles.card, styles.cardNoPad]}>
              {settingsRows.map((row, i) => (
                <TouchableOpacity
                  key={row.label}
                  style={[
                    styles.settingsRow,
                    i < settingsRows.length - 1 && styles.settingsRowDivider,
                  ]}
                  onPress={() => onPressSettingRow(row.label)}
                  activeOpacity={0.7}
                  disabled={deletingAccount && row.label === 'Delete Account'}
                >
                  <View style={[
                    styles.settingsIcon,
                    'danger' in row && row.danger && styles.settingsIconDanger,
                  ]}>
                    <Ionicons
                      name={row.icon as any}
                      size={18}
                      color={
                        'danger' in row && row.danger ? C.error :
                        C.brownMid
                      }
                    />
                  </View>
                  <Text style={[
                    styles.settingsLabel,
                    'danger' in row && row.danger && styles.settingsLabelDanger,
                  ]}>
                    {row.label}
                  </Text>
                  {row.label === 'Delete Account' && deletingAccount ? (
                    <ActivityIndicator size="small" color={C.error} />
                  ) : (
                    <Ionicons name="chevron-forward" size={16} color={C.borderDark} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── Dating Profile CTA ── */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.datingCta}
              onPress={() => setShowDatingProfile(true)}
              activeOpacity={0.88}
            >
              <View style={styles.datingCtaLeft}>
                <View style={styles.datingCtaIconWrap}>
                  <Ionicons name="flame" size={20} color={Colors.terracotta} />
                </View>
                <View style={styles.datingCtaText}>
                  <Text style={styles.datingCtaTitle}>Dating Profile</Text>
                  <Text style={styles.datingCtaSub}>Photos, bio &amp; preferences</Text>
                </View>
              </View>
              <View style={styles.datingCtaArrow}>
                <Ionicons name="chevron-forward" size={15} color={Colors.terracotta} />
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
        ) : (
          /* ── Dating Profile view ─────────────────────────────────────────── */
          <>
            {/* Sticky header */}
            <View style={styles.dpHeader}>
              <TouchableOpacity
                onPress={() => setShowDatingProfile(false)}
                style={styles.dpHeaderBack}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={20} color={C.brown} />
              </TouchableOpacity>
              <View style={styles.dpHeaderCenter}>
                <Ionicons name="flame" size={14} color={Colors.terracotta} />
                <Text style={styles.dpHeaderTitle}>Dating Profile</Text>
              </View>
              <View style={styles.dpHeaderRight}>
                {(datingBioSaveState === 'saving' || prefSaveState === 'saving') ? (
                  <ActivityIndicator size="small" color={C.muted} />
                ) : (datingBioSaveState === 'saved' || prefSaveState === 'saved') ? (
                  <Ionicons name="checkmark-circle" size={18} color={C.success} />
                ) : null}
              </View>
            </View>

            {datingLoading && !datingLoaded ? (
              <View style={styles.datingLoadingWrap}>
                <ActivityIndicator color={C.terracotta} size="large" />
              </View>
            ) : (
              <ScrollView
                ref={datingScrollRef}
                style={styles.datingScroll}
                contentContainerStyle={styles.datingScrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* ── Mini hero ── */}
                <View style={styles.dpHero}>
                  <View style={styles.dpAvatarRing}>
                    {mySummary?.avatarUrl ? (
                      <Image source={{ uri: mySummary.avatarUrl }} style={styles.dpAvatar} />
                    ) : (
                      <View style={[styles.dpAvatar, styles.dpAvatarFallback]}>
                        <Text style={styles.dpAvatarInitials}>
                          {profile?.full_name
                            ? profile.full_name.trim().split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2)
                            : '?'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.dpHeroName}>{profile?.full_name?.trim() || 'Your name'}</Text>
                  {profile?.city ? (
                    <View style={styles.dpHeroMeta}>
                      <Ionicons name="location-outline" size={11} color={C.muted} />
                      <Text style={styles.dpHeroCity}>{profile.city}</Text>
                    </View>
                  ) : null}
                </View>

                {/* ── Photos ── */}
                <View style={styles.dpSection}>
                  <View style={styles.dpSectionHeader}>
                    <Text style={styles.dpSectionTitle}>Photos</Text>
                    <Text style={styles.dpSectionMeta}>{myPhotoPaths.length} / 6</Text>
                  </View>
                  <Text style={styles.dpSectionSub}>Show your best self — add up to 6 photos</Text>
                  <View style={styles.dpPhotoGridBleed}>
                    <View style={styles.datingPhotoStrip}>
                      {myPhotoUrls.map((url, idx) => (
                        <View key={`${myPhotoPaths[idx] ?? idx}`} style={styles.datingPhotoWrap}>
                          {url
                            ? <Image source={{ uri: url }} style={styles.datingPhoto} resizeMode="cover" />
                            : <View style={[styles.datingPhoto, styles.datingPhotoEmpty]} />}
                          <TouchableOpacity
                            style={styles.datingPhotoRemoveBtn}
                            onPress={() => { const p = myPhotoPaths[idx]; if (p) void removeDatingPhoto(p, idx); }}
                            disabled={updatingDatingPhotos}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons name="close-circle" size={20} color={C.error} />
                          </TouchableOpacity>
                        </View>
                      ))}
                      {myPhotoPaths.length < 6 && (
                        <TouchableOpacity
                          style={styles.datingPhotoAddBtn}
                          onPress={() => void addDatingPhoto()}
                          disabled={updatingDatingPhotos}
                          activeOpacity={0.8}
                        >
                          {updatingDatingPhotos
                            ? <ActivityIndicator size="small" color={C.terracotta} />
                            : <>
                                <Ionicons name="add" size={22} color={C.terracotta} />
                                {myPhotoPaths.length === 0 && <Text style={styles.datingPhotoAddLabel}>Add photo</Text>}
                              </>}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>

                {/* ── Bio ── */}
                <View style={styles.dpSection}>
                  <View style={styles.dpSectionHeader}>
                    <Text style={styles.dpSectionTitle}>Bio</Text>
                    <Text style={styles.dpSectionMeta}>{datingBioText.length} / 280</Text>
                  </View>
                  <View style={[styles.dpBioCard, datingBioFocused && styles.dpBioCardFocused]}>
                    <TextInput
                      value={datingBioText}
                      onChangeText={setDatingBioText}
                      onContentSizeChange={(e) => {
                        const next = Math.max(80, Math.min(160, e.nativeEvent.contentSize.height + 16));
                        if (Math.abs(next - datingBioHeightRef.current) > 2) {
                          datingBioHeightRef.current = next;
                          setDatingBioInputHeight(next);
                        }
                      }}
                      onFocus={() => setDatingBioFocused(true)}
                      onBlur={() => {
                        setDatingBioFocused(false);
                        if (!userId) return;
                        const text = datingBioText.trim();
                        if (text === (mySummary?.about ?? '').trim()) return;
                        setDatingBioSaveState('saving');
                        void supabase.from('dating_profiles')
                          .upsert({ user_id: userId, is_enabled: true, about: text }, { onConflict: 'user_id' })
                          .then(({ error }) => {
                            if (error) { setDatingBioSaveState('error'); return; }
                            setMySummary((prev) => prev ? { ...prev, about: text } : prev);
                            setDatingBioSaveState('saved');
                          });
                      }}
                      multiline
                      maxLength={280}
                      scrollEnabled={false}
                      placeholder="What makes you, you? Write something genuine…"
                      placeholderTextColor={C.muted}
                      textAlignVertical="top"
                      style={[styles.dpBioInput, { height: datingBioInputHeight }]}
                    />
                  </View>
                </View>

                {/* ── Preferences ── */}
                <View style={styles.dpSection}>
                  <Text style={styles.dpSectionTitle}>Preferences</Text>
                  <Text style={styles.dpSectionSub}>Who you're open to meeting</Text>

                  {/* I'm interested in */}
                  <View style={styles.dpPrefBlock}>
                    <Text style={styles.dpPrefLabel}>I'm interested in</Text>
                    <View style={styles.datingChipRow}>
                      {DATING_GENDER_OPTIONS.map((opt) => {
                        const sel = prefDraft.preferredGenders.includes(opt.value);
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.datingChip, sel && styles.datingChipActive]}
                            onPress={() => setPrefDraft((prev) => ({ ...prev, preferredGenders: toggle(prev.preferredGenders, opt.value) }))}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.datingChipText, sel && styles.datingChipTextActive]}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Looking for */}
                  <View style={styles.dpPrefBlock}>
                    <Text style={styles.dpPrefLabel}>Looking for</Text>
                    <View style={styles.datingChipRow}>
                      {DATING_INTENT_OPTIONS.map((opt) => {
                        const sel = prefDraft.preferredIntents.includes(opt.value);
                        return (
                          <TouchableOpacity
                            key={opt.value}
                            style={[styles.datingChip, sel && styles.datingChipActive]}
                            onPress={() => setPrefDraft((prev) => ({ ...prev, preferredIntents: toggle(prev.preferredIntents, opt.value) }))}
                            activeOpacity={0.75}
                          >
                            <Text style={[styles.datingChipText, sel && styles.datingChipTextActive]}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Age range */}
                  <View style={styles.dpPrefBlock}>
                    <View style={styles.dpAgeRow}>
                      <Text style={styles.dpPrefLabel}>Age range</Text>
                      <View style={styles.dpAgeBadge}>
                        <Text style={styles.dpAgeBadgeText}>{prefDraft.preferredAgeMin ?? 18} – {prefDraft.preferredAgeMax ?? 65}</Text>
                      </View>
                    </View>
                    <View style={styles.datingSliderRow}>
                      <Text style={styles.datingSliderLabel}>Min</Text>
                      <Slider
                        style={styles.datingSlider}
                        minimumValue={18}
                        maximumValue={prefDraft.preferredAgeMax ?? 65}
                        step={1}
                        value={prefDraft.preferredAgeMin ?? 18}
                        onValueChange={(v) => setPrefDraft((prev) => ({ ...prev, preferredAgeMin: Math.round(v) }))}
                        minimumTrackTintColor={Colors.terracotta}
                        maximumTrackTintColor={Colors.border}
                        thumbTintColor={Colors.terracotta}
                      />
                    </View>
                    <View style={styles.datingSliderRow}>
                      <Text style={styles.datingSliderLabel}>Max</Text>
                      <Slider
                        style={styles.datingSlider}
                        minimumValue={prefDraft.preferredAgeMin ?? 18}
                        maximumValue={65}
                        step={1}
                        value={prefDraft.preferredAgeMax ?? 65}
                        onValueChange={(v) => setPrefDraft((prev) => ({ ...prev, preferredAgeMax: Math.round(v) }))}
                        minimumTrackTintColor={Colors.terracotta}
                        maximumTrackTintColor={Colors.border}
                        thumbTintColor={Colors.terracotta}
                      />
                    </View>
                  </View>
                </View>

                {/* ── Visibility ── */}
                <View style={styles.dpVisCard}>
                  <View style={styles.dpVisLeft}>
                    <View style={styles.dpVisIconWrap}>
                      <Ionicons name={prefDraft.isGloballyVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={Colors.terracotta} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dpVisTitle}>Visible in Dating</Text>
                      <Text style={styles.dpVisHint}>
                        {prefDraft.isGloballyVisible
                          ? 'Others in your groups can discover you.'
                          : "You're hidden — you can still swipe."}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={prefDraft.isGloballyVisible}
                    onValueChange={(v) => setPrefDraft((prev) => ({ ...prev, isGloballyVisible: v }))}
                    trackColor={{ false: Colors.border, true: Colors.terracotta }}
                    thumbColor={Colors.white}
                  />
                </View>

                {/* ── Back to Profile ── */}
                <TouchableOpacity
                  style={styles.dpBackBtn}
                  onPress={() => setShowDatingProfile(false)}
                  activeOpacity={0.8}
                >
                  <View style={styles.dpBackIconWrap}>
                    <Ionicons name="person-outline" size={17} color={Colors.terracotta} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dpBackTitle}>Back to Main Profile</Text>
                    <Text style={styles.dpBackSub}>Return to your primary profile details.</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={15} color={C.borderDark} />
                </TouchableOpacity>

                <View style={{ height: 48 }} />
              </ScrollView>
            )}
          </>
        )}
        </Animated.View>
      </SafeAreaView>

      <Modal
        visible={showBirthDateSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBirthDateSheet(false)}
      >
        <View style={styles.dateSheetOverlay}>
          <TouchableOpacity
            style={styles.dateSheetBackdrop}
            activeOpacity={1}
            onPress={() => setShowBirthDateSheet(false)}
          />
          <View style={styles.dateSheet}>
            <View style={styles.dateSheetHeader}>
              <TouchableOpacity onPress={() => setShowBirthDateSheet(false)} activeOpacity={0.8}>
                <Text style={styles.dateSheetCancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.dateSheetTitle}>Select Birth Date</Text>
              <TouchableOpacity onPress={() => void saveBirthDateFromSheet()} activeOpacity={0.8}>
                <Text style={styles.dateSheetSave}>Save</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={editingDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(event, date) => {
                if (date) setEditingDate(date);
                if (Platform.OS === 'android') {
                  if (event.type === 'set' && date) {
                    void updateProfilePatch({
                      birth_date: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`,
                    }).then((ok) => {
                      if (ok) setShowBirthDateSheet(false);
                    });
                  } else if (event.type === 'dismissed') {
                    setShowBirthDateSheet(false);
                  }
                }
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Delete Account Modal ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!deletingAccount) setShowDeleteModal(false); }}
      >
        <View style={styles.deleteOverlay}>
          <TouchableOpacity
            style={styles.deleteBackdrop}
            activeOpacity={1}
            onPress={() => { if (!deletingAccount) setShowDeleteModal(false); }}
          />
          <View style={styles.deleteSheet}>
            <View style={styles.deleteHandle} />

            {deleteStep === 1 ? (
              <>
                <View style={styles.deleteIconWrap}>
                  <Ionicons name="person-remove-outline" size={28} color={Colors.terracotta} />
                </View>
                <Text style={styles.deleteTitle}>Delete your account?</Text>
                <Text style={styles.deleteBody}>
                  Your account will be <Text style={styles.deleteBold}>deactivated immediately</Text> and permanently deleted after 30 days.
                </Text>
                <View style={styles.deleteRestoreBox}>
                  <Ionicons name="refresh-circle-outline" size={18} color={Colors.terracotta} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deleteRestoreTitle}>30-day restore window</Text>
                    <Text style={styles.deleteRestoreBody}>
                      Changed your mind? Email us within 30 days to recover everything — profile, groups, and connections.
                    </Text>
                  </View>
                </View>
                <View style={styles.deleteActions}>
                  <TouchableOpacity
                    style={styles.deleteCancelBtn}
                    onPress={() => setShowDeleteModal(false)}
                  >
                    <Text style={styles.deleteCancelText}>Keep account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteNextBtn}
                    onPress={() => setDeleteStep(2)}
                  >
                    <Text style={styles.deleteNextText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={[styles.deleteIconWrap, styles.deleteIconWrapRed]}>
                  <Ionicons name="trash-outline" size={28} color={Colors.error} />
                </View>
                <Text style={styles.deleteTitle}>This is permanent</Text>
                <Text style={styles.deleteBody}>
                  Deleting your account removes your profile, groups, events, and connections — all of it — after the 30-day window closes.
                </Text>
                <Text style={styles.deleteNote}>
                  You can still request a restore within 30 days by emailing support.
                </Text>
                <View style={styles.deleteActions}>
                  <TouchableOpacity
                    style={styles.deleteCancelBtn}
                    onPress={() => setDeleteStep(1)}
                    disabled={deletingAccount}
                  >
                    <Text style={styles.deleteCancelText}>Go back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.deleteConfirmBtn, deletingAccount && styles.deleteConfirmBtnDisabled]}
                    onPress={() => void deleteAccount()}
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.deleteConfirmText}>Delete my account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(C: typeof Colors) { return StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: C.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: { flex: 1, backgroundColor: C.cream },
  safe: { flex: 1 },

  // ── Header ──
  headerBg: {
    backgroundColor: C.brown,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: 36,
    shadowColor: C.ink,
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  headerContent: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: Spacing.lg,
  },

  // Avatar ring
  avatarRingWrap: {
    width: 120,
    height: 120,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  ringTrack: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ringHalfClipRight: {
    position: 'absolute',
    width: 60,
    height: 120,
    right: 0,
    overflow: 'hidden',
  },
  ringHalfClipLeft: {
    position: 'absolute',
    width: 60,
    height: 120,
    left: 0,
    overflow: 'hidden',
  },
  ringArc: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  photoWrap: { position: 'relative', width: 108, height: 108 },
  photoPlaceholder: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: C.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  photoImage: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: C.brownMid,
  },
  photoLoadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 54,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInitial: { fontSize: 44, fontWeight: '900', color: C.white },
  cameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.brown,
  },

  // Name & meta
  name: { fontSize: 26, fontWeight: '900', color: C.white, marginBottom: 6, textAlign: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  metaText: { fontSize: 13, color: C.brownLight },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.brownLight },

  // ── Sections ──
  section: { paddingHorizontal: Spacing.lg, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  sectionMeta: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '500',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionSubtext: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
    marginBottom: 10,
    marginTop: -6,
  },

  // ── Card ──
  card: {
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: Spacing.md,
  },
  cardNoPad: { padding: 0, overflow: 'hidden' },

  // ── Gallery ──
  galleryEmptyCard: {
    backgroundColor: C.warmWhite,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: C.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6,
  },
  galleryEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  galleryEmptyTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  galleryEmptySubtext: { fontSize: 12, color: C.muted, textAlign: 'center', lineHeight: 18 },
  galleryEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    backgroundColor: C.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  galleryEmptyBtnText: { fontSize: 13, color: C.white, fontWeight: '700' },

  galleryScroll: { gap: 10, paddingRight: Spacing.lg },
  galleryPhotoWrap: {
    width: 112,
    height: 148,
    borderRadius: Radius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  galleryPhoto: {
    width: 112,
    height: 148,
    borderRadius: Radius.md,
    backgroundColor: C.paper,
  },
  galleryRemoveBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(61,43,31,0.75)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  avatarBadgeText: {
    color: C.white,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  addPhotoTile: {
    width: 80,
    height: 148,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.borderDark,
    backgroundColor: C.warmWhite,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addPhotoLabel: { fontSize: 11, color: C.terracotta, fontWeight: '700' },

  // ── Bio ──
  bioLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  bioSaveBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(90,158,111,0.12)',
    borderWidth: 1.5,
    borderColor: C.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioDashedCard: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    minHeight: 94,
    justifyContent: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bioDashedCardActive: {
    borderColor: 'rgba(196,98,45,0.45)',
    borderWidth: 1,
  },
  bioInput: {
    fontSize: 14,
    color: C.ink,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
    padding: 0,
  },
  bioText: { fontSize: 14, color: C.brownMid, lineHeight: 23 },
  bioEmpty: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // ── Info rows (shared by Identity, Looking For, and Signals) ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  infoRowDivider: { borderTopWidth: 1, borderTopColor: C.border },
  infoRowEditing: { alignItems: 'flex-start', paddingVertical: 14, backgroundColor: 'rgba(196,98,45,0.03)' },
  infoIconBox: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoEmoji: { fontSize: 19 },
  infoText: { flex: 1 },
  infoFieldLabel: {
    fontSize: 10,
    color: C.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: { fontSize: 14, color: C.ink, fontWeight: '600' },
  infoValueEmpty: { color: C.muted, fontStyle: 'italic', fontWeight: '400' },

  // ── Settings ──
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  settingsRowDivider: { borderBottomWidth: 1, borderBottomColor: C.border },
  settingsRowPremium: { backgroundColor: 'rgba(201,168,76,0.06)' },
  settingsIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: { backgroundColor: 'rgba(201,168,76,0.12)' },
  settingsIconDanger: { backgroundColor: 'rgba(217,79,79,0.1)' },
  settingsLabel: { flex: 1, fontSize: 14, color: C.ink, fontWeight: '500' },
  settingsLabelDanger: { color: C.error },
  settingsLabelAccent: { color: C.gold, fontWeight: '600' },
  premiumBadge: {
    backgroundColor: C.gold,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: { fontSize: 9, color: C.white, fontWeight: '800', letterSpacing: 0.5 },
  unverifiedBadge: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderRadius: Radius.full,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
  },
  unverifiedText: { fontSize: 10, color: C.gold, fontWeight: '700', letterSpacing: 0.2 },
  verifiedBadge: {
    backgroundColor: 'rgba(126,150,94,0.16)',
    borderColor: 'rgba(126,150,94,0.6)',
  },
  verifiedText: { color: C.olive },

  // ── Inline Edit (in-place) ──
  inlineInput: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.border,
    backgroundColor: C.paper,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: C.ink,
  },
  inlineAgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlineInputHalf: {
    flex: 1,
  },
  inlineOptionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  inlineOptionChip: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.warmWhite,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  inlineOptionChipActive: {
    borderColor: C.terracotta,
    backgroundColor: 'rgba(196,98,45,0.1)',
  },
  inlineOptionText: {
    fontSize: 13,
    color: C.brownMid,
    fontWeight: '600',
  },
  inlineOptionTextActive: {
    color: C.terracotta,
  },
  inlineDoneChip: {
    alignSelf: 'flex-start',
    backgroundColor: C.terracotta,
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  inlineDoneChipText: {
    fontSize: 13,
    color: C.white,
    fontWeight: '700',
  },

  // ── Birth Date Sheet ──
  dateSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  dateSheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dateSheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderColor: C.border,
  },
  dateSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  dateSheetTitle: {
    fontSize: 14,
    color: C.ink,
    fontWeight: '700',
  },
  dateSheetCancel: {
    fontSize: 14,
    color: C.muted,
    fontWeight: '600',
  },
  dateSheetSave: {
    fontSize: 14,
    color: C.terracotta,
    fontWeight: '700',
  },

  // ── Delete Account Modal ──
  deleteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  deleteBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  deleteSheet: {
    backgroundColor: C.warmWhite,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    alignItems: 'center',
  },
  deleteHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  deleteIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(196,98,45,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  deleteIconWrapRed: { backgroundColor: 'rgba(217,79,79,0.10)' },
  deleteTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 10,
    textAlign: 'center',
  },
  deleteBody: {
    fontSize: 14,
    color: C.brownMid,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 14,
  },
  deleteBold: { fontWeight: '700', color: C.ink },
  deleteRestoreBox: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(196,98,45,0.07)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,98,45,0.18)',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 22,
  },
  deleteRestoreTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.terracotta,
    marginBottom: 3,
  },
  deleteRestoreBody: {
    fontSize: 12,
    color: C.brownMid,
    lineHeight: 18,
  },
  deleteNote: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 22,
    marginTop: -4,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
    alignSelf: 'stretch',
  },
  deleteCancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteCancelText: { fontSize: 15, fontWeight: '600', color: C.brownMid },
  deleteNextBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: C.terracotta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteNextText: { fontSize: 15, fontWeight: '700', color: C.white },
  deleteConfirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteConfirmBtnDisabled: { opacity: 0.55 },
  deleteConfirmText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // ── Dating Profile CTA (standalone card below Account) ──
  datingCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.paper,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(196,98,45,0.22)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    shadowColor: Colors.terracotta,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  datingCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  datingCtaIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(196,98,45,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  datingCtaText: { flex: 1 },
  datingCtaTitle: { fontSize: 15, fontWeight: '800', color: Colors.terracotta },
  datingCtaSub:   { fontSize: 12, color: C.muted, marginTop: 1 },
  datingCtaArrow: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(196,98,45,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Dating Profile view ──
  datingLoadingWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cream,
  },

  // Header bar
  dpHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.cream,
  },
  dpHeaderBack: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.paper, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  dpHeaderCenter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dpHeaderTitle:  { fontSize: 16, fontWeight: '800', color: C.ink },
  dpHeaderRight:  { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  // Scroll
  datingScroll:        { flex: 1 },
  datingScrollContent: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: 32, gap: 20 },

  // Mini hero
  dpHero: {
    alignItems: 'center', gap: 8,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    padding: Spacing.md,
  },
  dpAvatarRing: {
    borderRadius: 58, borderWidth: 2.5, borderColor: Colors.terracotta, padding: 2,
  },
  dpAvatar:         { width: 108, height: 108, borderRadius: 54 },
  dpAvatarFallback: { backgroundColor: Colors.terracotta, alignItems: 'center', justifyContent: 'center' },
  dpAvatarInitials: { fontSize: 36, fontWeight: '900', color: Colors.white },
  dpHeroName:       { fontSize: 20, fontWeight: '900', color: C.ink, marginTop: 4 },
  dpHeroMeta:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dpHeroCity:       { fontSize: 12, color: C.muted, fontWeight: '500' },

  // Sections
  dpSection: {
    backgroundColor: C.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    padding: Spacing.md, gap: 4,
  },
  dpSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2,
  },
  dpSectionTitle: { fontSize: 14, fontWeight: '800', color: C.ink },
  dpSectionMeta:  { fontSize: 12, color: C.muted, fontWeight: '600' },
  dpSectionSub:   { fontSize: 12, color: C.muted, lineHeight: 17, marginBottom: 10 },

  // Bio
  dpBioCard: {
    borderWidth: 1, borderColor: C.border, borderRadius: Radius.md,
    backgroundColor: C.warmWhite, padding: 12, marginTop: 4,
  },
  dpBioCardFocused: { borderColor: 'rgba(196,98,45,0.45)' },

  // Photo grid layout
  dpPhotoGridBleed: { marginHorizontal: -Spacing.md },
  dpBioInput: {
    fontSize: 14, color: C.ink, lineHeight: 22, padding: 0,
    textAlignVertical: 'top', minHeight: 80,
  },

  // Preference blocks (inside the section card)
  dpPrefBlock: { marginTop: 12, gap: 8 },
  dpPrefLabel: { fontSize: 12, fontWeight: '700', color: C.brownMid },

  // Chips (shared)
  datingChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  datingChip: {
    borderWidth: 1, borderColor: C.border, backgroundColor: C.warmWhite,
    borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8,
  },
  datingChipActive: { borderColor: Colors.terracotta, backgroundColor: 'rgba(196,98,45,0.10)' },
  datingChipText:       { fontSize: 13, color: C.brownMid, fontWeight: '600' },
  datingChipTextActive: { color: Colors.terracotta, fontWeight: '700' },

  // Age
  dpAgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dpAgeBadge: {
    backgroundColor: 'rgba(196,98,45,0.10)', borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  dpAgeBadgeText: { fontSize: 13, fontWeight: '800', color: Colors.terracotta },
  datingSliderRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  datingSliderLabel: { fontSize: 12, color: C.muted, fontWeight: '600', width: 28 },
  datingSlider:      { flex: 1, height: 40 },

  // Visibility card
  dpVisCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    padding: Spacing.md,
  },
  dpVisLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  dpVisIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(196,98,45,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  dpVisTitle: { fontSize: 14, fontWeight: '700', color: C.ink, marginBottom: 2 },
  dpVisHint:  { fontSize: 12, color: C.muted, lineHeight: 17 },

  // Back to profile button
  dpBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.paper, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  dpBackIconWrap: {
    width: 38, height: 38, borderRadius: 11,
    backgroundColor: 'rgba(196,98,45,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  dpBackTitle: { fontSize: 14, fontWeight: '700', color: C.ink },
  dpBackSub:   { fontSize: 12, color: C.muted, marginTop: 1 },

  // Photos (shared between sections)
  datingPhotoStrip:  { flexDirection: 'row', flexWrap: 'wrap', gap: D_PHOTO_GAP, marginTop: 4, justifyContent: 'flex-start' },
  datingPhotoWrap:   { position: 'relative' },
  datingPhoto:       { width: D_PHOTO_W, height: D_PHOTO_H, borderRadius: Radius.md, backgroundColor: C.paper },
  datingPhotoEmpty:  { borderWidth: 1, borderColor: C.border, borderStyle: 'dashed' },
  datingPhotoRemoveBtn: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: C.warmWhite, borderRadius: 12,
  },
  datingPhotoAddBtn: {
    width: D_PHOTO_W, height: D_PHOTO_H, borderRadius: Radius.md,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderDark,
    backgroundColor: C.warmWhite,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  datingPhotoAddLabel: { fontSize: 11, color: C.terracotta, fontWeight: '700' },
}); }
