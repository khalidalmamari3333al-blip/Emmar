import { router } from 'expo-router';

import { OwnerRequestsScreen } from '@/screens/owner/OwnerRequestsScreen';

export default function OwnerRequestsRoute() {
  return <OwnerRequestsScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/owner'))} />;
}
