import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { DataResult } from '@/services/properties';
import { colors, font, fonts, radius, spacing } from '@/theme';

/** يعرض حالة التحميل/عدم الربط/الخطأ بصدق. يُرجع null عند النجاح. */
export function StatusNotice({ result }: { result: DataResult<unknown> | null }) {
  const t = useT();
  if (!result) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />;
  if (result.status === 'not_configured') return <Text style={styles.notice}>{t.notConfigured}</Text>;
  if (result.status === 'error') return <Text style={[styles.notice, { color: colors.danger }]}>{t.loadError}</Text>;
  return null;
}

export function MockBadge() {
  const t = useT();
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{t.mockBadge}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, marginTop: spacing.md, textAlign: 'center' },
  badge: { alignSelf: 'flex-start', backgroundColor: '#FBEFD9', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { color: colors.clay, fontFamily: fonts.bodySemi, fontSize: 11 },
});
