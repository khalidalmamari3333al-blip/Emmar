// مساعد للاختبارات الشاملة: تحقق هوية تجريبي عبر دالة identity الحقيقية (IDENTITY_MODE=mock محليًا).
import type { SupabaseClient } from '@supabase/supabase-js';

let seq = 0;
/** رقم مدني فريد لكل مستخدم اختبار (لا يتكرر بين التشغيلات) */
export const uniqueCivilId = () => `${Date.now() % 1e8}`.padStart(8, '1') + String(++seq).padStart(2, '0');

export async function verifyMockIdentity(client: SupabaseClient, fullName: string) {
  const { data, error } = await client.functions.invoke('identity', { body: { action: 'mock_complete', fullName, nationalId: uniqueCivilId() } });
  if (error) throw new Error(`identity verification failed: ${error.message}`);
  return data as { verified: boolean };
}
