/**
 * ⚠️ وضع العرض التفاعلي للمستثمرين: "خادم" محاكى يعمل في ذاكرة المتصفح فقط.
 * لا يُرسل أي شيء لأي خادم، ويعود لحالته الأولى عند إعادة التحميل أو "إعادة ضبط العرض".
 * يُستخدم فقط عند EXPO_PUBLIC_USE_MOCK_DATA=true، ويحاكي قواعد قاعدة البيانات الحقيقية
 * (منع الحجز المزدوج، مهلة 48 ساعة، انتقالات الحالة، الإشعارات).
 */
import { mockActiveBookings, mockLayouts } from '@/data/mock/layout';
import { mockProperties } from '@/data/mock/properties';
import { periodsOverlap } from '@/lib/dates';
import type { BookingStatus } from '@/services/bookings';
import type { NotificationData, NotificationKind } from '@/services/notifications';
import type { BuildingLayout } from '@/types/layout';
import type { ListingStatus, PropertyDetail } from '@/types/property';

export type DemoRole = 'user' | 'owner' | 'admin';

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: DemoRole;
}

export interface DemoImage {
  id: string;
  url: string;
  position: number;
  isCover: boolean;
}

export interface DemoAudit {
  id: number;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DemoProperty extends PropertyDetail {
  ownerId: string;
  gallery?: DemoImage[];
  status: ListingStatus;
  updatedAt: string;
}

export interface DemoBooking {
  id: string;
  userId: string;
  bedId: string;
  start: string;
  end: string;
  status: BookingStatus;
  expiresAt: string;
  monthlyPriceOmr: number;
  createdAt: string;
}

export interface DemoNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  bookingId: string;
  data: NotificationData;
  readAt?: string;
  createdAt: string;
}

export const DEMO_USERS = {
  tenant: 'demo-tenant',
  owner: 'demo-owner',
  admin: 'demo-admin',
} as const;

const HOLD_MS = 48 * 3600 * 1000;

interface State {
  users: DemoUser[];
  properties: DemoProperty[];
  layouts: Record<string, BuildingLayout[]>;
  bookings: DemoBooking[];
  notifications: DemoNotification[];
  audit: DemoAudit[];
  currentUserId: string | null;
  seq: number;
}

let state: State;
const listeners = new Set<() => void>();

const iso = (ms: number) => new Date(ms).toISOString();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function seed(now = Date.now()): State {
  const users: DemoUser[] = [
    { id: DEMO_USERS.tenant, email: 'salem@demo.aqari.om', fullName: 'سالم البلوشي', phone: '+968 9123 4567', role: 'user' },
    { id: DEMO_USERS.owner, email: 'khalid@demo.aqari.om', fullName: 'خالد المعمري', phone: '+968 9555 0101', role: 'owner' },
    { id: DEMO_USERS.admin, email: 'admin@demo.aqari.om', fullName: 'مدير المنصة', role: 'admin' },
    { id: 'demo-reem', email: 'reem@demo.aqari.om', fullName: 'ريم الحارثية', phone: '+968 9222 3344', role: 'user' },
    { id: 'demo-ahmed', email: 'ahmed@demo.aqari.om', fullName: 'أحمد الشكيلي', phone: '+968 9777 8899', role: 'user' },
    { id: 'demo-other', email: 'tenant@demo.aqari.om', fullName: 'مستأجر', role: 'user' },
  ];
  const properties: DemoProperty[] = mockProperties.map((p) => ({ ...clone(p), ownerId: DEMO_USERS.owner, status: 'published', updatedAt: iso(now) }));
  const layouts = clone(mockLayouts);
  const bookings: DemoBooking[] = mockActiveBookings.map((b, i) => ({
    id: `seed-${i}`,
    userId: 'demo-other',
    bedId: b.bedId,
    start: b.start,
    end: b.end,
    status: 'confirmed',
    expiresAt: iso(now),
    monthlyPriceOmr: 50,
    createdAt: iso(now - 30 * 864e5),
  }));
  const s: State = { users, properties, layouts, bookings, notifications: [], audit: [], currentUserId: null, seq: 1 };
  state = s;
  // طلبان جديدان بانتظار المالك + حجز مؤكد للطالب، حتى لا تبدو اللوحات فارغة
  createBooking('demo-reem', { bedId: 'Y-103-b1', start: '2026-11-01', end: '2027-03-01' }, now - 3 * 3600e3);
  createBooking('demo-ahmed', { bedId: 'KN-102-b2', start: '2026-11-01', end: '2027-03-01' }, now - 20 * 60e3);
  const salem = createBooking(DEMO_USERS.tenant, { bedId: 'KS-003-b1', start: '2026-11-01', end: '2027-03-01' }, now - 2 * 864e5);
  if (salem.status === 'ok') decide(DEMO_USERS.owner, salem.id, 'confirmed', now - 864e5);
  return s;
}

const emit = () => listeners.forEach((l) => l());
const nextId = (p: string) => `${p}-${state.seq++}`;

export function demoState(): State {
  if (!state) seed();
  return state;
}
export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function resetDemo() {
  seed();
  emit();
}

// ---------- الأسرّة والعقارات ----------

export function findBed(bedId: string) {
  const s = demoState();
  for (const [propertyId, buildings] of Object.entries(s.layouts))
    for (const b of buildings)
      for (const f of b.floors)
        for (const r of f.rooms) {
          const bed = r.beds.find((x) => x.id === bedId);
          if (bed) return { propertyId, building: b, floor: f, room: r, bed };
        }
  return null;
}

const isActive = (b: DemoBooking, now: number) => b.status === 'confirmed' || (b.status === 'pending' && Date.parse(b.expiresAt) >= now);

export function bedIsFree(bedId: string, start: string, end: string, now = Date.now()) {
  const loc = findBed(bedId);
  if (!loc || loc.bed.status !== 'active') return false;
  return !demoState().bookings.some((b) => b.bedId === bedId && isActive(b, now) && periodsOverlap(b.start, b.end, start, end));
}

// ---------- الإشعارات (نفس منطق مشغّل قاعدة البيانات) ----------

function notify(userId: string, kind: NotificationKind, booking: DemoBooking, at: number) {
  const loc = findBed(booking.bedId);
  const p = loc && demoState().properties.find((x) => x.id === loc.propertyId);
  const requester = demoState().users.find((u) => u.id === booking.userId);
  demoState().notifications.unshift({
    id: nextId('n'),
    userId,
    kind,
    bookingId: booking.id,
    createdAt: iso(at),
    data: {
      property_id: p?.id,
      property_title_ar: p?.title.ar,
      property_title_en: p?.title.en,
      bed_code: loc?.bed.code,
      room_code: loc?.room.code,
      start_date: booking.start,
      end_date: booking.end,
      requester_name: requester?.fullName ?? null,
    },
  });
}

const ownerOfBed = (bedId: string) => {
  const loc = findBed(bedId);
  return loc ? demoState().properties.find((p) => p.id === loc.propertyId)?.ownerId : undefined;
};

// ---------- الحجوزات ----------

export function createBooking(userId: string, req: { bedId: string; start: string; end: string }, now = Date.now()): { status: 'ok'; id: string } | { status: 'conflict' | 'not_allowed' } {
  const loc = findBed(req.bedId);
  const p = loc && demoState().properties.find((x) => x.id === loc.propertyId);
  if (!loc || !p || p.status !== 'published' || p.kind !== 'student' || !(req.end > req.start)) return { status: 'not_allowed' };
  // الطلبات المعلقة المنتهية لا تحجب السرير (كما في قاعدة البيانات)
  for (const b of demoState().bookings) if (b.bedId === req.bedId && b.status === 'pending' && Date.parse(b.expiresAt) < now) b.status = 'expired';
  if (!bedIsFree(req.bedId, req.start, req.end, now)) return { status: 'conflict' };
  const booking: DemoBooking = {
    id: nextId('b'), userId, bedId: req.bedId, start: req.start, end: req.end, status: 'pending',
    expiresAt: iso(now + HOLD_MS), monthlyPriceOmr: loc.bed.monthlyPriceOmr, createdAt: iso(now),
  };
  demoState().bookings.push(booking);
  notify(p.ownerId, 'booking_requested', booking, now);
  emit();
  return { status: 'ok', id: booking.id };
}

/** نفس انتقالات الحالة المسموحة في قاعدة البيانات. */
export function decide(actorId: string, bookingId: string, status: 'confirmed' | 'rejected' | 'cancelled', now = Date.now()): boolean {
  const b = demoState().bookings.find((x) => x.id === bookingId);
  if (!b) return false;
  const actor = demoState().users.find((u) => u.id === actorId);
  const isManager = ownerOfBed(b.bedId) === actorId || actor?.role === 'admin';
  const isRequester = b.userId === actorId;
  const expired = b.status === 'pending' && Date.parse(b.expiresAt) < now;
  let ok = false;
  if (isManager && b.status === 'pending' && !expired && (status === 'confirmed' || status === 'rejected')) ok = true;
  else if (isManager && b.status === 'confirmed' && status === 'cancelled') ok = true;
  else if (isRequester && (b.status === 'pending' || b.status === 'confirmed') && status === 'cancelled') ok = true;
  if (!ok) return false;
  b.status = status;
  if (status === 'confirmed') notify(b.userId, 'booking_confirmed', b, now);
  else if (status === 'rejected') notify(b.userId, 'booking_rejected', b, now);
  else if (isRequester) notify(ownerOfBed(b.bedId)!, 'booking_cancelled_by_tenant', b, now);
  else notify(b.userId, 'booking_cancelled_by_owner', b, now);
  emit();
  return true;
}

export function setCurrentUser(id: string | null) {
  demoState().currentUserId = id;
  emit();
}

export function notifyChange() {
  emit();
}

export function newId(prefix: string) {
  return nextId(prefix);
}

/** يحاكي مشغلات audit_logs: سجل للعمليات الحساسة لا يُعدَّل. */
export function audit(action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const s = demoState();
  s.audit.unshift({ id: s.seq++, actorId: s.currentUserId, action, entity, entityId, details, createdAt: new Date().toISOString() });
}
