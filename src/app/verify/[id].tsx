import { router, useLocalSearchParams } from 'expo-router';

import { VerificationReviewScreen } from '@/screens/verification/VerificationReviewScreen';

export default function VerificationReviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <VerificationReviewScreen key={id} id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace('/verify'))} />;
}
