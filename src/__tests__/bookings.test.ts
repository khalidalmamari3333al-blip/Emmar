import {
  BookingRow,
  BookingsBackend,
  cancelBooking,
  createBookingRequest,
  effectiveStatus,
  listMyBookings,
  mapBookingRow,
} from '@/services/bookings';

const LIVE = { useMockData: false, supabaseUrl: 'u', supabaseAnonKey: 'k' };
const req = { bedId: 'bed-1', start: '2027-01-01', end: '2027-05-01' };

function backend(overrides: Partial<BookingsBackend>): BookingsBackend {
  return {
    insert: jest.fn(async () => ({ id: 'bk-1' })),
    listMine: jest.fn(async () => ({ rows: [] })),
    cancel: jest.fn(async () => ({ count: 1 })),
    ...overrides,
  };
}

describe('createBookingRequest', () => {
  it('sends only user, bed and dates (server sets status, price and expiry)', async () => {
    const b = backend({});
    expect(await createBookingRequest('u1', req, LIVE, b)).toEqual({ status: 'ok', id: 'bk-1' });
    expect(b.insert).toHaveBeenCalledWith('u1', req);
  });

  it('turns the database overlap error into a clear conflict', async () => {
    const b = backend({ insert: async () => ({ error: { code: '23P01', message: 'conflicting key value violates exclusion constraint' } }) });
    expect(await createBookingRequest('u1', req, LIVE, b)).toEqual({ status: 'conflict' });
  });

  it('reports RLS refusals as not allowed', async () => {
    const b = backend({ insert: async () => ({ error: { code: '42501', message: 'new row violates row-level security policy' } }) });
    expect(await createBookingRequest('u1', req, LIVE, b)).toEqual({ status: 'not_allowed' });
  });

  it('refuses to create anything in demo mode or without Supabase', async () => {
    expect(await createBookingRequest('u1', req, { useMockData: true })).toEqual({ status: 'demo' });
    expect(await createBookingRequest('u1', req, { useMockData: false })).toEqual({ status: 'not_configured' });
  });

  it('surfaces network failures as errors', async () => {
    const b = backend({ insert: async () => Promise.reject(new Error('offline')) });
    expect(await createBookingRequest('u1', req, LIVE, b)).toEqual({ status: 'error', message: 'offline' });
  });
});

describe('cancelBooking', () => {
  it('reports success only when a row was actually updated', async () => {
    expect(await cancelBooking('x', LIVE, backend({}))).toEqual({ status: 'ok' });
    expect(await cancelBooking('x', LIVE, backend({ cancel: async () => ({ count: 0 }) }))).toEqual({ status: 'not_allowed' });
    expect(await cancelBooking('x', LIVE, backend({ cancel: async () => ({ count: 0, error: { code: '42501', message: 'no' } }) }))).toEqual({ status: 'not_allowed' });
  });
});

describe('booking rows', () => {
  const row: BookingRow = {
    id: 'b1', status: 'pending', start_date: '2026-11-01', end_date: '2027-03-01',
    expires_at: '2026-10-11T10:00:00Z', monthly_price_omr: '45.000', created_at: '2026-10-09T10:00:00Z',
    beds: { code: '2', rooms: { code: '003', floors: { level: 0, buildings: { name_ar: 'المبنى أ', name_en: 'Building A', properties: { id: 'p1', title_ar: 'سكن', title_en: 'Housing' } } } } },
  };

  it('maps nested bed/room/floor/building/property info', () => {
    const b = mapBookingRow(row, new Date('2026-10-10T00:00:00Z'));
    expect(b).toMatchObject({ status: 'pending', bedCode: '2', roomCode: '003', floorLevel: 0, propertyId: 'p1', monthlyPriceOmr: 45 });
    expect(b.propertyTitle).toEqual({ ar: 'سكن', en: 'Housing' });
  });

  it('shows a pending request past its hold as expired', () => {
    expect(mapBookingRow(row, new Date('2026-10-12T00:00:00Z')).status).toBe('expired');
    expect(effectiveStatus('confirmed', '2000-01-01T00:00:00Z')).toBe('confirmed');
  });

  it('copes with a property that is no longer visible', () => {
    const b = mapBookingRow({ ...row, beds: null });
    expect(b.propertyTitle).toBeUndefined();
    expect(b.bedCode).toBeUndefined();
  });

  it('lists live bookings through the backend', async () => {
    const r = await listMyBookings('u1', LIVE, backend({ listMine: async () => ({ rows: [row] }) }));
    expect(r.status === 'ok' && r.data.map((b) => b.id)).toEqual(['b1']);
  });
});
