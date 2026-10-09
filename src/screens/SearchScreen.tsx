import { useEffect, useMemo, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { FadeIn, stagger } from '@/components/motion';
import { SearchIcon } from '@/components/omani/icons';
import { PropertyCard } from '@/components/PropertyCard';
import { MockBadge, StatusNotice } from '@/components/StatusNotice';
import { useLocale } from '@/i18n';
import { DataResult, searchProperties } from '@/services/properties';
import { colors, font, fonts, radius, spacing } from '@/theme';
import { City, ListingKind, PropertySummary, PropertyType, SearchFilters, TYPES_BY_KIND } from '@/types/property';

const CITIES: City[] = ['sohar', 'muscat'];
const KINDS: ListingKind[] = ['rent', 'sale', 'student'];
const ALL_TYPES: PropertyType[] = ['apartment', 'studio', 'villa', 'land', 'student_housing'];

/** يحوّل نص حقل السعر إلى رقم، أو undefined إن كان فارغًا/غير صالح. يقبل الأرقام العربية. */
export function parsePrice(text: string): number | undefined {
  const western = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d.]/g, '');
  if (!western) return undefined;
  const n = Number(western);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export interface SearchScreenProps {
  initialFilters?: SearchFilters;
  search?: (f: SearchFilters) => Promise<DataResult<PropertySummary[]>>;
  onOpen?: (id: string) => void;
  debounceMs?: number;
}

export function SearchScreen({ initialFilters = {}, search = searchProperties, onOpen = () => {}, debounceMs = 300 }: SearchScreenProps) {
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [queryText, setQueryText] = useState(initialFilters.query ?? '');
  const [minText, setMinText] = useState(initialFilters.minPrice?.toString() ?? '');
  const [maxText, setMaxText] = useState(initialFilters.maxPrice?.toString() ?? '');
  const [showFilters, setShowFilters] = useState(false);
  const [loaded, setLoaded] = useState<{ key: string; result: DataResult<PropertySummary[]> } | null>(null);

  // حقول النص تُطبَّق بعد توقف الكتابة قليلًا لتقليل الطلبات.
  useEffect(() => {
    const id = setTimeout(
      () => setFilters((f) => ({ ...f, query: queryText || undefined, minPrice: parsePrice(minText), maxPrice: parsePrice(maxText) })),
      debounceMs,
    );
    return () => clearTimeout(id);
  }, [queryText, minText, maxText, debounceMs]);

  const key = JSON.stringify(filters);
  useEffect(() => {
    let active = true;
    search(filters).then((r) => active && setLoaded({ key, result: r }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, search]);

  const result = loaded?.key === key ? loaded.result : null;
  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const types = filters.kind ? TYPES_BY_KIND[filters.kind] : ALL_TYPES;
  const extraCount = [filters.city, filters.type, filters.minPrice, filters.maxPrice, filters.minBedrooms].filter((v) => v !== undefined).length;
  const hasFilters = useMemo(() => Object.values(filters).some((v) => v !== undefined), [filters]);

  const reset = () => {
    setQueryText('');
    setMinText('');
    setMaxText('');
    setFilters({});
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>{t.search.title}</Text>
      <View style={styles.inputWrap}>
        <View style={styles.icon}>
          <SearchIcon />
        </View>
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder={t.search.placeholder}
          placeholderTextColor={colors.textMuted}
          // على الويب لا تتبع خانة الإدخال اتجاه الصفحة تلقائيًا
          style={[styles.input, Platform.OS === 'web' && { textAlign: locale === 'ar' ? 'right' : 'left' }]}
          returnKeyType="search"
          accessibilityLabel={t.search.placeholder}
        />
      </View>

      <View style={styles.filterBar}>
        <ChipGroup
          testID="filter-kind"
          allLabel={t.search.all}
          value={filters.kind}
          onChange={(kind) => set({ kind, type: kind && filters.type && !TYPES_BY_KIND[kind].includes(filters.type) ? undefined : filters.type })}
          options={KINDS.map((k) => ({ value: k, label: t.categories[k].title }))}
        />
      </View>
      <Pressable onPress={() => setShowFilters((v) => !v)} accessibilityRole="button" style={styles.toggle} testID="toggle-filters">
        <Text style={styles.toggleText}>{showFilters ? t.search.hideFilters : t.search.moreFilters(extraCount)}</Text>
      </Pressable>

      {showFilters && (
      <FadeIn distance={8} style={{ gap: spacing.sm }}>
      <Text style={styles.label}>{t.search.city}</Text>
      <ChipGroup testID="filter-city" allLabel={t.search.all} value={filters.city} onChange={(city) => set({ city })} options={CITIES.map((c) => ({ value: c, label: t.cities[c] }))} />

      {types.length > 1 && (
        <>
          <Text style={styles.label}>{t.search.type}</Text>
          <ChipGroup testID="filter-type" allLabel={t.search.all} value={filters.type} onChange={(type) => set({ type })} options={types.map((x) => ({ value: x, label: t.types[x] }))} />
        </>
      )}

      <Text style={styles.label}>{t.search.price}</Text>
      <View style={styles.priceRow}>
        <TextInput value={minText} onChangeText={setMinText} placeholder={t.search.minPrice} placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.input, styles.priceInput]} accessibilityLabel={t.search.minPrice} />
        <Text style={styles.dash}>–</Text>
        <TextInput value={maxText} onChangeText={setMaxText} placeholder={t.search.maxPrice} placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[styles.input, styles.priceInput]} accessibilityLabel={t.search.maxPrice} />
      </View>

      {filters.kind !== 'student' && (
        <>
          <Text style={styles.label}>{t.search.bedrooms}</Text>
          <ChipGroup testID="filter-bedrooms" allLabel={t.search.all} value={filters.minBedrooms} onChange={(minBedrooms) => set({ minBedrooms })} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `${n}+` }))} />
        </>
      )}

      </FadeIn>
      )}

      <View style={styles.summaryRow}>
        <Text style={styles.count}>{result?.status === 'ok' ? t.search.results(result.data.length) : ' '}</Text>
        {hasFilters && (
          <Pressable onPress={reset} accessibilityRole="button">
            <Text style={styles.reset}>{t.search.reset}</Text>
          </Pressable>
        )}
      </View>
      {result?.status === 'ok' && result.source === 'mock' && <MockBadge />}
      <StatusNotice result={result} />
      {result?.status === 'ok' && result.data.length === 0 && <Text style={styles.empty}>{t.search.empty}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={result?.status === 'ok' ? result.data : []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <FadeIn delay={stagger(index)} style={styles.item}>
            <PropertyCard item={item} wide onPress={() => onOpen(item.id)} />
          </FadeIn>
        )}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: font.title, color: colors.text },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, paddingVertical: 12, fontFamily: fonts.body, fontSize: font.body, color: colors.text },
  label: { marginTop: spacing.sm, fontFamily: fonts.bodyMedium, fontSize: font.small, color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { minWidth: 0, width: 0, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  dash: { color: colors.textMuted },
  icon: { width: 20, height: 20, flexShrink: 0 },
  filterBar: { marginTop: spacing.xs },
  toggle: { alignSelf: 'flex-start', paddingVertical: 6 },
  toggleText: { color: colors.primary, fontFamily: fonts.bodySemi, fontSize: font.small },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  count: { fontFamily: fonts.bodySemi, fontSize: font.body, color: colors.text },
  reset: { fontFamily: fonts.bodySemi, fontSize: font.small, color: colors.primary },
  empty: { color: colors.textMuted, fontFamily: fonts.body, fontSize: font.body, textAlign: 'center', marginTop: spacing.lg },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
