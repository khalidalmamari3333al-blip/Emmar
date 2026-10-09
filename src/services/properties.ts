import { mockProperties } from '@/data/mock/properties';
import { AppConfig, isSupabaseConfigured, readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type { City, PropertyDetail, PropertySummary, SearchFilters } from '@/types/property';

/** نتيجة موحدة لكل عمليات القراءة: لا نخفي الأخطاء ولا نعرض بيانات وهمية بصمت. */
export type DataResult<T> =
  | { status: 'ok'; source: 'mock' | 'live'; data: T }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export type FeaturedResult = DataResult<PropertySummary[]>;

export const PROPERTY_IMAGES_BUCKET = 'property-images';

/** صف جدول properties كما يُرجعه Supabase. */
export interface PropertyRow {
  id: string;
  kind: PropertySummary['kind'];
  type: PropertySummary['type'];
  city: City;
  district_ar: string;
  district_en: string;
  title_ar: string;
  title_en: string;
  description_ar?: string | null;
  description_en?: string | null;
  price_omr: number | string; // numeric قد يصل نصًا
  price_period: PropertySummary['pricePeriod'];
  bedrooms: number | null;
  area_sqm: number | string | null;
  cover_image_path: string | null;
  featured: boolean;
}

const SUMMARY_COLUMNS =
  'id,kind,type,city,district_ar,district_en,title_ar,title_en,price_omr,price_period,bedrooms,area_sqm,cover_image_path,featured';
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS},description_ar,description_en`;

export function mapPropertyRow(row: PropertyRow, imageUrl?: (path: string) => string): PropertyDetail {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    city: row.city,
    title: { ar: row.title_ar, en: row.title_en },
    district: { ar: row.district_ar, en: row.district_en },
    description: { ar: row.description_ar ?? '', en: row.description_en ?? '' },
    priceOmr: Number(row.price_omr),
    pricePeriod: row.price_period,
    bedrooms: row.bedrooms ?? undefined,
    areaSqm: row.area_sqm == null ? undefined : Number(row.area_sqm),
    imageUrl: row.cover_image_path && imageUrl ? imageUrl(row.cover_image_path) : undefined,
    featured: row.featured,
  };
}

/** يزيل الرموز التي لها معنى خاص في فلاتر PostgREST (الفاصلة والأقواس و% و*). */
export function sanitizeQuery(q: string | undefined): string {
  return (q ?? '').replace(/[%*,()\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

const normalize = (s: string) => s.toLocaleLowerCase().replace(/[ً-ٟ]/g, ''); // تجاهل التشكيل

/** منطق الفلترة نفسه المطبق على الخادم، يُستخدم للبيانات التجريبية والاختبارات. */
export function matchesFilters(p: PropertySummary, f: SearchFilters): boolean {
  const q = normalize(sanitizeQuery(f.query));
  if (q && ![p.title.ar, p.title.en, p.district.ar, p.district.en].some((s) => normalize(s).includes(q))) return false;
  if (f.city && p.city !== f.city) return false;
  if (f.kind && p.kind !== f.kind) return false;
  if (f.type && p.type !== f.type) return false;
  if (f.minPrice != null && p.priceOmr < f.minPrice) return false;
  if (f.maxPrice != null && p.priceOmr > f.maxPrice) return false;
  if (f.minBedrooms != null && (p.bedrooms ?? 0) < f.minBedrooms) return false;
  return true;
}

// ---------- الجلب الحقيقي من Supabase ----------
// كل الاستعلامات: المنشور فقط، وبدون البيانات التجريبية (is_demo).

function liveClient() {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const publicUrl = (path: string) => supabase.storage.from(PROPERTY_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  return { supabase, publicUrl };
}

export interface LiveSource {
  featured: (city: City) => Promise<PropertySummary[]>;
  search: (f: SearchFilters) => Promise<PropertySummary[]>;
  byId: (id: string) => Promise<PropertyDetail | null>;
}

export const liveSource: LiveSource = {
  async featured(city) {
    const { supabase, publicUrl } = liveClient();
    const { data, error } = await supabase
      .from('properties')
      .select(SUMMARY_COLUMNS)
      .eq('city', city)
      .eq('featured', true)
      .eq('status', 'published')
      .eq('is_demo', false)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    return ((data ?? []) as PropertyRow[]).map((r) => mapPropertyRow(r, publicUrl));
  },

  async search(f) {
    const { supabase, publicUrl } = liveClient();
    let q = supabase.from('properties').select(SUMMARY_COLUMNS).eq('status', 'published').eq('is_demo', false);
    if (f.city) q = q.eq('city', f.city);
    if (f.kind) q = q.eq('kind', f.kind);
    if (f.type) q = q.eq('type', f.type);
    if (f.minPrice != null) q = q.gte('price_omr', f.minPrice);
    if (f.maxPrice != null) q = q.lte('price_omr', f.maxPrice);
    if (f.minBedrooms != null) q = q.gte('bedrooms', f.minBedrooms);
    const text = sanitizeQuery(f.query);
    if (text) {
      const like = `%${text}%`;
      q = q.or(`title_ar.ilike.${like},title_en.ilike.${like},district_ar.ilike.${like},district_en.ilike.${like}`);
    }
    const { data, error } = await q.order('featured', { ascending: false }).order('created_at', { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return ((data ?? []) as PropertyRow[]).map((r) => mapPropertyRow(r, publicUrl));
  },

  async byId(id) {
    const { supabase, publicUrl } = liveClient();
    const { data, error } = await supabase
      .from('properties')
      .select(DETAIL_COLUMNS)
      .eq('id', id)
      .eq('status', 'published')
      .eq('is_demo', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPropertyRow(data as PropertyRow, publicUrl) : null;
  },
};

// ---------- واجهة الشاشات ----------

async function run<T>(config: AppConfig, mock: () => T, live: () => Promise<T>): Promise<DataResult<T>> {
  if (config.useMockData) return { status: 'ok', source: 'mock', data: mock() };
  if (!isSupabaseConfigured(config)) return { status: 'not_configured' };
  try {
    return { status: 'ok', source: 'live', data: await live() };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export function getFeaturedProperties(city: City, config = readConfig(), live: LiveSource = liveSource) {
  return run(config, () => mockProperties.filter((p) => p.city === city && p.featured), () => live.featured(city));
}

export function searchProperties(filters: SearchFilters, config = readConfig(), live: LiveSource = liveSource) {
  return run(
    config,
    () => mockProperties.filter((p) => matchesFilters(p, filters)).sort((a, b) => Number(b.featured) - Number(a.featured)),
    () => live.search(filters),
  );
}

export function getPropertyById(id: string, config = readConfig(), live: LiveSource = liveSource) {
  return run(config, () => mockProperties.find((p) => p.id === id) ?? null, () => live.byId(id));
}

export function formatPrice(p: Pick<PropertySummary, 'priceOmr'>): string {
  return p.priceOmr.toLocaleString('en-US', { maximumFractionDigits: 3 });
}
