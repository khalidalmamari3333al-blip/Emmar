import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { OmaniSkyline } from '@/components/omani/OmaniSkyline';
import { pick, useLocale } from '@/i18n';
import { formatPrice } from '@/services/properties';
import { colors, font, radius, shadow, spacing } from '@/theme';
import type { PropertySummary } from '@/types/property';

export function PropertyCard({ item, onPress, wide = false }: { item: PropertySummary; onPress?: () => void; wide?: boolean }) {
  const { t, locale } = useLocale();
  return (
    <Pressable
      style={({ pressed }) => [styles.card, wide && styles.wide, pressed && { opacity: 0.9 }]}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
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
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  body: { padding: spacing.md, gap: 4 },
  title: { fontSize: font.body, fontWeight: '700', color: colors.text },
  meta: { fontSize: font.small, color: colors.textMuted },
  price: { fontSize: font.body, fontWeight: '800', color: colors.primary },
});
