import { router, useLocalSearchParams } from 'expo-router';

import { PropertyDetailScreen } from '@/screens/PropertyDetailScreen';

export default function PropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PropertyDetailScreen
      id={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onChooseBed={() => router.push(`/property/${id}/beds`)}
    />
  );
}
