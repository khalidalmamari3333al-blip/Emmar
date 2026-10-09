import { mockActiveBookings, mockLayouts } from '@/data/mock/layout';
import { readConfig } from '@/lib/config';
import { ISODate, periodsOverlap } from '@/lib/dates';
import { getSupabase } from '@/lib/supabase';
import type { Availability, BuildingLayout } from '@/types/layout';

import { DataResult, run } from './properties';

// ---------- تحويل صفوف Supabase ----------
interface BedRow { id: string; code: string; monthly_price_omr: number | string; status: 'active' | 'maintenance'; position: number }
interface RoomRow { id: string; code: string; grid_x: number; grid_y: number; grid_w: number; grid_h: number; beds: BedRow[] }
interface FloorRow { id: string; level: number; rooms: RoomRow[] }
export interface BuildingRow { id: string; name_ar: string; name_en: string; created_at?: string; floors: FloorRow[] }

export function mapLayout(rows: BuildingRow[]): BuildingLayout[] {
  const byNum = <T,>(f: (x: T) => number) => (a: T, b: T) => f(a) - f(b);
  return rows.map((b) => ({
    id: b.id,
    name: { ar: b.name_ar, en: b.name_en },
    floors: [...b.floors].sort(byNum((f) => f.level)).map((f) => ({
      id: f.id,
      level: f.level,
      rooms: [...f.rooms]
        .sort((a, c) => a.grid_y - c.grid_y || a.grid_x - c.grid_x || a.code.localeCompare(c.code))
        .map((r) => ({
          id: r.id,
          code: r.code,
          x: r.grid_x,
          y: r.grid_y,
          w: r.grid_w,
          h: r.grid_h,
          beds: [...r.beds].sort(byNum((x) => x.position)).map((bd) => ({
            id: bd.id,
            code: bd.code,
            monthlyPriceOmr: Number(bd.monthly_price_omr),
            status: bd.status,
            position: bd.position,
          })),
        })),
    })),
  }));
}

/** توفر الأسرّة في البيانات التجريبية بنفس قاعدة قاعدة البيانات. */
export function mockAvailability(propertyId: string, start: ISODate, end: ISODate): Availability {
  const out: Availability = {};
  for (const b of mockLayouts[propertyId] ?? [])
    for (const f of b.floors)
      for (const r of f.rooms)
        for (const bed of r.beds)
          out[bed.id] =
            bed.status === 'active' &&
            !mockActiveBookings.some((bk) => bk.bedId === bed.id && periodsOverlap(bk.start, bk.end, start, end));
  return out;
}

// ---------- المصدر الحقيقي ----------
export interface BedsLiveSource {
  layout: (propertyId: string) => Promise<BuildingLayout[]>;
  availability: (propertyId: string, start: ISODate, end: ISODate) => Promise<Availability>;
}

export const bedsLiveSource: BedsLiveSource = {
  async layout(propertyId) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase
      .from('buildings')
      .select('id,name_ar,name_en,created_at,floors(id,level,rooms(id,code,grid_x,grid_y,grid_w,grid_h,beds(id,code,monthly_price_omr,status,position)))')
      .eq('property_id', propertyId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return mapLayout((data ?? []) as BuildingRow[]);
  },

  async availability(propertyId, start, end) {
    const supabase = getSupabase();
    if (!supabase) throw new Error('Supabase not configured');
    // دالة قاعدة البيانات تعيد التوفر فقط دون كشف هوية الحاجزين.
    const { data, error } = await supabase.rpc('bed_availability', { p_property: propertyId, p_start: start, p_end: end });
    if (error) throw new Error(error.message);
    return Object.fromEntries(((data ?? []) as { bed_id: string; is_available: boolean }[]).map((r) => [r.bed_id, r.is_available]));
  },
};

export function getBedLayout(propertyId: string, config = readConfig(), live: BedsLiveSource = bedsLiveSource): Promise<DataResult<BuildingLayout[]>> {
  return run(config, () => mockLayouts[propertyId] ?? [], () => live.layout(propertyId));
}

export function getBedAvailability(
  propertyId: string,
  start: ISODate,
  end: ISODate,
  config = readConfig(),
  live: BedsLiveSource = bedsLiveSource,
): Promise<DataResult<Availability>> {
  return run(config, () => mockAvailability(propertyId, start, end), () => live.availability(propertyId, start, end));
}
