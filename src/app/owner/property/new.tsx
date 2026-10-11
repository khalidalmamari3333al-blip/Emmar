import { router } from 'expo-router';

import { PropertyEditorScreen } from '@/screens/owner/PropertyEditorScreen';

export default function NewPropertyRoute() {
  return <PropertyEditorScreen onBack={() => router.back()} onCreated={(id) => router.replace(`/owner/property/${id}`)} />;
}
