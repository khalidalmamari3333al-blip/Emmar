import { router } from 'expo-router';

import { HomeScreen } from '@/screens/HomeScreen';

export default function HomeRoute() {
  return (
    <HomeScreen
      onSearch={() => router.push('/search')}
      onCategory={(kind) => router.push({ pathname: '/search', params: { kind } })}
      onOpen={(id) => router.push(`/property/${id}`)}
      onNotifications={() => router.push('/notifications')}
    />
  );
}
