import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { OmaniArch } from '@/components/omani/OmaniArch';
import { colors, font, radius, shadow, spacing } from '@/theme';

export function CategoryCard({ title, subtitle, icon, onPress }: { title: string; subtitle: string; icon: ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <OmaniArch size={54}>{icon}</OmaniArch>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  title: { marginTop: spacing.sm, fontSize: font.body, fontWeight: '700', color: colors.text },
  subtitle: { marginTop: 2, fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
});
