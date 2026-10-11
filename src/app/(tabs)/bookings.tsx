import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { BookingsScreen } from '@/screens/BookingsScreen';

export default function BookingsRoute() {
  const [refreshKey, setRefreshKey] = useState(0);
  // إعادة التحميل كلما عاد المستخدم لهذا التبويب (مثلًا بعد إرسال طلب جديد).
  useFocusEffect(useCallback(() => setRefreshKey((n) => n + 1), []));
  return <BookingsScreen refreshKey={refreshKey} onSignIn={() => router.push('/account')} onOpenProperty={(id) => router.push(`/property/${id}`)} />;
}
