/**
 * ⚠️ بيانات تجريبية فقط — للتطوير والاختبار.
 * لا تُستخدم إلا عند EXPO_PUBLIC_USE_MOCK_DATA=true وتظهر بجانبها شارة "بيانات تجريبية".
 */
import type { PropertySummary } from '@/types/property';

export const mockProperties: PropertySummary[] = [
  { id: 'mock-1', title: 'شقة غرفتين قرب الكورنيش', city: 'sohar', district: 'الطريف', kind: 'rent', type: 'apartment', priceOmr: 220, pricePeriod: 'monthly', bedrooms: 2, areaSqm: 110, featured: true },
  { id: 'mock-2', title: 'سكن طلابي قرب الجامعة', city: 'sohar', district: 'الهمبار', kind: 'student', type: 'student_bed', priceOmr: 45, pricePeriod: 'monthly', featured: true },
  { id: 'mock-3', title: 'فيلا بطابع عُماني حديث', city: 'muscat', district: 'العذيبة', kind: 'sale', type: 'villa', priceOmr: 185000, pricePeriod: 'total', bedrooms: 5, areaSqm: 420, featured: true },
  { id: 'mock-4', title: 'استوديو مفروش', city: 'muscat', district: 'الخوير', kind: 'rent', type: 'studio', priceOmr: 180, pricePeriod: 'monthly', areaSqm: 45, featured: true },
  { id: 'mock-5', title: 'أرض سكنية', city: 'sohar', district: 'فلج القبائل', kind: 'sale', type: 'land', priceOmr: 28000, pricePeriod: 'total', areaSqm: 600, featured: false },
];
