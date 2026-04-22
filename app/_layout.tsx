import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '../constants/theme';
import * as SplashScreen from 'expo-splash-screen';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    const hide = async () => {
      await SplashScreen.hideAsync();
    };
    void hide();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="profile-setup" />
        <Stack.Screen name="terms-accept" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        {/* OAuth callback — must be outside (auth) group so the deep-link scheme routes here */}
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="group/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="member/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="group/chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="event/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="chat/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notification-inbox" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="connections-settings" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="privacy-safety" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="privacy-policy" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="terms" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="help-feedback" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="agent-review" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="agent-group-proposal/[id]" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}
