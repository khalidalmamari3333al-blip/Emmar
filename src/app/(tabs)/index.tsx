import { router } from 'expo-router';

import { HomeScreen } from '@/screens/HomeScreen';

export default function HomeRoute() {
  // الفئات والبحث تنتقل لشاشة البحث (تُبنى في المرحلة 3).
  return <HomeScreen onSearch={() => router.push('/search')} onCategory={() => router.push('/search')} />;
}
