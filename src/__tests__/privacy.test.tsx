import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { demoPrivacy } from '@/demo/privacy';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthProvider, loginLockSeconds } from '@/lib/auth';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { PrivacyScreen, PrivacyServices } from '@/screens/privacy/PrivacyScreen';
import { errorCode } from '@/services/privacy';
import { ADMIN, fakeAuthBackend, STUDENT } from '@/test-utils/fakeAuth';

const t = dictionaries.ar;
const p = t.privacy;
const wrap = (ui: ReactElement, user = STUDENT) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={fakeAuthBackend(user)}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

describe('login lockout', () => {
  it('locks for a minute after 5 wrong attempts within 5 minutes', () => {
    const now = 1_000_000;
    expect(loginLockSeconds([now - 4000, now - 3000, now - 2000, now - 1000], now)).toBe(0);
    expect(loginLockSeconds([now - 5000, now - 4000, now - 3000, now - 2000, now - 1000], now)).toBe(59);
    expect(loginLockSeconds([now - 5000, now - 4000, now - 3000, now - 2000, now - 61_000], now + 60_000)).toBe(0);
    // محاولات أقدم من 5 دقائق لا تُحسب
    expect(loginLockSeconds(Array.from({ length: 6 }, (_, i) => now - 6 * 60_000 - i), now)).toBe(0);
  });
});

describe('safe privacy errors', () => {
  it('maps server errors to codes without exposing messages', () => {
    expect(errorCode({ code: 'RL001' })).toBe('rate_limited');
    expect(errorCode({ code: '23505' })).toBe('duplicate');
    expect(errorCode({ code: '42501' })).toBe('not_allowed');
    expect(errorCode({ code: 'XX000' })).toBe('error');
  });
});

describe('PrivacyScreen', () => {
  const services = (over: Partial<PrivacyServices> = {}) => ({
    exportData: async () => ({ ok: true, data: { email: 'me@example.com', bookings: [] } }),
    request: jest.fn(async () => ({ ok: true as const, data: undefined })),
    list: async () => ({ ok: true as const, data: [] }),
    ...over,
  }) as PrivacyServices & { request: jest.Mock };

  it('exports my data as readable JSON', async () => {
    await wrap(<PrivacyScreen services={services()} />);
    await fireEvent.press(await screen.findByTestId('export-data'));
    expect(await screen.findByText(/me@example\.com/)).toBeTruthy();
    expect(screen.getByText(p.retention, { exact: false })).toBeTruthy();
  });

  it('asks for confirmation before requesting deletion and explains what is kept', async () => {
    const s = services();
    await wrap(<PrivacyScreen services={s} />);
    expect(await screen.findByText(p.deletionBody)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('request-deletion'));
    expect(s.request).not.toHaveBeenCalled();
    expect(screen.getByText(p.deletionConfirm)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('request-deletion'));
    expect(s.request).toHaveBeenCalledWith('deletion', undefined);
    expect(await screen.findByText(p.sent)).toBeTruthy();
  });

  it('explains duplicates and rate limits clearly', async () => {
    await wrap(<PrivacyScreen services={services({ request: jest.fn(async () => ({ ok: false as const, code: 'rate_limited' as const })) })} />);
    await fireEvent.changeText(await screen.findByTestId('correction-details'), 'هاتفي خطأ');
    await fireEvent.press(screen.getByTestId('send-correction'));
    expect(await screen.findByText(p.rateLimited)).toBeTruthy();
  });
});

describe('admin privacy tab', () => {
  it('runs a deletion and the retention job', async () => {
    const privacy = {
      list: jest.fn(async () => ({ ok: true as const, data: [{ id: 'd1', userId: 'u', type: 'deletion' as const, status: 'pending' as const, createdAt: '2026-10-10T00:00:00Z' }] })),
      handle: jest.fn(),
      processDeletion: jest.fn(async () => ({ ok: true as const, data: { loginBlocked: true, files: { removed: 2, failed: 0 } } })),
      runRetention: jest.fn(async () => ({ ok: true as const, data: { queued: 3, files: { removed: 3, failed: 0 } } })),
    };
    await wrap(<AdminScreen privacy={privacy} debounceMs={0} />, ADMIN);
    await fireEvent.press(await screen.findByText(p.adminTab));
    await fireEvent.press(await screen.findByTestId('delete-d1'));
    expect(privacy.processDeletion).toHaveBeenCalledWith('d1');
    expect(await screen.findByText(p.deletionDone(true, 2))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('run-retention'));
    expect(await screen.findByText(p.retentionDone(3, 3))).toBeTruthy();
  });
});

describe('demo privacy follows the database rules', () => {
  beforeEach(() => resetDemo());

  it('exports only my data, limits requests and anonymises on deletion', () => {
    setCurrentUser(DEMO_USERS.tenant);
    const ex = demoPrivacy.export();
    expect(ex.ok && (ex.data.bookings as { id: string }[]).every((b) => demoState().bookings.find((x) => x.id === b.id)?.userId === DEMO_USERS.tenant)).toBe(true);
    expect(demoPrivacy.request('deletion').ok).toBe(true);
    expect(demoPrivacy.request('deletion')).toMatchObject({ ok: false, code: 'duplicate' });
    expect(demoPrivacy.processDeletion(demoState().privacy[0].id)).toMatchObject({ ok: false, code: 'not_allowed' });
    setCurrentUser(DEMO_USERS.admin);
    expect(demoPrivacy.processDeletion(demoState().privacy[0].id).ok).toBe(true);
    expect(demoState().users.find((u) => u.id === DEMO_USERS.tenant)!.fullName).toBe('مستخدم محذوف');
  });
});
