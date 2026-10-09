/**
 * ⚠️ بيانات تجريبية فقط — مخطط سكن طلابي وحجوزات وهمية لعقار mock-2.
 * لا تُستخدم إلا عند EXPO_PUBLIC_USE_MOCK_DATA=true.
 */
import type { BuildingLayout, RoomLayout } from '@/types/layout';

function room(id: string, code: string, x: number, y: number, beds: number, opts: { w?: number; maintenance?: number[]; price?: number } = {}): RoomLayout {
  return {
    id,
    code,
    x,
    y,
    w: opts.w ?? 1,
    h: 1,
    beds: Array.from({ length: beds }, (_, i) => ({
      id: `${id}-b${i + 1}`,
      code: String(i + 1),
      monthlyPriceOmr: opts.price ?? (beds === 1 ? 70 : beds === 2 ? 50 : 45),
      status: opts.maintenance?.includes(i + 1) ? 'maintenance' : 'active',
      position: i + 1,
    })),
  };
}

export const mockLayouts: Record<string, BuildingLayout[]> = {
  'mock-2': [
    {
      id: 'mock-bA',
      name: { ar: 'المبنى أ', en: 'Building A' },
      floors: [
        { id: 'mock-fA0', level: 0, rooms: [room('A-001', '001', 0, 0, 3), room('A-002', '002', 1, 0, 2), room('A-003', '003', 0, 1, 4, { w: 2, maintenance: [4] })] },
        { id: 'mock-fA1', level: 1, rooms: [room('A-101', '101', 0, 0, 2), room('A-102', '102', 1, 0, 1), room('A-103', '103', 0, 1, 3, { w: 2 })] },
      ],
    },
    {
      id: 'mock-bB',
      name: { ar: 'المبنى ب', en: 'Building B' },
      floors: [{ id: 'mock-fB0', level: 0, rooms: [room('B-001', '001', 0, 0, 2), room('B-002', '002', 1, 0, 2)] }],
    },
  ],
  // سكن الياسمين للطالبات — صحار: مبنى واحد بثلاثة طوابق
  'mock-9': [
    {
      id: 'mock-yas',
      name: { ar: 'مبنى الياسمين', en: 'Yasmeen Building' },
      floors: [0, 1, 2].map((lvl) => ({
        id: `mock-yas-f${lvl}`,
        level: lvl,
        rooms: [
          room(`Y-${lvl}01`, `${lvl}01`, 0, 0, 2, { price: 60 }),
          room(`Y-${lvl}02`, `${lvl}02`, 1, 0, 2, { price: 60 }),
          room(`Y-${lvl}03`, `${lvl}03`, 2, 0, 1, { price: 85 }),
          room(`Y-${lvl}04`, `${lvl}04`, 0, 1, 3, { w: 2, price: 55, maintenance: lvl === 2 ? [3] : [] }),
          room(`Y-${lvl}05`, `${lvl}05`, 2, 1, 1, { price: 85 }),
        ],
      })),
    },
  ],
  // سكن الخوض للطلاب — مسقط: مبنيان
  'mock-15': [
    {
      id: 'mock-kh1',
      name: { ar: 'المبنى الشمالي', en: 'North Building' },
      floors: [0, 1].map((lvl) => ({
        id: `mock-kh1-f${lvl}`,
        level: lvl,
        rooms: [
          room(`KN-${lvl}01`, `${lvl}01`, 0, 0, 4, { w: 2, price: 60 }),
          room(`KN-${lvl}02`, `${lvl}02`, 2, 0, 2, { price: 75 }),
          room(`KN-${lvl}03`, `${lvl}03`, 0, 1, 2, { price: 75 }),
          room(`KN-${lvl}04`, `${lvl}04`, 1, 1, 2, { price: 75 }),
          room(`KN-${lvl}05`, `${lvl}05`, 2, 1, 1, { price: 95 }),
        ],
      })),
    },
    {
      id: 'mock-kh2',
      name: { ar: 'المبنى الجنوبي', en: 'South Building' },
      floors: [{ id: 'mock-kh2-f0', level: 0, rooms: [room('KS-001', '001', 0, 0, 3, { price: 60 }), room('KS-002', '002', 1, 0, 3, { price: 60 }), room('KS-003', '003', 2, 0, 2, { price: 75 })] }],
    },
  ],
};

/** حجوزات وهمية نشطة (pending/confirmed) — الفترة [start, end). */
export const mockActiveBookings: { bedId: string; start: string; end: string }[] = [
  { bedId: 'A-001-b1', start: '2026-09-01', end: '2027-06-01' },
  { bedId: 'A-001-b2', start: '2026-11-01', end: '2027-03-01' },
  { bedId: 'A-002-b1', start: '2027-01-01', end: '2027-05-01' },
  { bedId: 'A-101-b1', start: '2026-09-01', end: '2027-09-01' },
  { bedId: 'A-101-b2', start: '2026-09-01', end: '2027-09-01' },
  { bedId: 'B-001-b2', start: '2027-02-01', end: '2027-03-01' },
  // الياسمين: إشغال مرتفع في الطابق الأرضي
  ...['Y-001-b1', 'Y-001-b2', 'Y-002-b1', 'Y-003-b1', 'Y-004-b1', 'Y-004-b2', 'Y-101-b1', 'Y-105-b1'].map((bedId) => ({ bedId, start: '2026-09-01', end: '2027-06-01' })),
  { bedId: 'Y-102-b2', start: '2027-01-01', end: '2027-05-01' },
  // الخوض: فصل دراسي
  ...['KN-001-b1', 'KN-001-b2', 'KN-001-b3', 'KN-002-b1', 'KN-101-b1', 'KN-104-b2', 'KS-001-b1', 'KS-002-b3'].map((bedId) => ({ bedId, start: '2026-09-01', end: '2027-01-01' })),
  { bedId: 'KN-003-b1', start: '2026-11-01', end: '2027-06-01' },
];
