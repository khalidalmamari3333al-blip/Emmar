/**
 * منطق المساعد الذكي (بدون اعتماد على Deno) حتى يُختبر بـ Jest.
 * يعمل داخل Supabase Edge Function؛ مفتاح Claude لا يغادر الخادم.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

export const MODEL = 'claude-opus-5-5';
export const DAILY_LIMIT = 30;
const MAX_ROUNDS = 6;
const MAX_TURNS = 20;
const MAX_USER_CHARS = 2000;
const MAX_ASSISTANT_CHARS = 6000;

export type Locale = 'ar' | 'en';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequest {
  messages: ChatTurn[];
  locale: Locale;
}

/** صف عقار كما يُرسل للتطبيق (نفس أعمدة شاشة البحث). */
export interface PropertyRow {
  id: string;
  kind: string;
  type: string;
  city: string;
  district_ar: string;
  district_en: string;
  title_ar: string;
  title_en: string;
  price_omr: number | string;
  price_period: string;
  bedrooms: number | null;
  area_sqm: number | string | null;
  cover_image_path: string | null;
  featured: boolean;
}

export interface AssistantResult {
  reply: string;
  properties: PropertyRow[];
  refused?: boolean;
}

// ---------------------------------------------------------------------
// التحقق من الطلب
// ---------------------------------------------------------------------

export function parseRequest(body: unknown): AssistantRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { messages?: unknown; locale?: unknown };
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_TURNS) return null;
  const messages: ChatTurn[] = [];
  for (const [i, m] of b.messages.entries()) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || !content.trim()) return null;
    if (content.length > (role === 'user' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS)) return null;
    // يجب أن تتناوب الأدوار وتبدأ وتنتهي برسالة المستخدم
    if (role !== (i % 2 === 0 ? 'user' : 'assistant')) return null;
    messages.push({ role, content });
  }
  if (messages[messages.length - 1].role !== 'user') return null;
  return { messages, locale: b.locale === 'en' ? 'en' : 'ar' };
}

// ---------------------------------------------------------------------
// الأدوات: تبحث في العقارات الحقيقية فقط (عبر RLS بصلاحيات المستخدم)
// ---------------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_properties',
    description:
      'Search published real-estate listings in Sohar and Muscat. All filters are optional; combine what the user told you. Returns up to 8 listings with prices in OMR (monthly for rent and student housing, total for sale). An empty list means nothing matches.',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', enum: ['sohar', 'muscat'] },
        kind: { type: 'string', enum: ['rent', 'sale', 'student'], description: 'rent = monthly rental, sale = for sale, student = student housing rented per bed' },
        type: { type: 'string', enum: ['apartment', 'studio', 'villa', 'land', 'student_housing'] },
        min_price: { type: 'number', description: 'OMR' },
        max_price: { type: 'number', description: 'OMR' },
        min_bedrooms: { type: 'integer' },
        query: { type: 'string', description: 'Words to match in the title or district (Arabic or English), e.g. a neighbourhood name' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'check_bed_availability',
    description:
      'For a student-housing listing, count beds free for a stay and their monthly prices. start_date is the move-in date (YYYY-MM-DD); months is the stay length (a semester is 4).',
    input_schema: {
      type: 'object',
      properties: {
        property_id: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        months: { type: 'integer', minimum: 1, maximum: 12 },
      },
      required: ['property_id', 'start_date', 'months'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_properties',
    description:
      'Display listings to the user as tappable cards in the app. Call this with the ids of the listings you recommend (from search results), best first. Do not write ids in your reply text.',
    input_schema: {
      type: 'object',
      properties: { property_ids: { type: 'array', items: { type: 'string' }, maxItems: 6 } },
      required: ['property_ids'],
      additionalProperties: false,
    },
  },
];

const COLUMNS =
  'id,kind,type,city,district_ar,district_en,title_ar,title_en,price_omr,price_period,bedrooms,area_sqm,cover_image_path,featured';

const ENUMS = {
  city: ['sohar', 'muscat'],
  kind: ['rent', 'sale', 'student'],
  type: ['apartment', 'studio', 'villa', 'land', 'student_housing'],
} as const;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const sanitize = (q: unknown) =>
  typeof q === 'string' ? q.replace(/[%*,()\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** ينفذ أداة ويعيد نتيجتها كنص JSON. كل المدخلات تُتحقق هنا (لا نثق بمدخلات النموذج). */
export async function executeTool(
  db: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
  seen: Map<string, PropertyRow>,
  shown: string[],
): Promise<{ content: string; isError?: boolean }> {
  if (name === 'search_properties') {
    let q = db.from('properties').select(COLUMNS).eq('status', 'published').eq('is_demo', false);
    for (const key of ['city', 'kind', 'type'] as const) {
      const v = input[key];
      if (typeof v === 'string' && (ENUMS[key] as readonly string[]).includes(v)) q = q.eq(key, v);
    }
    const min = num(input.min_price);
    const max = num(input.max_price);
    const beds = num(input.min_bedrooms);
    if (min !== undefined) q = q.gte('price_omr', min);
    if (max !== undefined) q = q.lte('price_omr', max);
    if (beds !== undefined) q = q.gte('bedrooms', Math.floor(beds));
    const text = sanitize(input.query);
    if (text) {
      const like = `%${text}%`;
      q = q.or(`title_ar.ilike.${like},title_en.ilike.${like},district_ar.ilike.${like},district_en.ilike.${like}`);
    }
    const { data, error } = await q.order('featured', { ascending: false }).order('price_omr').limit(8);
    if (error) return { content: `Search failed: ${error.message}`, isError: true };
    const rows = (data ?? []) as PropertyRow[];
    rows.forEach((r) => seen.set(r.id, r));
    return {
      content: JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          title: { ar: r.title_ar, en: r.title_en },
          city: r.city,
          district: { ar: r.district_ar, en: r.district_en },
          kind: r.kind,
          type: r.type,
          price_omr: Number(r.price_omr),
          price_period: r.price_period,
          bedrooms: r.bedrooms,
          area_sqm: r.area_sqm == null ? null : Number(r.area_sqm),
        })),
      ),
    };
  }

  if (name === 'check_bed_availability') {
    const id = typeof input.property_id === 'string' ? input.property_id : '';
    const start = typeof input.start_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.start_date) ? input.start_date : '';
    const months = typeof input.months === 'number' && Number.isInteger(input.months) && input.months >= 1 && input.months <= 12 ? input.months : 0;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !start || !months) return { content: 'Invalid input: need property_id, start_date (YYYY-MM-DD) and months 1-12.', isError: true };
    const end = addMonths(start, months);
    const [avail, layout] = await Promise.all([
      db.rpc('bed_availability', { p_property: id, p_start: start, p_end: end }),
      db.from('buildings').select('floors(rooms(beds(id,monthly_price_omr)))').eq('property_id', id),
    ]);
    if (avail.error) return { content: `Availability check failed: ${avail.error.message}`, isError: true };
    if (layout.error) return { content: `Availability check failed: ${layout.error.message}`, isError: true };
    const free = new Set(((avail.data ?? []) as { bed_id: string; is_available: boolean }[]).filter((r) => r.is_available).map((r) => r.bed_id));
    type B = { floors: { rooms: { beds: { id: string; monthly_price_omr: number | string }[] }[] }[] };
    const beds = ((layout.data ?? []) as B[]).flatMap((b) => b.floors.flatMap((f) => f.rooms.flatMap((r) => r.beds)));
    const prices = beds.filter((b) => free.has(b.id)).map((b) => Number(b.monthly_price_omr));
    return {
      content: JSON.stringify({
        property_id: id,
        start_date: start,
        end_date: end,
        total_beds: beds.length,
        available_beds: prices.length,
        monthly_price_min: prices.length ? Math.min(...prices) : null,
        monthly_price_max: prices.length ? Math.max(...prices) : null,
      }),
    };
  }

  if (name === 'show_properties') {
    const ids = Array.isArray(input.property_ids) ? input.property_ids.filter((x): x is string => typeof x === 'string') : [];
    // نعرض فقط عقارات ظهرت فعلًا في نتائج البحث — لا معرّفات مختلقة
    const valid = ids.filter((id) => seen.has(id) && !shown.includes(id)).slice(0, 6);
    shown.push(...valid);
    const unknown = ids.filter((id) => !seen.has(id));
    return { content: unknown.length ? `Displayed ${valid.length}. Ignored ids not found in search results: ${unknown.join(', ')}` : `Displayed ${valid.length} listing(s).` };
  }

  return { content: `Unknown tool: ${name}`, isError: true };
}

// ---------------------------------------------------------------------
// المحادثة
// ---------------------------------------------------------------------

export function systemPrompt(locale: Locale, today: string): string {
  return [
    'You are the assistant inside "Aqari Oman" (عقاري عُمان), a property app for Sohar and Muscat, Oman. You help people find a place to rent, a property to buy, or a bed in student housing (rented per bed).',
    'Use the tools to look at the real listings. Only describe listings, prices and availability that the tools returned - never invent them. If nothing matches, say so and suggest how to widen the search (another city, a higher budget, a different type).',
    'Understand the person\'s budget, city or area, what they need (rent, buy, student bed; bedrooms; dates) and search with what you know. If something essential is missing, ask one short question.',
    'When you recommend listings, call show_properties with their ids so the app shows cards; refer to listings by title in your text, not by id.',
    'Booking happens in the app: on a student-housing listing the person picks a bed and sends a request, which holds the bed for 48 hours until the owner approves. There is no online payment in the app yet.',
    'Prices are in Omani rials (OMR / ر.ع). Keep replies short and friendly.',
    `Reply in ${locale === 'ar' ? 'Arabic (Modern Standard, friendly; Omani dialect words are fine if the user uses them)' : 'English'}.`,
    `Today is ${today}.`,
  ].join('\n\n');
}

const REFUSAL: Record<Locale, string> = {
  ar: 'عذرًا، لا أستطيع المساعدة في هذا الطلب. يمكنني مساعدتك في البحث عن سكن أو عقار في صحار ومسقط.',
  en: "Sorry, I can't help with that request. I can help you find a home or property in Sohar and Muscat.",
};
const TOO_LONG: Record<Locale, string> = {
  ar: 'استغرق البحث أطول من المتوقع. جرّب سؤالًا أكثر تحديدًا.',
  en: 'That took longer than expected. Try a more specific question.',
};

/**
 * عند رفض جزئي ثم تحويل لنموذج بديل (fallbacks)، نعيد فقط ما يجوز إعادته:
 * قبل آخر كتلة fallback نحتفظ بالنصوص فقط.
 */
export function echoable(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlockParam[] {
  const last = content.map((b) => b.type as string).lastIndexOf('fallback');
  if (last < 0) return content as unknown as Anthropic.Beta.BetaContentBlockParam[];
  return [
    ...content.slice(0, last).filter((b) => b.type === 'text'),
    ...content.slice(last + 1),
  ] as unknown as Anthropic.Beta.BetaContentBlockParam[];
}

export interface RunDeps {
  client: Pick<Anthropic, 'beta'>;
  db: SupabaseClient;
  today: string;
}

export async function runAssistant(req: AssistantRequest, { client, db, today }: RunDeps): Promise<AssistantResult> {
  const messages: Anthropic.Beta.BetaMessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const seen = new Map<string, PropertyRow>();
  const shown: string[] = [];
  const texts: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // التفكير التكيفي يعمل افتراضيًا على هذا النموذج؛ نحدد مستوى الجهد صراحةً.
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: systemPrompt(req.locale, today), cache_control: { type: 'ephemeral' } }],
      tools: TOOLS,
      messages,
      // عند رفض طلب لأسباب أمان، يعيد الخادم المحاولة بنموذج بديل مناسب.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (response.stop_reason === 'refusal') return { reply: REFUSAL[req.locale], properties: [], refused: true };

    for (const block of response.content) if (block.type === 'text' && block.text.trim()) texts.push(block.text.trim());

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: echoable(response.content) });
      continue;
    }
    if (response.stop_reason !== 'tool_use') break;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: echoable(response.content) });
    const results = await Promise.all(
      toolUses.map(async (t) => {
        const r = await executeTool(db, t.name, (t.input ?? {}) as Record<string, unknown>, seen, shown).catch((e: unknown) => ({
          content: `Tool error: ${e instanceof Error ? e.message : String(e)}`,
          isError: true,
        }));
        return { type: 'tool_result' as const, tool_use_id: t.id, content: r.content, ...(r.isError ? { is_error: true } : {}) };
      }),
    );
    messages.push({ role: 'user', content: results });
    if (round === MAX_ROUNDS - 1) texts.push(TOO_LONG[req.locale]);
  }

  return {
    // نعرض آخر رد نصي (الردود الوسيطة غالبًا "سأبحث الآن…")
    reply: texts[texts.length - 1] ?? TOO_LONG[req.locale],
    properties: shown.map((id) => seen.get(id)!),
  };
}
