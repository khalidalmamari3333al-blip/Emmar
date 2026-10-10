import { router } from 'expo-router';

import { VerificationScreen } from '@/screens/verification/VerificationScreen';

export default function VerifyLandlordRoute() {
  return <VerificationScreen subject="landlord" onBack={() => (router.canGoBack() ? router.back() : router.replace('/owner'))} />;
}
