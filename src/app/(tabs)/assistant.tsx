import { router } from 'expo-router';

import { AssistantScreen } from '@/screens/AssistantScreen';

export default function AssistantRoute() {
  return <AssistantScreen onOpenProperty={(id) => router.push(`/property/${id}`)} onSignIn={() => router.push('/account')} />;
}
