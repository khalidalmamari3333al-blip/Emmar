import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { demoAuthBackend } from '@/demo/services';
import type { DemoRole } from '@/demo/store';
import { isSupabaseConfigured, readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

export type UserRole = 'user' | 'owner' | 'admin';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  phone?: string;
  /** من جدول profiles؛ يُستخدم لإظهار اللوحات فقط — الحماية الفعلية في RLS. */
  role: UserRole;
}

export const isOwnerRole = (u: AuthUser | null) => u?.role === 'owner' || u?.role === 'admin';
export const isAdminRole = (u: AuthUser | null) => u?.role === 'admin';

export type AuthErrorCode = 'invalid_credentials' | 'email_taken' | 'weak_password' | 'email_not_confirmed' | 'invalid_email' | 'rate_limited' | 'unknown';

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; code: AuthErrorCode };

/** واجهة مجردة فوق Supabase Auth لتسهيل الاختبار. */
export interface AuthBackend {
  current(): Promise<AuthUser | null>;
  subscribe(cb: (u: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(fullName: string, email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<boolean>;
}

export interface ProfilePatch {
  fullName?: string;
  phone?: string;
  preferredLocale?: 'ar' | 'en';
}

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out' | 'not_configured';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: AuthBackend['signIn'];
  signUp: AuthBackend['signUp'];
  signOut: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<boolean>;
  /** يعيد قراءة الملف الشخصي (مثلًا بعد تغيير الدور) */
  refresh: () => Promise<void>;
  /** وضع العرض التفاعلي: حسابات تجريبية محلية بلا كلمة مرور */
  demo: boolean;
  signInAs: (role: DemoRole) => Promise<void>;
}

const unavailable = async (): Promise<AuthResult> => ({ ok: false, code: 'unknown' });
const AuthContext = createContext<AuthContextValue>({
  status: 'loading',
  user: null,
  signIn: unavailable,
  signUp: unavailable,
  signOut: async () => {},
  updateProfile: async () => false,
  refresh: async () => {},
  demo: false,
  signInAs: async () => {},
});

export function mapAuthError(e: { code?: string; status?: number; message?: string } | null | undefined): AuthErrorCode {
  const code = e?.code ?? '';
  if (code === 'invalid_credentials') return 'invalid_credentials';
  if (code === 'user_already_exists' || code === 'email_exists') return 'email_taken';
  if (code === 'weak_password') return 'weak_password';
  if (code === 'email_not_confirmed') return 'email_not_confirmed';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'invalid_email';
  if (code.startsWith('over_') || e?.status === 429) return 'rate_limited';
  return 'unknown';
}

export function supabaseBackend(): AuthBackend | null {
  const supabase = getSupabase();
  if (!supabase) return null;
  type SbUser = { id: string; email?: string; user_metadata?: { full_name?: string } };
  const toUser = async (u: SbUser | null | undefined): Promise<AuthUser | null> => {
    if (!u) return null;
    const { data } = await supabase.from('profiles').select('full_name,phone,role').eq('id', u.id).maybeSingle();
    return {
      id: u.id,
      email: u.email ?? '',
      fullName: data?.full_name ?? u.user_metadata?.full_name ?? undefined,
      phone: data?.phone ?? undefined,
      role: (data?.role as UserRole | undefined) ?? 'user',
    };
  };
  return {
    async current() {
      const { data } = await supabase.auth.getSession();
      return toUser(data.session?.user);
    },
    subscribe(cb) {
      // لا ننتظر داخل المستمع (توصية Supabase)؛ نقرأ الملف الشخصي بعده.
      const { data } = supabase.auth.onAuthStateChange((_e, session) => {
        setTimeout(() => toUser(session?.user).then(cb, () => cb(null)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async updateProfile(userId, patch) {
      const row: Record<string, string | null> = {};
      if (patch.fullName !== undefined) row.full_name = patch.fullName.trim() || null;
      if (patch.phone !== undefined) row.phone = patch.phone.trim() || null;
      if (patch.preferredLocale) row.preferred_locale = patch.preferredLocale;
      const { data, error } = await supabase.from('profiles').update(row).eq('id', userId).select('id');
      return !error && (data?.length ?? 0) > 0;
    },
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { ok: false, code: mapAuthError(error) } : { ok: true };
    },
    async signUp(fullName, email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
      if (error) return { ok: false, code: mapAuthError(error) };
      // عند تفعيل تأكيد البريد لا تُنشأ جلسة حتى يضغط المستخدم الرابط.
      return { ok: true, needsConfirmation: !data.session };
    },
    async signOut() {
      await supabase.auth.signOut();
    },
  };
}

export function AuthProvider({ children, backend }: { children: ReactNode; backend?: AuthBackend | 'demo' | null }) {
  // 'demo' = حسابات العرض التفاعلي المحلية
  const isDemo = backend === 'demo' || (backend === undefined && readConfig().useMockData);
  const resolved = useMemo<AuthBackend | null>(() => {
    if (backend === 'demo') return demoAuthBackend;
    if (backend !== undefined) return backend;
    const config = readConfig();
    if (config.useMockData) return demoAuthBackend;
    return isSupabaseConfigured(config) ? supabaseBackend() : null;
  }, [backend]);

  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>(() =>
    resolved ? { status: 'loading', user: null } : { status: 'not_configured', user: null },
  );

  useEffect(() => {
    if (!resolved) return;
    let active = true;
    const apply = (u: AuthUser | null) => active && setState({ status: u ? 'signed_in' : 'signed_out', user: u });
    resolved.current().then(apply).catch(() => apply(null));
    const unsub = resolved.subscribe(apply);
    return () => {
      active = false;
      unsub();
    };
  }, [resolved]);

  const real = resolved;
  const signIn = useCallback<AuthBackend['signIn']>((e, p) => (real ? real.signIn(e.trim(), p) : unavailable()), [real]);
  const signUp = useCallback<AuthBackend['signUp']>((n, e, p) => (real ? real.signUp(n.trim(), e.trim(), p) : unavailable()), [real]);
  const signOut = useCallback(async () => {
    await real?.signOut();
  }, [real]);
  const refresh = useCallback(async () => {
    if (!real) return;
    const u = await real.current().catch(() => null);
    setState({ status: u ? 'signed_in' : 'signed_out', user: u });
  }, [real]);
  const userId = state.user?.id;
  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!real || !userId) return false;
      const ok = await real.updateProfile(userId, patch);
      // تغيير اللغة لا يحتاج إعادة قراءة الملف الشخصي
      if (ok && (patch.fullName !== undefined || patch.phone !== undefined)) await refresh();
      return ok;
    },
    [real, userId, refresh],
  );

  const signInAs = useCallback(async (role: DemoRole) => {
    if (isDemo) await demoAuthBackend.signInAs(role);
  }, [isDemo]);

  const value = useMemo(
    () => ({ ...state, signIn, signUp, signOut, updateProfile, refresh, demo: isDemo, signInAs }),
    [state, signIn, signUp, signOut, updateProfile, refresh, isDemo, signInAs],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------- تحقق بسيط قبل الإرسال ----------
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const MIN_PASSWORD = 8;
