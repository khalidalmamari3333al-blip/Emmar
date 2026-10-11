import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Gate, Notice, ScreenHeader } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { getMyIdentity, IdentityError, identityProviders, IdentityProviders, IResult, mockVerifyIdentity, MyIdentity, startTheqa } from '@/services/identity';
import { colors, font, fonts, radius, spacing } from '@/theme';

export interface IdentityServices {
  mine: () => Promise<IResult<MyIdentity | null>>;
  providers: () => Promise<IResult<IdentityProviders>>;
  theqa: () => Promise<IResult>;
  mock: (name: string, civilId: string) => Promise<IResult>;
}
const defaults: IdentityServices = { mine: getMyIdentity, providers: identityProviders, theqa: startTheqa, mock: mockVerifyIdentity };

export function IdentityScreen({ services = defaults, onBack, onManual }: { services?: IdentityServices; onBack?: () => void; onManual?: () => void }) {
  const { t, locale } = useLocale();
  const v = t.identity;
  const auth = useAuth();
  const [identity, setIdentity] = useState<MyIdentity | null | undefined>(undefined);
  const [providers, setProviders] = useState<IdentityProviders>({ theqa: false, mock: false });
  const [reload, setReload] = useState(0);
  const [name, setName] = useState('');
  const [civil, setCivil] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' | 'muted' } | null>(null);
  const signedIn = !!auth.user;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    Promise.all([services.mine(), services.providers()]).then(([m, p]) => {
      if (!active) return;
      setIdentity(m.ok ? m.data : null);
      if (p.ok) setProviders(p.data);
    });
    return () => {
      active = false;
    };
  }, [signedIn, services, reload]);

  const errText = (c: IdentityError) =>
    c === 'invalid_identity' ? v.invalid : c === 'identity_in_use' ? v.inUse : c === 'mock_disabled' ? v.mockDisabled : c === 'theqa_not_connected' ? v.theqaNotConnected : v.failed;

  const theqa = async () => {
    setBusy(true);
    const r = await services.theqa();
    setBusy(false);
    setMsg(r.ok ? null : { text: errText(r.code), tone: r.code === 'theqa_not_connected' ? 'muted' : 'error' });
  };

  const mock = async () => {
    setBusy(true);
    const r = await services.mock(name, civil);
    setBusy(false);
    setMsg(r.ok ? { text: v.done, tone: 'success' } : { text: errText(r.code), tone: 'error' });
    if (r.ok) {
      setCivil('');
      setReload((n) => n + 1);
      auth.refresh();
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={v.title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={signedIn} loading={auth.status === 'loading' || (signedIn && identity === undefined)} message={t.bookings.signInPrompt}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {identity ? (
            <View style={[styles.card, styles.ok]} testID="identity-verified">
              <Text style={styles.h3}>{v.verified}</Text>
              <Text style={styles.body}>{v.verifiedLine(identity.verifiedName, identity.last4)}</Text>
              <Text style={styles.meta}>
                {v.verifiedVia[identity.provider]} · {formatDate(identity.verifiedAt.slice(0, 10), locale)}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.body}>{v.why}</Text>
              {v.when.map((w) => (
                <Text key={w} style={styles.meta}>
                  • {w}
                </Text>
              ))}
              <Notice text={v.privacy} />

              <View style={styles.card}>
                <Text style={styles.h3}>{v.theqaTitle}</Text>
                <Text style={styles.meta}>{v.theqaBody}</Text>
                {!providers.theqa && <Notice text={v.theqaNotConnected} />}
                <Button label={v.theqaButton} onPress={theqa} busy={busy} disabled={!providers.theqa} testID="verify-theqa" />
              </View>

              {providers.mock && (
                <View style={[styles.card, styles.mock]} testID="mock-identity">
                  <Text style={styles.h3}>{v.mockTitle}</Text>
                  <Text style={styles.meta}>{v.mockBody}</Text>
                  <Field label={v.fullName} value={name} onChangeText={setName} testID="identity-name" />
                  <Field label={v.civilId} value={civil} onChangeText={setCivil} keyboardType="number-pad" secureTextEntry testID="identity-civil" />
                  <Button label={v.mockButton} onPress={mock} busy={busy} variant="secondary" testID="verify-mock" />
                </View>
              )}

              {onManual && (
                <View style={styles.card}>
                  <Text style={styles.h3}>{v.manualTitle}</Text>
                  <Text style={styles.meta}>{v.manualBody}</Text>
                  <Button label={v.manualButton} onPress={onManual} variant="ghost" testID="verify-manual" />
                </View>
              )}
            </>
          )}
          {msg && <Notice text={msg.text} tone={msg.tone} />}
        </ScrollView>
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  ok: { backgroundColor: colors.successLight, borderColor: colors.success },
  mock: { borderStyle: 'dashed', borderColor: colors.accent },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 22 },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
});
