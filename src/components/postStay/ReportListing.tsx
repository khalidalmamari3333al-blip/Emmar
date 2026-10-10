import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Field, Notice } from '@/components/ui';
import { useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { reportProperty, SResult } from '@/services/postStay';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { REPORT_REASONS, ReportReason } from '@/types/postStay';

export function ReportListing({ propertyId, send = reportProperty }: { propertyId: string; send?: (id: string, r: ReportReason, d?: string) => Promise<SResult> }) {
  const { t } = useLocale();
  const p = t.post;
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | undefined>();
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);

  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.link} testID="report-listing">
        <Text style={styles.linkText}>⚑ {p.report}</Text>
      </Pressable>
    );
  if (!auth.user) return <Notice text={p.signInToReport} />;
  if (msg?.tone === 'success') return <Notice text={msg.text} tone="success" />;

  return (
    <View style={styles.card} testID="report-form">
      <Text style={styles.h3}>{p.reportTitle}</Text>
      <ChipGroup testID="report-reason" value={reason} onChange={(v) => setReason(v ?? undefined)} options={REPORT_REASONS.map((r) => ({ value: r, label: p.reasons[r] }))} />
      <Field label={p.detailsField} value={details} onChangeText={setDetails} multiline maxLength={1000} />
      {msg && <Notice text={msg.text} tone={msg.tone} />}
      <Button
        small
        label={p.sendReport}
        busy={busy}
        disabled={!reason}
        testID="send-report"
        onPress={async () => {
          if (!reason) return;
          setBusy(true);
          const r = await send(propertyId, reason, details);
          setBusy(false);
          setMsg(r.ok ? { text: p.reportSent, tone: 'success' } : { text: r.code === 'duplicate' ? p.duplicateReport : p.failed, tone: 'error' });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', padding: spacing.sm, marginTop: spacing.md },
  linkText: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, textDecorationLine: 'underline' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, marginTop: spacing.md },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
});
