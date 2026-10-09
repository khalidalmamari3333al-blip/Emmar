import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryCard } from '@/components/CategoryCard';
import { NotificationBell } from '@/components/NotificationBell';
import { CityChips } from '@/components/CityChips';
import { FadeIn, stagger } from '@/components/motion';
import { BedIcon, HouseIcon, KeyIcon } from '@/components/omani/icons';
import { OmaniArcade } from '@/components/omani/OmaniArcade';
import { PropertyCard } from '@/components/PropertyCard';
import { SearchBar } from '@/components/SearchBar';
import { useT } from '@/i18n';
import { FeaturedResult, getFeaturedProperties } from '@/services/properties';
import { colors, font, fonts, radius, spacing } from '@/theme';
import type { City, ListingKind } from '@/types/property';

export interface HomeScreenProps {
  loadFeatured?: (city: City) => Promise<FeaturedResult>;
  onSearch?: () => void;
  onCategory?: (kind: ListingKind) => void;
  onOpen?: (id: string) => void;
  onNotifications?: () => void;
}

export function HomeScreen({ loadFeatured = getFeaturedProperties, onSearch = () => {}, onCategory = () => {}, onOpen = () => {}, onNotifications = () => {} }: HomeScreenProps) {
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
        <FadeIn>
          <View style={styles.hero}>
            <View style={styles.skyline}>
              <OmaniArcade width={420} height={112} color={colors.sand} opacity={0.4} />
            </View>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>{t.appName}</Text>
              <NotificationBell onPress={onNotifications} color={colors.primaryDark} />
            </View>
            <Text style={styles.heroTitle}>{t.heroTitle}</Text>
            <Text style={styles.heroSubtitle}>{t.heroSubtitle}</Text>
          </View>
        </FadeIn>

        {/* شريط البحث يطفو فوق حافة الواجهة */}
        <FadeIn delay={80} style={styles.floating}>
          <SearchBar onPress={onSearch} />
        </FadeIn>

        {result?.status === 'ok' && result.source === 'mock' && (
          <FadeIn delay={110} style={styles.section}>
            <View style={styles.demo} testID="demo-banner">
              <Text style={styles.demoTitle}>{t.demoBanner.title}</Text>
              <Text style={styles.demoBody}>{t.demoBanner.body}</Text>
            </View>
          </FadeIn>
        )}

        <FadeIn delay={140} style={styles.section}>
          <CityChips value={city} onChange={setCity} />
        </FadeIn>

        <FadeIn delay={200} style={styles.section}>
          <View style={styles.categories}>
            <CategoryCard title={t.categories.rent.title} subtitle={t.categories.rent.subtitle} icon={<KeyIcon />} onPress={() => onCategory('rent')} />
            <CategoryCard title={t.categories.sale.title} subtitle={t.categories.sale.subtitle} icon={<HouseIcon />} onPress={() => onCategory('sale')} />
            <CategoryCard title={t.categories.student.title} subtitle={t.categories.student.subtitle} icon={<BedIcon />} onPress={() => onCategory('student')} />
          </View>
        </FadeIn>

        <FadeIn delay={260} style={[styles.section, { marginTop: spacing.xl }]}>
          <View style={styles.row}>
            <Text style={styles.h2}>{t.featuredTitle}</Text>
            {result?.status === 'ok' && result.source === 'mock' && (
              <View style={styles.mockBadge}>
                <Text style={styles.mockText}>{t.mockBadge}</Text>
              </View>
            )}
          </View>
          <Featured result={result} onOpen={onOpen} />
        </FadeIn>

        {/* شرح الفكرة في ثلاث خطوات (ترتيبها هو رحلة المستخدم الفعلية) */}
        <FadeIn delay={320} style={[styles.section, { marginTop: spacing.xl }]}>
          <Text style={styles.h2}>{t.how.title}</Text>
          <View style={styles.steps}>
            {t.how.steps.map((step, i) => (
              <View key={step.title} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={styles.owners}>{t.how.owners}</Text>
        </FadeIn>
      </ScrollView>
    </SafeAreaView>
  );
}

function Featured({ result, onOpen }: { result: FeaturedResult | null; onOpen: (id: string) => void }) {
  const t = useT();
  if (!result) return <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />;
  if (result.status === 'not_configured') return <Text style={styles.notice}>{t.notConfigured}</Text>;
  if (result.status === 'error') return <Text style={[styles.notice, { color: colors.danger }]}>{t.loadError}</Text>;
  if (result.data.length === 0) return <Text style={styles.notice}>{t.emptyFeatured}</Text>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.sm }}>
      {result.data.map((p, i) => (
        <FadeIn key={p.id} delay={stagger(i, 80)}>
          <PropertyCard item={p} onPress={() => onOpen(p.id)} />
        </FadeIn>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl * 1.5 },
  hero: {
    backgroundColor: colors.sandLight,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 1.6,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },
  skyline: { position: 'absolute', bottom: 0, left: 0, right: 0, alignItems: 'center' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: colors.clay, fontFamily: fonts.displayMedium, fontSize: font.body, letterSpacing: 0.3 },
  heroTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 30, lineHeight: 44, marginTop: spacing.md },
  heroSubtitle: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, marginTop: 2 },
  floating: { paddingHorizontal: spacing.lg, marginTop: -28 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  h2: { fontFamily: fonts.displayMedium, fontSize: font.h2 + 1, color: colors.text, marginBottom: spacing.sm },
  categories: { flexDirection: 'row', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  mockBadge: { backgroundColor: '#FBEFD9', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 2, marginBottom: spacing.sm },
  mockText: { color: colors.clay, fontFamily: fonts.bodySemi, fontSize: 11 },
  demo: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4, borderStartWidth: 3, borderStartColor: colors.accent },
  demoTitle: { fontFamily: fonts.bodyBold, fontSize: font.small, color: colors.clay },
  demoBody: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, lineHeight: 20 },
  steps: { gap: spacing.md, marginTop: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: { width: 34, height: 40, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.white, fontFamily: fonts.display, fontSize: 18 },
  stepTitle: { fontFamily: fonts.displayMedium, fontSize: font.body + 1, color: colors.text },
  stepBody: { fontFamily: fonts.body, fontSize: font.small, color: colors.textMuted, lineHeight: 21 },
  owners: { marginTop: spacing.md, fontFamily: fonts.bodyMedium, fontSize: font.small, color: colors.clay },
  notice: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, marginTop: spacing.sm },
});
