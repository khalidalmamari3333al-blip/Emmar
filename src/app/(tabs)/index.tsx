import { router } from 'expo-router';

import type { DemoRole } from '@/demo/store';
import { useAuth } from '@/lib/auth';
import { HomeScreen } from '@/screens/HomeScreen';

/** جولة المستثمرين (وضع العرض فقط): كل خطوة تدخل بالحساب المناسب وتفتح الشاشة. */
const TOUR: { role: DemoRole; route: string }[] = [
  { role: 'user', route: '/property/mock-9/beds' },
  { role: 'owner', route: '/owner/requests' },
  { role: 'user', route: '/notifications' },
  { role: 'user', route: '/assistant' },
  { role: 'admin', route: '/admin' },
];

export default function HomeRoute() {
  const auth = useAuth();
  return (
    <HomeScreen
      onSearch={() => router.push('/search')}
      onCategory={(kind) => router.push({ pathname: '/search', params: { kind } })}
      onOpen={(id) => router.push(`/property/${id}`)}
      onNotifications={() => router.push('/notifications')}
      onTour={
        auth.demo
          ? async (i) => {
              await auth.signInAs(TOUR[i].role);
              router.push(TOUR[i].route as '/notifications');
            }
          : undefined
      }
    />
  );
}
