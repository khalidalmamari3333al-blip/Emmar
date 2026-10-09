import type { LocalizedText } from '@/i18n/types';

export interface BedInfo {
  id: string;
  code: string;
  monthlyPriceOmr: number;
  status: 'active' | 'maintenance';
  position: number;
}

export interface RoomLayout {
  id: string;
  code: string;
  /** الموضع في شبكة مخطط الطابق */
  x: number;
  y: number;
  w: number;
  h: number;
  beds: BedInfo[];
}

export interface FloorLayout {
  id: string;
  level: number; // 0 = الأرضي
  rooms: RoomLayout[];
}

export interface BuildingLayout {
  id: string;
  name: LocalizedText;
  floors: FloorLayout[];
}

/** bedId → متاح للفترة المطلوبة؟ */
export type Availability = Record<string, boolean>;
