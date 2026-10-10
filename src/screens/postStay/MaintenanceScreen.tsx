import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Button, Field, Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isOwnerRole, useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { listMaintenance, NewMaintenance, openMaintenance, SResult, updateMaintenance } from '@/services/postStay';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { allowedTransitions, MAINTENANCE_CATEGORIES, MaintenanceCategory, MaintenancePriority, MaintenanceRequest, MaintenanceStatus } from '@/types/postStay';

export interface MaintenanceServices {
  list: (as: 'tenant' | 'landlord') => Promise<SResult<MaintenanceRequest[]>>;
  open: (m: NewMaintenance) => Promise<SResult<string>>;
  update: (id: string, status: MaintenanceStatus, note?: string) => Promise<SResult>;
}
const defaults: MaintenanceServices = { list: listMaintenance, open: openMaintenance, update: updateMaintenance };

const TONE: Record<MaintenanceStatus, 'good' | 'warn' | 'bad' | 'neutral'> = { open: 'warn', in_progress: 'neutral', resolved: 'good', closed: 'neutral', cancelled: 'neutral' };
const PRIORITIES: MaintenancePriority[] = ['low', 'normal', 'urgent'];

export function MaintenanceScreen({
  as,
  bookingId,
  services = defaults,
  onBack,
  refreshKey = 0,
}: {
  as: 'tenant' | 'landlord';
  /** يفتح نموذج طلب جديد لهذا الحجز */
  bookingId?: string;
  services?: MaintenanceServices;
  onBack?: () => void;
  refreshKey?: number;
}) {
  const { t, locale } = useLocale();
  const p = t.post;
  const auth = useAuth();
  const allowed = !!auth.user && (as === 'tenant' || isOwnerRole(auth.user));
  const [res, setRes] = useState<SResult<MaintenanceRequest[]> | null>(null);
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ category: 'other' as MaintenanceCategory, priority: 'normal' as MaintenancePriority, title: '', description: '' });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'success' } | null>(null);
  const [formOpen, setFormOpen] = useState(!!bookingId);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    services.list(as).then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [allowed, as, services, reload, refreshKey]);

  const errText = (code: string) => (code === 'not_completed' ? p.noActiveStay : code === 'invalid' ? p.invalid : code === 'not_allowed' ? t.owner.notAllowed : p.failed);

  const submit = async () => {
    if (!bookingId) return;
    setBusy(true);
    const r = await services.open({ bookingId, ...form });
    setBusy(false);
    if (!r.ok) return setMsg({ text: errText(r.code), tone: 'error' });
    setMsg({ text: p.submitted, tone: 'success' });
    setFormOpen(false);
    setForm({ category: 'other', priority: 'normal', title: '', description: '' });
    setReload((n) => n + 1);
  };

  const move = async (m: MaintenanceRequest, to: MaintenanceStatus) => {
    setBusy(true);
    const r = await services.update(m.id, to, notes[m.id]);
    setBusy(false);
    setMsg(r.ok ? null : { text: errText(r.code), tone: 'error' });
    setReload((n) => n + 1);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={as === 'tenant' ? p.maintenanceTitle : p.ownerMaintenanceTitle} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={allowed} loading={auth.status === 'loading'} message={as === 'tenant' ? t.bookings.signInPrompt : t.owner.notOwner}>
        <FlatList
          data={res?.ok ? res.data : []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              {as === 'tenant' && bookingId && formOpen && (
                <View style={styles.card} testID="maintenance-form">
                  <Text style={styles.h3}>{p.newRequest}</Text>
                  <ChipGroup testID="m-category" value={form.category} onChange={(v) => v && setForm((f) => ({ ...f, category: v }))} options={MAINTENANCE_CATEGORIES.map((c) => ({ value: c, label: p.categories[c] }))} />
                  <ChipGroup testID="m-priority" value={form.priority} onChange={(v) => v && setForm((f) => ({ ...f, priority: v }))} options={PRIORITIES.map((x) => ({ value: x, label: p.priorities[x] }))} />
                  <Field label={p.titleField} value={form.title} onChangeText={(v) => setForm((f) => ({ ...f, title: v }))} maxLength={120} testID="m-title" />
                  <Field label={p.descriptionField} value={form.description} onChangeText={(v) => setForm((f) => ({ ...f, description: v }))} multiline maxLength={2000} />
                  <Button label={p.submit} onPress={submit} busy={busy} disabled={form.title.trim().length < 3} testID="m-submit" />
                </View>
              )}
              {msg && <Notice text={msg.text} tone={msg.tone} />}
              {res && !res.ok && <Notice text={t.loadError} tone="error" />}
            </View>
          }
          ListEmptyComponent={res?.ok ? <Notice text={p.noMaintenance} /> : null}
          renderItem={({ item: m }) => {
            const next = allowedTransitions(m.status, as);
            return (
              <View style={styles.card} testID={`maintenance-${m.id}`}>
                <View style={styles.row}>
                  <Text style={styles.title}>{m.title}</Text>
                  <Pill label={p.mStatus[m.status]} tone={TONE[m.status]} />
                </View>
                <Text style={styles.meta}>
                  {[p.categories[m.category], p.priorities[m.priority], m.propertyTitle ? pick(m.propertyTitle, locale) : null, formatDate(m.createdAt.slice(0, 10), locale)].filter(Boolean).join(' · ')}
                </Text>
                {m.priority === 'urgent' && m.status !== 'closed' && m.status !== 'cancelled' && <Pill label={p.priorities.urgent} tone="bad" />}
                {m.description ? <Text style={styles.body}>{m.description}</Text> : null}
                {m.landlordNote ? (
                  <Text style={styles.body}>
                    {p.landlordNote}: {m.landlordNote}
                  </Text>
                ) : null}
                {as === 'landlord' && next.length > 0 && (
                  <Field label={p.noteField} value={notes[m.id] ?? ''} onChangeText={(v) => setNotes((n) => ({ ...n, [m.id]: v }))} testID={`m-note-${m.id}`} />
                )}
                {next.length > 0 && (
                  <View style={styles.actions}>
                    {next.map((s) => (
                      <Button key={s} small variant={s === 'cancelled' || s === 'open' ? 'ghost' : 'secondary'} label={p.actions[s]} onPress={() => move(m, s)} busy={busy} testID={`m-${s}-${m.id}`} />
                    ))}
                  </View>
                )}
              </View>
            );
          }}
        />
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text, flexShrink: 1 },
  h3: { fontFamily: fonts.displayMedium, fontSize: font.body, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
});
