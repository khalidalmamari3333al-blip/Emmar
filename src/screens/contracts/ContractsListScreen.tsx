import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { CResult, listMyContracts, myRole } from '@/services/contracts';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { ContractSummary } from '@/types/contract';

import { MockSignatureBanner } from './ContractScreen';

const TONE = { pending_tenant: 'warn', pending_landlord: 'warn', completed: 'good', cancelled: 'neutral' } as const;

export function ContractsListScreen({
  load = listMyContracts,
  onOpen = () => {},
  onBack,
  refreshKey = 0,
}: {
  load?: () => Promise<CResult<ContractSummary[]>>;
  onOpen?: (id: string) => void;
  onBack?: () => void;
  refreshKey?: number;
}) {
  const { t, locale } = useLocale();
  const auth = useAuth();
  const [res, setRes] = useState<CResult<ContractSummary[]> | null>(null);
  const signedIn = !!auth.user;

  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    load().then((r) => active && setRes(r));
    return () => {
      active = false;
    };
  }, [load, signedIn, refreshKey]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t.contracts.title} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={signedIn} loading={auth.status === 'loading'} message={t.bookings.signInPrompt}>
        <FlatList
          data={res?.ok ? res.data : []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<MockSignatureBanner />}
          ListEmptyComponent={res?.ok ? <Notice text={t.contracts.empty} /> : res ? <Notice text={t.loadError} tone="error" /> : null}
          renderItem={({ item }) => {
            const role = myRole(item, auth.user?.id);
            return (
              <Pressable style={styles.card} onPress={() => onOpen(item.id)} accessibilityRole="button" testID={`contract-${item.id}`}>
                <Text style={styles.title}>{item.propertyTitle ? pick(item.propertyTitle, locale) : t.contracts.title}</Text>
                <Text style={styles.meta}>
                  {role ? t.contracts.roles[role] : ''} · {t.contracts.version(item.currentVersion)}
                </Text>
                <Pill label={t.contracts.status[item.status]} tone={TONE[item.status]} />
              </Pressable>
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
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: 6, alignItems: 'flex-start' },
  title: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
});
