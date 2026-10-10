import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { Gate, Notice, Pill, ScreenHeader } from '@/components/ui';
import { pick, useLocale } from '@/i18n';
import { isStaffRole, useAuth } from '@/lib/auth';
import { verificationQueue, VResult } from '@/services/verification';
import { colors, spacing } from '@/theme';
import type { QueueItem, RequestStatus } from '@/types/verification';

import { styles as part } from './parts';

const FILTERS = ['submitted', 'needs_info', 'approved', 'rejected'] as const;

export function VerificationQueueScreen({
  load = verificationQueue,
  onOpen = () => {},
  onBack,
  refreshKey = 0,
}: {
  load?: (status: RequestStatus | null) => Promise<VResult<QueueItem[]>>;
  onOpen?: (id: string) => void;
  onBack?: () => void;
  refreshKey?: number;
}) {
  const { t, locale } = useLocale();
  const v = t.verification;
  const auth = useAuth();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('submitted');
  const [res, setRes] = useState<{ filter: string; r: VResult<QueueItem[]> } | null>(null);
  const staff = isStaffRole(auth.user);

  useEffect(() => {
    if (!staff) return;
    let active = true;
    load(filter).then((r) => active && setRes({ filter, r }));
    return () => {
      active = false;
    };
  }, [filter, load, staff, refreshKey]);

  const r = res?.filter === filter ? res.r : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScreenHeader title={v.queueTitle} onBack={onBack} backLabel={t.detail.back} />
      <Gate allowed={staff} loading={auth.status === 'loading'} message={v.notStaff}>
        <FlatList
          data={r?.ok ? r.data : []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <View style={{ gap: spacing.sm }}>
              <ChipGroup testID="queue-filter" value={filter} onChange={(x) => x && setFilter(x)} options={FILTERS.map((f) => ({ value: f, label: v.filters[f] }))} />
              <Notice text={v.aiNote} />
              {r && !r.ok && <Notice text={t.loadError} tone="error" />}
            </View>
          }
          ListEmptyComponent={r?.ok ? <Notice text={v.queueEmpty} /> : null}
          renderItem={({ item }) => (
            <Pressable style={part.card} onPress={() => onOpen(item.id)} accessibilityRole="button" testID={`queue-${item.id}`}>
              <Text style={part.h3}>{item.propertyTitle ? pick(item.propertyTitle, locale) : v.landlordSubject}</Text>
              <Text style={part.meta}>
                {[item.submitterName, item.city ? t.cities[item.city] : null, `${v.documents}: ${item.documents}`].filter(Boolean).join(' · ')}
              </Text>
              <View style={s.pills}>
                <Pill label={`${v.layers.automated}: ${v.automated[item.automatedStatus]}`} tone={item.automatedStatus === 'failed' ? 'bad' : item.automatedStatus === 'passed' ? 'good' : 'warn'} />
                <Pill label={`${v.layers.official}: ${v.official[item.officialStatus]}`} />
              </View>
            </Pressable>
          )}
        />
      </Gate>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
