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
    emit: (u) => listener?.(u),
    ...overrides,
  };
}

export const STUDENT: AuthUser = { id: 'user-1', email: 'student@example.com', fullName: 'طالب' };
