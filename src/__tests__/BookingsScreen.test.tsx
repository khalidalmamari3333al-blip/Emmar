import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { BookingsScreen } from '@/screens/BookingsScreen';
import type { CancelResult, MyBooking } from '@/services/bookings';
import { fakeAuthBackend, STUDENT } from '@/test-utils/fakeAuth';

const t = dictionaries.ar;

const pending: MyBooking = {
  id: 'b1', status: 'pending', start: '2026-11-01', end: '2027-03-01', expiresAt: '2026-10-11T10:00:00Z',
  monthlyPriceOmr: 45, createdAt: '2026-10-09', bedCode: '2', roomCode: '003', floorLevel: 0,
  buildingName: { ar: 'المبنى أ', en: 'Building A' }, propertyId: 'p1', propertyTitle: { ar: 'سكن قرب الجامعة', en: 'Near uni' },
};
const rejected: MyBooking = { ...pending, id: 'b2', status: 'rejected', expiresAt: undefined };

async function setup(auth: AuthBackend | 'demo' | null, data: MyBooking[] = [], cancel?: (id: string) => Promise<CancelResult>) {
  const load = jest.fn(async () => ({ status: 'ok' as const, source: 'live' as const, data }));
  const onSignIn = jest.fn();
  const cancelFn = jest.fn(cancel ?? (async () => ({ status: 'ok' as const })));
  await render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={auth}>
        <BookingsScreen load={load} cancel={cancelFn} onSignIn={onSignIn} />
      </AuthProvider>
    </LocaleProvider>,
  );
  return { load, onSignIn, cancelFn };
}

describe('BookingsScreen', () => {
  it('asks signed-out users to sign in', async () => {
    const { onSignIn, load } = await setup(fakeAuthBackend(null));
    await fireEvent.press(await screen.findByText(t.bookings.signInCta));
    expect(onSignIn).toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('lists my bookings with status, location, dates and total', async () => {
    const { load } = await setup(fakeAuthBackend(STUDENT), [pending, rejected]);
    expect(await screen.findAllByText('سكن قرب الجامعة')).toHaveLength(2);
    expect(load).toHaveBeenCalledWith(STUDENT.id);
    expect(screen.getByText(t.bookings.status.pending)).toBeTruthy();
    expect(screen.getByText(t.bookings.status.rejected)).toBeTruthy();
    expect(screen.getAllByText(/سرير 2 · غرفة 003 · الأرضي · المبنى أ/)).toHaveLength(2);
    expect(screen.getAllByText(/الإجمالي: 180 ر.ع/)).toHaveLength(2);
    expect(screen.getByText(t.bookings.pendingUntil('11 أكتوبر 2026'))).toBeTruthy();
    // لا يمكن إلغاء طلب مرفوض
    expect(screen.getAllByText(t.bookings.cancel)).toHaveLength(1);
  });

  it('cancels only after a second confirmation, then reloads', async () => {
    const { cancelFn, load } = await setup(fakeAuthBackend(STUDENT), [pending]);
    await fireEvent.press(await screen.findByText(t.bookings.cancel));
    expect(cancelFn).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText(t.bookings.confirmCancel));
    expect(cancelFn).toHaveBeenCalledWith('b1');
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it('shows an error if cancelling fails', async () => {
    await setup(fakeAuthBackend(STUDENT), [pending], async () => ({ status: 'error', message: 'x' }));
    await fireEvent.press(await screen.findByText(t.bookings.cancel));
    await fireEvent.press(screen.getByText(t.bookings.confirmCancel));
    expect(await screen.findByText(t.bookings.cancelFailed)).toBeTruthy();
  });

  it('shows an empty state', async () => {
    await setup(fakeAuthBackend(STUDENT), []);
    expect(await screen.findByText(t.bookings.empty)).toBeTruthy();
  });

  it('in demo mode, asks to sign in first (demo accounts live in Account)', async () => {
    await setup('demo');
    expect(await screen.findByText(t.bookings.signInPrompt)).toBeTruthy();
  });
});
