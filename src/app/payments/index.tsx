import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { PaymentsScreen } from '@/screens/payments/PaymentsScreen';

export default function PaymentsRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return <PaymentsScreen as="tenant" refreshKey={refreshKey} onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} />;
}
