import { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { exportMyData, listPrivacyRequests, PrivacyError, PrivacyRequest, PrivacyType, requestPrivacy, VResult } from '@/services/privacy';
import { colors, font, fonts, radius, spacing } from '@/theme';

export interface PrivacyServices {
  exportData: () => Promise<VResult<Record<string, unknown>>>;
  request: (type: PrivacyType, details?: string) => Promise<VResult>;
  list: () => Promise<VResult<PrivacyRequest[]>>;
}
const defaults: PrivacyServices = { exportData: exportMyData, request: requestPrivacy, list: () => listPrivacyRequests(null) };

export function PrivacyScreen({ services = defaults, onBack }: { services?: PrivacyServices; onBack?: () => void }) {
  const { t, locale } = useLocale();
  const p = t.privacy;
  const auth = useAuth();
  const [exported, setExported] = useState<string | null>(null);
  const [correction, setCorrection] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [list, setList] = useState<PrivacyRequest[]>([]);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const signedIn = !!auth.user;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    services.list().then((r) => active && setList(r.ok ? r.data.filter((x) => x.userId === auth.user?.id) : []));
    return () => {
      active = false;
    };
  }, [signedIn, services, reload, auth.user?.id]);

  const errText = (c: PrivacyError) => (c === 'duplicate' ? p.duplicate : c === 'rate_limited' ? p.rateLimited : p.failed);

  const send = async (type: PrivacyType, details?: string) => {
    setBusy(true);
    const r = await services.request(type, details);
    setBusy(false);
    setMsg(r.ok ? { text: p.sent, tone: 'success' } : { text: errText(r.code), tone: 'error' });
    if (r.ok) {
      setCorrection('');
      setConfirmDelete(false);
    }
    setReload((n) => n + 1);
  };

  const doExport = async () => {
    setBusy(true);
    const r = await services.exportData();
    setBusy(false);
    if (!r.ok) return setMsg({ text: errText(r.code), tone: 'error' });
    setExported(JSON.stringify(r.data, null, 2));
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={p.title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={signedIn} loading={auth.status === 'loading'} message={t.bookings.signInPrompt}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.body}>{p.intro}</Text>
          <View style={styles.card}>
            {p.collected.map((line) => (
              <Text key={line} style={styles.meta}>
                • {line}
              </Text>
            ))}
            <Text style={styles.meta}>• {p.retention}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.h3}>{p.exportTitle}</Text>
            <Text style={styles.meta}>{p.exportBody}</Text>
            <Button label={p.exportButton} onPress={doExport} busy={busy} variant="secondary" testID="export-data" />
            {exported && (
              <>
                <Text style={styles.meta}>{p.exported}</Text>
                <ScrollView style={styles.json} nestedScrollEnabled>
                  <Text selectable style={styles.code} testID="export-json">
                    {exported}
                  </Text>
                </ScrollView>
                <Button small variant="ghost" label={p.share} onPress={() => Share.share({ message: exported }).catch(() => {})} />
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.h3}>{p.correctionTitle}</Text>
            <Field label={p.correctionHint} value={correction} onChangeText={setCorrection} multiline maxLength={1000} testID="correction-details" />
            <Button label={p.send} onPress={() => send('correction', correction)} busy={busy} disabled={correction.trim().length < 3} variant="secondary" testID="send-correction" />
          </View>

          <View style={[styles.card, { borderColor: colors.danger }]}>
            <Text style={styles.h3}>{p.deletionTitle}</Text>
            <Text style={styles.meta}>{p.deletionBody}</Text>
            {confirmDelete && <Notice text={p.deletionConfirm} tone="error" />}
            <Button label={p.deletionTitle} variant="danger" busy={busy} testID="request-deletion" onPress={() => (confirmDelete ? send('deletion') : setConfirmDelete(true))} />
          </View>

          {msg && <Notice text={msg.text} tone={msg.tone} />}

          {list.length > 0 && (
            <View style={styles.card} testID="my-privacy-requests">
              <Text style={styles.h3}>{p.myRequests}</Text>
              {list.map((r) => (
                <View key={r.id} style={styles.row}>
                  <Text style={styles.body}>
                    {p.types[r.type]} · {formatDate(r.createdAt.slice(0, 10), locale)}
                  </Text>
                  <Pill label={p.status[r.status]} tone={r.status === 'completed' ? 'good' : r.status === 'rejected' ? 'bad' : 'warn'} />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 22 },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
  json: { maxHeight: 220, backgroundColor: colors.background, borderRadius: radius.sm, padding: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: 11, color: colors.text, writingDirection: 'ltr', textAlign: 'left' },
});
