import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { AdminUser, emptyPropertyInput, OwnerProperty } from '@/services/owner';
import { ADMIN, fakeAuthBackend, OWNER } from '@/test-utils/fakeAuth';

const t = dictionaries.ar;
const users: AdminUser[] = [
  { id: ADMIN.id, email: ADMIN.email, role: 'admin', createdAt: '' },
  { id: 'u2', email: 'salem@example.com', fullName: 'سالم', role: 'user', createdAt: '' },
];
const prop: OwnerProperty = { id: 'p1', title: { ar: 'فيلا', en: 'Villa' }, city: 'muscat', kind: 'sale', status: 'published', featured: false, updatedAt: '', input: emptyPropertyInput() };

const wrap = (props: Parameters<typeof AdminScreen>[0], auth: AuthBackend = fakeAuthBackend(ADMIN)) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={auth}>
        <AdminScreen debounceMs={0} {...props} />
      </AuthProvider>
    </LocaleProvider>,
  );

describe('AdminScreen', () => {
  it('is for admins only', async () => {
    await wrap({}, fakeAuthBackend(OWNER));
    expect(await screen.findByText(t.admin.notAdmin)).toBeTruthy();
  });

  it('promotes a user to owner, but never offers to change your own role', async () => {
    const setRole = jest.fn(async () => ({ ok: true as const, data: undefined }));
    await wrap({ listUsers: async () => ({ ok: true, data: users }), setRole });
    expect(await screen.findByText('سالم')).toBeTruthy();
    expect(screen.queryByTestId(`role-${ADMIN.id}`)).toBeNull();
    await fireEvent.press(screen.getByText(t.admin.roles.owner));
    expect(setRole).toHaveBeenCalledWith('u2', 'owner');
    expect(await screen.findByText(t.admin.roleChanged)).toBeTruthy();
  });

  it('features and archives listings', async () => {
    const setFeatured = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const setStatus = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const listProperties = jest.fn(async () => ({ ok: true as const, data: [prop] }));
    await wrap({ listUsers: async () => ({ ok: true, data: [] }), listProperties, setFeatured, setStatus });
    await fireEvent.press(await screen.findByText(t.admin.tabs.properties));
    await fireEvent.press(await screen.findByTestId('feature-p1'));
    expect(setFeatured).toHaveBeenCalledWith('p1', true);
    await fireEvent.press(screen.getByTestId('archive-p1'));
    expect(setStatus).toHaveBeenCalledWith('p1', 'archived');
    await waitFor(() => expect(listProperties.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it('shows the read-only audit log with actor names and filters by entity', async () => {
    const auditLog = jest.fn(async (entity?: string) => ({
      ok: true as const,
      data: [{ id: 7, actorId: ADMIN.id, actorName: 'مدير', action: 'role.changed', entity: 'profile', entityId: 'u2', details: { from: 'user', to: 'owner' }, createdAt: '2026-10-01T10:00:00Z' }].filter((e) => !entity || e.entity === entity),
    }));
    await wrap({ auditLog });
    await fireEvent.press(await screen.findByText(t.admin.tabs.audit));
    expect(await screen.findByText(t.extras.audit.actions['role.changed'])).toBeTruthy();
    expect(screen.getByText(/مدير ·/)).toBeTruthy();
    await fireEvent.press(screen.getByText(t.extras.audit.entities.booking));
    expect(auditLog).toHaveBeenLastCalledWith('booking');
    expect(await screen.findByText(t.extras.audit.empty)).toBeTruthy();
  });
});
