import { router } from 'expo-router';

import { NotificationsScreen } from '@/screens/NotificationsScreen';

export default function NotificationsRoute() {
  return (
    <NotificationsScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onNavigate={(route) => router.push(route as '/bookings')}
      onSignIn={() => router.push('/account')}
    />
  );
}
