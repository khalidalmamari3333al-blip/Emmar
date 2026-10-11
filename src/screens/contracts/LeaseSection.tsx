import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button, Field, Notice, Pill } from '@/components/ui';
import { useLocale } from '@/i18n';
import { CResult, getLeaseRegistration, LeaseRegistration, LeaseStatus, updateLeaseRegistration } from '@/services/contracts';
import { colors, font, fonts, radius, spacing } from '@/theme';

export interface LeaseServices {
  get: (contractId: string) => Promise<CResult<LeaseRegistration | null>>;
  update: (contractId: string, status: LeaseStatus, reference?: string, notes?: string) => Promise<CResult>;
}
const defaults: LeaseServices = { get: getLeaseRegistration, update: updateLeaseRegistration };
const TONE: Record<LeaseStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { not_submitted: 'neutral', preparing: 'warn', submitted: 'warn', registered: 'good', rejected: 'bad' };

/** حالة التسجيل الرسمي لدى البلدية — منفصلة تمامًا عن التوقيع في التطبيق. */
export function LeaseSection({ contractId, role, services = defaults }: { contractId: string; role: 'landlord' | 'tenant' | 'admin' | null; services?: LeaseServices }) {
  const { t } = useLocale();
  const l = t.lease;
  const [lease, setLease] = useState<LeaseRegistration | null>(null);
  const [reload, setReload] = useState(0);
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  useEffect(() => {
    let active = true;
    services.get(contractId).then((r) => active && setLease(r.ok ? r.data : null));
    return () => {
      active = false;
    };
  }, [contractId, services, reload]);

  if (!lease) return null;

  const move = async (status: LeaseStatus) => {
    setBusy(true);
    const r = await services.update(contractId, status, reference, notes);
    setBusy(false);
    setMsg(r.ok ? { text: l.updated, tone: 'success' } : { text: r.code === 'reason_required' ? l.referenceRequired : r.code === 'not_allowed' ? l.onlyPlatform : l.failed, tone: 'error' });
    if (r.ok) setReload((n) => n + 1);
  };

  const landlordCan = role === 'landlord' && ['not_submitted', 'preparing', 'rejected'].includes(lease.status);
  const adminCan = role === 'admin' && lease.status === 'submitted';

  return (
    <View style={styles.card} testID="lease-registration">
      <View style={styles.row}>
        <Text style={styles.h3}>{l.title}</Text>
        <Pill label={l.status[lease.status]} tone={TONE[lease.status]} />
      </View>
      <Text style={styles.body}>{l.notice}</Text>
      <Text style={styles.meta}>
        {l.authority[lease.authority]}
        {lease.referenceNo ? ` · ${l.reference}: ${lease.referenceNo}` : ''}
      </Text>
      {lease.notes ? <Text style={styles.meta}>{lease.notes}</Text> : null}
      {lease.status !== 'registered' && (
        <>
          <Text style={styles.label}>{l.checklistTitle}</Text>
          {l.checklist.map((c) => (
            <Text key={c} style={styles.meta}>
              • {c}
            </Text>
          ))}
          <Notice text={l.manualNote} />
        </>
      )}
      {landlordCan && (
        <>
          {lease.status !== 'preparing' && <Button small variant="secondary" label={l.prepare} onPress={() => move('preparing')} busy={busy} testID="lease-prepare" />}
          <Field label={l.reference} value={reference} onChangeText={setReference} testID="lease-reference" />
          <Field label={l.notes} value={notes} onChangeText={setNotes} />
          <Button small label={l.submit} onPress={() => move('submitted')} busy={busy} testID="lease-submit" />
          <Text style={styles.meta}>{l.onlyPlatform}</Text>
        </>
      )}
      {adminCan && (
        <View style={styles.row}>
          <Button small label={l.confirm} onPress={() => move('registered')} busy={busy} testID="lease-confirm" />
          <Button small variant="ghost" label={l.reject} onPress={() => move('rejected')} busy={busy} />
        </View>
      )}
      {msg && <Notice text={msg.text} tone={msg.tone} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text, flexShrink: 1 },
  body: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.text, lineHeight: 20 },
  label: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.textMuted },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
});
