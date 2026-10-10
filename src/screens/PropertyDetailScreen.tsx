import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { PropertyIllustration } from '@/components/omani/PropertyIllustration';
import { MockBadge, StatusNotice } from '@/components/StatusNotice';
import { pick, useLocale } from '@/i18n';
import { DataResult, firstPayment, formatPrice, getPropertyById } from '@/services/properties';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';
import { UTILITIES, type PropertyDetail } from '@/types/property';
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
              <View style={StyleSheet.absoluteFill}>
                <PropertyIllustration type={p.type} seed={p.id} width="100%" height="100%" />
              </View>
            )}
          </View>
          {p.images && p.images.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery} accessibilityLabel={t.features.sections.gallery} testID="gallery">
              {p.images.map((uri, i) => (
                <Image key={uri + i} source={{ uri }} style={styles.thumb} resizeMode="cover" accessibilityIgnoresInvertColors />
              ))}
            </ScrollView>
          )}
          </FadeIn>
          <FadeIn delay={120} style={styles.body}>
            {result?.status === 'ok' && result.source === 'mock' && <MockBadge />}
            <Text style={styles.kind}>
              {t.categories[p.kind].title}
              {p.kind !== 'student' ? ` · ${t.types[p.type]}` : ''}
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
              {p.furnished && <Fact label={t.extras.fields.furnished} value={t.features.furnished[p.furnished]} />}
            </View>

            <Text style={styles.h2}>{t.detail.description}</Text>
            <Text style={styles.description}>{pick(p.description, locale) || t.detail.noDescription}</Text>

            {p.pricePeriod === 'monthly' && (
              <>
                <Text style={styles.h2}>{t.features.sections.costs}</Text>
                <View style={styles.card} testID="costs">
                  <CostRow label={t.features.costs.rent} value={`${formatPrice(p)} ${t.currency}`} />
                  {!!p.depositOmr && <CostRow label={t.features.costs.deposit} value={`${p.depositOmr} ${t.currency}`} />}
                  {!!p.feesOmr && <CostRow label={t.features.costs.fees} value={`${p.feesOmr} ${t.currency}`} />}
                  <CostRow strong label={t.features.costs.firstPayment} value={`${firstPayment(p)} ${t.currency}`} />
                  <Text style={styles.note}>{p.depositOmr || p.feesOmr ? t.features.costs.depositNote : t.features.costs.noExtra}</Text>
                </View>
              </>
            )}

            {!!p.amenities?.length && (
              <>
                <Text style={styles.h2}>{t.features.sections.amenities}</Text>
                <Tags items={p.amenities.map((a) => t.features.amenities[a])} />
              </>
            )}

            {p.pricePeriod === 'monthly' && (
              <>
                <Text style={styles.h2}>{t.features.sections.included}</Text>
                <Tags items={(p.utilities ?? []).map((u) => `✓ ${t.features.utilities[u]}`)} />
                {UTILITIES.some((u) => !p.utilities?.includes(u)) && (
                  <>
                    <Text style={styles.sub}>{t.features.sections.notIncluded}</Text>
                    <Tags muted items={UTILITIES.filter((u) => !p.utilities?.includes(u)).map((u) => `✕ ${t.features.utilities[u]}`)} />
                  </>
                )}
              </>
            )}

            {!!p.nearLandmarks?.length && (
              <>
                <Text style={styles.h2}>{t.features.sections.near}</Text>
                <Tags items={p.nearLandmarks.map((l) => t.features.landmarks[l])} />
              </>
            )}

            {p.rules && pick(p.rules, locale) ? (
              <>
                <Text style={styles.h2}>{t.features.sections.rules}</Text>
                <Text style={styles.description}>{pick(p.rules, locale)}</Text>
              </>
            ) : null}

            {p.cancellationPolicy && (
              <>
                <Text style={styles.h2}>{t.features.sections.cancellation}</Text>
                <View style={styles.card}>
                  <Text style={styles.factValue}>{t.features.cancellation[p.cancellationPolicy].title}</Text>
                  <Text style={styles.note}>{t.features.cancellation[p.cancellationPolicy].body}</Text>
                </View>
              </>
            )}

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

function CostRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.costRow}>
      <Text style={[styles.costLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.costValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

function Tags({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <View style={styles.tags}>
      {items.map((s) => (
        <Text key={s} style={[styles.tag, muted && styles.tagMuted]}>
          {s}
        </Text>
      ))}
    </View>
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
  gallery: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  thumb: { width: 96, height: 72, borderRadius: radius.sm, backgroundColor: colors.sandLight },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  costRow: { flexDirection: 'row', justifyContent: 'space-between' },
  costLabel: { fontFamily: fonts.body, fontSize: font.body, color: colors.textMuted },
  costValue: { fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text },
  strong: { fontFamily: fonts.bodyBold, color: colors.primary },
  note: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, marginTop: spacing.xs },
  sub: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { fontFamily: fonts.body, fontSize: font.small, color: colors.text, backgroundColor: colors.sandLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, overflow: 'hidden' },
  tagMuted: { color: colors.textMuted, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  soon: { marginTop: spacing.lg, color: colors.textMuted, fontFamily: fonts.body, fontSize: font.small, textAlign: 'center' },
});
