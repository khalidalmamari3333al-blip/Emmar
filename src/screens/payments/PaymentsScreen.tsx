import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Gate, Notice, Pill, ScreenHeader, StatTile } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isOwnerRole, useAuth } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import { formatDate } from '@/lib/dates';
import { completeMockCheckout, isOverdue, isPayable, landlordReport, listPayments, PResult, refundDeposit, startCheckout } from '@/services/payments';
import { formatPrice } from '@/services/properties';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { CheckoutSession, Payment, PaymentStatus } from '@/types/payment';

export interface PaymentServices {
  list: (as: 'tenant' | 'landlord') => Promise<PResult<Payment[]>>;
  checkout: (id: string) => Promise<PResult<CheckoutSession>>;
  complete: (ref: string, outcome: 'succeeded' | 'failed') => Promise<PResult<string>>;
  refund: (id: string) => Promise<PResult<string>>;
}
const defaults: PaymentServices = { list: listPayments, checkout: startCheckout, complete: completeMockCheckout, refund: refundDeposit };

const TONE: Record<PaymentStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  pending: 'warn', processing: 'neutral', paid: 'good', failed: 'bad', refund_pending: 'neutral', refunded: 'neutral', cancelled: 'neutral',
};

export function MockPaymentBanner() {
  const { t } = useLocale();
  return (
    <View style={styles.banner} testID="mock-payment-warning" accessibilityRole="alert">
      <Text style={styles.bannerText}>{t.payments.mockWarning}</Text>
    </View>
  );
}

/** دفعات المستأجر (as="tenant") أو تقرير المالك (as="landlord"). */
export function PaymentsScreen({ as, services = defaults, onBack, refreshKey = 0 }: { as: 'tenant' | 'landlord'; services?: PaymentServices; onBack?: () => void; refreshKey?: number }) {
  const { t, locale } = useLocale();
  const pt = t.payments;
  const auth = useAuth();
  const [res, setRes] = useState<PResult<Payment[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [session, setSession] = useState<(CheckoutSession & { paymentId: string }) | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const allowed = !!auth.user && (as === 'tenant' || isOwnerRole(auth.user));

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    services.list(as).then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [allowed, as, services, reload, refreshKey]);

  const list = res?.ok ? res.data : [];
  const errText = (code: string) => (code === 'not_allowed' ? pt.notAllowed : code === 'invalid_state' ? pt.invalidState : code === 'provider_not_configured' ? pt.providerMissing : pt.failed);
  const money = (n: number) => `${formatPrice({ priceOmr: n })} ${t.currency}`;
  const label = (p: Payment) => (p.kind === 'rent' ? pt.rentN(p.seq) : pt.kinds[p.kind]);

  const pay = async (p: Payment) => {
    setBusy(true);
    setMsg(null);
    const r = await services.checkout(p.id);
    setBusy(false);
    if (!r.ok) return setMsg({ text: errText(r.code), tone: 'error' });
    setSession({ ...r.data, paymentId: p.id });
    setReload((n) => n + 1);
  };

  const finish = async (outcome: 'succeeded' | 'failed') => {
    if (!session) return;
    setBusy(true);
    const r = await services.complete(session.providerRef, outcome);
    setBusy(false);
    setMsg(!r.ok ? { text: errText(r.code), tone: 'error' } : r.data === 'paid' ? { text: pt.paidOk, tone: 'success' } : { text: pt.failedPay, tone: 'error' });
    if (r.ok && r.data === 'paid') setReceipt(session.paymentId);
    setSession(null);
    setReload((n) => n + 1);
  };

  const refund = async (p: Payment) => {
    setBusy(true);
    const r = await services.refund(p.id);
    setBusy(false);
    setMsg(r.ok && r.data === 'refunded' ? { text: pt.refunded, tone: 'success' } : { text: r.ok ? pt.failed : errText(r.code), tone: 'error' });
    setReload((n) => n + 1);
  };

  const report = as === 'landlord' ? landlordReport(list) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={as === 'tenant' ? pt.title : pt.ownerTitle} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={allowed} loading={auth.status === 'loading'} message={as === 'tenant' ? t.bookings.signInPrompt : t.owner.notOwner}>
        <FlatList
          data={list}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              <MockPaymentBanner />
              {report && (
                <View style={styles.tiles} testID="payments-report">
                  <StatTile label={pt.report.collected} value={money(report.collected)} />
                  <StatTile label={pt.report.outstanding} value={money(report.outstanding)} />
                  <StatTile label={pt.report.overdue} value={money(report.overdue)} />
                  <StatTile label={pt.report.depositsHeld} value={money(report.depositsHeld)} />
                </View>
              )}
              {session && (
                <View style={styles.checkout} testID="mock-checkout">
                  <Text style={styles.h3}>{pt.checkoutTitle}</Text>
                  <Text style={styles.body}>{pt.checkoutBody}</Text>
                  <Row label={pt.amount} value={money(session.amountOmr)} />
                  <Row label={pt.reference} value={ltr(session.providerRef)} />
                  <Button label={pt.simulateSuccess} onPress={() => finish('succeeded')} busy={busy} testID="simulate-success" />
                  <Button label={pt.simulateFailure} onPress={() => finish('failed')} busy={busy} variant="secondary" testID="simulate-failure" />
                </View>
              )}
              {msg && <Notice text={msg.text} tone={msg.tone} />}
              {res && !res.ok && <Notice text={t.loadError} tone="error" />}
            </View>
          }
          ListEmptyComponent={res?.ok ? <Notice text={as === 'tenant' ? pt.empty : pt.ownerEmpty} /> : null}
          renderItem={({ item: p }) => (
            <View style={styles.card} testID={`payment-${p.id}`}>
              <Pressable onPress={() => p.receiptNo && setReceipt(receipt === p.id ? null : p.id)} accessibilityRole={p.receiptNo ? 'button' : undefined}>
                <View style={styles.rowBetween}>
                  <Text style={styles.title}>{label(p)}</Text>
                  <Text style={styles.amount}>{money(p.amountOmr)}</Text>
                </View>
                <Text style={styles.meta}>
                  {[p.propertyTitle ? pick(p.propertyTitle, locale) : null, as === 'landlord' && p.tenantName ? `${pt.tenant}: ${p.tenantName}` : null, pt.due(formatDate(p.dueDate, locale))]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <View style={styles.pills}>
                  <Pill label={pt.status[p.status]} tone={TONE[p.status]} />
                  {isOverdue(p) && <Pill label={pt.overdue} tone="bad" />}
                </View>
              </Pressable>
              {receipt === p.id && p.receiptNo && (
                <View style={styles.receipt} testID={`receipt-${p.id}`}>
                  <Text style={styles.h3}>{pt.receipt}</Text>
                  <Row label={pt.receiptNo} value={ltr(p.receiptNo)} />
                  {p.paidAt && <Row label={pt.paidOn} value={formatDate(p.paidAt.slice(0, 10), locale)} />}
                  <Row label={pt.amount} value={money(p.amountOmr)} />
                  {p.providerRef && <Row label={pt.reference} value={ltr(p.providerRef)} />}
                  <Text style={styles.meta}>{pt.mockReceipt}</Text>
                </View>
              )}
              {as === 'tenant' && isPayable(p) && !session && <Button small label={`${pt.pay} ${money(p.amountOmr)}`} onPress={() => pay(p)} busy={busy} testID={`pay-${p.id}`} />}
              {as === 'landlord' && p.kind === 'deposit' && p.status === 'paid' && (
                <Button small variant="secondary" label={pt.refund} onPress={() => refund(p)} busy={busy} testID={`refund-${p.id}`} />
              )}
            </View>
          )}
        />
      </Gate>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  banner: { backgroundColor: '#FBEFD9', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  bannerText: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.text, lineHeight: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  checkout: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 2, borderColor: colors.accent, padding: spacing.md, gap: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  receipt: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  pills: { flexDirection: 'row', gap: 6, marginTop: 4 },
  title: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text },
  amount: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.primary },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: font.small, color: colors.text, lineHeight: 20 },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  value: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.text },
});
