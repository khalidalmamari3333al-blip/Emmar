import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/ChipGroup';
import { SearchIcon } from '@/components/omani/icons';
import { PropertyCard } from '@/components/PropertyCard';
import { MockBadge, StatusNotice } from '@/components/StatusNotice';
import { useT } from '@/i18n';
import { DataResult, searchProperties } from '@/services/properties';
import { colors, font, radius, spacing } from '@/theme';
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
  const t = useT();
  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [queryText, setQueryText] = useState(initialFilters.query ?? '');
  const [minText, setMinText] = useState(initialFilters.minPrice?.toString() ?? '');
  const [maxText, setMaxText] = useState(initialFilters.maxPrice?.toString() ?? '');
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
        <SearchIcon />
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder={t.search.placeholder}
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          accessibilityLabel={t.search.placeholder}
        />
      </View>

      <Text style={styles.label}>{t.search.city}</Text>
      <ChipGroup testID="filter-city" allLabel={t.search.all} value={filters.city} onChange={(city) => set({ city })} options={CITIES.map((c) => ({ value: c, label: t.cities[c] }))} />

      <Text style={styles.label}>{t.search.kind}</Text>
      <ChipGroup
        testID="filter-kind"
        allLabel={t.search.all}
        value={filters.kind}
        onChange={(kind) => set({ kind, type: kind && filters.type && !TYPES_BY_KIND[kind].includes(filters.type) ? undefined : filters.type })}
        options={KINDS.map((k) => ({ value: k, label: t.categories[k].title }))}
      />

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
        renderItem={({ item }) => (
          <View style={styles.item}>
            <PropertyCard item={item} wide onPress={() => onOpen(item.id)} />
          </View>
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
  title: { fontSize: font.title, fontWeight: '800', color: colors.text },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  input: { flex: 1, paddingVertical: 12, fontSize: font.body, color: colors.text },
  label: { marginTop: spacing.sm, fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: { minWidth: 0, width: 0, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md },
  dash: { color: colors.textMuted },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  count: { fontSize: font.body, fontWeight: '700', color: colors.text },
  reset: { fontSize: font.small, color: colors.primary, fontWeight: '700' },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: 'center', marginTop: spacing.lg },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
