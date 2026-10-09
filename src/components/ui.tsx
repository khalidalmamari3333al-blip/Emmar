import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';

import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  testID?: string;
  style?: ViewStyle;
}) {
  const v = VARIANTS[variant];
  const off = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.btn, small && styles.btnSmall, { backgroundColor: v.bg, borderColor: v.border }, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}
    >
      {busy ? <ActivityIndicator color={v.fg} size="small" /> : <Text style={[styles.btnText, small && { fontFamily: fonts.body, fontSize: font.small }, { color: v.fg }]}>{label}</Text>}
    </Pressable>
  );
}

const VARIANTS: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.primary, border: colors.primary },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...props}
        style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, error && { borderColor: colors.danger }, props.style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const c = PILL[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[styles.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const PILL = {
  neutral: { bg: '#ECE8E3', fg: colors.textMuted },
  good: { bg: '#DCEBE5', fg: colors.primaryDark },
  warn: { bg: '#FBEFD9', fg: colors.clay },
  bad: { bg: '#F3DEDB', fg: colors.danger },
  accent: { bg: colors.accent, fg: colors.white },
};

export function StatTile({ label, value, testID }: { label: string; value: number | string; testID?: string }) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function ScreenHeader({ title, onBack, backLabel }: { title: string; onBack?: () => void; backLabel?: string }) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.back}>{backLabel}</Text>
        </Pressable>
      )}
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export function Notice({ text, tone = 'muted' }: { text: string; tone?: 'muted' | 'error' | 'success' }) {
  return <Text style={[styles.notice, tone === 'error' && { color: colors.danger }, tone === 'success' && { color: colors.primary }]}>{text}</Text>;
}

/** يعرض المحتوى فقط إذا كان الشرط محققًا، وإلا رسالة. الحماية الحقيقية في قاعدة البيانات. */
export function Gate({ allowed, loading, message, children }: { allowed: boolean; loading?: boolean; message: string; children: ReactNode }) {
  if (loading) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />;
  if (!allowed)
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <CrenellationDivider />
        <Notice text={message} />
      </View>
    );
  return <>{children}</>;
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.md, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: spacing.sm + 4, minHeight: 34, borderRadius: radius.pill },
  btnText: { fontFamily: fonts.bodyBold, fontSize: font.body },
  field: { gap: 4, flex: 1 },
  label: { fontFamily: fonts.bodyMedium, fontSize: font.small, color: colors.textMuted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontFamily: fonts.body, fontSize: font.body, color: colors.text, backgroundColor: colors.surface, minWidth: 0 },
  error: { fontFamily: fonts.body, fontSize: 12, color: colors.danger },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  section: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm, ...shadow },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { fontFamily: fonts.display, fontSize: font.h2 - 2, color: colors.text },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  tile: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: 'center', ...shadow },
  tileValue: { fontFamily: fonts.display, fontSize: 24, color: colors.primary },
  tileLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  back: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: font.body },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: font.h2, color: colors.text },
  notice: { fontFamily: fonts.body, fontSize: font.body, color: colors.textMuted, textAlign: 'center', marginVertical: spacing.sm },
});
