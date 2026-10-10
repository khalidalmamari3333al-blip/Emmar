import { router, useLocalSearchParams } from 'expo-router';

import { VerificationScreen } from '@/screens/verification/VerificationScreen';

export default function VerifyPropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VerificationScreen key={id} subject="property" propertyId={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/owner'))} />;
}
