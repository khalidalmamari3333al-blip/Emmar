import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { isSupabaseConfigured, readConfig } from './config';

let client: SupabaseClient | null = null;

/** يُرجع عميل Supabase، أو null إذا لم تُضبط الإعدادات (بدل التظاهر بأن الخدمة تعمل). */
export function getSupabase(): SupabaseClient | null {
  const config = readConfig();
  if (!isSupabaseConfigured(config)) return null;
  if (!client) {
    client = createClient(config.supabaseUrl!, config.supabaseAnonKey!, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
