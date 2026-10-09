/**
 * تنفيذ الخدمات في وضع العرض التفاعلي فوق المخزن المحلي (src/demo/store.ts).
 * نفس واجهات الخدمات الحقيقية حتى تعمل الشاشات كما هي.
 */
import type { LocalizedText } from '@/i18n/types';
import type { AuthBackend, AuthUser } from '@/lib/auth';
import type { MyBooking } from '@/services/bookings';
import type { AppNotification, NotificationsBackend } from '@/services/notifications';
import type { AdminUser, ImageAsset, OwnerProperty, OwnerRequest, OwnerStats, PropertyInput, Result } from '@/services/owner';
import type { Availability, BuildingLayout } from '@/types/layout';
import type { City, ListingStatus, PropertyDetail, PropertySummary, SearchFilters } from '@/types/property';

import { bedIsFree, createBooking, decide, DEMO_USERS, DemoProperty, DemoRole, demoState, findBed, newId, notifyChange, setCurrentUser, subscribe } from './store';

const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
const me = () => demoState().currentUserId;

// ---------------------------------------------------------------------
// الحسابات التجريبية
// ---------------------------------------------------------------------

const toAuthUser = (id: string | null): AuthUser | null => {
  const u = id ? demoState().users.find((x) => x.id === id) : null;
  return u ? { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role } : null;
};

export const demoAuthBackend: AuthBackend & { signInAs(role: DemoRole): Promise<void> } = {
  async current() {
    return toAuthUser(me());
  },
  subscribe(cb) {
    return subscribe(() => cb(toAuthUser(me())));
  },
  async signIn(email) {
    const u = demoState().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return { ok: false, code: 'invalid_credentials' };
    setCurrentUser(u.id);
    return { ok: true };
  },
  async signUp(fullName, email) {
    if (demoState().users.some((x) => x.email.toLowerCase() === email.toLowerCase())) return { ok: false, code: 'email_taken' };
    const id = newId('u');
    demoState().users.push({ id, email, fullName, role: 'user' });
    setCurrentUser(id);
    return { ok: true, needsConfirmation: false };
  },
  async signOut() {
    setCurrentUser(null);
  },
  async updateProfile(userId, patch) {
    const u = demoState().users.find((x) => x.id === userId);
    if (!u) return false;
    if (patch.fullName !== undefined) u.fullName = patch.fullName.trim();
    if (patch.phone !== undefined) u.phone = patch.phone.trim() || undefined;
    notifyChange();
    return true;
  },
  async signInAs(role) {
    setCurrentUser(role === 'owner' ? DEMO_USERS.owner : role === 'admin' ? DEMO_USERS.admin : DEMO_USERS.tenant);
  },
};

// ---------------------------------------------------------------------
// العقارات (العامة: المنشور فقط)
// ---------------------------------------------------------------------

const published = () => demoState().properties.filter((p) => p.status === 'published');
const toDetail = (p: DemoProperty): PropertyDetail => {
  const { ownerId: _o, status: _s, updatedAt: _u, ...rest } = p;
  return rest;
};

export const demoProperties = {
  featured: (city: City): PropertySummary[] => published().filter((p) => p.city === city && p.featured).map(toDetail),
  search: (match: (p: PropertySummary) => boolean): PropertySummary[] =>
    published()
      .filter(match)
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .map(toDetail),
  byId: (id: string): PropertyDetail | null => {
    const p = published().find((x) => x.id === id);
    return p ? toDetail(p) : null;
  },
};

export const demoBeds = {
  layout: (propertyId: string): BuildingLayout[] => demoState().layouts[propertyId] ?? [],
  availability(propertyId: string, start: string, end: string): Availability {
    const out: Availability = {};
    for (const b of demoState().layouts[propertyId] ?? []) for (const f of b.floors) for (const r of f.rooms) for (const bed of r.beds) out[bed.id] = bedIsFree(bed.id, start, end);
    return out;
  },
};

// ---------------------------------------------------------------------
// حجوزاتي
// ---------------------------------------------------------------------

function bookingView(id: string): Omit<MyBooking, 'id' | 'status' | 'start' | 'end' | 'createdAt'> {
  const b = demoState().bookings.find((x) => x.id === id)!;
  const loc = findBed(b.bedId);
  const p = loc && demoState().properties.find((x) => x.id === loc.propertyId);
  return {
    expiresAt: b.expiresAt,
    monthlyPriceOmr: b.monthlyPriceOmr,
    bedCode: loc?.bed.code,
    roomCode: loc?.room.code,
    floorLevel: loc?.floor.level,
    buildingName: loc?.building.name,
    propertyId: p?.id,
    propertyTitle: p?.title,
  };
}

export const demoBookings = {
  create: (userId: string, req: { bedId: string; start: string; end: string }) => createBooking(userId, req),
  listMine: (userId: string): MyBooking[] =>
    demoState()
      .bookings.filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => ({
        id: b.id,
        status: b.status === 'pending' && Date.parse(b.expiresAt) < Date.now() ? 'expired' : b.status,
        start: b.start,
        end: b.end,
        createdAt: b.createdAt,
        ...bookingView(b.id),
      })),
  cancel: (id: string) => (me() ? decide(me()!, id, 'cancelled') : false),
};

// ---------------------------------------------------------------------
// الإشعارات
// ---------------------------------------------------------------------

export const demoNotifications: NotificationsBackend = {
  async list(): Promise<AppNotification[]> {
    return demoState()
      .notifications.filter((n) => n.userId === me())
      .map((n) => ({ id: n.id, kind: n.kind, bookingId: n.bookingId, data: n.data, readAt: n.readAt, createdAt: n.createdAt }));
  },
  async unreadCount() {
    return demoState().notifications.filter((n) => n.userId === me() && !n.readAt).length;
  },
  async markRead(ids) {
    const now = new Date().toISOString();
    demoState().notifications.forEach((n) => n.userId === me() && ids.includes(n.id) && !n.readAt && (n.readAt = now));
    notifyChange();
  },
  async markAllRead() {
    const now = new Date().toISOString();
    demoState().notifications.forEach((n) => n.userId === me() && !n.readAt && (n.readAt = now));
    notifyChange();
  },
};

// ---------------------------------------------------------------------
// لوحة المالك
// ---------------------------------------------------------------------

function toOwnerProperty(p: DemoProperty): OwnerProperty {
  return {
    id: p.id,
    title: p.title,
    city: p.city,
    kind: p.kind,
    status: p.status,
    featured: p.featured,
    imageUrl: p.imageUrl,
    updatedAt: p.updatedAt,
    input: {
      kind: p.kind, type: p.type, city: p.city, districtAr: p.district.ar, districtEn: p.district.en, titleAr: p.title.ar, titleEn: p.title.en,
      descriptionAr: p.description.ar, descriptionEn: p.description.en, price: String(p.priceOmr), bedrooms: p.bedrooms == null ? '' : String(p.bedrooms),
      area: p.areaSqm == null ? '' : String(p.areaSqm), status: p.status,
    },
  };
}

const canManage = (p: DemoProperty) => {
  const u = demoState().users.find((x) => x.id === me());
  return !!u && (p.ownerId === u.id || u.role === 'admin');
};
const propertyOfFloor = (floorId: string) => Object.entries(demoState().layouts).find(([, bs]) => bs.some((b) => b.floors.some((f) => f.id === floorId)));

function applyInput(p: Partial<DemoProperty>, i: PropertyInput, toNum: (s: string) => number | undefined) {
  Object.assign(p, {
    kind: i.kind, type: i.type, city: i.city,
    title: { ar: i.titleAr.trim(), en: i.titleEn.trim() },
    district: { ar: i.districtAr.trim(), en: i.districtEn.trim() },
    description: { ar: i.descriptionAr.trim(), en: i.descriptionEn.trim() },
    priceOmr: toNum(i.price) ?? 0,
    pricePeriod: i.kind === 'sale' ? 'total' : 'monthly',
    bedrooms: i.kind === 'student' ? undefined : toNum(i.bedrooms),
    areaSqm: toNum(i.area),
    status: i.status,
    updatedAt: new Date().toISOString(),
  });
}

export const demoOwner = {
  listMine: (ownerId: string) => ok(demoState().properties.filter((p) => p.ownerId === ownerId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(toOwnerProperty)),
  listAll: (status?: ListingStatus) => ok(demoState().properties.filter((p) => !status || p.status === status).map(toOwnerProperty)),
  get: (id: string) => {
    const p = demoState().properties.find((x) => x.id === id);
    return ok(p && canManage(p) ? toOwnerProperty(p) : null);
  },
  create(ownerId: string, input: PropertyInput, toNum: (s: string) => number | undefined): Result<string> {
    const id = newId('demo-p');
    const p = { id, ownerId, featured: false } as DemoProperty;
    applyInput(p, input, toNum);
    demoState().properties.unshift(p);
    demoState().layouts[id] = [];
    notifyChange();
    return ok(id);
  },
  update(id: string, input: PropertyInput, toNum: (s: string) => number | undefined): Result {
    const p = demoState().properties.find((x) => x.id === id);
    if (!p || !canManage(p)) return { ok: false, code: 'not_allowed' };
    applyInput(p, input, toNum);
    notifyChange();
    return ok(undefined);
  },
  setStatus(id: string, status: ListingStatus): Result {
    const p = demoState().properties.find((x) => x.id === id);
    if (!p || !canManage(p)) return { ok: false, code: 'not_allowed' };
    p.status = status;
    notifyChange();
    return ok(undefined);
  },
  /** في العرض تُستخدم الصورة المختارة مباشرة من الجهاز (لا رفع لأي خادم). */
  upload(id: string, asset: ImageAsset): Result<string> {
    const p = demoState().properties.find((x) => x.id === id);
    if (!p || !canManage(p)) return { ok: false, code: 'not_allowed' };
    p.imageUrl = asset.uri;
    notifyChange();
    return ok(asset.uri);
  },
  addBuilding(propertyId: string, name: LocalizedText): Result<string> {
    const id = newId('bld');
    (demoState().layouts[propertyId] ??= []).push({ id, name: { ar: name.ar.trim(), en: name.en.trim() }, floors: [] });
    notifyChange();
    return ok(id);
  },
  addFloor(buildingId: string, level: number): Result<string> {
    for (const bs of Object.values(demoState().layouts)) {
      const b = bs.find((x) => x.id === buildingId);
      if (b) {
        const id = newId('flr');
        b.floors.push({ id, level, rooms: [] });
        b.floors.sort((a, c) => a.level - c.level);
        notifyChange();
        return ok(id);
      }
    }
    return { ok: false, code: 'not_allowed' };
  },
  addRooms(floorId: string, codes: string[], bedsPerRoom: number, price: number): Result<number> {
    const entry = propertyOfFloor(floorId);
    const floor = entry?.[1].flatMap((b) => b.floors).find((f) => f.id === floorId);
    if (!floor) return { ok: false, code: 'not_allowed' };
    const start = floor.rooms.length;
    codes.forEach((code, i) => {
      const rid = newId('room');
      floor.rooms.push({
        id: rid, code, x: (start + i) % 3, y: Math.floor((start + i) / 3), w: 1, h: 1,
        beds: Array.from({ length: bedsPerRoom }, (_, k) => ({ id: `${rid}-b${k + 1}`, code: String(k + 1), monthlyPriceOmr: price, status: 'active' as const, position: k + 1 })),
      });
    });
    notifyChange();
    return ok(codes.length);
  },
  updateBed(bedId: string, patch: { status?: 'active' | 'maintenance'; monthlyPriceOmr?: number }): Result {
    const loc = findBed(bedId);
    if (!loc) return { ok: false, code: 'not_allowed' };
    if (patch.status) loc.bed.status = patch.status;
    if (patch.monthlyPriceOmr !== undefined) loc.bed.monthlyPriceOmr = patch.monthlyPriceOmr;
    notifyChange();
    return ok(undefined);
  },
  deleteRoom(roomId: string): Result {
    for (const bs of Object.values(demoState().layouts))
      for (const b of bs)
        for (const f of b.floors) {
          const r = f.rooms.find((x) => x.id === roomId);
          if (!r) continue;
          if (demoState().bookings.some((bk) => r.beds.some((bd) => bd.id === bk.bedId))) return { ok: false, code: 'in_use' };
          f.rooms = f.rooms.filter((x) => x.id !== roomId);
          notifyChange();
          return ok(undefined);
        }
    return { ok: false, code: 'not_allowed' };
  },
  requests(): Result<OwnerRequest[]> {
    const uid = me();
    const isAdmin = demoState().users.find((u) => u.id === uid)?.role === 'admin';
    const now = Date.now();
    const rows = demoState()
      .bookings.filter((b) => b.userId !== 'demo-other') // الحجوزات المزروعة الخلفية لا تظهر كطلبات
      .map((b) => ({ b, loc: findBed(b.bedId) }))
      .filter(({ loc }) => loc && (isAdmin || demoState().properties.find((p) => p.id === loc.propertyId)?.ownerId === uid))
      .sort((x, y) => y.b.createdAt.localeCompare(x.b.createdAt))
      .map(({ b, loc }) => {
        const p = demoState().properties.find((x) => x.id === loc!.propertyId)!;
        const u = demoState().users.find((x) => x.id === b.userId);
        return {
          id: b.id, status: b.status === 'pending' && Date.parse(b.expiresAt) < now ? 'expired' : b.status, start: b.start, end: b.end,
          expiresAt: b.expiresAt, monthlyPriceOmr: b.monthlyPriceOmr, createdAt: b.createdAt, bedCode: loc!.bed.code, roomCode: loc!.room.code,
          floorLevel: loc!.floor.level, buildingName: loc!.building.name, propertyId: p.id, propertyTitle: p.title,
          requesterName: u?.fullName, requesterPhone: u?.phone,
        } as OwnerRequest;
      });
    return ok(rows);
  },
  decide: (id: string, status: 'confirmed' | 'rejected' | 'cancelled'): Result => (me() && decide(me()!, id, status) ? ok(undefined) : { ok: false, code: 'not_allowed' }),
  stats(): Result<OwnerStats> {
    const uid = me();
    const mine = demoState().properties.filter((p) => p.ownerId === uid);
    const bedIds = mine.flatMap((p) => (demoState().layouts[p.id] ?? []).flatMap((b) => b.floors.flatMap((f) => f.rooms.flatMap((r) => r.beds.map((x) => x.id)))));
    const today = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const bk = demoState().bookings.filter((b) => bedIds.includes(b.bedId));
    return ok({
      properties: mine.length,
      published: mine.filter((p) => p.status === 'published').length,
      beds: bedIds.length,
      occupiedToday: new Set(bk.filter((b) => b.status === 'confirmed' && b.start <= today && today < b.end).map((b) => b.bedId)).size,
      pendingRequests: bk.filter((b) => b.status === 'pending' && Date.parse(b.expiresAt) >= now).length,
    });
  },
};

export const demoAdmin = {
  listUsers(search: string): Result<AdminUser[]> {
    const q = search.trim().toLowerCase();
    return ok(
      demoState()
        .users.filter((u) => u.id !== 'demo-other' && (!q || u.email.toLowerCase().includes(q) || u.fullName.includes(search.trim())))
        .map((u) => ({ id: u.id, email: u.email, fullName: u.fullName, phone: u.phone, role: u.role, createdAt: '' })),
    );
  },
  setRole(userId: string, role: AdminUser['role']): Result {
    if (userId === me()) return { ok: false, code: 'not_allowed' };
    const u = demoState().users.find((x) => x.id === userId);
    if (!u) return { ok: false, code: 'not_allowed' };
    u.role = role;
    notifyChange();
    return ok(undefined);
  },
  setFeatured(id: string, featured: boolean): Result {
    const p = demoState().properties.find((x) => x.id === id);
    if (!p) return { ok: false, code: 'not_allowed' };
    p.featured = featured;
    notifyChange();
    return ok(undefined);
  },
};

export type { SearchFilters };
