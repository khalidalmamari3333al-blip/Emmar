import type { Locale } from '@/i18n/types';
import { AppConfig, isSupabaseConfigured, readConfig } from '@/lib/config';
import { demoReply } from '@/demo/assistant';
import { getSupabase } from '@/lib/supabase';
import type { PropertySummary } from '@/types/property';

import { mapPropertyRow, PROPERTY_IMAGES_BUCKET, PropertyRow } from './properties';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export type AssistantError = 'daily_limit' | 'busy' | 'sign_in' | 'not_configured' | 'error';

export type AssistantResult =
  | { status: 'ok'; reply: string; properties: PropertySummary[]; demo?: boolean }
  | { status: AssistantError };

/** الخادم يقبل حتى 20 رسالة تبدأ بالمستخدم؛ نرسل آخرها فقط. */
export function trimHistory(turns: ChatTurn[], max = 20): ChatTurn[] {
  let out = turns.slice(-max);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  return out;
}

/** يحوّل رمز HTTP ورسالة الخادم إلى خطأ مفهوم للمستخدم. */
export function mapAssistantError(status: number | undefined, code: string | undefined): AssistantError {
  if (status === 401) return 'sign_in';
  if (status === 429 && code === 'daily_limit') return 'daily_limit';
  if (status === 503 && code === 'not_configured') return 'not_configured';
  if (status === 503 || status === 502 || status === 429) return 'busy';
  return 'error';
}

export interface AssistantTransport {
  invoke(body: { messages: ChatTurn[]; locale: Locale }): Promise<{ status?: number; data?: { reply?: string; properties?: PropertyRow[]; error?: string } }>;
}

function supabaseTransport(): AssistantTransport | null {
  const sb = getSupabase();
  if (!sb) return null;
  return {
    async invoke(body) {
      const { data, error } = await sb.functions.invoke('assistant', { body });
      if (!error) return { status: 200, data };
      // FunctionsHttpError يحمل الاستجابة الأصلية في context
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.status === 'number') {
        const payload = await ctx.json().catch(() => ({}));
        return { status: ctx.status, data: payload };
      }
      return { status: undefined };
    },
  };
}

export async function askAssistant(turns: ChatTurn[], locale: Locale, config: AppConfig = readConfig(), transport?: AssistantTransport | null): Promise<AssistantResult> {
  // وضع العرض: ردود بقواعد بسيطة (ليست ذكاءً اصطناعيًا) — والواجهة توضح ذلك.
  if (config.useMockData) return { status: 'ok', demo: true, ...demoReply(trimHistory(turns), locale) };
  if (!transport && !isSupabaseConfigured(config)) return { status: 'not_configured' };
  const t = transport ?? supabaseTransport();
  if (!t) return { status: 'not_configured' };
  try {
    const r = await t.invoke({ messages: trimHistory(turns), locale });
    if (r.status !== 200 || !r.data?.reply) return { status: mapAssistantError(r.status, r.data?.error) };
    const sb = getSupabase();
    const imageUrl = sb ? (p: string) => sb.storage.from(PROPERTY_IMAGES_BUCKET).getPublicUrl(p).data.publicUrl : undefined;
    return { status: 'ok', reply: r.data.reply, properties: (r.data.properties ?? []).map((row) => mapPropertyRow(row, imageUrl)) };
  } catch {
    return { status: 'error' };
  }
}
