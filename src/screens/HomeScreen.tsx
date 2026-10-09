import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryCard } from '@/components/CategoryCard';
import { CityChips } from '@/components/CityChips';
import { CrenellationDivider } from '@/components/omani/CrenellationDivider';
import { BedIcon, HouseIcon, KeyIcon } from '@/components/omani/icons';
import { OmaniSkyline } from '@/components/omani/OmaniSkyline';
import { PropertyCard } from '@/components/PropertyCard';
import { SearchBar } from '@/components/SearchBar';
import { useT } from '@/i18n';
import { FeaturedResult, getFeaturedProperties } from '@/services/properties';
import { colors, font, radius, spacing } from '@/theme';
import type { City, ListingKind } from '@/types/property';

export interface HomeScreenProps {
  loadFeatured?: (city: City) => Promise<FeaturedResult>;
  onSearch?: () => void;
  onCategory?: (kind: ListingKind) => void;
}

export function HomeScreen({ loadFeatured = getFeaturedProperties, onSearch = () => {}, onCategory = () => {} }: HomeScreenProps) {
  const t = useT();
  const [city, setCity] = useState<City>('sohar');
  // نحفظ المدينة مع النتيجة حتى نعرض مؤشر التحميل عند تغيير المدينة.
  const [loaded, setLoaded] = useState<{ city: City; result: FeaturedResult } | null>(null);
  const result = loaded?.city === city ? loaded.result : null;

  useEffect(() => {
    let active = true;
    loadFeatured(city).then((r) => active && setLoaded({ city, result: r }));
    return () => {
      active = false;
    };
  }, [city, loadFeatured]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.skyline}>
            <OmaniSkyline width={380} height={120} color={colors.sand} opacity={0.3} />
          </View>
          <Text style={styles.brand}>{t.appName}</Text>
          <Text style={styles.heroTitle}>{t.heroTitle}</Text>
          <Text style={styles.heroSubtitle}>{t.heroSubtitle}</Text>
        </View>

        <View style={styles.section}>
          <SearchBar onPress={onSearch} />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t.chooseCity}</Text>
          <CityChips value={city} onChange={setCity} />
        </View>

        <CrenellationDivider />

        <View style={styles.section}>
          <Text style={styles.h2}>{t.categoriesTitle}</Text>
          <View style={styles.categories}>
            <CategoryCard title={t.categories.rent.title} subtitle={t.categories.rent.subtitle} icon={<KeyIcon />} onPress={() => onCategory('rent')} />
            <CategoryCard title={t.categories.sale.title} subtitle={t.categories.sale.subtitle} icon={<HouseIcon />} onPress={() => onCategory('sale')} />
            <CategoryCard title={t.categories.student.title} subtitle={t.categories.student.subtitle} icon={<BedIcon />} onPress={() => onCategory('student')} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.h2}>{t.featuredTitle}</Text>
            {result?.status === 'ok' && result.source === 'mock' && (
              <View style={styles.mockBadge}>
                <Text style={styles.mockText}>{t.mockBadge}</Text>
              </View>
            )}
          </View>
          <Featured result={result} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Featured({ result }: { result: FeaturedResult | null }) {
  const t = useT();
  if (!result) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />;
  if (result.status === 'not_configured') return <Text style={styles.notice}>{t.notConfigured}</Text>;
  if (result.status === 'error') return <Text style={[styles.notice, { color: colors.danger }]}>{t.loadError}</Text>;
  if (result.items.length === 0) return <Text style={styles.notice}>{t.emptyFeatured}</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      {result.items.map((p) => (
        <PropertyCard key={p.id} item={p} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl + spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    overflow: 'hidden',
  },
  skyline: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  brand: { color: colors.accent, fontSize: font.small, fontWeight: '700', letterSpacing: 0.5 },
  heroTitle: { color: colors.white, fontSize: font.title, fontWeight: '800', marginTop: spacing.sm },
  heroSubtitle: { color: colors.sandLight, fontSize: font.body, marginTop: spacing.xs },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  label: { color: colors.textMuted, fontSize: font.small, marginBottom: spacing.sm },
  h2: { fontSize: font.h2, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  categories: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  mockBadge: { backgroundColor: '#FBEFD9', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, marginBottom: spacing.sm },
  mockText: { color: colors.clay, fontSize: 11, fontWeight: '700' },
  notice: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.sm },
});
