import { useEffect, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isOwnerRole, useAuth } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import { formatDate } from '@/lib/dates';
import { BookingStatus } from '@/services/bookings';
import { decideRequest, listOwnerRequests, OwnerRequest, Result, whatsappLink } from '@/services/owner';
import { formatPrice } from '@/services/properties';
import { colors, font, radius, shadow, spacing } from '@/theme';

type Tab = 'pending' | 'confirmed' | 'other';
const tabOf = (s: BookingStatus): Tab => (s === 'pending' ? 'pending' : s === 'confirmed' ? 'confirmed' : 'other');
const TONE = { pending: 'warn', confirmed: 'good', rejected: 'bad', cancelled: 'neutral', expired: 'neutral' } as const;

export interface OwnerRequestsProps {
  load?: () => Promise<Result<OwnerRequest[]>>;
  decide?: (id: string, status: 'confirmed' | 'rejected' | 'cancelled') => Promise<Result>;
  openUrl?: (url: string) => void;
  onBack?: () => void;
}

export function OwnerRequestsScreen({ load = listOwnerRequests, decide = decideRequest, openUrl = (u) => Linking.openURL(u), onBack }: OwnerRequestsProps) {
  const { t } = useLocale();
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [res, setRes] = useState<Result<OwnerRequest[]> | null>(null);
  const [reload, setReload] = useState(0);
  const allowed = isOwnerRole(auth.user);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    load().then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [allowed, load, reload]);

  const all = res?.ok ? res.data : [];
  const count = (x: Tab) => all.filter((r) => tabOf(r.status) === x).length;
  const items = all.filter((r) => tabOf(r.status) === tab);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t.requests.title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={allowed} loading={auth.status === 'loading'} message={t.owner.notOwner}>
        <View style={{ paddingHorizontal: spacing.lg }}>
          <ChipGroup
            testID="requests-tab"
            value={tab}
            onChange={(v) => v && setTab(v)}
            options={(['pending', 'confirmed', 'other'] as Tab[]).map((x) => ({ value: x, label: `${t.requests.tabs[x]} (${count(x)})` }))}
          />
        </View>
        {!res && <Notice text="…" />}
        {res && !res.ok && <Notice text={res.code === 'not_configured' ? t.notConfigured : t.loadError} tone="error" />}
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={res?.ok ? <Notice text={t.requests.empty} /> : null}
          renderItem={({ item }) => <RequestCard r={item} decide={decide} openUrl={openUrl} onChanged={() => setReload((n) => n + 1)} />}
        />
      </Gate>
    </SafeAreaView>
  );
}

function RequestCard({ r, decide, openUrl, onChanged }: { r: OwnerRequest; decide: OwnerRequestsProps['decide'] & {}; openUrl: (u: string) => void; onChanged: () => void }) {
  const { t, locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const months = Math.round((Date.parse(r.end) - Date.parse(r.start)) / (30.44 * 864e5));
  const wa = r.requesterPhone ? whatsappLink(r.requesterPhone) : null;

  const run = async (status: 'confirmed' | 'rejected' | 'cancelled') => {
    setBusy(true);
    setError(false);
    const res = await decide(r.id, status);
    setBusy(false);
    if (res.ok) onChanged();
    else setError(true);
  };

  return (
    <View style={styles.card} testID={`request-${r.id}`}>
      <View style={styles.top}>
        <Text style={styles.title} numberOfLines={2}>
          {pick(r.propertyTitle, locale)}
        </Text>
        <Pill label={t.bookings.status[r.status]} tone={TONE[r.status]} />
      </View>
      <Text style={styles.meta}>
        {t.beds.bed(r.bedCode)} · {t.beds.room(r.roomCode)} · {t.beds.floorLabel(r.floorLevel)} · {pick(r.buildingName, locale)}
      </Text>
      <Text style={styles.meta}>
        {formatDate(r.start, locale)} {locale === 'ar' ? '←' : '→'} {formatDate(r.end, locale)} ({t.beds.months(months)})
      </Text>
      {r.monthlyPriceOmr != null && (
        <Text style={styles.price}>
          {formatPrice({ priceOmr: r.monthlyPriceOmr })} {t.currency} × {months} = {formatPrice({ priceOmr: r.monthlyPriceOmr * months })} {t.currency}
        </Text>
      )}
      <View style={styles.person}>
        <Text style={styles.meta}>
          {t.requests.requester}: <Text style={styles.name}>{r.requesterName || t.requests.noName}</Text>
          {r.requesterPhone ? ` · ${ltr(r.requesterPhone)}` : ''}
        </Text>
        {r.requesterPhone && (
          <View style={styles.actions}>
            {wa && <Button small variant="secondary" label={t.requests.whatsapp} onPress={() => openUrl(wa)} />}
            <Button small variant="ghost" label={t.requests.call} onPress={() => openUrl(`tel:${r.requesterPhone}`)} />
          </View>
        )}
      </View>
      {r.status === 'pending' && (
        <View style={styles.actions}>
          <Button label={t.requests.approve} onPress={() => run('confirmed')} busy={busy} style={{ flex: 1 }} testID={`approve-${r.id}`} />
          <Button label={t.requests.reject} onPress={() => run('rejected')} disabled={busy} variant="danger" style={{ flex: 1 }} testID={`reject-${r.id}`} />
        </View>
      )}
      {r.status === 'confirmed' && <Button label={t.requests.cancel} onPress={() => run('cancelled')} busy={busy} variant="danger" small />}
      {error && <Notice text={t.requests.actionFailed} tone="error" />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6, ...shadow },
  top: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { flex: 1, fontSize: font.body, fontWeight: '800', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  price: { fontSize: font.small, color: colors.primary, fontWeight: '700' },
  person: { backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm, gap: 6 },
  name: { color: colors.text, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: 4 },
});
