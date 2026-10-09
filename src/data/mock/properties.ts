/**
 * ⚠️ بيانات تجريبية فقط — للتطوير والاختبار.
 * لا تُستخدم إلا عند EXPO_PUBLIC_USE_MOCK_DATA=true وتظهر بجانبها شارة "بيانات تجريبية".
 */
import type { PropertySummary } from '@/types/property';

export const mockProperties: PropertySummary[] = [
  { id: 'mock-1', title: { ar: 'شقة غرفتين قرب الكورنيش', en: '2-bedroom flat near the Corniche' }, city: 'sohar', district: { ar: 'الطريف', en: 'Al Tareef' }, kind: 'rent', type: 'apartment', priceOmr: 220, pricePeriod: 'monthly', bedrooms: 2, areaSqm: 110, featured: true },
  { id: 'mock-2', title: { ar: 'سكن طلابي قرب الجامعة', en: 'Student housing near the university' }, city: 'sohar', district: { ar: 'الهمبار', en: 'Al Humbar' }, kind: 'student', type: 'student_housing', priceOmr: 45, pricePeriod: 'monthly', featured: true },
  { id: 'mock-3', title: { ar: 'فيلا بطابع عُماني حديث', en: 'Modern Omani-style villa' }, city: 'muscat', district: { ar: 'العذيبة', en: 'Al Azaiba' }, kind: 'sale', type: 'villa', priceOmr: 185000, pricePeriod: 'total', bedrooms: 5, areaSqm: 420, featured: true },
  { id: 'mock-4', title: { ar: 'استوديو مفروش', en: 'Furnished studio' }, city: 'muscat', district: { ar: 'الخوير', en: 'Al Khuwair' }, kind: 'rent', type: 'studio', priceOmr: 180, pricePeriod: 'monthly', areaSqm: 45, featured: true },
  { id: 'mock-5', title: { ar: 'أرض سكنية', en: 'Residential plot' }, city: 'sohar', district: { ar: 'فلج القبائل', en: 'Falaj Al Qabail' }, kind: 'sale', type: 'land', priceOmr: 28000, pricePeriod: 'total', areaSqm: 600, featured: false },
];
