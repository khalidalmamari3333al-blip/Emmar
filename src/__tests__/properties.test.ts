import { mockProperties } from '@/data/mock/properties';
import {
  getFeaturedProperties,
  getPropertyById,
  LiveSource,
  firstPayment,
  matchesFilters,
  PAGE_SIZE,
  sanitizeQuery,
  searchProperties,
} from '@/services/properties';

const live: jest.Mocked<LiveSource> = { featured: jest.fn(), search: jest.fn(), byId: jest.fn() };
const MOCK = { useMockData: true };
const OFF = { useMockData: false };
const LIVE = { useMockData: false, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' };

beforeEach(() => jest.resetAllMocks());

describe('data source selection', () => {
  it('returns mock data only when the mock flag is on, and labels it as mock', async () => {
    const r = await getFeaturedProperties('sohar', MOCK, live);
    expect(r.status === 'ok' && r.source).toBe('mock');
    expect(r.status === 'ok' && r.data.every((p) => p.city === 'sohar')).toBe(true);
    expect(live.featured).not.toHaveBeenCalled();
  });

  it('never falls back to mock data when the flag is off and Supabase is missing', async () => {
    expect(await getFeaturedProperties('sohar', OFF, live)).toEqual({ status: 'not_configured' });
    expect(await searchProperties({}, OFF, live)).toEqual({ status: 'not_configured' });
    expect(await getPropertyById('x', OFF, live)).toEqual({ status: 'not_configured' });
  });

  it('uses the live source when configured', async () => {
    live.search.mockResolvedValue([]);
    const filters = { city: 'muscat' as const, kind: 'rent' as const };
    expect(await searchProperties(filters, LIVE, live)).toEqual({ status: 'ok', source: 'live', data: [] });
    expect(live.search).toHaveBeenCalledWith(filters, 0);
  });

  it('reports live errors instead of hiding them', async () => {
    live.byId.mockRejectedValue(new Error('boom'));
    expect(await getPropertyById('1', LIVE, live)).toEqual({ status: 'error', message: 'boom' });
  });

  it('returns null (not an error) for a missing property', async () => {
    live.byId.mockResolvedValue(null);
    expect(await getPropertyById('nope', LIVE, live)).toEqual({ status: 'ok', source: 'live', data: null });
  });
});

describe('matchesFilters', () => {
  const ids = (f: Parameters<typeof matchesFilters>[1]) => mockProperties.filter((p) => matchesFilters(p, f)).map((p) => p.id);

  it('matches everything with no filters', () => {
    expect(ids({})).toHaveLength(mockProperties.length);
  });

  it('filters by city, kind and type', () => {
    expect(ids({ city: 'muscat' })).toEqual(['mock-3', 'mock-4', 'mock-10', 'mock-11', 'mock-12', 'mock-13', 'mock-14', 'mock-15', 'mock-16']);
    expect(ids({ kind: 'sale' })).toEqual(['mock-3', 'mock-5', 'mock-8', 'mock-12', 'mock-13', 'mock-16']);
    expect(ids({ type: 'student_housing' })).toEqual(['mock-2', 'mock-9', 'mock-15']);
  });

  it('filters by price range (inclusive) and minimum bedrooms', () => {
    expect(ids({ kind: 'rent', minPrice: 180, maxPrice: 220 })).toEqual(['mock-1', 'mock-4', 'mock-14']);
    expect(ids({ minBedrooms: 3 })).toEqual(['mock-3', 'mock-7', 'mock-8', 'mock-11', 'mock-16']);
  });

  it('searches Arabic and English titles and districts, case-insensitively', () => {
    expect(ids({ query: 'الخوير' })).toEqual(['mock-4']);
    expect(ids({ query: 'VILLA' })).toEqual(['mock-3', 'mock-7', 'mock-11', 'mock-16']);
    expect(ids({ query: 'humbar' })).toEqual(['mock-2', 'mock-7']);
  });
});

describe('new filters (amenities, included services, furnishing, landmarks)', () => {
  const ids = (f: Parameters<typeof matchesFilters>[1]) => mockProperties.filter((p) => matchesFilters(p, f)).map((p) => p.id);

  it('requires every selected amenity and included service', () => {
    expect(ids({ amenities: ['wifi', 'study_room'] })).toEqual(['mock-2', 'mock-9', 'mock-15']);
    expect(ids({ kind: 'student', utilities: ['internet', 'electricity'] })).toEqual(['mock-2', 'mock-9', 'mock-15']);
  });

  it('filters by furnishing and proximity to a landmark', () => {
    expect(ids({ landmark: 'squ' })).toEqual(['mock-15']);
    expect(ids({ furnishedOnly: true, city: 'muscat', kind: 'rent' })).toEqual(['mock-4', 'mock-10', 'mock-14']);
  });
});

describe('pagination', () => {
  it('returns pages of PAGE_SIZE and an empty page at the end', async () => {
    const p0 = await searchProperties({}, MOCK, live, 0);
    expect(p0.status === 'ok' && p0.data.length).toBe(16); // أقل من 20 ← نهاية النتائج
    const p1 = await searchProperties({}, MOCK, live, 1);
    expect(p1.status === 'ok' && p1.data).toEqual([]);
    expect(PAGE_SIZE).toBe(20);
  });
});

describe('firstPayment', () => {
  it('adds one month of rent, the deposit and one-time fees', () => {
    expect(firstPayment({ priceOmr: 55, pricePeriod: 'monthly', depositOmr: 55, feesOmr: 10 })).toBe(120);
    expect(firstPayment({ priceOmr: 300, pricePeriod: 'monthly' })).toBe(300);
    expect(firstPayment({ priceOmr: 90000, pricePeriod: 'total', depositOmr: 1 })).toBeUndefined();
  });
});

describe('sanitizeQuery', () => {
  it('strips characters that could alter the PostgREST filter', () => {
    expect(sanitizeQuery('a,b),title_ar.eq.x%')).toBe('a b title_ar.eq.x');
    expect(sanitizeQuery('   ')).toBe('');
    expect(sanitizeQuery(undefined)).toBe('');
  });
});
