import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Notice, Pill } from '@/components/ui';
import { useLocale } from '@/i18n';
import { documentUrl, VResult } from '@/services/verification';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { ListingStatus } from '@/types/property';
import type { CheckResult, VerificationCheck, VerificationDocument, VerificationRequest } from '@/types/verification';

const RESULT_TONE: Record<CheckResult, 'good' | 'warn' | 'bad' | 'neutral'> = { pass: 'good', warn: 'warn', fail: 'bad', unavailable: 'neutral' };
const tone = (v: string) =>
  (['passed', 'verified', 'approved', 'published'].includes(v) ? 'good' : ['failed', 'rejected', 'mismatch', 'not_found'].includes(v) ? 'bad' : ['warning', 'needs_info', 'pending', 'draft'].includes(v) ? 'warn' : 'neutral') as
    'good' | 'bad' | 'warn' | 'neutral';

/** الحالات الأربع منفصلة دائمًا: آلي، رسمي، بشري، نشر. */
export function StatusLayers({ request, publication }: { request: VerificationRequest; publication?: ListingStatus }) {
  const { t } = useLocale();
  const v = t.verification;
  const rows: [string, string, string][] = [
    [v.layers.automated, v.automated[request.automatedStatus], request.automatedStatus],
    [v.layers.official, v.official[request.officialStatus], request.officialStatus],
    [v.layers.human, v.human[request.humanStatus], request.humanStatus],
  ];
  if (publication) rows.push([v.layers.publication, t.owner.status[publication], publication]);
  return (
    <View style={styles.card} testID="status-layers">
      <View style={styles.rowBetween}>
        <Text style={styles.h3}>{v.requestStatus[request.status]}</Text>
      </View>
      {rows.map(([label, value, raw]) => (
        <View key={label} style={styles.rowBetween}>
          <Text style={styles.label}>{label}</Text>
          <Pill label={value} tone={tone(raw)} />
        </View>
      ))}
    </View>
  );
}

export function ChecksList({ checks }: { checks: VerificationCheck[] }) {
  const { t } = useLocale();
  const v = t.verification;
  if (!checks.length) return null;
  return (
    <View style={styles.card} testID="checks">
      <Text style={styles.h3}>{v.checks}</Text>
      {checks.map((c) => (
        <View key={c.code} style={styles.check} testID={`check-${c.code}`}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.checkLabel}>{v.checkLabels[c.code] ?? c.code}</Text>
            <Text style={styles.meta}>
              {c.required ? v.required : v.optional}
              {c.isMock ? ` · ${v.mockTag}` : ''}
            </Text>
          </View>
          <Pill label={v.result[c.result]} tone={RESULT_TONE[c.result]} />
        </View>
      ))}
    </View>
  );
}

export function Decisions({ request }: { request: VerificationRequest }) {
  const { t } = useLocale();
  const withReason = request.decisions.filter((d) => d.reason);
  if (!withReason.length) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.h3}>{t.verification.reviewerNote}</Text>
      {withReason.map((d) => (
        <Text key={d.createdAt} style={styles.body}>
          {t.verification.human[d.decision]}: {d.reason}
        </Text>
      ))}
    </View>
  );
}

/** يفتح المستند الخاص برابط موقّع مؤقت. */
export function DocumentRow({
  doc,
  onRemove,
  open = documentUrl,
  onError,
}: {
  doc: VerificationDocument;
  onRemove?: () => void;
  open?: (path: string) => Promise<VResult<string>>;
  onError?: (msg: string) => void;
}) {
  const { t } = useLocale();
  const v = t.verification;
  const view = async () => {
    const r = await open(doc.path);
    if (!r.ok) return onError?.(r.message === 'demo_document' ? v.noDocsPreview : v.failed);
    if (Platform.OS === 'web') window.open(r.data, '_blank', 'noopener');
    else Linking.openURL(r.data);
  };
  return (
    <View style={styles.doc} testID={`doc-${doc.id}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>{v.docTypes[doc.docType]}</Text>
        <Text style={styles.meta}>
          {doc.mimeType.replace('application/', '').replace('image/', '').toUpperCase()} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB
        </Text>
      </View>
      <Small label={v.open} onPress={view} />
      {onRemove && <Small label={v.remove} onPress={onRemove} danger />}
    </View>
  );
}

export function Small({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.small, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.smallText, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export function Notices() {
  const { t } = useLocale();
  return (
    <View style={{ gap: spacing.xs }}>
      <Notice text={t.verification.privacy} />
      <Notice text={t.verification.mockNotice} />
    </View>
  );
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  label: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  checkLabel: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.text },
  doc: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  small: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  smallText: { fontFamily: fonts.body, fontSize: font.small, color: colors.primary },
});
