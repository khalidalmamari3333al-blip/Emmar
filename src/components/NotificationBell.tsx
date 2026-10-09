import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { NotificationsBackend, supabaseNotifications } from '@/services/notifications';
import { colors, fonts } from '@/theme';

const POLL_MS = 60_000;

/** جرس بعدد الإشعارات غير المقروءة؛ يتحدث كل دقيقة وعند عودة التطبيق للواجهة. */
export function NotificationBell({
  onPress,
  backend,
  refreshKey = 0,
  color = colors.white,
}: {
  onPress: () => void;
  backend?: NotificationsBackend | null;
  refreshKey?: number;
  color?: string;
}) {
  const t = useT();
  const auth = useAuth();
  const [count, setCount] = useState(0);
  const signedIn = auth.status === 'signed_in';

  useEffect(() => {
    if (!signedIn) return;
    const b = backend === undefined ? supabaseNotifications() : backend;
    if (!b) return;
    let active = true;
    const load = () => b.unreadCount().then((n) => active && setCount(n), () => undefined);
    load();
    const timer = setInterval(load, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
  }, [signedIn, backend, refreshKey]);

  if (!signedIn) return null;
  const label = count ? `${t.notifications.open} (${count})` : t.notifications.open;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={10} testID="notification-bell">
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
        <Path d="M10 20a2 2 0 0 0 4 0" />
      </Svg>
      {count > 0 && (
        <View style={styles.badge} testID="notification-badge">
          <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -4, end: -6, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.sandLight },
  badgeText: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: 10 },
});
