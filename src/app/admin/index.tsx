import { router } from 'expo-router';

import { AdminScreen } from '@/screens/admin/AdminScreen';

export default function AdminRoute() {
  return <AdminScreen onBack={() => (router.canGoBack() ? router.back() : router.replace('/account'))} onOpenProperty={(id) => router.push(`/owner/property/${id}`)} />;
}
