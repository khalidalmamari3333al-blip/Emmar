/**
 * ⚠️ بيانات تجريبية فقط — للتطوير والاختبار.
 * لا تُستخدم إلا عند EXPO_PUBLIC_USE_MOCK_DATA=true وتظهر بجانبها شارة "بيانات تجريبية".
 */
import type { PropertyDetail } from '@/types/property';

export const mockProperties: PropertyDetail[] = [
  { id: 'mock-1', description: { ar: 'شقة مشمسة في الطابق الثاني، قريبة من الكورنيش والخدمات.', en: 'Sunny second-floor flat close to the Corniche and amenities.' }, title: { ar: 'شقة غرفتين قرب الكورنيش', en: '2-bedroom flat near the Corniche' }, city: 'sohar', district: { ar: 'الطريف', en: 'Al Tareef' }, kind: 'rent', type: 'apartment', priceOmr: 220, pricePeriod: 'monthly', bedrooms: 2, areaSqm: 110, featured: true },
  { id: 'mock-2', description: { ar: 'أسرّة في غرف مشتركة، إنترنت ومطبخ مشترك، على بعد دقائق من الجامعة.', en: 'Beds in shared rooms with Wi-Fi and a shared kitchen, minutes from the university.' }, title: { ar: 'سكن طلابي قرب الجامعة', en: 'Student housing near the university' }, city: 'sohar', district: { ar: 'الهمبار', en: 'Al Humbar' }, kind: 'student', type: 'student_housing', priceOmr: 45, pricePeriod: 'monthly', featured: true },
  { id: 'mock-3', description: { ar: 'فيلا تجمع الأقواس العُمانية التقليدية مع تصميم داخلي حديث.', en: 'A villa combining traditional Omani arches with a modern interior.' }, title: { ar: 'فيلا بطابع عُماني حديث', en: 'Modern Omani-style villa' }, city: 'muscat', district: { ar: 'العذيبة', en: 'Al Azaiba' }, kind: 'sale', type: 'villa', priceOmr: 185000, pricePeriod: 'total', bedrooms: 5, areaSqm: 420, featured: true },
  { id: 'mock-4', description: { ar: 'استوديو مفروش بالكامل، مناسب للموظفين.', en: 'Fully furnished studio, ideal for professionals.' }, title: { ar: 'استوديو مفروش', en: 'Furnished studio' }, city: 'muscat', district: { ar: 'الخوير', en: 'Al Khuwair' }, kind: 'rent', type: 'studio', priceOmr: 180, pricePeriod: 'monthly', areaSqm: 45, featured: true },
  { id: 'mock-5', description: { ar: 'أرض سكنية في منطقة هادئة.', en: 'Residential plot in a quiet neighbourhood.' }, title: { ar: 'أرض سكنية', en: 'Residential plot' }, city: 'sohar', district: { ar: 'فلج القبائل', en: 'Falaj Al Qabail' }, kind: 'sale', type: 'land', priceOmr: 28000, pricePeriod: 'total', areaSqm: 600, featured: false },
];
