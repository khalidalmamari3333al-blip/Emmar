import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { demoContracts } from '@/demo/contracts';
import { demoIdentity } from '@/demo/identity';
import { demoAuthBackend, DEMO_OTP } from '@/demo/services';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { formatOmanMobile, normalizeOmanMobile } from '@/lib/phone';
import { AccountScreen } from '@/screens/AccountScreen';
import { LeaseSection, LeaseServices } from '@/screens/contracts/LeaseSection';
import { IdentityScreen, IdentityServices } from '@/screens/identity/IdentityScreen';
import { fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';
import type { Contract } from '@/types/contract';

const t = dictionaries.ar;
const wrap = (ui: ReactElement, backend: AuthBackend | 'demo' | null = fakeAuthBackend(STUDENT)) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={backend}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

describe('Omani mobile numbers', () => {
  it('accepts local, +968, 00968 and Arabic-Indic forms; rejects landlines and wrong lengths', () => {
    expect(normalizeOmanMobile('91234567')).toBe('+96891234567');
    expect(normalizeOmanMobile('+968 7123 4567')).toBe('+96871234567');
    expect(normalizeOmanMobile('0096891234567')).toBe('+96891234567');
    expect(normalizeOmanMobile('٩١٢٣٤٥٦٧')).toBe('+96891234567');
    expect(normalizeOmanMobile('24123456')).toBeNull(); // هاتف ثابت
    expect(normalizeOmanMobile('9123456')).toBeNull();
    expect(formatOmanMobile('+96891234567')).toBe('+968 9123 4567');
  });
});

describe('sign-up with mobile + OTP + email', () => {
  it('sends a code, verifies it, then asks only for name and email (no ID card)', async () => {
    let signedIn: { id: string; email: string; role: 'user'; fullName?: string } | null = null;
    let listener: ((u: typeof signedIn) => void) | null = null;
    const backend = fakeAuthBackend(null, {
      current: async () => signedIn,
      subscribe: (cb) => {
        listener = cb as never;
        return () => (listener = null);
      },
      sendPhoneCode: jest.fn(async () => ({ ok: true as const })),
      verifyPhoneCode: jest.fn(async (_p: string, code: string) => {
        if (code !== '654321') return { ok: false as const, code: 'invalid_code' as const };
        signedIn = { id: 'new-1', email: '', role: 'user' };
        listener?.(signedIn);
        return { ok: true as const, needsProfile: true };
      }),
      completeProfile: jest.fn(async (fullName: string, email: string) => {
        signedIn = { id: 'new-1', email, role: 'user', fullName };
        return { ok: true as const, needsConfirmation: true };
      }),
    });
    await wrap(<AccountScreen />, backend);
    await fireEvent.changeText(await screen.findByTestId('phone-input'), '2412');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(screen.getByText(t.auth.errors.invalid_phone)).toBeTruthy();
    expect(backend.sendPhoneCode).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId('phone-input'), '9123 4567');
    await fireEvent.press(screen.getByTestId('send-code'));
    expect(backend.sendPhoneCode).toHaveBeenCalledWith('+96891234567');
    expect(await screen.findByText(t.auth.phone.codeSent('+968 9123 4567'))).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('code-input'), '111111');
    await fireEvent.press(screen.getByTestId('verify-code'));
    expect(await screen.findByText(t.auth.errors.invalid_code)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('code-input'), '654321');
    await fireEvent.press(screen.getByTestId('verify-code'));
    expect(await screen.findByTestId('complete-profile')).toBeTruthy();
    expect(screen.getByText(t.auth.phone.profileIntro)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('profile-name'), 'سالم البلوشي');
    await fireEvent.changeText(screen.getByTestId('profile-email'), 'salem@example.com');
    await fireEvent.press(screen.getByTestId('finish-profile'));
    expect(backend.completeProfile).toHaveBeenCalledWith('سالم البلوشي', 'salem@example.com');
  });

  it('demo mode uses the fixed demo code and creates a new account for a new number', async () => {
    resetDemo();
    expect(await demoAuthBackend.verifyPhoneCode!('91112222', '000000')).toEqual({ ok: false, code: 'invalid_code' });
    expect(await demoAuthBackend.verifyPhoneCode!('91112222', DEMO_OTP)).toEqual({ ok: true, needsProfile: true });
    expect((await demoAuthBackend.current())?.phoneVerified).toBe(true);
    expect(await demoAuthBackend.completeProfile!('مستخدم جديد', 'new@demo.om')).toMatchObject({ ok: true });
    // رقم حساب موجود يسجّل الدخول إليه
    expect(await demoAuthBackend.verifyPhoneCode!('+968 9123 4567', DEMO_OTP)).toEqual({ ok: true, needsProfile: false });
    expect((await demoAuthBackend.current())?.id).toBe(DEMO_USERS.tenant);
  });
});

describe('identity verification', () => {
  const services = (over: Partial<IdentityServices> = {}): IdentityServices => ({
    mine: async () => ({ ok: true, data: null }),
    providers: async () => ({ ok: true, data: { theqa: false, mock: true } }),
    theqa: async () => ({ ok: false, code: 'theqa_not_connected' }),
    mock: jest.fn(async () => ({ ok: true as const, data: undefined })),
    ...over,
  });

  it('explains when identity is needed and says honestly that THEQA is not connected', async () => {
    await wrap(<IdentityScreen services={services()} />);
    expect(await screen.findByText(t.identity.why)).toBeTruthy();
    expect(screen.getByText(t.identity.theqaNotConnected)).toBeTruthy();
    expect(screen.getByText(t.identity.privacy)).toBeTruthy();
    expect(screen.getByTestId('mock-identity')).toBeTruthy();
  });

  it('runs the mock check and shows the verified state', async () => {
    let verified = false;
    const s = services({
      mine: async () => ({ ok: true, data: verified ? { provider: 'mock_theqa', isMock: true, verifiedName: 'سالم', last4: '5678', verifiedAt: '2026-10-11T00:00:00Z' } : null }),
      mock: jest.fn(async () => {
        verified = true;
        return { ok: true as const, data: undefined };
      }),
    });
    await wrap(<IdentityScreen services={s} />);
    await fireEvent.changeText(await screen.findByTestId('identity-name'), 'سالم');
    await fireEvent.changeText(screen.getByTestId('identity-civil'), '12345678');
    await fireEvent.press(screen.getByTestId('verify-mock'));
    expect(s.mock).toHaveBeenCalledWith('سالم', '12345678');
    expect(await screen.findByTestId('identity-verified')).toBeTruthy();
    expect(screen.getByText(t.identity.verifiedVia.mock_theqa, { exact: false })).toBeTruthy();
  });

  it('hides the mock option when the server has not enabled it', async () => {
    await wrap(<IdentityScreen services={services({ providers: async () => ({ ok: true, data: { theqa: false, mock: false } }) })} />);
    await screen.findByText(t.identity.why);
    expect(screen.queryByTestId('mock-identity')).toBeNull();
  });

  it('demo: one civil number cannot verify two accounts; signing needs identity', async () => {
    resetDemo();
    setCurrentUser('demo-reem');
    expect(demoIdentity.mockVerify('ريم الحارثية', '11112222').ok).toBe(true);
    setCurrentUser('demo-ahmed');
    expect(demoIdentity.mockVerify('أحمد', '11112222')).toEqual({ ok: false, code: 'identity_in_use' });
    // سالم موثّق؛ نزيل هويته فيُطلب التحقق قبل التوقيع
    setCurrentUser(DEMO_USERS.tenant);
    const list = await demoContracts.list();
    const mine = list.ok ? list.data.find((c) => c.tenantId === DEMO_USERS.tenant)! : null;
    const full = (await demoContracts.get(mine!.id)) as { ok: true; data: Contract };
    delete demoState().identities[DEMO_USERS.tenant];
    expect(await demoContracts.sign(mine!.id, full.data.versions[0].sha256)).toMatchObject({ ok: false, code: 'identity_required' });
  });
});

describe('official lease registration', () => {
  const lease = (status: 'not_submitted' | 'submitted') => ({ contractId: 'c1', authority: 'muscat_municipality' as const, method: 'manual' as const, status, referenceNo: status === 'submitted' ? 'MCT-9' : undefined });

  it('tells both parties that signing is not official registration; the landlord submits with a reference', async () => {
    const services: LeaseServices = { get: async () => ({ ok: true, data: lease('not_submitted') }), update: jest.fn(async () => ({ ok: true as const, data: undefined })) };
    await wrap(<LeaseSection contractId="c1" role="landlord" services={services} />, fakeAuthBackend(OWNER));
    expect(await screen.findByText(t.lease.notice)).toBeTruthy();
    expect(screen.getByText(t.lease.manualNote)).toBeTruthy();
    expect(screen.getByText(`• ${t.lease.checklist[1]}`)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('lease-reference'), 'MCT-2027-1');
    await fireEvent.press(screen.getByTestId('lease-submit'));
    expect(services.update).toHaveBeenCalledWith('c1', 'submitted', 'MCT-2027-1', '');
    expect(screen.queryByTestId('lease-confirm')).toBeNull(); // المالك لا يؤكد التسجيل بنفسه
  });

  it('only the platform confirms a submitted registration; tenants just see the status', async () => {
    const services: LeaseServices = { get: async () => ({ ok: true, data: lease('submitted') }), update: jest.fn(async () => ({ ok: true as const, data: undefined })) };
    const r = await wrap(<LeaseSection contractId="c1" role="tenant" services={services} />);
    expect(await screen.findByText(t.lease.status.submitted)).toBeTruthy();
    expect(screen.queryByTestId('lease-submit')).toBeNull();
    expect(screen.queryByTestId('lease-confirm')).toBeNull();
    await r.unmount();
    await wrap(<LeaseSection contractId="c1" role="admin" services={services} />);
    await fireEvent.press(await screen.findByTestId('lease-confirm'));
    expect(services.update).toHaveBeenCalledWith('c1', 'registered', '', '');
  });

  it('demo: completing a contract opens a registration the landlord cannot self-confirm', async () => {
    resetDemo();
    setCurrentUser(DEMO_USERS.owner);
    const list = await demoContracts.list();
    const done = list.ok ? list.data.find((c) => c.status === 'completed')! : null;
    expect(demoContracts.lease(done!.id)).toMatchObject({ ok: true, data: { status: 'not_submitted', method: 'manual' } });
    expect(demoContracts.updateLease(done!.id, 'submitted')).toMatchObject({ ok: false, code: 'reason_required' });
    expect(demoContracts.updateLease(done!.id, 'submitted', 'SHR-1').ok).toBe(true);
    expect(demoContracts.updateLease(done!.id, 'registered')).toMatchObject({ ok: false, code: 'not_allowed' });
    setCurrentUser(DEMO_USERS.admin);
    expect(demoContracts.updateLease(done!.id, 'registered').ok).toBe(true);
  });
});
