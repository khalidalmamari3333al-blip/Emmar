import { fireEvent, render, screen } from '@testing-library/react-native';
import { createHash } from 'node:crypto';

import { demoContracts } from '@/demo/contracts';
import { demoOwner } from '@/demo/services';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { ContractScreen, ContractServices } from '@/screens/contracts/ContractScreen';
import { canonicalText, contractSha256, monthsBetween, renderStudentContract } from '@/services/contractRender';
import { canSign, myRole } from '@/services/contracts';
import { fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';
import type { Contract } from '@/types/contract';

const t = dictionaries.ar;
const facts = {
  landlordName: 'خالد المعمري', tenantName: 'سالم', titleAr: 'سكن', titleEn: 'Residence', city: 'sohar' as const, districtAr: 'الهمبار', districtEn: 'Al Humbar',
  bedLabel: '101-1', startDate: '2026-11-01', endDate: '2027-03-01', monthlyPrice: 45, deposit: 45, cancellation: 'flexible', bookingId: 'b-1',
};

describe('contract text and fingerprint', () => {
  it('fills every placeholder from the booking facts', () => {
    const { bodyAr, bodyEn } = renderStudentContract(facts);
    expect(bodyAr).not.toMatch(/\{\{/);
    expect(bodyAr).toContain('من 2026-11-01 إلى 2027-03-01 (4 شهر)');
    expect(bodyEn).toContain('Monthly rent: 45 OMR');
    expect(bodyAr).toContain('سياسة الإلغاء: مرنة');
    expect(bodyEn).toContain('Terms:\n—');
    expect(monthsBetween('2026-11-15', '2027-01-14')).toBe(1);
  });

  it('computes SHA-256 over the same canonical text as the database', async () => {
    const { bodyAr, bodyEn } = renderStudentContract(facts);
    const expected = createHash('sha256').update(canonicalText(bodyAr, bodyEn), 'utf8').digest('hex');
    expect(await contractSha256(bodyAr, bodyEn)).toBe(expected);
    expect(await contractSha256(bodyAr + ' ', bodyEn)).not.toBe(expected);
  });
});

describe('demo contracts follow the database rules', () => {
  beforeEach(() => resetDemo());

  it("seeds Salem's contract and runs tenant → landlord signing to a frozen final fingerprint", async () => {
    setCurrentUser(DEMO_USERS.tenant);
    const list = await demoContracts.list();
    const summary = list.ok ? list.data[0] : undefined;
    expect(summary).toMatchObject({ status: 'pending_tenant', tenantId: DEMO_USERS.tenant });
    const c = (await demoContracts.get(summary!.id)).ok ? ((await demoContracts.get(summary!.id)) as { data: Contract }).data : null;
    const sha = c!.versions[0].sha256;
    expect(await demoContracts.sign(c!.id, '0'.repeat(64))).toMatchObject({ ok: false, code: 'fingerprint_mismatch' });
    expect(await demoContracts.sign(c!.id, sha)).toEqual({ ok: true, data: 'pending_landlord' });
    expect(await demoContracts.sign(c!.id, sha)).toMatchObject({ ok: false, code: 'not_your_turn' });

    setCurrentUser(DEMO_USERS.owner);
    expect(await demoContracts.revise(c!.id)).toMatchObject({ ok: false }); // موقّع بالفعل
    expect(await demoContracts.sign(c!.id, sha)).toEqual({ ok: true, data: 'completed' });
    const done = demoState().contracts.find((x) => x.id === c!.id)!;
    expect(done).toMatchObject({ status: 'completed', finalSha256: sha });
    expect(done.signatures.every((s) => s.isMock && s.provider === 'mock_sign')).toBe(true);
    expect(await demoContracts.cancel(c!.id, 'x')).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('only the landlord creates contracts, for confirmed bookings, once; revisions need a real change', async () => {
    setCurrentUser(DEMO_USERS.owner);
    const pending = demoState().bookings.find((b) => b.status === 'pending')!;
    expect(await demoContracts.create(pending.id)).toMatchObject({ ok: false, code: 'not_confirmed' });
    const list = await demoContracts.list();
    const c = list.ok ? list.data[0] : undefined;
    expect(await demoContracts.create(c!.bookingId)).toMatchObject({ ok: false, code: 'already_exists' });
    expect(await demoContracts.revise(c!.id)).toMatchObject({ ok: false, code: 'unchanged' });
    const p = demoState().properties.find((x) => x.id === c!.propertyId)!;
    const r = demoOwner.get(p.id);
    demoOwner.update(p.id, { ...(r.ok ? r.data!.input : ({} as never)), deposit: '99' }, Number);
    expect(await demoContracts.revise(c!.id, 'تحديث التأمين')).toEqual({ ok: true, data: 2 });

    setCurrentUser('demo-reem');
    expect(await demoContracts.get(c!.id)).toEqual({ ok: true, data: null }); // طرف ثالث
  });
});

describe('ContractScreen', () => {
  const make = async (status: Contract['status']): Promise<Contract> => {
    const { bodyAr, bodyEn } = renderStudentContract(facts);
    return {
      id: 'c1', bookingId: 'b-1', propertyId: 'p', landlordId: OWNER.id, tenantId: STUDENT.id, status, currentVersion: 1, createdAt: '',
      versions: [{ versionNo: 1, bodyAr, bodyEn, sha256: await contractSha256(bodyAr, bodyEn), createdAt: '' }], signatures: [],
    };
  };
  const wrap = (services: ContractServices, user = STUDENT) =>
    render(
      <LocaleProvider initialLocale="ar">
        <AuthProvider backend={fakeAuthBackend(user)}>
          <ContractScreen id="c1" services={services} />
        </AuthProvider>
      </LocaleProvider>,
    );

  it('always shows the mock-signature warning, verifies the fingerprint locally and asks for confirmation before signing', async () => {
    const c = await make('pending_tenant');
    const sign = jest.fn(async () => ({ ok: true as const, data: 'pending_landlord' as const }));
    await wrap({ get: async () => ({ ok: true, data: c }), sign, revise: jest.fn(), cancel: jest.fn() });
    expect(await screen.findByTestId('mock-signature-warning')).toBeTruthy();
    expect(screen.getByText(t.contracts.mockWarning)).toBeTruthy();
    expect(await screen.findByText(t.contracts.verifiedLocally)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sign-contract'));
    expect(sign).not.toHaveBeenCalled();
    expect(screen.getByText(t.contracts.confirmSign)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sign-contract'));
    expect(sign).toHaveBeenCalledWith(c);
    expect(await screen.findByText(t.contracts.signed)).toBeTruthy();
  });

  it('refuses to offer signing when the text does not match its fingerprint', async () => {
    const c = await make('pending_tenant');
    c.versions[0].bodyAr += ' (معدّل)';
    await wrap({ get: async () => ({ ok: true, data: c }), sign: jest.fn(), revise: jest.fn(), cancel: jest.fn() });
    expect(await screen.findByText(t.contracts.fingerprintMismatch)).toBeTruthy();
  });

  it('the landlord waits for the tenant, and a completed contract is shown as frozen', async () => {
    const c = await make('pending_tenant');
    expect(myRole(c, OWNER.id)).toBe('landlord');
    expect(canSign(c, OWNER.id)).toBe(false);
    await wrap({ get: async () => ({ ok: true, data: c }), sign: jest.fn(), revise: jest.fn(), cancel: jest.fn() }, OWNER);
    expect(await screen.findByText(t.contracts.waitingOther)).toBeTruthy();
    expect(screen.queryByTestId('sign-contract')).toBeNull();
    expect(screen.getByTestId('revise-contract')).toBeTruthy();
  });

  it('shows a completed contract as frozen with its final fingerprint', async () => {
    const c = { ...(await make('completed')), completedAt: '2026-10-10' };
    c.finalSha256 = c.versions[0].sha256;
    await wrap({ get: async () => ({ ok: true, data: c }), sign: jest.fn(), revise: jest.fn(), cancel: jest.fn() });
    expect(await screen.findByText(t.contracts.completedNote)).toBeTruthy();
    expect(screen.getByText(t.contracts.finalFingerprint)).toBeTruthy();
    expect(screen.queryByTestId('cancel-contract')).toBeNull();
  });
});
