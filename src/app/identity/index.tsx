import { router } from 'expo-router';

import { IdentityScreen } from '@/screens/identity/IdentityScreen';

export default function IdentityRoute() {
  return <IdentityScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} onManual={() => router.push('/owner/verify/account')} />;
}
