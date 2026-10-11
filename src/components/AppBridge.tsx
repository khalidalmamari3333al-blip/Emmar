import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { enablePush, onNotificationTap } from '@/lib/push';
import { NotificationKind, targetRoute } from '@/services/notifications';

/** يربط الحساب بالجهاز: لغة الإشعارات، تسجيل رمز الهاتف إن سُمح مسبقًا، وفتح الشاشة عند الضغط على إشعار. */
export function AppBridge() {
  const { locale } = useLocale();
  const auth = useAuth();
  const userId = auth.status === 'signed_in' ? auth.user?.id : undefined;
  const { updateProfile } = auth;

  // إشعارات الهاتف تصل بلغة التطبيق الحالية
  useEffect(() => {
    if (userId) updateProfile({ preferredLocale: locale }).catch(() => undefined);
  }, [userId, locale, updateProfile]);

  useEffect(() => {
    if (userId && Platform.OS !== 'web') enablePush(false).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    return onNotificationTap((kind) => router.push(kind ? targetRoute(kind as NotificationKind) : '/notifications'));
  }, []);

  return null;
}
