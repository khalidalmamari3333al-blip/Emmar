/**
 * ⚠️ وضع العرض التفاعلي للمستثمرين: "خادم" محاكى يعمل في ذاكرة المتصفح فقط.
 * لا يُرسل أي شيء لأي خادم، ويعود لحالته الأولى عند إعادة التحميل أو "إعادة ضبط العرض".
 * يُستخدم فقط عند EXPO_PUBLIC_USE_MOCK_DATA=true، ويحاكي قواعد قاعدة البيانات الحقيقية
 * (منع الحجز المزدوج، مهلة 48 ساعة، انتقالات الحالة، الإشعارات).
 */
import { mockActiveBookings, mockLayouts } from '@/data/mock/layout';
import { mockProperties } from '@/data/mock/properties';
import { periodsOverlap } from '@/lib/dates';
import { evaluateRules } from '@/services/verificationRules';
import type { BookingStatus } from '@/services/bookings';
import type { NotificationData, NotificationKind } from '@/services/notifications';
import type { BuildingLayout } from '@/types/layout';
import type { Contract } from '@/types/contract';
import type { Payment } from '@/types/payment';
import type { MaintenanceRequest, PropertyReport, PublicReview } from '@/types/postStay';
import type { ListingStatus, PropertyDetail } from '@/types/property';
import type {
  AutomatedStatus,
  DeclaredData,
  HumanStatus,
  ListingVerification,
  OfficialStatus,
  RequestStatus,
  VerificationCheck,
  VerificationDecision,
  VerificationDocument,
  VerificationSubject,
} from '@/types/verification';

export type DemoRole = 'user' | 'owner' | 'admin' | 'verifier';
export type DemoUserRole = DemoRole | 'support';

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: DemoUserRole;
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

export interface DemoVerification {
  id: string;
  subject: VerificationSubject;
  propertyId?: string;
  submittedBy: string;
  status: RequestStatus;
  automatedStatus: AutomatedStatus;
  officialStatus: OfficialStatus;
  humanStatus: HumanStatus;
  declared: DeclaredData;
  identityLast4?: string;
  /** بصمة تجريبية غير قابلة للعكس بسهولة — لا يُخزن الرقم كاملًا */
  identityHash?: string;
  documents: VerificationDocument[];
  checks: VerificationCheck[];
  decisions: (VerificationDecision & { decidedBy: string })[];
  submittedAt?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface DemoLandlord {
  userId: string;
  accountType: 'individual' | 'company';
  legalName?: string;
  companyCr?: string;
  verificationStatus: ListingVerification;
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
  verifier: 'demo-verifier',
} as const;

const HOLD_MS = 48 * 3600 * 1000;

interface State {
  users: DemoUser[];
  properties: DemoProperty[];
  layouts: Record<string, BuildingLayout[]>;
  bookings: DemoBooking[];
  notifications: DemoNotification[];
  audit: DemoAudit[];
  verifications: DemoVerification[];
  landlords: DemoLandlord[];
  contracts: Contract[];
  payments: Payment[];
  maintenance: MaintenanceRequest[];
  reports: (PropertyReport & { reporterId: string })[];
  reviews: (PublicReview & { bookingId: string; propertyId: string; tenantId: string })[];
  paymentTx: { providerRef: string; paymentId: string; type: 'charge' | 'refund'; amountOmr: number; status: 'initiated' | 'succeeded' | 'failed'; createdBy: string }[];
  /** عقد سالم التجريبي يُنشأ عند أول وصول (البصمة تُحسب بشكل غير متزامن) */
  contractsSeeded: boolean;
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
    { id: DEMO_USERS.verifier, email: 'verify@demo.aqari.om', fullName: 'مريم الرواحية', role: 'verifier' },
    { id: 'demo-reem', email: 'reem@demo.aqari.om', fullName: 'ريم الحارثية', phone: '+968 9222 3344', role: 'user' },
    { id: 'demo-ahmed', email: 'ahmed@demo.aqari.om', fullName: 'أحمد الشكيلي', phone: '+968 9777 8899', role: 'user' },
    { id: 'demo-other', email: 'tenant@demo.aqari.om', fullName: 'مستأجر', role: 'user' },
  ];
  // العروض التجريبية موثّقة سلفًا (مراجعة مستندات تجريبية) حتى يظهر شكل الشارة
  const properties: DemoProperty[] = mockProperties.map((p, i) => ({
    ...clone(p), ownerId: DEMO_USERS.owner, status: 'published', updatedAt: iso(now),
    verificationStatus: 'verified', verifiedAt: iso(now - (20 + i) * 864e5), verifiedScope: i < 2 ? 'official_registry' : 'documents_reviewed',
  }));
  // إعلان جديد بانتظار فريق التحقق
  properties.push({
    id: 'demo-pending', ownerId: DEMO_USERS.owner, status: 'draft', updatedAt: iso(now), featured: false,
    kind: 'rent', type: 'apartment', city: 'sohar', title: { ar: 'شقة جديدة في فلج القبائل', en: 'New flat in Falaj Al Qabail' },
    district: { ar: 'فلج القبائل', en: 'Falaj Al Qabail' }, description: { ar: 'إعلان جديد لم يُنشر بعد — بانتظار التوثيق.', en: 'New listing, not yet published — awaiting verification.' },
    priceOmr: 230, pricePeriod: 'monthly', bedrooms: 2, areaSqm: 105, verificationStatus: 'pending', amenities: ['ac', 'parking'], utilities: ['water'],
    depositOmr: 230, cancellationPolicy: 'moderate',
  });
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
  const s: State = { users, properties, layouts, bookings, notifications: [], audit: [], verifications: [], landlords: [], contracts: [], payments: [], paymentTx: [], maintenance: [], reports: [], reviews: [], contractsSeeded: false, currentUserId: null, seq: 1 };
  state = s;
  // طلبان جديدان بانتظار المالك + حجز مؤكد للطالب، حتى لا تبدو اللوحات فارغة
  createBooking('demo-reem', { bedId: 'Y-103-b1', start: '2026-11-01', end: '2027-03-01' }, now - 3 * 3600e3);
  createBooking('demo-ahmed', { bedId: 'KN-102-b2', start: '2026-11-01', end: '2027-03-01' }, now - 20 * 60e3);
  const salem = createBooking(DEMO_USERS.tenant, { bedId: 'KS-003-b1', start: '2026-11-01', end: '2027-03-01' }, now - 2 * 864e5);
  if (salem.status === 'ok') decide(DEMO_USERS.owner, salem.id, 'confirmed', now - 864e5);

  seedPostStay(s, now, salem.status === 'ok' ? salem.id : undefined);

  // المالك التجريبي موثّق، وطلب توثيق واحد بانتظار فريق التحقق
  s.landlords.push({ userId: DEMO_USERS.owner, accountType: 'individual', legalName: 'خالد المعمري', verificationStatus: 'verified' });
  const declared = { deedNumber: 'TEST-OK-1001', declaredOwnerName: 'خالد المعمري', declaredCity: 'sohar' as const, plotNumber: '12/345' };
  const docs: VerificationDocument[] = [
    { id: 'seed-doc-1', docType: 'title_deed', path: `${DEMO_USERS.owner}/seed-ver-1/title_deed.pdf`, mimeType: 'application/pdf', sizeBytes: 482113, sha256: 'a'.repeat(64), uploadedBy: DEMO_USERS.owner, createdAt: iso(now - 5 * 3600e3) },
  ];
  const r = evaluateRules({ subject: 'property', docs, foreignHashes: new Set(), ...declared, listingCity: 'sohar', landlordName: 'خالد المعمري' });
  s.verifications.push({
    id: 'seed-ver-1', subject: 'property', propertyId: 'demo-pending', submittedBy: DEMO_USERS.owner, status: 'submitted',
    automatedStatus: r.automated, officialStatus: r.official, humanStatus: 'pending', declared, documents: docs, checks: r.checks, decisions: [],
    submittedAt: iso(now - 4 * 3600e3), createdAt: iso(now - 5 * 3600e3),
  });
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

/** إقامات سابقة مكتملة وتقييماتها، وطلب صيانة مفتوح، وبلاغ — حتى تظهر لوحات ما بعد السكن. */
function seedPostStay(s: State, now: number, salemBooking?: string) {
  const past = (id: string, userId: string, bedId: string, start: string, end: string): DemoBooking => ({
    id, userId, bedId, start, end, status: 'confirmed', expiresAt: iso(now), monthlyPriceOmr: findBed(bedId)?.bed.monthlyPriceOmr ?? 45, createdAt: iso(now - 400 * 864e5),
  });
  s.bookings.push(
    past('past-reem', 'demo-reem', 'Y-103-b1', '2025-09-01', '2026-01-01'),
    past('past-ahmed', 'demo-ahmed', 'Y-103-b1', '2025-02-01', '2025-06-01'),
    // إقامة سابقة لسالم لم يقيّمها بعد — يستطيع تجربة التقييم
    past('past-salem', DEMO_USERS.tenant, 'Y-103-b1', '2026-02-01', '2026-06-01'),
  );
  const prop = findBed('Y-103-b1')?.propertyId ?? 'mock-2';
  s.reviews.push(
    { id: 'rev-1', bookingId: 'past-reem', propertyId: prop, tenantId: 'demo-reem', rating: 5, comment: 'قريب جدًا من الجامعة، والإنترنت ممتاز، وغرفة المذاكرة هادئة.', reviewer: 'ريم', stayEnd: '2026-01-01', landlordReply: 'شكرًا ريم، سعدنا بإقامتك!', createdAt: iso(now - 250 * 864e5) },
    { id: 'rev-2', bookingId: 'past-ahmed', propertyId: prop, tenantId: 'demo-ahmed', rating: 4, comment: 'نظيف ومرتب، المطبخ المشترك يحتاج تنظيمًا أكثر وقت الذروة.', reviewer: 'أحمد', stayEnd: '2025-06-01', createdAt: iso(now - 480 * 864e5) },
  );
  if (salemBooking) {
    const loc = findBed(s.bookings.find((b) => b.id === salemBooking)!.bedId);
    s.maintenance.push({
      id: 'maint-1', bookingId: salemBooking, propertyId: loc?.propertyId ?? prop, tenantId: DEMO_USERS.tenant, landlordId: DEMO_USERS.owner,
      category: 'ac', priority: 'urgent', title: 'المكيّف يقطر ماء', description: 'منذ يومين في الغرفة 003.', status: 'open', createdAt: iso(now - 5 * 3600e3),
    });
  }
  s.reports.push({ id: 'rep-1', propertyId: 'mock-5', reporterId: 'demo-reem', reason: 'wrong_info', details: 'المساحة المذكورة أكبر من الواقع.', status: 'open', createdAt: iso(now - 26 * 3600e3) });
}
