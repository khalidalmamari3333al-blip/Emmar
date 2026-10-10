import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PropertyIllustration } from '@/components/omani/PropertyIllustration';
import { Button, Gate, Notice, Pill, ScreenHeader, StatTile } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isOwnerRole, useAuth } from '@/lib/auth';
import { getOwnerStats, listMyProperties, OwnerProperty, OwnerStats, Result } from '@/services/owner';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { FadeIn, stagger } from '@/components/motion';

export interface OwnerDashboardProps {
  loadStats?: () => Promise<Result<OwnerStats>>;
  loadProperties?: (ownerId: string) => Promise<Result<OwnerProperty[]>>;
  onAdd?: () => void;
  onEdit?: (id: string) => void;
  onRequests?: () => void;
  onVerify?: (id: string) => void;
  onVerifyAccount?: () => void;
  onPayments?: () => void;
  onBack?: () => void;
  refreshKey?: number;
}

const STATUS_TONE = { draft: 'warn', published: 'good', archived: 'neutral' } as const;
const VERIFY_TONE = { unverified: 'neutral', pending: 'warn', verified: 'good', rejected: 'bad' } as const;

export function OwnerDashboardScreen({
  loadStats = getOwnerStats,
  loadProperties = listMyProperties,
  onAdd = () => {},
  onEdit = () => {},
  onRequests = () => {},
  onVerify = () => {},
  onVerifyAccount = () => {},
  onPayments = () => {},
  onBack,
  refreshKey = 0,
}: OwnerDashboardProps) {
  const { t, locale } = useLocale();
  const auth = useAuth();
  const ownerId = isOwnerRole(auth.user) ? auth.user!.id : null;
  const [stats, setStats] = useState<Result<OwnerStats> | null>(null);
  const [props, setProps] = useState<Result<OwnerProperty[]> | null>(null);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    loadStats().then((r) => active && setStats(r));
    loadProperties(ownerId).then((r) => active && setProps(r));
    return () => {
      active = false;
    };
  }, [ownerId, loadStats, loadProperties, refreshKey]);

  const s = stats?.ok ? stats.data : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t.owner.dashboard} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={isOwnerRole(auth.user)} loading={auth.status === 'loading'} message={t.owner.notOwner}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.tiles}>
            <StatTile label={t.owner.stats.properties} value={s?.properties ?? '–'} testID="stat-properties" />
            <StatTile label={t.owner.stats.published} value={s?.published ?? '–'} />
            <StatTile label={t.owner.stats.beds} value={s?.beds ?? '–'} />
            <StatTile label={t.owner.stats.occupied} value={s?.occupiedToday ?? '–'} />
            <StatTile label={t.owner.stats.pending} value={s?.pendingRequests ?? '–'} testID="stat-pending" />
          </View>
          {stats && !stats.ok && <Notice text={stats.code === 'not_configured' ? t.notConfigured : t.loadError} tone="error" />}

          <View style={styles.actions}>
            <Button label={t.owner.addProperty} onPress={onAdd} style={{ flex: 1 }} testID="add-property" />
            <Button
              label={s?.pendingRequests ? `${t.owner.requests} (${s.pendingRequests})` : t.owner.requests}
              onPress={onRequests}
              variant="secondary"
              style={{ flex: 1 }}
              testID="open-requests"
            />
          </View>
          <Button label={t.payments.ownerTitle} onPress={onPayments} variant="secondary" testID="open-owner-payments" />
          <Button label={t.verification.verifyAccount} onPress={onVerifyAccount} variant="ghost" testID="verify-account" />

          <Text style={styles.h2}>{t.owner.myProperties}</Text>
          {!props && <Notice text="…" />}
          {props && !props.ok && <Notice text={t.loadError} tone="error" />}
          {props?.ok && props.data.length === 0 && <Notice text={t.owner.noProperties} />}
          {props?.ok &&
            props.data.map((p, i) => (
              <FadeIn key={p.id} delay={stagger(i)}>
              <Pressable style={styles.card} onPress={() => onEdit(p.id)} accessibilityRole="button" testID={`owner-property-${p.id}`}>
                <View style={styles.thumb}>
                  {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={StyleSheet.absoluteFill} /> : <PropertyIllustration type={p.input.type} seed={p.id} width="100%" height="100%" />}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {pick(p.title, locale)}
                  </Text>
                  <Text style={styles.meta}>
                    {t.cities[p.city]} · {t.categories[p.kind].title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <Pill label={t.owner.status[p.status]} tone={STATUS_TONE[p.status]} />
                    {p.featured && <Pill label={t.owner.featured} tone="accent" />}
                    <Pill label={t.verification.listing[p.verificationStatus]} tone={VERIFY_TONE[p.verificationStatus]} />
                  </View>
                  {p.verificationStatus !== 'verified' && (
                    <Pressable onPress={() => onVerify(p.id)} accessibilityRole="button" testID={`verify-${p.id}`}>
                      <Text style={styles.edit}>{t.verification.verifyCta} ←</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.edit}>{t.owner.edit}</Text>
              </Pressable>
              </FadeIn>
            ))}
        </ScrollView>
      </Gate>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  h2: { fontFamily: fonts.display, fontSize: font.h2, color: colors.text, marginTop: spacing.sm },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  thumb: { width: 72, height: 72, borderTopLeftRadius: 36, borderTopRightRadius: 36, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.sandLight, alignItems: 'center', justifyContent: 'flex-end' },
  title: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  edit: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: font.small },
});
