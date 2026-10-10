import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';

import { MaintenanceScreen } from '@/screens/postStay/MaintenanceScreen';

export default function MaintenanceRoute() {
  const { booking } = useLocalSearchParams<{ booking?: string }>();
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return <MaintenanceScreen key={booking ?? 'all'} as="tenant" bookingId={booking} refreshKey={refreshKey} onBack={() => (router.canGoBack() ? router.back() : router.replace('/bookings'))} />;
}
