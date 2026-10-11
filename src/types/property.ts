import type { LocalizedText } from '@/i18n/types';

export type City = 'sohar' | 'muscat';
export type ListingKind = 'rent' | 'sale' | 'student';
export type PropertyType = 'apartment' | 'studio' | 'room' | 'villa' | 'house' | 'building' | 'land' | 'student_housing';

/** رموز المواصفات (نفس القيم المسموحة في قاعدة البيانات). */
export const AMENITIES = ['wifi', 'ac', 'kitchen', 'parking', 'laundry', 'security', 'elevator', 'cleaning', 'gym', 'pool', 'study_room', 'prayer_room'] as const;
export const UTILITIES = ['electricity', 'water', 'internet', 'gas'] as const;
export const LANDMARKS = ['sohar_university', 'utas_sohar', 'squ', 'utas_muscat', 'muscat_university', 'sohar_port', 'city_center', 'beach'] as const;
export type Amenity = (typeof AMENITIES)[number];
export type Utility = (typeof UTILITIES)[number];
export type Landmark = (typeof LANDMARKS)[number];
export type Furnished = 'unfurnished' | 'semi' | 'furnished';
export type CancellationPolicy = 'flexible' | 'moderate' | 'strict';
export type PricePeriod = 'monthly' | 'total';

export interface PropertySummary {
  id: string;
  title: LocalizedText;
  city: City;
  district: LocalizedText;
  kind: ListingKind;
  type: PropertyType;
  /** السعر بالريال العُماني */
  priceOmr: number;
  pricePeriod: PricePeriod;
  bedrooms?: number;
  areaSqm?: number;
  imageUrl?: string;
  furnished?: Furnished;
  amenities?: Amenity[];
  utilities?: Utility[];
  nearLandmarks?: Landmark[];
  featured: boolean;
  /** التوثيق كما تحدده قاعدة البيانات (decide_verification) */
  verificationStatus?: import('./verification').ListingVerification;
  verifiedAt?: string;
  verifiedScope?: import('./verification').VerifiedScope;
}

export interface PropertyDetail extends PropertySummary {
  description: LocalizedText;
  /** تأمين مسترد يُدفع عند التعاقد */
  depositOmr?: number;
  /** رسوم لمرة واحدة (إدارية/عمولة) */
  feesOmr?: number;
  rules?: LocalizedText;
  cancellationPolicy?: CancellationPolicy;
  /** المالك (لإظهار أدوات الرد للمالك فقط؛ الصلاحية يفرضها الخادم) */
  ownerId?: string;
  /** روابط الصور مرتبة (الغلاف أولًا) */
  images?: string[];
}

/** فلاتر البحث. كل الحقول اختيارية؛ الحقل الفارغ يعني "الكل". */
export interface SearchFilters {
  query?: string;
  city?: City;
  kind?: ListingKind;
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  furnishedOnly?: boolean;
  amenities?: Amenity[];
  utilities?: Utility[];
  landmark?: Landmark;
}

export type ListingStatus = 'draft' | 'published' | 'archived';

/** أنواع العقار المسموحة لكل نوع عرض (نفس قيود الواجهة؛ الخادم يفرض السعر حسب النوع). */
export const TYPES_BY_KIND: Record<ListingKind, PropertyType[]> = {
  rent: ['apartment', 'studio', 'room', 'villa', 'house', 'building'],
  sale: ['apartment', 'villa', 'house', 'building', 'land'],
  student: ['student_housing'],
};
