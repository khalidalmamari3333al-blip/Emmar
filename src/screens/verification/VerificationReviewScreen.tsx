import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Gate, Notice, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isStaffRole, useAuth } from '@/lib/auth';
import { getOwnerProperty, OwnerProperty, Result } from '@/services/owner';
import { decideRequest, documentUrl, getRequest, VResult } from '@/services/verification';
import { canApprove } from '@/services/verificationRules';
import { colors, spacing } from '@/theme';
import type { Decision, VerificationRequest } from '@/types/verification';

import { ChecksList, Decisions, DocumentRow, Notices, StatusLayers, styles as part } from './parts';

export interface ReviewServices {
  get: (id: string) => Promise<VResult<VerificationRequest | null>>;
  decide: (id: string, d: Decision, reason?: string) => Promise<VResult>;
  documentUrl: (path: string) => Promise<VResult<string>>;
  property: (id: string) => Promise<Result<OwnerProperty | null>>;
}
const defaults: ReviewServices = { get: getRequest, decide: decideRequest, documentUrl, property: getOwnerProperty };

export function VerificationReviewScreen({ id, services = defaults, onBack, onDone }: { id: string; services?: ReviewServices; onBack?: () => void; onDone?: () => void }) {
  const { t, locale } = useLocale();
  const v = t.verification;
  const auth = useAuth();
  const staff = isStaffRole(auth.user);
  const [req, setReq] = useState<VerificationRequest | null | undefined>(undefined);
  const [property, setProperty] = useState<OwnerProperty | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!staff) return;
    let active = true;
    (async () => {
      const r = await services.get(id);
      const data = r.ok ? r.data : null;
      return { data, p: data?.propertyId ? await services.property(data.propertyId) : null };
    })().then(({ data, p }) => {
      if (!active) return;
      setReq(data);
      if (p?.ok) setProperty(p.data);
    });
    return () => {
      active = false;
    };
  }, [staff, id, services, reload]);

  const decide = async (d: Decision) => {
    if (d !== 'approved' && !reason.trim()) return setMsg({ text: v.reasonRequired, tone: 'error' });
    if (d === 'approved' && req?.automatedStatus === 'warning' && !reason.trim()) return setMsg({ text: v.warningReason, tone: 'error' });
    setBusy(true);
    const r = await services.decide(id, d, reason);
    setBusy(false);
    if (!r.ok)
      return setMsg({
        text: r.code === 'checks_failed' ? v.cannotApprove : r.code === 'reason_required' ? v.reasonRequired : r.code === 'not_allowed' ? v.ownRequest : v.failed,
        tone: 'error',
      });
    setMsg({ text: v.decided, tone: 'success' });
    setReason('');
    setReload((n) => n + 1);
    onDone?.();
  };

  // الخادم يرفض أيضًا؛ هنا نخفي الأزرار فقط
  const own = !!req && req.submittedBy === auth.user?.id;
  const pending = req?.status === 'submitted';
  const approvable = !!req && canApprove(req.checks, req.automatedStatus);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={v.review} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={staff} loading={auth.status === 'loading' || (staff && req === undefined)} message={v.notStaff}>
        {req === null ? (
          <Notice text={t.detail.notFound} />
        ) : req ? (
          <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
            <Text style={part.h3}>{property ? pick(property.title, locale) : req.subject === 'property' ? v.title : v.landlordSubject}</Text>
            {property && <Text style={part.meta}>{t.cities[property.city]} · {pick({ ar: property.input.districtAr, en: property.input.districtEn }, locale)}</Text>}
            <Notices />
            <StatusLayers request={req} publication={property?.status} />

            {req.subject === 'property' && (
              <View style={part.card} testID="declared">
                <Text style={part.h3}>{v.declared}</Text>
                <Row label={v.fields.deedNumber} value={req.deedNumber} />
                <Row label={v.fields.ownerName} value={req.declaredOwnerName} />
                <Row label={v.fields.plotNumber} value={req.plotNumber} />
                <Row label={v.fields.city} value={req.declaredCity ? t.cities[req.declaredCity] : undefined} />
              </View>
            )}
            {req.subject === 'landlord' && req.identityLast4 && (
              <View style={part.card}>
                <Row label={v.fields.identity} value={`•••• ${req.identityLast4}`} />
              </View>
            )}

            <View style={part.card}>
              <Text style={part.h3}>{v.documents}</Text>
              {req.documents.length === 0 && <Text style={part.meta}>—</Text>}
              {req.documents.map((d) => (
                <DocumentRow key={d.id} doc={d} open={services.documentUrl} onError={(text) => setMsg({ text, tone: 'error' })} />
              ))}
            </View>

            <ChecksList checks={req.checks} />
            <Decisions request={req} />
            <Notice text={v.aiNote} />

            {pending && !own && (
              <View style={part.card}>
                <Field label={v.reason} value={reason} onChangeText={setReason} multiline maxLength={1000} testID="decision-reason" />
                {!approvable && <Notice text={v.cannotApprove} tone="error" />}
                <Button label={v.approve} onPress={() => decide('approved')} busy={busy} disabled={!approvable} testID="approve" />
                <Button label={v.needsInfo} onPress={() => decide('needs_info')} busy={busy} variant="secondary" testID="needs-info" />
                <Button label={v.reject} onPress={() => decide('rejected')} busy={busy} variant="ghost" testID="reject" />
              </View>
            )}
            {own && <Notice text={v.ownRequest} />}
            {msg && <Notice text={msg.text} tone={msg.tone} />}
          </ScrollView>
        ) : null}
      </Gate>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <View style={part.rowBetween}>
      <Text style={part.label}>{label}</Text>
      <Text style={part.checkLabel}>{value || '—'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
});
