import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { OmaniSkyline } from '@/components/omani/OmaniSkyline';
import { MockBadge, StatusNotice } from '@/components/StatusNotice';
import { pick, useLocale } from '@/i18n';
import { DataResult, formatPrice, getPropertyById } from '@/services/properties';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';
import type { PropertyDetail } from '@/types/property';
import { FadeIn } from '@/components/motion';

export interface PropertyDetailScreenProps {
  id: string;
  load?: (id: string) => Promise<DataResult<PropertyDetail | null>>;
  onBack?: () => void;
  onChooseBed?: () => void;
}

export function PropertyDetailScreen({ id, load = getPropertyById, onBack, onChooseBed }: PropertyDetailScreenProps) {
  const { t, locale } = useLocale();
  const [loaded, setLoaded] = useState<{ id: string; result: DataResult<PropertyDetail | null> } | null>(null);

  useEffect(() => {
    let active = true;
    load(id).then((r) => active && setLoaded({ id, result: r }));
    return () => {
      active = false;
    };
  }, [id, load]);

  const result = loaded?.id === id ? loaded.result : null;
  const p = result?.status === 'ok' ? result.data : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {onBack && (
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
          <Text style={styles.backText}>{t.detail.back}</Text>
        </Pressable>
      )}
      <StatusNotice result={result} />
      {result?.status === 'ok' && !p && <Text style={styles.notFound}>{t.detail.notFound}</Text>}
      {p && (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
          <FadeIn distance={24}>
          <View style={styles.media}>
            {p.imageUrl ? (
              <Image source={{ uri: p.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
            ) : (
              <OmaniSkyline width={380} height={130} color={colors.clay} opacity={0.25} />
            )}
          </View>

          </FadeIn>
          <FadeIn delay={120} style={styles.body}>
            {result?.status === 'ok' && result.source === 'mock' && <MockBadge />}
            <Text style={styles.kind}>
              {t.categories[p.kind].title} · {t.types[p.type]}
            </Text>
            <Text style={styles.title}>{pick(p.title, locale)}</Text>
            <Text style={styles.meta}>
              {t.cities[p.city]} · {pick(p.district, locale)}
            </Text>
            <Text style={styles.price}>
              {formatPrice(p)} {t.currency}
              {p.pricePeriod === 'monthly' ? ` ${t.perMonth}` : ''}
            </Text>

            <CrenellationDivider />

            <Text style={styles.h2}>{t.detail.details}</Text>
            <View style={styles.facts}>
              <Fact label={t.detail.type} value={t.types[p.type]} />
              <Fact label={t.detail.location} value={`${t.cities[p.city]}${locale === 'ar' ? '، ' : ', '}${pick(p.district, locale)}`} />
              {p.bedrooms != null && <Fact label={t.detail.bedrooms} value={String(p.bedrooms)} />}
              {p.areaSqm != null && <Fact label={t.detail.area} value={`${p.areaSqm} ${t.sqm}`} />}
            </View>

            <Text style={styles.h2}>{t.detail.description}</Text>
            <Text style={styles.description}>{pick(p.description, locale) || t.detail.noDescription}</Text>

            {/* طلب الحجز لغير السكن الطلابي لم يُنجز بعد — نوضح ذلك بدل زر شكلي */}
            {p.kind === 'student' ? (
              <Pressable style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]} accessibilityRole="button" onPress={onChooseBed}>
                <Text style={styles.ctaText}>{t.detail.chooseBed}</Text>
              </Pressable>
            ) : (
              <Text style={styles.soon}>{t.detail.requestSoon}</Text>
            )}
          </FadeIn>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  back: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  backText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: font.body },
  notFound: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, textAlign: 'center', margin: spacing.xl },
  media: {
    height: 230,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.sandLight,
    borderTopLeftRadius: 200,
    borderTopRightRadius: 200,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  body: { padding: spacing.lg, gap: spacing.xs },
  kind: { color: colors.accent, fontFamily: fonts.bodySemi, fontSize: font.small, marginTop: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: font.title, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.body, color: colors.textMuted },
  price: { fontFamily: fonts.display, fontSize: 22, color: colors.primary, marginTop: spacing.sm },
  h2: { fontFamily: fonts.displayMedium, fontSize: font.h2, color: colors.text, marginTop: spacing.md, marginBottom: spacing.sm },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fact: { width: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  factLabel: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  factValue: { fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text, marginTop: 2 },
  description: { fontFamily: fonts.body, fontSize: font.body, color: colors.text, lineHeight: 24 },
  cta: { marginTop: spacing.lg, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', backgroundColor: colors.primary, ...shadow },
  ctaText: { color: colors.white, fontFamily: fonts.bodyBold, fontSize: font.body },
  soon: { marginTop: spacing.lg, color: colors.textMuted, fontFamily: fonts.body, fontSize: font.small, textAlign: 'center' },
});
