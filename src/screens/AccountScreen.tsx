import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { Locale, useLocale } from '@/i18n';
import { colors, font, radius, spacing } from '@/theme';

const LOCALES: Locale[] = ['ar', 'en'];

export function AccountScreen() {
  const { t, locale, setLocale } = useLocale();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text style={styles.title}>{t.tabs.account}</Text>

      <View style={styles.card}>
        <Text style={styles.h2}>{t.languageTitle}</Text>
        <View style={styles.row} accessibilityRole="radiogroup">
          {LOCALES.map((l) => {
            const selected = l === locale;
            return (
              <Pressable
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => !selected && setLocale(l)}
                style={[styles.option, selected && styles.optionSelected]}
              >
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{t.languages[l]}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>{t.languageHint}</Text>
      </View>

      <CrenellationDivider />
      <Text style={styles.hint}>{t.comingSoon}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text, marginBottom: spacing.lg },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h2: { fontSize: font.h2, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: font.body, fontWeight: '600', color: colors.clay },
  optionTextSelected: { color: colors.white },
  hint: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
});
