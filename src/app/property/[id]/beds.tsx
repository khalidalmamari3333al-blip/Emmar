import { router, useLocalSearchParams } from 'expo-router';

import { BedPickerScreen } from '@/screens/BedPickerScreen';

export default function BedsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BedPickerScreen propertyId={id} onBack={() => (router.canGoBack() ? router.back() : router.replace(`/property/${id}`))} />;
}
