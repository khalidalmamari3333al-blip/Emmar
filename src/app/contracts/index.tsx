import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ContractsListScreen } from '@/screens/contracts/ContractsListScreen';

export default function ContractsRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return (
    <ContractsListScreen
      refreshKey={refreshKey}
      onOpen={(id) => router.push(`/contracts/${id}`)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))}
    />
  );
}
