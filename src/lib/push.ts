import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase';

export type PushStatus = 'enabled' | 'denied' | 'unsupported' | 'not_ready' | 'error';

// يُعرض الإشعار حتى لو كان التطبيق مفتوحًا
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let currentToken: string | null = null;

/** معرّف مشروع EAS مطلوب لإصدار رمز Expo Push. يُضاف بـ `eas init`. */
export function easProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * يفعّل إشعارات الهاتف لهذا الجهاز. `prompt=false` يسجّل فقط إن كان الإذن ممنوحًا مسبقًا
 * (لا نزعج المستخدم بطلب الإذن تلقائيًا).
 */
export async function enablePush(prompt: boolean): Promise<PushStatus> {
  if (Platform.OS === 'web' || !Device.isDevice) return 'unsupported';
  const projectId = easProjectId();
  if (!projectId) return 'not_ready';
  const sb = getSupabase();
  if (!sb) return 'not_ready';
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Aqari Oman', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && prompt) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await sb.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    if (error) return 'error';
    currentToken = token;
    return 'enabled';
  } catch {
    return 'error';
  }
}

/** يُستدعى قبل تسجيل الخروج حتى لا تصل إشعارات الحساب لجهاز خرج منه. */
export async function unregisterDevice(): Promise<void> {
  const sb = getSupabase();
  if (!sb || !currentToken) return;
  await sb.rpc('unregister_push_token', { p_token: currentToken }).then(
    () => undefined,
    () => undefined,
  );
  currentToken = null;
}

/** عند الضغط على إشعار: يعيد نوعه لتوجيه المستخدم للشاشة المناسبة. */
export function onNotificationTap(handler: (kind: string | undefined) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const data = r.notification.request.content.data as { kind?: string } | undefined;
    handler(data?.kind);
  });
  return () => sub.remove();
}
