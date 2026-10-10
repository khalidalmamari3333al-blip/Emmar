import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Field, Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import { contractSha256 } from '@/services/contractRender';
import { cancelContract, canSign, CResult, getContract, myRole, reviseContract, signContract } from '@/services/contracts';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { Contract, ContractStatus } from '@/types/contract';

export interface ContractServices {
  get: (id: string) => Promise<CResult<Contract | null>>;
  sign: (c: Contract) => Promise<CResult<ContractStatus>>;
  revise: (id: string, note?: string) => Promise<CResult<number>>;
  cancel: (id: string, reason: string) => Promise<CResult>;
}
const defaults: ContractServices = { get: getContract, sign: signContract, revise: reviseContract, cancel: cancelContract };

const TONE = { pending_tenant: 'warn', pending_landlord: 'warn', completed: 'good', cancelled: 'neutral' } as const;

/** شريط التحذير يظهر دائمًا في أعلى العقد ولا يمكن إخفاؤه. */
export function MockSignatureBanner() {
  const { t } = useLocale();
  return (
    <View style={styles.banner} testID="mock-signature-warning" accessibilityRole="alert">
      <Text style={styles.bannerText}>{t.contracts.mockWarning}</Text>
    </View>
  );
}

export function ContractScreen({ id, services = defaults, onBack }: { id: string; services?: ContractServices; onBack?: () => void }) {
  const { t, locale } = useLocale();
  const c = t.contracts;
  const auth = useAuth();
  const [contract, setContract] = useState<Contract | null | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [lang, setLang] = useState<'ar' | 'en'>(locale);
  const [localOk, setLocalOk] = useState<{ sha: string; ok: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const signedIn = !!auth.user;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    services.get(id).then((r) => active && setContract(r.ok ? r.data : null));
    return () => {
      active = false;
    };
  }, [id, services, signedIn, reload]);

  const version = contract?.versions.find((v) => v.versionNo === contract.currentVersion);

  // التطبيق يعيد حساب البصمة من النص المعروض ليتأكد أنه نفسه المخزّن
  useEffect(() => {
    if (!version) return;
    let active = true;
    contractSha256(version.bodyAr, version.bodyEn).then((sha) => active && setLocalOk({ sha: version.sha256, ok: sha === version.sha256 }));
    return () => {
      active = false;
    };
  }, [version]);

  const errText = (code: string) =>
    code === 'fingerprint_mismatch' ? c.fingerprintMismatch : code === 'not_your_turn' ? c.notYourTurn : code === 'unchanged' ? c.unchanged : code === 'reason_required' ? t.verification.reasonRequired : c.failed;

  const act = async <T,>(fn: () => Promise<CResult<T>>, success: (d: T) => string) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setConfirming(false);
    setMsg(r.ok ? { text: success(r.data), tone: 'success' } : { text: errText(r.code), tone: 'error' });
    setReload((n) => n + 1);
  };

  const role = contract ? myRole(contract, auth.user?.id) : null;
  const mayRevise = contract && role === 'landlord' && contract.status === 'pending_tenant';
  const open = contract && (contract.status === 'pending_tenant' || contract.status === 'pending_landlord');
  const fmt = (d: string) => new Date(d).toLocaleString(locale === 'ar' ? 'ar-OM' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={c.title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={signedIn} loading={auth.status === 'loading' || (signedIn && contract === undefined)} message={t.bookings.signInPrompt}>
        {contract === null ? (
          <Notice text={t.detail.notFound} />
        ) : contract && version ? (
          <ScrollView contentContainerStyle={styles.content}>
            <MockSignatureBanner />
            <View style={styles.rowBetween}>
              <Text style={styles.h2}>{contract.propertyTitle ? pick(contract.propertyTitle, locale) : c.title}</Text>
              <Pill label={c.status[contract.status]} tone={TONE[contract.status]} />
            </View>
            <Text style={styles.meta}>
              {c.version(version.versionNo)}
              {version.note ? ` · ${c.versionNote}: ${version.note}` : ''}
            </Text>

            <ChipGroup testID="contract-lang" value={lang} onChange={(v) => v && setLang(v)} options={[{ value: 'ar' as const, label: 'العربية' }, { value: 'en' as const, label: 'English' }]} />
            <View style={styles.paper} testID="contract-text">
              <Text style={[styles.body, { writingDirection: lang === 'ar' ? 'rtl' : 'ltr', textAlign: lang === 'ar' ? 'right' : 'left' }]}>{lang === 'ar' ? version.bodyAr : version.bodyEn}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>{contract.finalSha256 ? c.finalFingerprint : c.fingerprint}</Text>
              <Text style={styles.hash} selectable testID="contract-sha">
                {ltr(contract.finalSha256 ?? version.sha256)}
              </Text>
              {localOk?.sha === version.sha256 && (localOk.ok ? <Text style={styles.ok}>{c.verifiedLocally}</Text> : <Notice text={c.fingerprintMismatch} tone="error" />)}
            </View>

            <View style={styles.card} testID="signatures">
              <Text style={styles.h3}>{c.signatures}</Text>
              {(['tenant', 'landlord'] as const).map((r) => {
                const s = contract.signatures.find((x) => x.role === r && x.versionNo === version.versionNo);
                return (
                  <View key={r} style={styles.rowBetween}>
                    <Text style={styles.label}>{c.roles[r]}</Text>
                    <Text style={s ? styles.ok : styles.meta}>{s ? `✓ ${c.signedAt(fmt(s.signedAt))} · ${t.verification.mockTag}` : c.notSigned}</Text>
                  </View>
                );
              })}
            </View>

            {contract.status === 'completed' && <Notice text={c.completedNote} tone="success" />}
            {contract.status === 'cancelled' && contract.cancelledReason && <Notice text={`${c.cancelled} ${contract.cancelledReason}`} />}
            {open && !canSign(contract, auth.user?.id) && role && <Notice text={c.waitingOther} />}

            {msg && <Notice text={msg.text} tone={msg.tone} />}
            {canSign(contract, auth.user?.id) && (
              <>
                {confirming && <Notice text={c.confirmSign} />}
                <Button
                  label={c.sign}
                  busy={busy}
                  disabled={!localOk?.ok}
                  testID="sign-contract"
                  onPress={() => (confirming ? act(() => services.sign(contract), () => c.signed) : setConfirming(true))}
                />
              </>
            )}
            {mayRevise && <Button label={c.revise} onPress={() => act(() => services.revise(contract.id), (n) => c.revised(n))} busy={busy} variant="secondary" testID="revise-contract" />}
            {open && role && (
              <View style={styles.card}>
                <Field label={c.cancelReason} value={reason} onChangeText={setReason} testID="cancel-reason" />
                <Button label={c.cancel} onPress={() => act(() => services.cancel(contract.id, reason), () => c.cancelled)} busy={busy} variant="ghost" testID="cancel-contract" />
              </View>
            )}
          </ScrollView>
        ) : null}
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  banner: { backgroundColor: '#FBEFD9', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  bannerText: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.text, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  h2: { fontFamily: fonts.displayMedium, fontSize: font.h2, color: colors.text, flexShrink: 1 },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  label: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  paper: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 26 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  hash: { fontFamily: fonts.body, fontSize: 12, color: colors.text, letterSpacing: 0.5 },
  ok: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.success },
});
