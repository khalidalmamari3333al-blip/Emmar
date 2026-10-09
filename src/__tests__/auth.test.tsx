import { fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider, isValidEmail, mapAuthError } from '@/lib/auth';
import { AccountScreen } from '@/screens/AccountScreen';
import { fakeAuthBackend, STUDENT } from '@/test-utils/fakeAuth';

const t = dictionaries.ar;

const renderAccount = (backend: AuthBackend | 'demo' | null) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={backend}>
        <AccountScreen />
      </AuthProvider>
    </LocaleProvider>,
  );

describe('auth helpers', () => {
  it('maps Supabase error codes', () => {
    expect(mapAuthError({ code: 'invalid_credentials' })).toBe('invalid_credentials');
    expect(mapAuthError({ code: 'user_already_exists' })).toBe('email_taken');
    expect(mapAuthError({ code: 'over_email_send_rate_limit' })).toBe('rate_limited');
    expect(mapAuthError({ status: 429 })).toBe('rate_limited');
    expect(mapAuthError({ code: 'something_new' })).toBe('unknown');
  });

  it('validates emails', () => {
    expect(isValidEmail('a@b.om')).toBe(true);
    expect(isValidEmail(' a@b.om ')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('not an email')).toBe(false);
  });
});

describe('AccountScreen', () => {
  it('validates input before contacting the server', async () => {
    const signIn = jest.fn();
    await renderAccount(fakeAuthBackend(null, { signIn }));
    await fireEvent.changeText(await screen.findByLabelText(t.auth.email), 'bad');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(screen.getByText(t.auth.invalidEmail)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(t.auth.email), 'me@example.com');
    await fireEvent.changeText(screen.getByLabelText(t.auth.password), 'short');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(screen.getByText(t.auth.shortPassword)).toBeTruthy();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('shows the server error for wrong credentials', async () => {
    await renderAccount(fakeAuthBackend(null, { signIn: async () => ({ ok: false, code: 'invalid_credentials' }) }));
    await fireEvent.changeText(await screen.findByLabelText(t.auth.email), 'me@example.com');
    await fireEvent.changeText(screen.getByLabelText(t.auth.password), 'password123');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(await screen.findByText(t.auth.errors.invalid_credentials)).toBeTruthy();
  });

  it('signs up and tells the user to confirm their email', async () => {
    const signUp = jest.fn(async () => ({ ok: true as const, needsConfirmation: true }));
    await renderAccount(fakeAuthBackend(null, { signUp }));
    await fireEvent.press(await screen.findByText(t.auth.toSignUp));
    await fireEvent.changeText(screen.getByLabelText(t.auth.fullName), 'سالم');
    await fireEvent.changeText(screen.getByLabelText(t.auth.email), 'salem@example.com');
    await fireEvent.changeText(screen.getByLabelText(t.auth.password), 'password123');
    await fireEvent.press(screen.getByTestId('auth-submit'));
    expect(signUp).toHaveBeenCalledWith('سالم', 'salem@example.com', 'password123');
    expect(await screen.findByText(t.auth.checkEmail)).toBeTruthy();
  });

  it('shows the signed-in user and signs out', async () => {
    await renderAccount(fakeAuthBackend(STUDENT));
    expect(await screen.findByText(STUDENT.email)).toBeTruthy();
    await fireEvent.press(screen.getByText(t.auth.signOut));
    expect(await screen.findByText(t.auth.signInTitle)).toBeTruthy();
  });

  it('is honest in demo mode and when Supabase is missing', async () => {
    await renderAccount('demo');
    expect(screen.getByText(t.auth.demoMode)).toBeTruthy();
  });

  it('says the database is not connected when there is no backend', async () => {
    await renderAccount(null);
    expect(screen.getByText(t.notConfigured)).toBeTruthy();
  });
});
