import { Pressable, StyleSheet, Text, View } from 'react-native';

import { t } from '@/i18n';
import { colors, font, radius, spacing } from '@/theme';
import type { City } from '@/types/property';

const CITIES: City[] = ['sohar', 'muscat'];

export function CityChips({ value, onChange }: { value: City; onChange: (c: City) => void }) {
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {CITIES.map((c) => {
        const selected = c === value;
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(c)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{t.cities[c]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.sand,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.clay, fontSize: font.body, fontWeight: '600' },
  labelSelected: { color: colors.white },
});
