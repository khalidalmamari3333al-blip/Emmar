import { getFeaturedProperties } from '@/services/properties';

const live = jest.fn();

beforeEach(() => live.mockReset());

describe('getFeaturedProperties', () => {
  it('returns mock data only when the mock flag is on, and labels it as mock', async () => {
    const r = await getFeaturedProperties('sohar', { useMockData: true }, live);
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.source).toBe('mock');
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items.every((p) => p.city === 'sohar')).toBe(true);
    expect(live).not.toHaveBeenCalled();
  });

  it('never falls back to mock data when the flag is off and Supabase is missing', async () => {
    const r = await getFeaturedProperties('sohar', { useMockData: false }, live);
    expect(r).toEqual({ status: 'not_configured' });
    expect(live).not.toHaveBeenCalled();
  });

  it('uses the live source when configured', async () => {
    live.mockResolvedValue([]);
    const r = await getFeaturedProperties('muscat', { useMockData: false, supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }, live);
    expect(r).toEqual({ status: 'ok', source: 'live', items: [] });
    expect(live).toHaveBeenCalledWith('muscat');
  });

  it('reports live errors instead of hiding them', async () => {
    live.mockRejectedValue(new Error('boom'));
    const r = await getFeaturedProperties('muscat', { useMockData: false, supabaseUrl: 'u', supabaseAnonKey: 'k' }, live);
    expect(r).toEqual({ status: 'error', message: 'boom' });
  });
});
