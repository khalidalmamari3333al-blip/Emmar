import type { SupabaseClient } from '@supabase/supabase-js';

import { demoNotifications } from '@/demo/services';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type { Locale, Strings } from '@/i18n/types';

export type NotificationKind =
  | 'booking_requested'
  | 'booking_cancelled_by_tenant'
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_cancelled_by_owner'
  | 'booking_expired';

export interface NotificationData {
  property_id?: string;
  property_title_ar?: string;
  property_title_en?: string;
  bed_code?: string;
  room_code?: string;
  start_date?: string;
  end_date?: string;
  requester_name?: string | null;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  bookingId?: string;
  data: NotificationData;
  readAt?: string;
  createdAt: string;
}

/** الإشعارات الموجهة للمالك تفتح صندوق الطلبات؛ الباقي يفتح "حجوزاتي". */
export const isOwnerKind = (k: NotificationKind) => k === 'booking_requested' || k === 'booking_cancelled_by_tenant';
export const targetRoute = (k: NotificationKind) => (isOwnerKind(k) ? '/owner/requests' : '/bookings');

/** نص الإشعار في التطبيق (يطابق notification_text في قاعدة البيانات). */
export function notificationText(n: Pick<AppNotification, 'kind' | 'data'>, t: Strings, locale: Locale): { title: string; body: string } {
  const prop = (locale === 'ar' ? n.data.property_title_ar : n.data.property_title_en) ?? '';
  const bed = n.data.bed_code ? `${t.beds.bed(n.data.bed_code)} · ${t.beds.room(n.data.room_code ?? '')}` : '';
  const k = t.notifications.kinds[n.kind];
  return { title: k.title, body: k.body({ bed, property: prop, name: n.data.requester_name || t.requests.noName }) };
}

interface Row { id: string; kind: NotificationKind; booking_id: string | null; data: NotificationData; read_at: string | null; created_at: string }
const map = (r: Row): AppNotification => ({ id: r.id, kind: r.kind, bookingId: r.booking_id ?? undefined, data: r.data ?? {}, readAt: r.read_at ?? undefined, createdAt: r.created_at });

export interface NotificationsBackend {
  list(): Promise<AppNotification[]>;
  unreadCount(): Promise<number>;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<void>;
}

export function supabaseNotifications(sb?: SupabaseClient | null): NotificationsBackend | null {
  if (sb === undefined && readConfig().useMockData) return demoNotifications;
  sb = sb === undefined ? getSupabase() : sb;
  if (!sb) return null;
  return {
    async list() {
      const { data, error } = await sb.from('notifications').select('id,kind,booking_id,data,read_at,created_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return ((data ?? []) as Row[]).map(map);
    },
    async unreadCount() {
      const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    async markRead(ids) {
      if (!ids.length) return;
      const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
      if (error) throw new Error(error.message);
    },
    async markAllRead() {
      const { error } = await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
      if (error) throw new Error(error.message);
    },
  };
}

/** وقت نسبي قصير: "الآن"، "منذ 5 د"، "منذ 3 س"، أو التاريخ. */
export function timeAgo(iso: string, t: Strings, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return t.notifications.justNow;
  if (s < 3600) return t.notifications.minutesAgo(Math.floor(s / 60));
  if (s < 86400) return t.notifications.hoursAgo(Math.floor(s / 3600));
  return t.notifications.daysAgo(Math.floor(s / 86400));
}
