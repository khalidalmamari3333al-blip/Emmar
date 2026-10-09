/**
 * مساعد العرض التجريبي: يفهم الميزانية والمدينة والنوع من الرسالة بقواعد بسيطة
 * ويبحث في عقارات العرض. ليس ذكاءً اصطناعيًا — والواجهة تقول ذلك صراحةً.
 */
import type { Locale } from '@/i18n/types';
import { matchesFilters } from '@/services/properties';
import type { PropertySummary, SearchFilters } from '@/types/property';

import { demoProperties } from './services';

const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** يستخرج الفلاتر من نص المستخدم (عربي أو إنجليزي). */
export function parseNeeds(text: string): SearchFilters {
  const t = toWestern(text.toLowerCase());
  const f: SearchFilters = {};
  if (/صحار|sohar/.test(t)) f.city = 'sohar';
  else if (/مسقط|muscat|الخوض|القرم|الموج|بوشر|العذيبة/.test(t)) f.city = 'muscat';

  // \b حتى لا تُفهم "bedroom" على أنها سرير طلابي
  if (/سرير|طلاب|طالب|سكن طلابي|جامعة/.test(t) || /\b(students?|beds?|dorms?)\b/.test(t)) f.kind = 'student';
  else if (/للبيع|شراء|اشتري|تملك|تمليك|buy|sale|purchase/.test(t)) f.kind = 'sale';
  else if (/إيجار|ايجار|للإيجار|استئجار|rent/.test(t)) f.kind = 'rent';

  if (/فيلا|villa/.test(t)) f.type = 'villa';
  else if (/استوديو|studio/.test(t)) f.type = 'studio';
  else if (/أرض|ارض|land|plot/.test(t)) f.type = 'land';
  else if (/شقة|شقه|flat|apartment/.test(t)) f.type = 'apartment';

  const nums = [...t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(ألف|الف|k)?/g)].map((m) => Number(m[1].replace(/,/g, '')) * (m[2] ? 1000 : 1));
  const rooms = t.match(/(\d)\s*(غرف|غرفة|bedrooms?|br)\b/) ?? (/غرفتين|two bedrooms?/.test(t) ? ['', '2'] : null);
  if (rooms) f.minBedrooms = Number(rooms[1]);
  const budget = nums.filter((n) => !rooms || n !== Number(rooms[1])).find((n) => n >= 20);
  if (budget) f.maxPrice = budget;
  return f;
}

export function demoReply(turns: { role: string; content: string }[], locale: Locale): { reply: string; properties: PropertySummary[] } {
  // نجمع احتياجات المحادثة كلها (رسالة متابعة مثل "وفي مسقط؟" تكمل ما قبلها)
  const needs = turns.filter((x) => x.role === 'user').reduce<SearchFilters>((acc, m) => ({ ...acc, ...parseNeeds(m.content) }), {});
  if (needs.type && needs.type !== 'student_housing' && needs.kind === 'student') delete needs.kind;
  const results = demoProperties.search((p) => matchesFilters(p, needs)).slice(0, 3);
  const ar = locale === 'ar';
  const cityName = needs.city ? (ar ? { sohar: 'صحار', muscat: 'مسقط' } : { sohar: 'Sohar', muscat: 'Muscat' })[needs.city] : null;
  const budget = needs.maxPrice ? (ar ? ` ضمن ميزانية ${needs.maxPrice.toLocaleString('en-US')} ر.ع` : ` within ${needs.maxPrice.toLocaleString('en-US')} OMR`) : '';

  if (!Object.keys(needs).length)
    return {
      reply: ar
        ? 'أهلًا! أخبرني بالمدينة (صحار أو مسقط)، وهل تبحث عن إيجار أو شراء أو سرير في سكن طلابي، وميزانيتك التقريبية.'
        : 'Hi! Tell me the city (Sohar or Muscat), whether you want to rent, buy or a student bed, and your rough budget.',
      properties: [],
    };
  if (!results.length)
    return {
      reply: ar
        ? `لم أجد عقارات مطابقة${cityName ? ` في ${cityName}` : ''}${budget}. جرّب ميزانية أعلى أو مدينة أخرى.`
        : `I couldn't find matching listings${cityName ? ` in ${cityName}` : ''}${budget}. Try a higher budget or another city.`,
      properties: [],
    };
  const where = cityName ? (ar ? ` في ${cityName}` : ` in ${cityName}`) : '';
  const extra =
    needs.kind === 'student'
      ? ar
        ? ' افتح السكن واضغط "اختر سريرك" لترى الأسرّة المتاحة على المخطط.'
        : ' Open a residence and tap "Choose your bed" to see free beds on the plan.'
      : '';
  return {
    reply: ar
      ? `وجدت لك ${results.length === 1 ? 'عقارًا واحدًا' : results.length === 2 ? 'عقارين' : `${results.length} عقارات`}${where}${budget}.${extra}`
      : `I found ${results.length} listing${results.length > 1 ? 's' : ''}${where}${budget}.${extra}`,
    properties: results,
  };
}
