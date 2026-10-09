import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusNotice } from '@/components/StatusNotice';
import { pick, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { BookingStatus, cancelBooking, CancelResult, canCancel, listMyBookings, MyBooking } from '@/services/bookings';
import { DataResult, formatPrice } from '@/services/properties';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';
import { FadeIn, stagger } from '@/components/motion';

const STATUS_COLOR: Record<BookingStatus, { bg: string; fg: string }> = {
  pending: { bg: '#FBEFD9', fg: colors.clay },
  confirmed: { bg: colors.successLight, fg: colors.success },
  rejected: { bg: '#F3DEDB', fg: colors.danger },
  cancelled: { bg: '#ECE8E3', fg: colors.textMuted },
  expired: { bg: '#ECE8E3', fg: colors.textMuted },
};

export interface BookingsScreenProps {
  load?: (userId: string) => Promise<DataResult<MyBooking[]>>;
  cancel?: (id: string) => Promise<CancelResult>;
  onSignIn?: () => void;
  onOpenProperty?: (id: string) => void;
  /** يتغير عند عودة المستخدم للتبويب لإعادة التحميل */
  refreshKey?: number;
}

export function BookingsScreen({ load = listMyBookings, cancel = cancelBooking, onSignIn = () => {}, onOpenProperty = () => {}, refreshKey = 0 }: BookingsScreenProps) {
  const { t } = useLocale();
  const auth = useAuth();
  const userId = auth.user?.id;
  const [result, setResult] = useState<{ key: string; data: DataResult<MyBooking[]> } | null>(null);
  const [reload, setReload] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const key = `${userId}|${refreshKey}|${reload}`;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    load(userId).then((r) => {
      if (!active) return;
      setResult({ key, data: r });
      setRefreshing(false);
    });
    return () => {
      active = false;
    };
  }, [userId, key, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setReload((n) => n + 1);
  }, []);

  const current = result?.key === key || refreshing ? result?.data ?? null : null;

  let body;
  if (auth.status === 'not_configured') body = <Text style={styles.notice}>{t.notConfigured}</Text>;
  else if (auth.status === 'loading') body = <StatusNotice result={null} />;
  else if (auth.status === 'signed_out')
    body = (
      <View style={styles.center}>
        <Text style={styles.notice}>{t.bookings.signInPrompt}</Text>
        <Pressable style={styles.cta} onPress={onSignIn} accessibilityRole="button">
          <Text style={styles.ctaText}>{t.bookings.signInCta}</Text>
        </Pressable>
      </View>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{t.bookings.title}</Text>
      {body ?? (
        <FlatList
          data={current?.status === 'ok' ? current.data : []}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
          ListHeaderComponent={<StatusNotice result={current} />}
          ListEmptyComponent={current?.status === 'ok' ? <Text style={styles.notice}>{t.bookings.empty}</Text> : null}
          renderItem={({ item, index }) => (
            <FadeIn delay={stagger(index)}>
              <BookingCard booking={item} cancel={cancel} onChanged={() => setReload((n) => n + 1)} onOpenProperty={onOpenProperty} />
            </FadeIn>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function BookingCard({ booking: b, cancel, onChanged, onOpenProperty }: { booking: MyBooking; cancel: (id: string) => Promise<CancelResult>; onChanged: () => void; onOpenProperty: (id: string) => void }) {
  const { t, locale } = useLocale();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const c = STATUS_COLOR[b.status];
  const months = Math.round((Date.parse(b.end) - Date.parse(b.start)) / (30.44 * 864e5));

  const doCancel = async () => {
    setBusy(true);
    const r = await cancel(b.id);
    setBusy(false);
    setConfirming(false);
    if (r.status === 'ok') onChanged();
    else setError(true);
  };

  return (
    <View style={styles.card} testID={`booking-${b.id}`}>
      <View style={styles.cardTop}>
        <Pressable disabled={!b.propertyId} onPress={() => b.propertyId && onOpenProperty(b.propertyId)} style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {b.propertyTitle ? pick(b.propertyTitle, locale) : t.bookings.unknownProperty}
          </Text>
        </Pressable>
        <View style={[styles.pill, { backgroundColor: c.bg }]}>
          <Text style={[styles.pillText, { color: c.fg }]}>{t.bookings.status[b.status]}</Text>
        </View>
      </View>
      {b.bedCode && (
        <Text style={styles.meta}>
          {[
            t.beds.bed(b.bedCode),
            b.roomCode && t.beds.room(b.roomCode),
            b.floorLevel != null && t.beds.floorLabel(b.floorLevel),
            b.buildingName && pick(b.buildingName, locale),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
      <Text style={styles.meta}>
        {formatDate(b.start, locale)} {locale === 'ar' ? '←' : '→'} {formatDate(b.end, locale)}
      </Text>
      {b.monthlyPriceOmr != null && (
        <Text style={styles.price}>
          {formatPrice({ priceOmr: b.monthlyPriceOmr })} {t.currency} {t.beds.perMonth} · {t.beds.total}: {formatPrice({ priceOmr: b.monthlyPriceOmr * months })} {t.currency}
        </Text>
      )}
      {b.status === 'pending' && b.expiresAt && (
        <Text style={styles.hold}>{t.bookings.pendingUntil(formatDate(b.expiresAt.slice(0, 10), locale))}</Text>
      )}
      {error && <Text style={styles.error}>{t.bookings.cancelFailed}</Text>}
      {canCancel(b) &&
        (confirming ? (
          <View style={styles.actions}>
            <Pressable style={[styles.danger, busy && { opacity: 0.6 }]} disabled={busy} onPress={doCancel} accessibilityRole="button">
              <Text style={styles.dangerText}>{t.bookings.confirmCancel}</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setConfirming(false)} accessibilityRole="button">
              <Text style={styles.secondaryText}>{t.bookings.keep}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.secondary} onPress={() => setConfirming(true)} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: colors.danger }]}>{t.bookings.cancel}</Text>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  title: { fontFamily: fonts.display, fontSize: font.title, color: colors.text, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  center: { alignItems: 'center', padding: spacing.lg, gap: spacing.md },
  notice: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, textAlign: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  cta: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.xl },
  ctaText: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: font.body },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 4, ...shadow },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  price: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.primary },
  hold: { fontFamily: fonts.body, fontSize: font.small, color: colors.clay },
  error: { fontFamily: fonts.body, fontSize: font.small, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  danger: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: spacing.md },
  dangerText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: font.small },
  secondary: { alignSelf: 'flex-start', marginTop: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: spacing.md },
  secondaryText: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: font.small },
});
