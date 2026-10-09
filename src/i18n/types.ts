export type Locale = 'ar' | 'en';
export type LocalizedText = Record<Locale, string>;

/** شكل ملف النصوص؛ كل لغة يجب أن تملأ كل المفاتيح (يتحقق TypeScript من ذلك). */
export interface Strings {
  appName: string;
  greeting: string;
  heroTitle: string;
  heroSubtitle: string;
  searchPlaceholder: string;
  chooseCity: string;
  cities: { sohar: string; muscat: string };
  categoriesTitle: string;
  categories: Record<'rent' | 'sale' | 'student', { title: string; subtitle: string }>;
  featuredTitle: string;
  emptyFeatured: string;
  notConfigured: string;
  loadError: string;
  mockBadge: string;
  currency: string;
  perMonth: string;
  bedrooms: string;
  sqm: string;
  comingSoon: string;
  languageTitle: string;
  languageHint: string;
  languages: Record<Locale, string>;
  tabs: { home: string; search: string; bookings: string; account: string };
}
