import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { VerificationQueueScreen } from '@/screens/verification/VerificationQueueScreen';

export default function VerificationQueueRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return (
    <VerificationQueueScreen
      refreshKey={refreshKey}
      onOpen={(id) => router.push(`/verify/${id}`)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
    />
  );
}
