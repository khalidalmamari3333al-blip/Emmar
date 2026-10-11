import { BedsLiveSource, getBedAvailability, getBedLayout, mapLayout, mockAvailability } from '@/services/beds';

describe('mockAvailability (same rule as the database)', () => {
  const a = mockAvailability('mock-2', '2026-11-01', '2027-03-01');

  it('marks overlapping bookings as unavailable', () => {
    expect(a['A-001-b1']).toBe(false);
    expect(a['A-002-b1']).toBe(false); // يبدأ في يناير داخل الفترة
    expect(a['A-001-b3']).toBe(true);
  });

  it('never offers a bed under maintenance', () => {
    expect(a['A-003-b4']).toBe(false);
  });

  it('allows a stay that starts on the day the previous one ends', () => {
    expect(mockAvailability('mock-2', '2027-03-01', '2027-04-01')['A-001-b2']).toBe(true);
  });
});

describe('mapLayout', () => {
  it('sorts floors, rooms (by grid) and beds, and converts numeric prices', () => {
    const [b] = mapLayout([
      {
        id: 'b', name_ar: 'أ', name_en: 'A',
        floors: [
          { id: 'f1', level: 1, rooms: [] },
          {
            id: 'f0', level: 0,
            rooms: [
              { id: 'r2', code: '2', grid_x: 0, grid_y: 1, grid_w: 1, grid_h: 1, beds: [] },
              {
                id: 'r1', code: '1', grid_x: 0, grid_y: 0, grid_w: 2, grid_h: 1,
                beds: [
                  { id: 'x2', code: '2', monthly_price_omr: '45.500', status: 'active', position: 2 },
                  { id: 'x1', code: '1', monthly_price_omr: 45, status: 'maintenance', position: 1 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(b.floors.map((f) => f.level)).toEqual([0, 1]);
    expect(b.floors[0].rooms.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(b.floors[0].rooms[0].beds.map((x) => x.id)).toEqual(['x1', 'x2']);
    expect(b.floors[0].rooms[0].beds[1].monthlyPriceOmr).toBe(45.5);
    expect(b.floors[0].rooms[0].w).toBe(2);
  });
});

describe('data source selection', () => {
  const live: jest.Mocked<BedsLiveSource> = { layout: jest.fn(), availability: jest.fn() };
  const LIVE = { useMockData: false, supabaseUrl: 'u', supabaseAnonKey: 'k' };

  it('is honest when not configured', async () => {
    expect(await getBedLayout('p', { useMockData: false }, live)).toEqual({ status: 'not_configured' });
    expect(await getBedAvailability('p', '2027-01-01', '2027-02-01', { useMockData: false }, live)).toEqual({ status: 'not_configured' });
  });

  it('asks the database for the exact period', async () => {
    live.availability.mockResolvedValue({ x: true });
    expect(await getBedAvailability('p', '2027-01-01', '2027-05-01', LIVE, live)).toEqual({ status: 'ok', source: 'live', data: { x: true } });
    expect(live.availability).toHaveBeenCalledWith('p', '2027-01-01', '2027-05-01');
  });
});
