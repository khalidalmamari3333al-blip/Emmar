import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Notice, ScreenHeader } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { AppNotification, isOwnerKind, notificationText, NotificationsBackend, supabaseNotifications, targetRoute, timeAgo } from '@/services/notifications';
import { colors, font, radius, spacing } from '@/theme';

export interface NotificationsScreenProps {
  backend?: NotificationsBackend | null;
  onNavigate?: (route: string) => void;
  onBack?: () => void;
  onSignIn?: () => void;
  now?: number;
}

export function NotificationsScreen({ backend, onNavigate = () => {}, onBack, onSignIn = () => {}, now }: NotificationsScreenProps) {
  const { t, locale } = useLocale();
  const auth = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);
  const signedIn = auth.status === 'signed_in';
  const b = backend === undefined ? supabaseNotifications() : backend;

  useEffect(() => {
    if (!signedIn || !b) return;
    let active = true;
    b.list().then(
      (list) => active && setItems(list),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, backend]);

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
      await b?.markRead([n.id]).catch(() => undefined);
    }
    onNavigate(targetRoute(n.kind));
  };

  const markAll = async () => {
    await b?.markAllRead().catch(() => undefined);
    setItems((cur) => cur?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? null);
  };

  const unread = items?.filter((n) => !n.readAt).length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t.notifications.title} onBack={onBack} backLabel={t.detail.back} />
      {!signedIn ? (
        <View style={styles.center}>
          <Notice text={auth.status === 'demo' ? t.auth.demoMode : t.notifications.signInPrompt} />
          {auth.status === 'signed_out' && <Button label={t.bookings.signInCta} onPress={onSignIn} />}
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              {failed && <Notice text={t.loadError} tone="error" />}
              {!items && !failed && <Notice text="…" />}
              {unread > 0 && <Button small variant="ghost" label={t.notifications.markAllRead} onPress={markAll} testID="mark-all-read" />}
            </>
          }
          ListEmptyComponent={items ? <Notice text={t.notifications.empty} /> : null}
          renderItem={({ item }) => {
            const { title, body } = notificationText(item, t, locale);
            return (
              <Pressable onPress={() => open(item)} style={[styles.item, !item.readAt && styles.unread]} accessibilityRole="button" testID={`notification-${item.id}`}>
                <View style={[styles.dot, { backgroundColor: item.readAt ? 'transparent' : isOwnerKind(item.kind) ? colors.accent : colors.primary }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.title, !item.readAt && { fontWeight: '800' }]}>{title}</Text>
                  <Text style={styles.body}>{body}</Text>
                  <Text style={styles.time}>{timeAgo(item.createdAt, t, now)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  list: { padding: spacing.lg, gap: spacing.sm },
  item: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  unread: { borderColor: colors.sand, backgroundColor: '#FFFCF7' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  title: { fontSize: font.body, fontWeight: '600', color: colors.text },
  body: { fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
  time: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
