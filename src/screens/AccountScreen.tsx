import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/AuthForm';
import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { Button, Field, Notice } from '@/components/ui';
import { Locale, useLocale } from '@/i18n';
import { isAdminRole, isOwnerRole, useAuth } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import { enablePush, PushStatus, unregisterDevice } from '@/lib/push';
import { colors, font, radius, spacing } from '@/theme';

const LOCALES: Locale[] = ['ar', 'en'];

export function AccountScreen({ onOpenOwner = () => {}, onOpenAdmin = () => {} }: { onOpenOwner?: () => void; onOpenAdmin?: () => void } = {}) {
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
          <Text style={styles.email}>{ltr(auth.user.email)}</Text>
          <Pressable onPress={() => unregisterDevice().finally(auth.signOut)} accessibilityRole="button" style={styles.signOut}>
            <Text style={styles.signOutText}>{t.auth.signOut}</Text>
          </Pressable>
        </View>
      )}
      {auth.status === 'signed_in' && auth.user && (
        <>
          {isOwnerRole(auth.user) && <Button label={t.owner.openDashboard} onPress={onOpenOwner} testID="open-owner" />}
          {isAdminRole(auth.user) && <Button label={t.admin.openDashboard} onPress={onOpenAdmin} variant="secondary" testID="open-admin" />}
          <ProfileCard key={auth.user.id} />
          <PushCard />
        </>
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

function PushCard() {
  const { t } = useLocale();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const msg: Record<PushStatus, string> = {
    enabled: t.notifications.push.enabled,
    denied: t.notifications.push.denied,
    unsupported: t.notifications.push.unsupported,
    not_ready: t.notifications.push.notReady,
    error: t.profile.failed,
  };
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{t.notifications.push.title}</Text>
      <Text style={styles.hintStart}>{t.notifications.push.hint}</Text>
      {status && <Notice text={msg[status]} tone={status === 'enabled' ? 'success' : status === 'error' ? 'error' : 'muted'} />}
      {status !== 'enabled' && (
        <Button
          small
          variant="secondary"
          label={t.notifications.push.enable}
          busy={busy}
          testID="enable-push"
          onPress={async () => {
            setBusy(true);
            setStatus(await enablePush(true));
            setBusy(false);
          }}
        />
      )}
    </View>
  );
}

function ProfileCard() {
  const { t } = useLocale();
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.fullName ?? '');
  const [phone, setPhone] = useState(auth.user?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'success' | 'error' } | null>(null);
  const save = async () => {
    setBusy(true);
    const ok = await auth.updateProfile({ fullName: name, phone });
    setBusy(false);
    setMsg(ok ? { text: t.profile.saved, tone: 'success' } : { text: t.profile.failed, tone: 'error' });
  };
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{t.profile.title}</Text>
      <Field label={t.auth.fullName} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={t.profile.phone} value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint={t.profile.phoneHint} autoComplete="tel" placeholder="+968 9XXX XXXX" />
      {msg && <Notice text={msg.text} tone={msg.tone} />}
      <Button label={t.profile.save} onPress={save} busy={busy} small variant="secondary" testID="save-profile" />
    </View>
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
