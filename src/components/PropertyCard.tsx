import { Image, StyleSheet, Text, View } from 'react-native';

import { OmaniSkyline } from '@/components/omani/OmaniSkyline';
import { t } from '@/i18n';
import { formatPrice } from '@/services/properties';
import { colors, font, radius, shadow, spacing } from '@/theme';
import type { PropertySummary } from '@/types/property';

const KIND_LABEL = { rent: t.categories.rent.title, sale: t.categories.sale.title, student: t.categories.student.title };

export function PropertyCard({ item }: { item: PropertySummary }) {
  return (
    <View style={styles.card} testID={`property-${item.id}`}>
      <View style={styles.media}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <OmaniSkyline width={240} height={80} color={colors.clay} opacity={0.25} />
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{KIND_LABEL[item.kind]}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.meta}>{t.cities[item.city]} · {item.district}</Text>
        <Text style={styles.price}>
          {formatPrice(item)} {t.currency}
          {item.pricePeriod === 'monthly' ? ` ${t.perMonth}` : ''}
        </Text>
        <Text style={styles.meta}>
          {[item.bedrooms ? `${item.bedrooms} ${t.bedrooms}` : null, item.areaSqm ? `${item.areaSqm} ${t.sqm}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, ...shadow },
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
