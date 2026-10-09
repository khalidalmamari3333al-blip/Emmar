import type { SupabaseClient } from '@supabase/supabase-js';

import type { LocalizedText } from '@/i18n/types';
import { getSupabase } from '@/lib/supabase';
import type { BookingStatus } from '@/services/bookings';
import { effectiveStatus } from '@/services/bookings';
import { City, ListingKind, ListingStatus, PropertyType, TYPES_BY_KIND } from '@/types/property';

import { mapPropertyRow, PROPERTY_IMAGES_BUCKET, PropertyRow } from './properties';

export type Result<T = void> = { ok: true; data: T } | { ok: false; code: 'not_configured' | 'not_allowed' | 'in_use' | 'error'; message?: string };

const PG_INSUFFICIENT_PRIVILEGE = '42501';
const PG_FOREIGN_KEY_VIOLATION = '23503';

function client(): SupabaseClient | null {
  return getSupabase();
}

function fail(error: { code?: string; message: string }): Result<never> {
  if (error.code === PG_INSUFFICIENT_PRIVILEGE) return { ok: false, code: 'not_allowed', message: error.message };
  if (error.code === PG_FOREIGN_KEY_VIOLATION) return { ok: false, code: 'in_use', message: error.message };
  return { ok: false, code: 'error', message: error.message };
}

async function guard<T>(fn: (sb: SupabaseClient) => Promise<Result<T>>): Promise<Result<T>> {
  const sb = client();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// =====================================================================
// العقار: النموذج والتحقق
// =====================================================================

export interface PropertyInput {
  kind: ListingKind;
  type: PropertyType;
  city: City;
  districtAr: string;
  districtEn: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  descriptionEn: string;
  /** نص كما أدخله المالك؛ يُحوَّل ويُتحقق منه */
  price: string;
  bedrooms: string;
  area: string;
  status: ListingStatus;
}

export type FieldError = 'required' | 'too_short' | 'too_long' | 'invalid_number' | 'type_mismatch';
export type PropertyErrors = Partial<Record<keyof PropertyInput, FieldError>>;

export const emptyPropertyInput = (): PropertyInput => ({
  kind: 'rent', type: 'apartment', city: 'sohar', districtAr: '', districtEn: '', titleAr: '', titleEn: '',
  descriptionAr: '', descriptionEn: '', price: '', bedrooms: '', area: '', status: 'draft',
});

/** يحوّل الأرقام العربية-الهندية ويزيل الفواصل. */
export function toNumber(text: string): number | undefined {
  const s = text.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g, '').replace('٫', '.');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function validatePropertyInput(i: PropertyInput): PropertyErrors {
  const e: PropertyErrors = {};
  const text = (k: keyof PropertyInput, min: number, max: number) => {
    const v = String(i[k]).trim();
    if (!v) e[k] = 'required';
    else if (v.length < min) e[k] = 'too_short';
    else if (v.length > max) e[k] = 'too_long';
  };
  text('titleAr', 3, 120);
  text('titleEn', 3, 120);
  text('districtAr', 2, 60);
  text('districtEn', 2, 60);
  if (i.descriptionAr.length > 2000) e.descriptionAr = 'too_long';
  if (i.descriptionEn.length > 2000) e.descriptionEn = 'too_long';
  if (!TYPES_BY_KIND[i.kind].includes(i.type)) e.type = 'type_mismatch';

  const price = toNumber(i.price);
  if (price === undefined) e.price = 'required';
  else if (Number.isNaN(price) || price < 0 || price > 100_000_000) e.price = 'invalid_number';

  for (const k of ['bedrooms', 'area'] as const) {
    const n = toNumber(i[k]);
    if (n !== undefined && (Number.isNaN(n) || n < 0 || (k === 'bedrooms' && !Number.isInteger(n)) || (k === 'area' && n === 0)))
      e[k] = 'invalid_number';
  }
  return e;
}

/** صف قاعدة البيانات من مدخلات صالحة. فترة السعر مشتقة من نوع العرض (كما يفرض الخادم). */
export function toPropertyRow(i: PropertyInput) {
  const bedrooms = toNumber(i.bedrooms);
  const area = toNumber(i.area);
  return {
    kind: i.kind,
    type: i.type,
    city: i.city,
    district_ar: i.districtAr.trim(),
    district_en: i.districtEn.trim(),
    title_ar: i.titleAr.trim(),
    title_en: i.titleEn.trim(),
    description_ar: i.descriptionAr.trim() || null,
    description_en: i.descriptionEn.trim() || null,
    price_omr: toNumber(i.price)!,
    price_period: i.kind === 'sale' ? ('total' as const) : ('monthly' as const),
    bedrooms: i.kind === 'student' || bedrooms === undefined ? null : bedrooms,
    area_sqm: area ?? null,
    status: i.status,
  };
}

export interface OwnerProperty {
  id: string;
  input: PropertyInput;
  title: LocalizedText;
  city: City;
  kind: ListingKind;
  status: ListingStatus;
  featured: boolean;
  imageUrl?: string;
  updatedAt: string;
}

type OwnerRow = PropertyRow & { status: ListingStatus; updated_at: string; description_ar: string | null; description_en: string | null };

const OWNER_COLUMNS =
  'id,kind,type,city,district_ar,district_en,title_ar,title_en,description_ar,description_en,price_omr,price_period,bedrooms,area_sqm,cover_image_path,featured,status,updated_at';

export function mapOwnerRow(r: OwnerRow, imageUrl?: (p: string) => string): OwnerProperty {
  const p = mapPropertyRow(r, imageUrl);
  return {
    id: r.id,
    title: p.title,
    city: r.city,
    kind: r.kind,
    status: r.status,
    featured: r.featured,
    imageUrl: p.imageUrl,
    updatedAt: r.updated_at,
    input: {
      kind: r.kind, type: r.type, city: r.city,
      districtAr: r.district_ar, districtEn: r.district_en, titleAr: r.title_ar, titleEn: r.title_en,
      descriptionAr: r.description_ar ?? '', descriptionEn: r.description_en ?? '',
      price: String(Number(r.price_omr)), bedrooms: r.bedrooms == null ? '' : String(r.bedrooms),
      area: r.area_sqm == null ? '' : String(Number(r.area_sqm)), status: r.status,
    },
  };
}

const publicUrl = (sb: SupabaseClient) => (path: string) => sb.storage.from(PROPERTY_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;

export function listMyProperties(ownerId: string) {
  return guard<OwnerProperty[]>(async (sb) => {
    const { data, error } = await sb.from('properties').select(OWNER_COLUMNS).eq('owner_id', ownerId).order('updated_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as OwnerRow[]).map((r) => mapOwnerRow(r, publicUrl(sb))) };
  });
}

/** كل العقارات (للإدارة؛ RLS يسمح للمدير برؤية الكل). */
export function listAllProperties(status?: ListingStatus) {
  return guard<OwnerProperty[]>(async (sb) => {
    let q = sb.from('properties').select(OWNER_COLUMNS).eq('is_demo', false);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('updated_at', { ascending: false }).limit(200);
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as OwnerRow[]).map((r) => mapOwnerRow(r, publicUrl(sb))) };
  });
}

export function getOwnerProperty(id: string) {
  return guard<OwnerProperty | null>(async (sb) => {
    const { data, error } = await sb.from('properties').select(OWNER_COLUMNS).eq('id', id).maybeSingle();
    if (error) return fail(error);
    return { ok: true, data: data ? mapOwnerRow(data as OwnerRow, publicUrl(sb)) : null };
  });
}

export function createProperty(ownerId: string, input: PropertyInput) {
  return guard<string>(async (sb) => {
    const { data, error } = await sb.from('properties').insert({ ...toPropertyRow(input), owner_id: ownerId }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: data.id as string };
  });
}

export function updateProperty(id: string, input: PropertyInput) {
  return guard(async (sb) => {
    const { data, error } = await sb.from('properties').update(toPropertyRow(input)).eq('id', id).select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

export function setPropertyStatus(id: string, status: ListingStatus) {
  return guard(async (sb) => {
    const { data, error } = await sb.from('properties').update({ status }).eq('id', id).select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

export interface ImageAsset {
  uri: string;
  mimeType?: string | null;
}

/** يرفع صورة الغلاف إلى Storage تحت مجلد العقار (سياسة التخزين تسمح للمالك فقط). */
export function uploadCover(propertyId: string, asset: ImageAsset) {
  return guard<string>(async (sb) => {
    const contentType = asset.mimeType || 'image/jpeg';
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const path = `${propertyId}/cover-${Date.now()}.${ext}`;
    const up = await sb.storage.from(PROPERTY_IMAGES_BUCKET).upload(path, body, { contentType, upsert: false });
    if (up.error) return { ok: false, code: 'error', message: up.error.message };
    const { data, error } = await sb.from('properties').update({ cover_image_path: path }).eq('id', propertyId).select('id');
    if (error) return fail(error);
    if (!data?.length) return { ok: false, code: 'not_allowed' };
    return { ok: true, data: publicUrl(sb)(path) };
  });
}

// =====================================================================
// هيكل السكن: مبانٍ، طوابق، غرف، أسرّة
// =====================================================================

/** رموز غرف جديدة حسب الطابق: الأرضي 001، 002… والطابق 1: 101، 102… مع تخطي الموجود. */
export function nextRoomCodes(level: number, existing: string[], count: number): string[] {
  const taken = new Set(existing);
  const out: string[] = [];
  for (let n = 1; out.length < count && n < 1000; n++) {
    const code = `${level}${String(n).padStart(2, '0')}`;
    if (!taken.has(code)) out.push(code);
  }
  return out;
}

export function addBuilding(propertyId: string, name: LocalizedText) {
  return guard<string>(async (sb) => {
    const { data, error } = await sb.from('buildings').insert({ property_id: propertyId, name_ar: name.ar.trim(), name_en: name.en.trim() }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: data.id as string };
  });
}

export function addFloor(buildingId: string, level: number) {
  return guard<string>(async (sb) => {
    const { data, error } = await sb.from('floors').insert({ building_id: buildingId, level }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: data.id as string };
  });
}

/** يضيف عدة غرف بعدد أسرّة وسعر موحّد، ويضعها في شبكة من صفين. */
export function addRooms(floorId: string, level: number, existingCodes: string[], count: number, bedsPerRoom: number, monthlyPrice: number) {
  return guard<number>(async (sb) => {
    const startIndex = existingCodes.length;
    const codes = nextRoomCodes(level, existingCodes, count);
    const perRow = 3;
    const { data: rooms, error } = await sb
      .from('rooms')
      .insert(codes.map((code, i) => ({ floor_id: floorId, code, grid_x: (startIndex + i) % perRow, grid_y: Math.floor((startIndex + i) / perRow) })))
      .select('id');
    if (error) return fail(error);
    const beds = (rooms ?? []).flatMap((r) =>
      Array.from({ length: bedsPerRoom }, (_, b) => ({ room_id: r.id, code: String(b + 1), position: b + 1, monthly_price_omr: monthlyPrice })),
    );
    if (beds.length) {
      const { error: e2 } = await sb.from('beds').insert(beds);
      if (e2) return fail(e2);
    }
    return { ok: true, data: codes.length };
  });
}

export function updateBed(bedId: string, patch: { status?: 'active' | 'maintenance'; monthlyPriceOmr?: number }) {
  return guard(async (sb) => {
    const row: Record<string, unknown> = {};
    if (patch.status) row.status = patch.status;
    if (patch.monthlyPriceOmr !== undefined) row.monthly_price_omr = patch.monthlyPriceOmr;
    const { data, error } = await sb.from('beds').update(row).eq('id', bedId).select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

/** حذف غرفة؛ يُرفض إن كان لأحد أسرّتها حجوزات (in_use) — حماية لسجل الحجوزات. */
export function deleteRoom(roomId: string) {
  return guard(async (sb) => {
    const { data, error } = await sb.from('rooms').delete().eq('id', roomId).select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

// =====================================================================
// طلبات الحجز وإحصائيات المالك
// =====================================================================

export interface OwnerRequest {
  id: string;
  status: BookingStatus;
  start: string;
  end: string;
  expiresAt?: string;
  monthlyPriceOmr?: number;
  createdAt: string;
  bedCode: string;
  roomCode: string;
  floorLevel: number;
  buildingName: LocalizedText;
  propertyId: string;
  propertyTitle: LocalizedText;
  requesterName?: string;
  requesterPhone?: string;
}

export interface RequestRow {
  id: string; status: BookingStatus; start_date: string; end_date: string; expires_at: string | null;
  monthly_price_omr: number | string | null; created_at: string; bed_code: string; room_code: string; floor_level: number;
  building_name_ar: string; building_name_en: string; property_id: string; property_title_ar: string; property_title_en: string;
  requester_name: string | null; requester_phone: string | null;
}

export function mapRequestRow(r: RequestRow, now = new Date()): OwnerRequest {
  return {
    id: r.id,
    status: effectiveStatus(r.status, r.expires_at ?? undefined, now),
    start: r.start_date,
    end: r.end_date,
    expiresAt: r.expires_at ?? undefined,
    monthlyPriceOmr: r.monthly_price_omr == null ? undefined : Number(r.monthly_price_omr),
    createdAt: r.created_at,
    bedCode: r.bed_code,
    roomCode: r.room_code,
    floorLevel: r.floor_level,
    buildingName: { ar: r.building_name_ar, en: r.building_name_en },
    propertyId: r.property_id,
    propertyTitle: { ar: r.property_title_ar, en: r.property_title_en },
    requesterName: r.requester_name ?? undefined,
    requesterPhone: r.requester_phone ?? undefined,
  };
}

export function listOwnerRequests() {
  return guard<OwnerRequest[]>(async (sb) => {
    const { data, error } = await sb.rpc('owner_booking_requests');
    if (error) return fail(error);
    const now = new Date();
    return { ok: true, data: ((data ?? []) as RequestRow[]).map((r) => mapRequestRow(r, now)) };
  });
}

/** قرار المالك. قاعدة البيانات تفرض الانتقالات المسموحة (لا تأكيد لطلب منتهٍ مثلًا). */
export function decideRequest(id: string, status: 'confirmed' | 'rejected' | 'cancelled') {
  return guard(async (sb) => {
    const { data, error } = await sb.from('bookings').update({ status }).eq('id', id).select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

export interface OwnerStats {
  properties: number;
  published: number;
  beds: number;
  occupiedToday: number;
  pendingRequests: number;
}

export function getOwnerStats() {
  return guard<OwnerStats>(async (sb) => {
    const { data, error } = await sb.rpc('owner_dashboard_stats').single();
    if (error) return fail(error);
    const r = data as { properties: number; published: number; beds: number; occupied_today: number; pending_requests: number };
    return { ok: true, data: { properties: r.properties, published: r.published, beds: r.beds, occupiedToday: r.occupied_today, pendingRequests: r.pending_requests } };
  });
}

/** رابط واتساب لرقم عُماني أو دولي. */
export function whatsappLink(phone: string): string | null {
  let digits = phone.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `968${digits}`; // رقم عُماني محلي
  return digits.length >= 10 ? `https://wa.me/${digits}` : null;
}

// =====================================================================
// الإدارة
// =====================================================================

export interface AdminUser {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
  role: 'user' | 'owner' | 'admin';
  createdAt: string;
}

export function adminListUsers(search: string) {
  return guard<AdminUser[]>(async (sb) => {
    const { data, error } = await sb.rpc('admin_list_users', { p_search: search.trim() || null });
    if (error) return fail(error);
    type Row = { id: string; email: string; full_name: string | null; phone: string | null; role: AdminUser['role']; created_at: string };
    return {
      ok: true,
      data: ((data ?? []) as Row[]).map((r) => ({ id: r.id, email: r.email, fullName: r.full_name ?? undefined, phone: r.phone ?? undefined, role: r.role, createdAt: r.created_at })),
    };
  });
}

export function adminSetRole(userId: string, role: AdminUser['role']) {
  return guard(async (sb) => {
    const { error } = await sb.rpc('admin_set_role', { p_user: userId, p_role: role });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

export function adminSetFeatured(propertyId: string, featured: boolean) {
  return guard(async (sb) => {
    const { error } = await sb.rpc('admin_set_featured', { p_property: propertyId, p_featured: featured });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}
