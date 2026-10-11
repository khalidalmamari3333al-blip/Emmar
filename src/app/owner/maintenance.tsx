import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { MaintenanceScreen } from '@/screens/postStay/MaintenanceScreen';

export default function OwnerMaintenanceRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return <MaintenanceScreen as="landlord" refreshKey={refreshKey} onBack={() => (router.canGoBack() ? router.back() : router.replace('/owner'))} />;
}
