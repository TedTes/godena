import { Redirect } from 'expo-router';

// DEV BYPASS: skip auth, go straight to app
// Change href back to "/onboarding" to restore the full flow
export default function Index() {
  return <Redirect href="/(tabs)/home" />;
}
