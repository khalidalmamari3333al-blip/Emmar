import type { LocalizedText } from '@/i18n/types';

export type City = 'sohar' | 'muscat';
export type ListingKind = 'rent' | 'sale' | 'student';
export type PropertyType = 'apartment' | 'studio' | 'villa' | 'land' | 'student_housing';
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
  featured: boolean;
}
