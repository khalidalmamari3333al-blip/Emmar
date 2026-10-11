import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useT } from '@/i18n';
import { isValidEmail, loginLockSeconds, MIN_PASSWORD, useAuth } from '@/lib/auth';
import { formatOmanMobile, normalizeOmanMobile } from '@/lib/phone';
import { colors, font, fonts, radius, spacing } from '@/theme';

/** الدخول بالبريد وكلمة المرور (بديل) */
export function EmailAuthForm() {
  const t = useT();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [failures, setFailures] = useState<number[]>([]);

  const submit = async () => {
    // تحقق محلي سريع؛ الخادم يتحقق مرة أخرى.
    if (mode === 'signUp' && name.trim().length < 2) return setMessage({ kind: 'error', text: t.auth.nameRequired });
    if (!isValidEmail(email)) return setMessage({ kind: 'error', text: t.auth.invalidEmail });
    if (password.length < MIN_PASSWORD) return setMessage({ kind: 'error', text: t.auth.shortPassword });
    const wait = mode === 'signIn' ? loginLockSeconds(failures) : 0;
    if (wait > 0) return setMessage({ kind: 'error', text: t.auth.lockedFor(wait) });
    setBusy(true);
    setMessage(null);
    const r = mode === 'signIn' ? await signIn(email, password) : await signUp(name, email, password);
    setBusy(false);
    if (!r.ok && r.code === 'invalid_credentials') setFailures((f) => [...f.filter((x) => Date.now() - x < 5 * 60_000), Date.now()]);
    if (!r.ok) return setMessage({ kind: 'error', text: t.auth.errors[r.code] });
    setFailures([]);
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

/** التسجيل الافتراضي: رقم الجوال ورمز OTP. بعد التحقق يكمل المستخدم اسمه وبريده (CompleteProfileCard). */
export function PhoneAuthForm() {
  const t = useT();
  const p = t.auth.phone;
  const { sendPhoneCode, verifyPhoneCode, demo } = useAuth();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<number[]>([]);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const send = async () => {
    const e164 = normalizeOmanMobile(phone);
    if (!e164) return setMessage({ kind: 'error', text: t.auth.errors.invalid_phone });
    setBusy(true);
    const r = await sendPhoneCode(e164);
    setBusy(false);
    if (!r.ok) return setMessage({ kind: 'error', text: t.auth.errors[r.code] });
    setSentTo(e164);
    setCode('');
    setMessage({ kind: 'info', text: p.codeSent(formatOmanMobile(e164)) });
  };

  const verify = async () => {
    if (!sentTo) return;
    const wait = loginLockSeconds(failures);
    if (wait > 0) return setMessage({ kind: 'error', text: t.auth.lockedFor(wait) });
    setBusy(true);
    const r = await verifyPhoneCode(sentTo, code);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'invalid_code') setFailures((f) => [...f.filter((x) => Date.now() - x < 5 * 60_000), Date.now()]);
      return setMessage({ kind: 'error', text: t.auth.errors[r.code] });
    }
  };

  return (
    <View style={styles.card} testID="phone-auth">
      <Text style={styles.h2}>{p.title}</Text>
      <Text style={styles.hint}>{p.intro}</Text>
      {!sentTo ? (
        <>
          <TextInput
            style={[styles.input, { textAlign: 'left', writingDirection: 'ltr' }]}
            value={phone}
            onChangeText={setPhone}
            placeholder={`${p.label} — ${p.hint}`}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={p.label}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            testID="phone-input"
          />
          {message && <Text style={message.kind === 'error' ? styles.error : styles.info}>{message.text}</Text>}
          <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={send} disabled={busy} accessibilityRole="button" testID="send-code">
            <Text style={styles.buttonText}>{p.send}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={(v) => setCode(v.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder={p.codeLabel}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={p.codeLabel}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            testID="code-input"
          />
          {message && <Text style={message.kind === 'error' ? styles.error : styles.info}>{message.text}</Text>}
          {demo && <Text style={styles.info}>{p.demoCode}</Text>}
          <Pressable style={[styles.button, (busy || code.length !== 6) && { opacity: 0.6 }]} onPress={verify} disabled={busy || code.length !== 6} accessibilityRole="button" testID="verify-code">
            <Text style={styles.buttonText}>{p.verify}</Text>
          </Pressable>
          <View style={styles.row}>
            <Pressable onPress={send} disabled={busy} accessibilityRole="button">
              <Text style={styles.link}>{p.resend}</Text>
            </Pressable>
            <Pressable onPress={() => { setSentTo(null); setMessage(null); }} accessibilityRole="button">
              <Text style={styles.link}>{p.change}</Text>
            </Pressable>
          </View>
        </>
      )}
      <Text style={styles.hint}>{p.browseFree}</Text>
    </View>
  );
}

/** يُعرض بعد الدخول بالجوال لحساب جديد: الاسم والبريد (بلا صورة بطاقة). */
export function CompleteProfileCard() {
  const t = useT();
  const p = t.auth.phone;
  const { completeProfile, user } = useAuth();
  const [name, setName] = useState(user?.fullName ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  const finish = async () => {
    if (name.trim().length < 2) return setMessage({ kind: 'error', text: t.auth.nameRequired });
    if (!isValidEmail(email)) return setMessage({ kind: 'error', text: t.auth.invalidEmail });
    setBusy(true);
    const r = await completeProfile(name, email);
    setBusy(false);
    if (!r.ok) return setMessage({ kind: 'error', text: t.auth.errors[r.code] });
    setMessage({ kind: 'info', text: r.needsConfirmation ? t.auth.checkEmail : t.profile.saved });
  };

  return (
    <View style={styles.card} testID="complete-profile">
      <Text style={styles.h2}>{p.profileTitle}</Text>
      <Text style={styles.hint}>{p.profileIntro}</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={t.auth.fullName} placeholderTextColor={colors.textMuted} accessibilityLabel={t.auth.fullName} autoComplete="name" testID="profile-name" />
      <TextInput
        style={[styles.input, { textAlign: 'left', writingDirection: 'ltr' }]}
        value={email}
        onChangeText={setEmail}
        placeholder={t.auth.email}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={t.auth.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        testID="profile-email"
      />
      {message && <Text style={message.kind === 'error' ? styles.error : styles.info}>{message.text}</Text>}
      <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={finish} disabled={busy} accessibilityRole="button" testID="finish-profile">
        <Text style={styles.buttonText}>{p.finish}</Text>
      </Pressable>
    </View>
  );
}

/** نموذج الدخول: الجوال + OTP افتراضيًا، والبريد وكلمة المرور بديلًا. */
export function AuthForm({ initialMethod = 'phone' }: { initialMethod?: 'phone' | 'email' } = {}) {
  const t = useT();
  const [method, setMethod] = useState(initialMethod);
  return (
    <View style={{ gap: spacing.xs }}>
      {method === 'phone' ? <PhoneAuthForm /> : <EmailAuthForm />}
      <Pressable onPress={() => setMethod((m) => (m === 'phone' ? 'email' : 'phone'))} accessibilityRole="button" testID="switch-auth-method">
        <Text style={styles.link}>{method === 'phone' ? t.auth.phone.useEmail : t.auth.phone.usePhone}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.small, lineHeight: 20 },
  code: { textAlign: 'center', letterSpacing: 8, fontSize: 22, writingDirection: 'ltr' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  h2: { fontFamily: fonts.displayMedium, fontSize: font.h2, color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, fontFamily: fonts.body, fontSize: font.body, color: colors.text, backgroundColor: colors.background },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: spacing.xs },
  buttonText: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: font.body },
  link: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: font.small, textAlign: 'center', paddingVertical: spacing.xs },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: font.small },
  info: { color: colors.primary, fontFamily: fonts.body, fontSize: font.small },
});
