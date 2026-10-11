import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppBridge } from '@/components/AppBridge';
import { NotificationBell } from '@/components/NotificationBell';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { AccountScreen } from '@/screens/AccountScreen';
import { NotificationsScreen } from '@/screens/NotificationsScreen';
import { AppNotification, notificationText, NotificationsBackend, targetRoute, timeAgo } from '@/services/notifications';
import { fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';

jest.mock('@/lib/push', () => ({
  enablePush: jest.fn(async () => 'unsupported'),
  unregisterDevice: jest.fn(async () => undefined),
  onNotificationTap: jest.fn(() => () => undefined),
}));
// eslint-disable-next-line import/first
import { enablePush, unregisterDevice } from '@/lib/push';

const ar = dictionaries.ar;
const en = dictionaries.en;
const data = { bed_code: '2', room_code: '003', property_title_ar: 'سكن النخيل', property_title_en: 'Al Nakheel', requester_name: 'سالم' };
const n = (id: string, kind: AppNotification['kind'], read = false): AppNotification => ({ id, kind, data, createdAt: '2026-10-09T10:00:00Z', readAt: read ? '2026-10-09T11:00:00Z' : undefined });

function backend(items: AppNotification[]): jest.Mocked<NotificationsBackend> {
  return { list: jest.fn(async () => items), unreadCount: jest.fn(async () => items.filter((x) => !x.readAt).length), markRead: jest.fn(async (_ids: string[]) => undefined), markAllRead: jest.fn(async () => undefined) };
}

const wrap = (ui: React.ReactElement, auth: AuthBackend | 'demo' = fakeAuthBackend(OWNER), locale: 'ar' | 'en' = 'ar') =>
  render(
    <LocaleProvider initialLocale={locale}>
      <AuthProvider backend={auth}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

describe('notification text', () => {
  it('matches the database wording in both languages', () => {
    // نفس نص notification_text() في SQL (مختبر هناك أيضًا)
    expect(notificationText(n('1', 'booking_requested'), ar, 'ar').body).toBe('سالم طلب سرير 2 · غرفة 003 في سكن النخيل');
    expect(notificationText(n('1', 'booking_confirmed'), en, 'en')).toEqual({ title: 'Your request was approved ✓', body: 'Bed 2 · Room 003 at Al Nakheel is confirmed for you' });
  });

  it('routes owner notifications to the inbox and tenant ones to bookings', () => {
    expect(targetRoute('booking_requested')).toBe('/owner/requests');
    expect(targetRoute('booking_cancelled_by_tenant')).toBe('/owner/requests');
    expect(targetRoute('booking_confirmed')).toBe('/bookings');
    expect(targetRoute('booking_expired')).toBe('/bookings');
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-10-09T12:00:00Z');
    expect(timeAgo('2026-10-09T11:59:30Z', ar, now)).toBe('الآن');
    expect(timeAgo('2026-10-09T11:55:00Z', ar, now)).toBe('منذ 5 د');
    expect(timeAgo('2026-10-07T12:00:00Z', ar, now)).toBe('منذ يومين');
  });
});

describe('NotificationBell', () => {
  it('shows the unread count for signed-in users', async () => {
    await wrap(<NotificationBell onPress={() => {}} backend={backend([n('1', 'booking_requested'), n('2', 'booking_requested', true)])} />);
    expect(await screen.findByLabelText(`${ar.notifications.open} (1)`)).toBeTruthy();
  });

  it('is hidden for signed-out users', async () => {
    await wrap(<NotificationBell onPress={() => {}} backend={backend([])} />, fakeAuthBackend(null));
    expect(screen.queryByTestId('notification-bell')).toBeNull();
  });
});

describe('NotificationsScreen', () => {
  it('lists notifications, marks one read and opens the right screen', async () => {
    const b = backend([n('1', 'booking_requested'), n('2', 'booking_confirmed', true)]);
    const onNavigate = jest.fn();
    await wrap(<NotificationsScreen backend={b} onNavigate={onNavigate} now={Date.parse('2026-10-09T10:05:00Z')} />);
    expect(await screen.findByText('سالم طلب سرير 2 · غرفة 003 في سكن النخيل')).toBeTruthy();
    expect(screen.getAllByText('منذ 5 د')).toHaveLength(2);
    await fireEvent.press(screen.getByTestId('notification-1'));
    expect(b.markRead).toHaveBeenCalledWith(['1']);
    expect(onNavigate).toHaveBeenCalledWith('/owner/requests');
    // المقروء مسبقًا لا يُعلَّم مرة أخرى
    await fireEvent.press(screen.getByTestId('notification-2'));
    expect(b.markRead).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenLastCalledWith('/bookings');
  });

  it('marks all as read', async () => {
    const b = backend([n('1', 'booking_requested'), n('2', 'booking_rejected')]);
    await wrap(<NotificationsScreen backend={b} />);
    await fireEvent.press(await screen.findByTestId('mark-all-read'));
    expect(b.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('mark-all-read')).toBeNull());
  });

  it('shows an empty state and asks signed-out users to sign in', async () => {
    await wrap(<NotificationsScreen backend={backend([])} />);
    expect(await screen.findByText(ar.notifications.empty)).toBeTruthy();
  });

  it('asks signed-out users to sign in', async () => {
    await wrap(<NotificationsScreen backend={backend([])} />, fakeAuthBackend(null));
    expect(await screen.findByText(ar.notifications.signInPrompt)).toBeTruthy();
  });
});

describe('device and language sync', () => {
  it('saves the app language to the profile so pushes arrive in it', async () => {
    const updateProfile = jest.fn(async () => true);
    await wrap(<AppBridge />, fakeAuthBackend(STUDENT, { updateProfile }), 'en');
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(STUDENT.id, { preferredLocale: 'en' }));
  });

  it('unregisters this device before signing out', async () => {
    const signOut = jest.fn(async () => undefined);
    await wrap(<AccountScreen />, fakeAuthBackend(STUDENT, { signOut }));
    await fireEvent.press(await screen.findByText(ar.auth.signOut));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(unregisterDevice).toHaveBeenCalled();
  });

  it('explains when phone notifications are not available here', async () => {
    await wrap(<AccountScreen />, fakeAuthBackend(STUDENT));
    await fireEvent.press(await screen.findByTestId('enable-push'));
    expect(enablePush).toHaveBeenCalledWith(true);
    expect(await screen.findByText(ar.notifications.push.unsupported)).toBeTruthy();
  });
});
