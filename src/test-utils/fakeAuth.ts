import type { AuthBackend, AuthResult, AuthUser } from '@/lib/auth';

/** خلفية مصادقة وهمية للاختبارات فقط. */
export function fakeAuthBackend(initial: AuthUser | null, overrides: Partial<AuthBackend> = {}): AuthBackend & { emit: (u: AuthUser | null) => void } {
  let listener: ((u: AuthUser | null) => void) | null = null;
  const ok: AuthResult = { ok: true };
  return {
    current: async () => initial,
    subscribe: (cb) => {
      listener = cb;
      return () => (listener = null);
    },
    signIn: async () => ok,
    signUp: async () => ok,
    signOut: async () => listener?.(null),
    updateProfile: async () => true,
    emit: (u) => listener?.(u),
    ...overrides,
  };
}

export const STUDENT: AuthUser = { id: 'user-1', email: 'student@example.com', fullName: 'طالب', role: 'user' };
export const OWNER: AuthUser = { id: 'owner-1', email: 'owner@example.com', fullName: 'مالك', phone: '+96891234567', role: 'owner' };
export const ADMIN: AuthUser = { id: 'admin-1', email: 'admin@example.com', fullName: 'مدير', role: 'admin' };
export const VERIFIER: AuthUser = { id: 'verifier-1', email: 'verifier@example.com', fullName: 'موظف تحقق', role: 'verifier' };
