import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, font, fonts, radius, spacing } from '@/theme';

export interface ChipOption<T> {
  value: T;
  label: string;
}

/** مجموعة اختيار واحد على شكل شرائح، مع خيار "الكل" اختياري (value = undefined). */
export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  allLabel,
  testID,
}: {
  options: ChipOption<T>[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  allLabel?: string;
  testID?: string;
}) {
  const all: ChipOption<T | undefined>[] = allLabel ? [{ value: undefined, label: allLabel }] : [];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="radiogroup" testID={testID}>
      {[...all, ...options].map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value ?? '__all')}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand, backgroundColor: colors.surface },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { color: colors.clay, fontFamily: fonts.bodyMedium, fontSize: font.small },
  labelSelected: { color: colors.white },
});

/** اختيار متعدد على شكل شرائح (مثل المرافق). */
export function MultiChipGroup<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: ChipOption<T>[];
  value: T[];
  onChange: (v: T[]) => void;
  testID?: string;
}) {
  return (
    <View style={styles.wrap} testID={testID}>
      {options.map((o) => {
        const selected = value.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(selected ? value.filter((v) => v !== o.value) : [...value, o.value])}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {selected ? '✓ ' : ''}
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
