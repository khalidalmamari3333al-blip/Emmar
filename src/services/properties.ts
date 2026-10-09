import { mockProperties } from '@/data/mock/properties';
import { AppConfig, isSupabaseConfigured, readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type { City, PropertySummary } from '@/types/property';

export type FeaturedResult =
  | { status: 'ok'; source: 'mock' | 'live'; items: PropertySummary[] }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

type Fetcher = (city: City) => Promise<PropertySummary[]>;

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
  price_omr: number | string; // numeric قد يصل نصًا
  price_period: PropertySummary['pricePeriod'];
  bedrooms: number | null;
  area_sqm: number | string | null;
  cover_image_path: string | null;
  featured: boolean;
}

export function mapPropertyRow(row: PropertyRow, imageUrl?: (path: string) => string): PropertySummary {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    city: row.city,
    title: { ar: row.title_ar, en: row.title_en },
    district: { ar: row.district_ar, en: row.district_en },
    priceOmr: Number(row.price_omr),
    pricePeriod: row.price_period,
    bedrooms: row.bedrooms ?? undefined,
    areaSqm: row.area_sqm == null ? undefined : Number(row.area_sqm),
    imageUrl: row.cover_image_path && imageUrl ? imageUrl(row.cover_image_path) : undefined,
    featured: row.featured,
  };
}

/** جلب حقيقي من Supabase: المنشور فقط، ودائمًا بدون البيانات التجريبية (is_demo). */
const fetchLive: Fetcher = async (city) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('properties')
    .select('id,kind,type,city,district_ar,district_en,title_ar,title_en,price_omr,price_period,bedrooms,area_sqm,cover_image_path,featured')
    .eq('city', city)
    .eq('featured', true)
    .eq('status', 'published')
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const publicUrl = (path: string) => supabase.storage.from(PROPERTY_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
  return ((data ?? []) as PropertyRow[]).map((r) => mapPropertyRow(r, publicUrl));
};

export async function getFeaturedProperties(
  city: City,
  config: AppConfig = readConfig(),
  live: Fetcher = fetchLive,
): Promise<FeaturedResult> {
  if (config.useMockData) {
    return { status: 'ok', source: 'mock', items: mockProperties.filter((p) => p.city === city && p.featured) };
  }
  if (!isSupabaseConfigured(config)) return { status: 'not_configured' };
  try {
    return { status: 'ok', source: 'live', items: await live(city) };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export function formatPrice(p: Pick<PropertySummary, 'priceOmr'>): string {
  return p.priceOmr.toLocaleString('en-US', { maximumFractionDigits: 3 });
}
