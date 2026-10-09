import { Pressable, StyleSheet, Text } from 'react-native';

import { SearchIcon } from '@/components/omani/icons';
import { useT } from '@/i18n';
import { colors, font, radius, shadow, spacing } from '@/theme';

export function SearchBar({ onPress }: { onPress: () => void }) {
  const t = useT();
  return (
    <Pressable accessibilityRole="search" accessibilityLabel={t.searchPlaceholder} onPress={onPress} style={styles.bar}>
      <SearchIcon />
      <Text style={styles.placeholder}>{t.searchPlaceholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  placeholder: { color: colors.textMuted, fontSize: font.body, flex: 1 },
});
