import { isSupabaseConfigured, readConfig } from '@/lib/config';
import { ISODate } from '@/lib/dates';
import { getSupabase } from '@/lib/supabase';
import type { LocalizedText } from '@/i18n/types';

import { DataResult } from './properties';

export type BookingStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'expired';

export interface MyBooking {
  id: string;
  status: BookingStatus;
  start: ISODate;
  end: ISODate;
  expiresAt?: string;
  monthlyPriceOmr?: number;
  createdAt: string;
  bedCode?: string;
  roomCode?: string;
  floorLevel?: number;
  buildingName?: LocalizedText;
  propertyId?: string;
  propertyTitle?: LocalizedText;
}

export type CreateResult =
  | { status: 'ok'; id: string }
  | { status: 'conflict' } // سبق أحدٌ إلى السرير لنفس الفترة
  | { status: 'not_allowed' }
  | { status: 'demo' }
  | { status: 'not_configured' }
  | { status: 'error'; message: string };

export type CancelResult = { status: 'ok' } | { status: 'not_allowed' } | { status: 'error'; message: string };

export interface BookingRequest {
  bedId: string;
  start: ISODate;
  end: ISODate;
  note?: string;
}

/** أخطاء PostgreSQL ذات المعنى للمستخدم. */
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_INSUFFICIENT_PRIVILEGE = '42501';

interface DbError { code?: string; message: string }

export interface BookingsBackend {
  insert(userId: string, req: BookingRequest): Promise<{ id?: string; error?: DbError }>;
  listMine(userId: string): Promise<{ rows?: BookingRow[]; error?: DbError }>;
  cancel(id: string): Promise<{ count: number; error?: DbError }>;
}

export interface BookingRow {
  id: string;
  status: BookingStatus;
  start_date: string;
  end_date: string;
  expires_at: string | null;
  monthly_price_omr: number | string | null;
  created_at: string;
  beds: {
    code: string;
    rooms: { code: string; floors: { level: number; buildings: { name_ar: string; name_en: string; properties: { id: string; title_ar: string; title_en: string } | null } | null } | null } | null;
  } | null;
}

/** الطلب المعلق الذي تجاوز مهلته يُعرض "منتهيًا" حتى قبل أن تعلّمه مهمة التنظيف. */
export function effectiveStatus(status: BookingStatus, expiresAt: string | undefined, now: Date = new Date()): BookingStatus {
  return status === 'pending' && expiresAt && new Date(expiresAt) < now ? 'expired' : status;
}

export function mapBookingRow(r: BookingRow, now: Date = new Date()): MyBooking {
  const room = r.beds?.rooms;
  const building = room?.floors?.buildings;
  const property = building?.properties;
  return {
    id: r.id,
    status: effectiveStatus(r.status, r.expires_at ?? undefined, now),
    start: r.start_date,
    end: r.end_date,
    expiresAt: r.expires_at ?? undefined,
    monthlyPriceOmr: r.monthly_price_omr == null ? undefined : Number(r.monthly_price_omr),
    createdAt: r.created_at,
    bedCode: r.beds?.code,
    roomCode: room?.code,
    floorLevel: room?.floors?.level,
    buildingName: building ? { ar: building.name_ar, en: building.name_en } : undefined,
    propertyId: property?.id,
    propertyTitle: property ? { ar: property.title_ar, en: property.title_en } : undefined,
  };
}

export const canCancel = (b: MyBooking) => b.status === 'pending' || b.status === 'confirmed';

export function supabaseBookingsBackend(): BookingsBackend | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  return {
    async insert(userId, req) {
      // الحالة والمهلة والسعر يحددها الخادم؛ نرسل فقط ما يختاره المستخدم.
      const { data, error } = await supabase
        .from('bookings')
        .insert({ user_id: userId, bed_id: req.bedId, start_date: req.start, end_date: req.end, note: req.note || null })
        .select('id')
        .single();
      return { id: data?.id, error: error ?? undefined };
    },
    async listMine(userId) {
      const { data, error } = await supabase
        .from('bookings')
        .select('id,status,start_date,end_date,expires_at,monthly_price_omr,created_at,beds(code,rooms(code,floors(level,buildings(name_ar,name_en,properties(id,title_ar,title_en)))))')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      return { rows: (data ?? []) as unknown as BookingRow[], error: error ?? undefined };
    },
    async cancel(id) {
      const { data, error } = await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id).select('id');
      return { count: data?.length ?? 0, error: error ?? undefined };
    },
  };
}

function backendOrStatus(config = readConfig(), backend?: BookingsBackend | null): BookingsBackend | 'demo' | 'not_configured' {
  if (backend) return backend;
  if (config.useMockData) return 'demo';
  if (!isSupabaseConfigured(config)) return 'not_configured';
  return supabaseBookingsBackend() ?? 'not_configured';
}

export async function createBookingRequest(userId: string, req: BookingRequest, config = readConfig(), backend?: BookingsBackend | null): Promise<CreateResult> {
  const b = backendOrStatus(config, backend);
  // في وضع البيانات التجريبية لا نتظاهر بإنشاء حجز.
  if (b === 'demo' || b === 'not_configured') return { status: b };
  try {
    const { id, error } = await b.insert(userId, req);
    if (error?.code === PG_EXCLUSION_VIOLATION) return { status: 'conflict' };
    if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'not_allowed' };
    if (error || !id) return { status: 'error', message: error?.message ?? 'no id returned' };
    return { status: 'ok', id };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function listMyBookings(userId: string, config = readConfig(), backend?: BookingsBackend | null): Promise<DataResult<MyBooking[]>> {
  const b = backendOrStatus(config, backend);
  if (b === 'demo') return { status: 'ok', source: 'mock', data: [] };
  if (b === 'not_configured') return { status: 'not_configured' };
  try {
    const { rows, error } = await b.listMine(userId);
    if (error) return { status: 'error', message: error.message };
    const now = new Date();
    return { status: 'ok', source: 'live', data: (rows ?? []).map((r) => mapBookingRow(r, now)) };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelBooking(id: string, config = readConfig(), backend?: BookingsBackend | null): Promise<CancelResult> {
  const b = backendOrStatus(config, backend);
  if (b === 'demo' || b === 'not_configured') return { status: 'not_allowed' };
  try {
    const { count, error } = await b.cancel(id);
    if (error?.code === PG_INSUFFICIENT_PRIVILEGE) return { status: 'not_allowed' };
    if (error) return { status: 'error', message: error.message };
    return count > 0 ? { status: 'ok' } : { status: 'not_allowed' };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
