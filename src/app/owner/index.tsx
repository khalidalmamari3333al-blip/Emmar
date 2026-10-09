import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { OwnerDashboardScreen } from '@/screens/owner/OwnerDashboardScreen';

export default function OwnerRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return (
    <OwnerDashboardScreen
      refreshKey={refreshKey}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
      onAdd={() => router.push('/owner/property/new')}
      onEdit={(id) => router.push(`/owner/property/${id}`)}
      onRequests={() => router.push('/owner/requests')}
    />
  );
}
