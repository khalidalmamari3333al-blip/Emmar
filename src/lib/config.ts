/**
 * إعدادات عامة تُقرأ من متغيرات EXPO_PUBLIC_* فقط.
 * هذه القيم تُضمَّن في التطبيق وتكون مرئية للجميع؛ لذلك لا يُسمح إلا بالمفتاح العام (anon).
 */
export interface AppConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  useMockData: boolean;
}

// يجب الوصول لكل متغير بالاسم الصريح حتى يستطيع Expo تضمينه وقت البناء.
const processEnv = () => ({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_USE_MOCK_DATA: process.env.EXPO_PUBLIC_USE_MOCK_DATA,
});

export function readConfig(env: Record<string, string | undefined> = processEnv()): AppConfig {
  return {
    supabaseUrl: env.EXPO_PUBLIC_SUPABASE_URL || undefined,
    supabaseAnonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY || undefined,
    useMockData: env.EXPO_PUBLIC_USE_MOCK_DATA === 'true',
  };
}

export const isSupabaseConfigured = (c: AppConfig) => Boolean(c.supabaseUrl && c.supabaseAnonKey);
