import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { isValidEmail, MIN_PASSWORD, useAuth } from '@/lib/auth';
import { colors, font, radius, spacing } from '@/theme';

export function AuthForm() {
  const t = useT();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const submit = async () => {
    // تحقق محلي سريع؛ الخادم يتحقق مرة أخرى.
    if (mode === 'signUp' && name.trim().length < 2) return setMessage({ kind: 'error', text: t.auth.nameRequired });
    if (!isValidEmail(email)) return setMessage({ kind: 'error', text: t.auth.invalidEmail });
    if (password.length < MIN_PASSWORD) return setMessage({ kind: 'error', text: t.auth.shortPassword });
    setBusy(true);
    setMessage(null);
    const r = mode === 'signIn' ? await signIn(email, password) : await signUp(name, email, password);
    setBusy(false);
    if (!r.ok) return setMessage({ kind: 'error', text: t.auth.errors[r.code] });
    if (r.needsConfirmation) {
      setMode('signIn');
      setPassword('');
      setMessage({ kind: 'info', text: t.auth.checkEmail });
    }
  };

  const switchMode = () => {
    setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
    setMessage(null);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{mode === 'signIn' ? t.auth.signInTitle : t.auth.signUpTitle}</Text>
      {mode === 'signUp' && (
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t.auth.fullName} placeholderTextColor={colors.textMuted} accessibilityLabel={t.auth.fullName} autoComplete="name" />
      )}
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder={t.auth.email}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t.auth.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={`${t.auth.password} (${t.auth.passwordHint})`}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t.auth.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
      />
      {message && <Text style={message.kind === 'error' ? styles.error : styles.info}>{message.text}</Text>}
      <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy} accessibilityRole="button" testID="auth-submit">
        <Text style={styles.buttonText}>{mode === 'signIn' ? t.auth.submitSignIn : t.auth.submitSignUp}</Text>
      </Pressable>
      <Pressable onPress={switchMode} accessibilityRole="button">
        <Text style={styles.link}>{mode === 'signIn' ? t.auth.toSignUp : t.auth.toSignIn}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h2: { fontSize: font.h2, fontWeight: '700', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: font.body, color: colors.text, backgroundColor: colors.background },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: font.body },
  link: { color: colors.primary, fontWeight: '700', fontSize: font.small, textAlign: 'center', paddingVertical: spacing.xs },
  error: { color: colors.danger, fontSize: font.small },
  info: { color: colors.primary, fontSize: font.small },
});
