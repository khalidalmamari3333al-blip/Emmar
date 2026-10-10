/**
 * مساعد العرض التجريبي: يفهم الميزانية والمدينة والنوع من الرسالة بقواعد بسيطة
 * ويبحث في عقارات العرض. ليس ذكاءً اصطناعيًا — والواجهة تقول ذلك صراحةً.
 */
import type { Locale } from '@/i18n/types';
import { firstPayment, matchesFilters } from '@/services/properties';
import type { Amenity, PropertySummary, SearchFilters } from '@/types/property';

import { demoProperties } from './services';
import { demoState } from './store';

const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** يستخرج الفلاتر من نص المستخدم (عربي أو إنجليزي). */
export function parseNeeds(text: string): SearchFilters {
  const t = toWestern(text.toLowerCase());
  const f: SearchFilters = {};
  if (/صحار|sohar/.test(t)) f.city = 'sohar';
  else if (/مسقط|muscat|الخوض|القرم|الموج|بوشر|العذيبة/.test(t)) f.city = 'muscat';

  // القرب من الجامعات (قبل كشف "جامعة" كسكن طلابي)
  if (/جامعة السلطان قابوس|squ|sultan qaboos/.test(t)) f.landmark = 'squ';
  else if (/جامعة صحار|sohar university/.test(t)) f.landmark = 'sohar_university';
  else if (/التقنية.*صحار|utas.*sohar/.test(t)) f.landmark = 'utas_sohar';
  else if (/التقنية|utas/.test(t)) f.landmark = 'utas_muscat';
  else if (/جامعة مسقط|muscat university/.test(t)) f.landmark = 'muscat_university';
  else if (/البحر|الشاطئ|beach|sea/.test(t)) f.landmark = 'beach';

  const amenities: Amenity[] = [];
  if (/واي ?فاي|wi-?fi|انترنت|إنترنت|internet/.test(t)) amenities.push('wifi');
  if (/موقف|parking/.test(t)) amenities.push('parking');
  if (/جيم|نادي رياضي|gym/.test(t)) amenities.push('gym');
  if (/مسبح|pool/.test(t)) amenities.push('pool');
  if (/غرفة مذاكرة|study room/.test(t)) amenities.push('study_room');
  if (amenities.length) f.amenities = amenities;
  if (/غير مفروش|unfurnished/.test(t)) delete f.furnishedOnly;
  else if (/مفروش|مفروشة|furnished/.test(t)) f.furnishedOnly = true;

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
  // تفاصيل حقيقية من بيانات العرض: أول دفعة متوقعة، التوثيق، التقييم
  const top = demoProperties.byId(results[0].id);
  const pay = top ? firstPayment(top) : undefined;
  const reviews = demoState().reviews.filter((r) => r.propertyId === results[0].id);
  const avg = reviews.length ? Math.round((reviews.reduce((x, r) => x + r.rating, 0) / reviews.length) * 10) / 10 : null;
  const title = top ? (ar ? top.title.ar : top.title.en) : '';
  const facts = [
    pay ? (ar ? `أول دفعة متوقعة في «${title}» ${pay} ر.ع (إيجار شهر + التأمين + الرسوم)` : `the expected first payment at "${title}" is ${pay} OMR (one month + deposit + fees)`) : null,
    top?.verificationStatus === 'verified' ? (ar ? 'وهو موثّق من فريق التحقق' : 'it is verified by the verification team') : null,
    avg != null ? (ar ? `وتقييمه ${avg} من 5` : `rated ${avg}/5`) : null,
  ].filter(Boolean);
  const sentence = facts.join(ar ? '، ' : ', ');
  const factLine = sentence ? ` ${ar ? sentence : sentence[0].toUpperCase() + sentence.slice(1)}.` : '';
  const wantsCompare = turns.some((x) => x.role === 'user' && /قارن|مقارنة|compare/.test(x.content.toLowerCase()));
  const compareLine =
    wantsCompare && results.length >= 2
      ? (() => {
          const [a, b] = results.slice(0, 2).map((r) => demoProperties.byId(r.id)!);
          const pa = firstPayment(a) ?? a.priceOmr;
          const pb = firstPayment(b) ?? b.priceOmr;
          const cheaper = pa <= pb ? a : b;
          return ar
            ? ` للمقارنة: «${a.title.ar}» ${pa} ر.ع مقابل «${b.title.ar}» ${pb} ر.ع كأول دفعة — الأوفر «${cheaper.title.ar}».`
            : ` Compared: "${a.title.en}" ${pa} OMR vs "${b.title.en}" ${pb} OMR as first payment — "${cheaper.title.en}" costs less upfront.`;
        })()
      : '';
  const extra =
    needs.kind === 'student'
      ? ar
        ? ' افتح السكن واضغط "اختر سريرك" لترى الأسرّة المتاحة على المخطط.'
        : ' Open a residence and tap "Choose your bed" to see free beds on the plan.'
      : '';
  return {
    reply: ar
      ? `وجدت لك ${results.length === 1 ? 'عقارًا واحدًا' : results.length === 2 ? 'عقارين' : `${results.length} عقارات`}${where}${budget}.${factLine}${compareLine}${extra}`
      : `I found ${results.length} listing${results.length > 1 ? 's' : ''}${where}${budget}.${factLine}${compareLine}${extra}`,
    properties: results,
  };
}
