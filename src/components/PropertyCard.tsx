import { Image, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/motion';

import { OmaniSkyline } from '@/components/omani/OmaniSkyline';
import { pick, useLocale } from '@/i18n';
import { formatPrice } from '@/services/properties';
import { colors, font, fonts, radius, shadow, spacing } from '@/theme';
import type { PropertySummary } from '@/types/property';

export function PropertyCard({ item, onPress, wide = false }: { item: PropertySummary; onPress?: () => void; wide?: boolean }) {
  const { t, locale } = useLocale();
  return (
    <PressableScale
      style={[styles.card, wide && styles.wide]}
      testID={`property-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={pick(item.title, locale)}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.media}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <OmaniSkyline width={240} height={80} color={colors.clay} opacity={0.25} />
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t.categories[item.kind].title}{item.kind !== 'student' ? ` · ${t.types[item.type]}` : ''}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{pick(item.title, locale)}</Text>
        <Text style={styles.meta}>{t.cities[item.city]} · {pick(item.district, locale)}</Text>
        <Text style={styles.price}>
          {formatPrice(item)} {t.currency}
          {item.pricePeriod === 'monthly' ? ` ${t.perMonth}` : ''}
        </Text>
        <Text style={styles.meta}>
          {[item.bedrooms ? `${item.bedrooms} ${t.bedrooms}` : null, item.areaSqm ? `${item.areaSqm} ${t.sqm}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { width: 250, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  wide: { width: '100%' },
  media: {
    height: 130,
    backgroundColor: colors.sandLight,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderTopLeftRadius: 120,
    borderTopRightRadius: 120, // قوس عُماني أعلى الصورة
    overflow: 'hidden',
  },
  badge: { position: 'absolute', bottom: spacing.sm, start: spacing.sm, backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: colors.white, fontFamily: fonts.bodySemi, fontSize: 12 },
  body: { padding: spacing.md, gap: 4 },
  title: { fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted },
  price: { fontFamily: fonts.bodyBold, fontSize: font.body, color: colors.primary },
});
