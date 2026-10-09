/**
 * ⚠️ بيانات تجريبية فقط — مخطط سكن طلابي وحجوزات وهمية لعقار mock-2.
 * لا تُستخدم إلا عند EXPO_PUBLIC_USE_MOCK_DATA=true.
 */
import type { BuildingLayout, RoomLayout } from '@/types/layout';

function room(id: string, code: string, x: number, y: number, beds: number, opts: { w?: number; maintenance?: number[] } = {}): RoomLayout {
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
      monthlyPriceOmr: beds === 1 ? 70 : beds === 2 ? 50 : 45,
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
};

/** حجوزات وهمية نشطة (pending/confirmed) — الفترة [start, end). */
export const mockActiveBookings: { bedId: string; start: string; end: string }[] = [
  { bedId: 'A-001-b1', start: '2026-09-01', end: '2027-06-01' },
  { bedId: 'A-001-b2', start: '2026-11-01', end: '2027-03-01' },
  { bedId: 'A-002-b1', start: '2027-01-01', end: '2027-05-01' },
  { bedId: 'A-101-b1', start: '2026-09-01', end: '2027-09-01' },
  { bedId: 'A-101-b2', start: '2026-09-01', end: '2027-09-01' },
  { bedId: 'B-001-b2', start: '2027-02-01', end: '2027-03-01' },
];
