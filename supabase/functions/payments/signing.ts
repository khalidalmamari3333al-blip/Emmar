// توقيع أحداث مزود الدفع والتحقق منها: HMAC-SHA256 على "<timestamp>.<body>"
// الترويسة: x-aqari-signature: t=<unix seconds>,v1=<hex>
// يعمل في Deno وNode (Web Crypto).

export const SIGNATURE_HEADER = 'x-aqari-signature';
export const TOLERANCE_SECONDS = 300;

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** مقارنة بزمن ثابت حتى لا تكشف التوقيتات أجزاء التوقيع */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signPayload(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmac(secret, `${timestamp}.${body}`)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'bad_signature' };

export async function verifySignature(secret: string, header: string | null, body: string, now = Math.floor(Date.now() / 1000)): Promise<VerifyResult> {
  if (!header) return { ok: false, reason: 'missing' };
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? '')) return { ok: false, reason: 'malformed' };
  // يمنع إعادة إرسال حدث قديم ملتقط
  if (Math.abs(now - t) > TOLERANCE_SECONDS) return { ok: false, reason: 'expired' };
  const expected = await hmac(secret, `${t}.${body}`);
  return safeEqual(expected, parts.v1) ? { ok: true } : { ok: false, reason: 'bad_signature' };
}
