import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { isSupabaseConfigured, readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
}

export type AuthErrorCode = 'invalid_credentials' | 'email_taken' | 'weak_password' | 'email_not_confirmed' | 'invalid_email' | 'rate_limited' | 'unknown';

export type AuthResult = { ok: true; needsConfirmation?: boolean } | { ok: false; code: AuthErrorCode };

/** واجهة مجردة فوق Supabase Auth لتسهيل الاختبار. */
export interface AuthBackend {
  current(): Promise<AuthUser | null>;
  subscribe(cb: (u: AuthUser | null) => void): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  signUp(fullName: string, email: string, password: string): Promise<AuthResult>;
  signOut(): Promise<void>;
}

export type AuthStatus = 'loading' | 'signed_in' | 'signed_out' | 'demo' | 'not_configured';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signIn: AuthBackend['signIn'];
  signUp: AuthBackend['signUp'];
  signOut: () => Promise<void>;
}

const unavailable = async (): Promise<AuthResult> => ({ ok: false, code: 'unknown' });
const AuthContext = createContext<AuthContextValue>({ status: 'loading', user: null, signIn: unavailable, signUp: unavailable, signOut: async () => {} });

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
  const toUser = (u: SbUser | null | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? '', fullName: u.user_metadata?.full_name } : null);
  return {
    async current() {
      const { data } = await supabase.auth.getSession();
      return toUser(data.session?.user);
    },
    subscribe(cb) {
      const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
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
  const resolved = useMemo<AuthBackend | 'demo' | null>(() => {
    if (backend !== undefined) return backend;
    const config = readConfig();
    if (config.useMockData) return 'demo';
    return isSupabaseConfigured(config) ? supabaseBackend() : null;
  }, [backend]);

  const [state, setState] = useState<{ status: AuthStatus; user: AuthUser | null }>(() =>
    resolved === 'demo' ? { status: 'demo', user: null } : resolved ? { status: 'loading', user: null } : { status: 'not_configured', user: null },
  );

  useEffect(() => {
    if (!resolved || resolved === 'demo') return;
    let active = true;
    const apply = (u: AuthUser | null) => active && setState({ status: u ? 'signed_in' : 'signed_out', user: u });
    resolved.current().then(apply).catch(() => apply(null));
    const unsub = resolved.subscribe(apply);
    return () => {
      active = false;
      unsub();
    };
  }, [resolved]);

  const real = resolved && resolved !== 'demo' ? resolved : null;
  const signIn = useCallback<AuthBackend['signIn']>((e, p) => (real ? real.signIn(e.trim(), p) : unavailable()), [real]);
  const signUp = useCallback<AuthBackend['signUp']>((n, e, p) => (real ? real.signUp(n.trim(), e.trim(), p) : unavailable()), [real]);
  const signOut = useCallback(async () => {
    await real?.signOut();
  }, [real]);

  const value = useMemo(() => ({ ...state, signIn, signUp, signOut }), [state, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------- تحقق بسيط قبل الإرسال ----------
export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const MIN_PASSWORD = 8;
