export const ar = {
  appName: 'عقاري عُمان',
  greeting: 'أهلًا بك',
  heroTitle: 'ابحث عن بيتك في عُمان',
  heroSubtitle: 'أصالة المكان، وراحة السكن الحديث',
  searchPlaceholder: 'ابحث بالحي، المبنى، أو نوع العقار',
  chooseCity: 'المدينة',
  cities: { sohar: 'صحار', muscat: 'مسقط' },
  categoriesTitle: 'ماذا تبحث؟',
  categories: {
    rent: { title: 'للإيجار', subtitle: 'شقق واستوديوهات' },
    sale: { title: 'للبيع', subtitle: 'شقق، فلل، أراضٍ' },
    student: { title: 'سكن طلابي', subtitle: 'احجز سريرك' },
  },
  featuredTitle: 'عقارات مميزة',
  emptyFeatured: 'لا توجد عقارات منشورة في هذه المدينة بعد.',
  notConfigured: 'لم يتم ربط قاعدة البيانات بعد. أضف إعدادات Supabase في ملف .env.',
  loadError: 'تعذّر تحميل العقارات.',
  mockBadge: 'بيانات تجريبية — ليست عروضًا حقيقية',
  currency: 'ر.ع',
  perMonth: '/ شهريًا',
  bedrooms: 'غرف',
  sqm: 'م²',
  comingSoon: 'هذه الشاشة قيد التطوير وستتوفر في مرحلة قادمة.',
  tabs: { home: 'الرئيسية', search: 'البحث', bookings: 'حجوزاتي', account: 'حسابي' },
} as const;

export type Strings = typeof ar;
