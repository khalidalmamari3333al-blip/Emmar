import { router } from 'expo-router';

import { PrivacyScreen } from '@/screens/privacy/PrivacyScreen';

export default function PrivacyRoute() {
  return <PrivacyScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />;
}
