import { mockProperties } from '@/data/mock/properties';
import {
  getFeaturedProperties,
  getPropertyById,
  LiveSource,
  matchesFilters,
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
    expect(live.search).toHaveBeenCalledWith(filters);
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
    expect(ids({ city: 'muscat' })).toEqual(['mock-3', 'mock-4']);
    expect(ids({ kind: 'sale' })).toEqual(['mock-3', 'mock-5']);
    expect(ids({ type: 'student_housing' })).toEqual(['mock-2']);
  });

  it('filters by price range (inclusive) and minimum bedrooms', () => {
    expect(ids({ kind: 'rent', minPrice: 180, maxPrice: 220 })).toEqual(['mock-1', 'mock-4']);
    expect(ids({ minBedrooms: 3 })).toEqual(['mock-3']);
  });

  it('searches Arabic and English titles and districts, case-insensitively', () => {
    expect(ids({ query: 'الخوير' })).toEqual(['mock-4']);
    expect(ids({ query: 'VILLA' })).toEqual(['mock-3']);
    expect(ids({ query: 'humbar' })).toEqual(['mock-2']);
  });
});

describe('sanitizeQuery', () => {
  it('strips characters that could alter the PostgREST filter', () => {
    expect(sanitizeQuery('a,b),title_ar.eq.x%')).toBe('a b title_ar.eq.x');
    expect(sanitizeQuery('   ')).toBe('');
    expect(sanitizeQuery(undefined)).toBe('');
  });
});
