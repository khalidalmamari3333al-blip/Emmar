import { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';

import { PressableScale } from '@/components/motion';

import { OmaniArch } from '@/components/omani/OmaniArch';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';

export function CategoryCard({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: ReactNode; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={styles.card} containerStyle={{ flex: 1 }} scaleTo={0.95}>
      <OmaniArch size={54}>{icon}</OmaniArch>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadow,
  },
  title: { marginTop: spacing.sm, fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text, textAlign: 'center' },
  subtitle: { marginTop: 2, fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
});
