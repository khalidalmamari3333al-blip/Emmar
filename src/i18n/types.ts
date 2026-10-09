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
  search: {
    title: string;
    placeholder: string;
    filters: string;
    all: string;
    city: string;
    kind: string;
    type: string;
    price: string;
    minPrice: string;
    maxPrice: string;
    bedrooms: string;
    reset: string;
    results: (n: number) => string;
    empty: string;
  };
  types: Record<'apartment' | 'studio' | 'villa' | 'land' | 'student_housing', string>;
  detail: {
    notFound: string;
    description: string;
    noDescription: string;
    details: string;
    area: string;
    bedrooms: string;
    type: string;
    location: string;
    chooseBed: string;
    chooseBedSoon: string;
    requestSoon: string;
    back: string;
  };
  tabs: { home: string; search: string; bookings: string; account: string };
}
