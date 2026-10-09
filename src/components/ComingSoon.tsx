import { StyleSheet, Text, View } from 'react-native';

import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { useT } from '@/i18n';
import { colors, font, fonts, spacing } from '@/theme';

/** شاشة صريحة بأن الميزة غير منجزة بعد — لا واجهات شكلية. */
export function ComingSoon({ title }: { title: string }) {
  const t = useT();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <CrenellationDivider />
      <Text style={styles.body}>{t.comingSoon}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, backgroundColor: colors.background },
  title: { fontFamily: fonts.displayMedium, fontSize: font.h2, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.textMuted, textAlign: 'center' },
});
