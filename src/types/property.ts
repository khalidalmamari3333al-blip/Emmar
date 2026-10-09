export type City = 'sohar' | 'muscat';
export type ListingKind = 'rent' | 'sale' | 'student';
export type PropertyType = 'apartment' | 'studio' | 'villa' | 'land' | 'student_bed';
export type PricePeriod = 'monthly' | 'total';

export interface PropertySummary {
  id: string;
  title: string;
  city: City;
  district: string;
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
