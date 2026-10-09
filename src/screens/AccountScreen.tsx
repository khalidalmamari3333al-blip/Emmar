import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/AuthForm';
import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { Locale, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { colors, font, radius, spacing } from '@/theme';

const LOCALES: Locale[] = ['ar', 'en'];

export function AccountScreen() {
  const { t, locale, setLocale } = useLocale();
  const auth = useAuth();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t.tabs.account}</Text>

      {auth.status === 'signed_in' && auth.user && (
        <View style={styles.card}>
          <Text style={styles.hintStart}>{t.auth.signedInAs}</Text>
          {auth.user.fullName ? <Text style={styles.h2}>{auth.user.fullName}</Text> : null}
          <Text style={styles.email}>{auth.user.email}</Text>
          <Pressable onPress={auth.signOut} accessibilityRole="button" style={styles.signOut}>
            <Text style={styles.signOutText}>{t.auth.signOut}</Text>
          </Pressable>
        </View>
      )}
      {auth.status === 'signed_out' && <AuthForm />}
      {auth.status === 'demo' && <Text style={styles.hint}>{t.auth.demoMode}</Text>}
      {auth.status === 'not_configured' && <Text style={styles.hint}>{t.notConfigured}</Text>}

      <View style={{ height: spacing.md }} />

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.title, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h2: { fontSize: font.h2, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', gap: spacing.sm },
  option: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.sand },
  optionSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  optionText: { fontSize: font.body, fontWeight: '600', color: colors.clay },
  optionTextSelected: { color: colors.white },
  hintStart: { fontSize: font.small, color: colors.textMuted },
  email: { fontSize: font.body, color: colors.text },
  signOut: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.danger },
  signOutText: { color: colors.danger, fontWeight: '700', fontSize: font.small },
  hint: { fontSize: font.small, color: colors.textMuted, textAlign: 'center' },
});
