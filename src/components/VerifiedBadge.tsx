import { StyleSheet, Text, View } from 'react-native';

import { useLocale } from '@/i18n';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { PropertySummary } from '@/types/property';

/** شارة "موثّق" — تظهر فقط عندما تقرر قاعدة البيانات ذلك (decide_verification)، مع النطاق والتاريخ في الوضع المفصل. */
export function VerifiedBadge({ item, detailed = false }: { item: Pick<PropertySummary, 'verificationStatus' | 'verifiedAt' | 'verifiedScope'>; detailed?: boolean }) {
  const { t, locale } = useLocale();
  if (item.verificationStatus !== 'verified') return null;
  const date = item.verifiedAt ? new Date(item.verifiedAt).toLocaleDateString(locale === 'ar' ? 'ar-OM' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : null;
  if (!detailed)
    return (
      <View style={styles.pill} testID="verified-badge">
        <Text style={styles.pillText}>✓ {t.verification.badge}</Text>
      </View>
    );
  return (
    <View style={styles.box} testID="verified-badge">
      <Text style={styles.title}>✓ {t.verification.badge}</Text>
      <Text style={styles.note}>
        {item.verifiedScope ? t.verification.scope[item.verifiedScope] : ''}
        {date ? ` · ${t.verification.verifiedOn(date)}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', backgroundColor: colors.successLight, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: colors.success, fontFamily: fonts.bodySemi, fontSize: 11 },
  box: { backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  title: { color: colors.success, fontFamily: fonts.bodyBold, fontSize: font.small },
  note: { color: colors.text, fontFamily: fonts.body, fontSize: font.small },
});
