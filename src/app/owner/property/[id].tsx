import { router, useLocalSearchParams } from 'expo-router';

import { PropertyEditorScreen } from '@/screens/owner/PropertyEditorScreen';

export default function EditPropertyRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PropertyEditorScreen
      key={id}
      propertyId={id}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/owner'))}
      onPreview={(pid) => router.push(`/property/${pid}`)}
    />
  );
}
