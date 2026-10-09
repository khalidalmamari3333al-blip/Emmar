import { mockProperties } from '@/data/mock/properties';
import { AppConfig, isSupabaseConfigured, readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type { City, PropertySummary } from '@/types/property';

export type FeaturedResult =
  | { status: 'ok'; source: 'mock' | 'live'; items: PropertySummary[] }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

type Fetcher = (city: City) => Promise<PropertySummary[]>;

/** جلب حقيقي من Supabase. جدول properties سيُنشأ في المرحلة 2. */
const fetchLive: Fetcher = async (city) => {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('properties')
    .select('id,title,city,district,kind,type,priceOmr:price_omr,pricePeriod:price_period,bedrooms,areaSqm:area_sqm,imageUrl:cover_image_url,featured')
    .eq('city', city)
    .eq('featured', true)
    .eq('status', 'published')
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as PropertySummary[];
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
  return p.priceOmr.toLocaleString('en-US');
}
