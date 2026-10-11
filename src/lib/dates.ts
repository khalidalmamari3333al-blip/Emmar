/**
 * تواريخ الإيجار كنصوص 'YYYY-MM-DD' (بدون ساعات/مناطق زمنية) لتطابق نوع date في PostgreSQL.
 * الفترة نصف مفتوحة [start, end): تاريخ النهاية هو يوم الخروج، ويمكن أن يبدأ فيه حجز آخر.
 */
export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** يضيف أشهرًا مع تثبيت اليوم عند نهاية الشهر (31 يناير + شهر = 28/29 فبراير). */
export function addMonths(s: ISODate, months: number): ISODate {
  const d = parseISODate(s);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toISODate(target);
}

/** بدايات الأشهر القادمة (لا تشمل الشهر الحالي إذا كان قد بدأ). */
export function upcomingMonthStarts(today: Date, count: number): ISODate[] {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  return Array.from({ length: count }, (_, i) => addMonths(toISODate(first), i));
}

/** هل تتداخل فترتان نصف مفتوحتين [a1, a2) و [b1, b2)؟ نفس منطق && في PostgreSQL. */
export function periodsOverlap(a1: ISODate, a2: ISODate, b1: ISODate, b2: ISODate): boolean {
  return a1 < b2 && b1 < a2;
}

export function formatMonthYear(s: ISODate, locale: 'ar' | 'en'): string {
  // أرقام لاتينية في العربية أيضًا لتطابق الأسعار؛ أسماء الأشهر حسب الاستخدام في عُمان.
  const AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = parseISODate(s);
  return `${(locale === 'ar' ? AR : EN)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDate(s: ISODate, locale: 'ar' | 'en'): string {
  const d = parseISODate(s);
  return `${d.getUTCDate()} ${formatMonthYear(s, locale)}`;
}
