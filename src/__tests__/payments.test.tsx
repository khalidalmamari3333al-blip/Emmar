import { fireEvent, render, screen } from '@testing-library/react-native';

import { demoContracts } from '@/demo/contracts';
import { demoPayments } from '@/demo/payments';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { PaymentServices, PaymentsScreen } from '@/screens/payments/PaymentsScreen';
import { isOverdue, landlordReport, mapPaymentRow, PaymentRow } from '@/services/payments';
import { fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';
import type { Contract } from '@/types/contract';
import type { Payment } from '@/types/payment';

const t = dictionaries.ar;
const pay = (over: Partial<Payment>): Payment => ({
  id: 'p', contractId: 'c', propertyId: 'x', tenantId: STUDENT.id, landlordId: OWNER.id, kind: 'rent', seq: 1, dueDate: '2026-11-01', amountOmr: 45, status: 'pending', isMock: true, ...over,
});

describe('payment rules', () => {
  it('summarises the landlord report without counting deposits as income', () => {
    const r = landlordReport(
      [
        pay({ id: '1', status: 'paid' }),
        pay({ id: '2', seq: 2, dueDate: '2026-12-01' }),
        pay({ id: '3', seq: 3, dueDate: '2027-01-01', status: 'failed' }),
        pay({ id: '4', kind: 'deposit', amountOmr: 60, status: 'paid' }),
        pay({ id: '5', kind: 'deposit', amountOmr: 30, status: 'refunded' }),
      ],
      '2026-12-15',
    );
    expect(r).toEqual({ collected: 45, outstanding: 90, overdue: 45, depositsHeld: 60, refunded: 30 });
    expect(isOverdue(pay({ dueDate: '2026-01-01', status: 'paid' }), '2026-12-15')).toBe(false);
  });

  it('maps the provider reference of the successful charge onto the receipt', () => {
    const row = {
      id: 'p', contract_id: 'c', property_id: 'x', tenant_id: 't', landlord_id: 'l', kind: 'rent', seq: 1, due_date: '2026-11-01', amount_omr: '45.000', status: 'paid',
      paid_at: '2026-11-01T10:00:00Z', receipt_no: 'AQ-2026-000001', refunded_at: null,
      payment_transactions: [{ provider_ref: 'mock_fail', status: 'failed', type: 'charge', is_mock: true }, { provider_ref: 'mock_ok', status: 'succeeded', type: 'charge', is_mock: true }],
    } as PaymentRow;
    expect(mapPaymentRow(row)).toMatchObject({ amountOmr: 45, providerRef: 'mock_ok', receiptNo: 'AQ-2026-000001', isMock: true });
  });
});

describe('demo payments follow the database rules', () => {
  beforeEach(() => resetDemo());

  it('creates the schedule when the contract completes; paid only after the provider event', async () => {
    setCurrentUser(DEMO_USERS.tenant);
    const list = await demoContracts.list();
    const summary = list.ok ? list.data.find((c) => c.tenantId === DEMO_USERS.tenant)! : null;
    const full = await demoContracts.get(summary!.id);
    const c = (full as { data: Contract }).data;
    expect(demoPayments.list('tenant')).toEqual({ ok: true, data: [] }); // لا دفعات قبل اكتمال العقد
    await demoContracts.sign(c.id, c.versions[0].sha256);
    setCurrentUser(DEMO_USERS.owner);
    await demoContracts.sign(c.id, c.versions[0].sha256);

    setCurrentUser(DEMO_USERS.tenant);
    const mine = demoPayments.list('tenant');
    const rows = mine.ok ? mine.data : [];
    expect(rows.filter((p) => p.kind === 'rent')).toHaveLength(4);
    const first = rows[0];
    const session = demoPayments.checkout(first.id);
    if (!session.ok) throw new Error('checkout failed');
    expect(demoState().payments.find((p) => p.id === first.id)!.status).toBe('processing');
    expect(demoPayments.checkout(first.id)).toMatchObject({ ok: false, code: 'invalid_state' }); // لا دفع مزدوج
    expect(demoPayments.complete(session.data.providerRef, 'succeeded')).toEqual({ ok: true, data: 'paid' });
    expect(demoPayments.complete(session.data.providerRef, 'succeeded')).toEqual({ ok: true, data: 'already_final' });
    expect(demoState().payments.find((p) => p.id === first.id)!.receiptNo).toMatch(/^AQ-DEMO-\d{6}$/);
  });

  it('declined payments can be retried; only the landlord refunds a paid deposit', async () => {
    setCurrentUser(DEMO_USERS.owner);
    const report = await demoContracts.list(); // يزرع العقد المكتمل ودفعاته
    expect(report.ok).toBe(true);
    const owner = demoPayments.list('landlord');
    const deposit = owner.ok ? owner.data.find((p) => p.kind === 'deposit' && p.status === 'paid') : undefined;
    expect(deposit).toBeTruthy();
    setCurrentUser('demo-other');
    expect(demoPayments.refund(deposit!.id)).toMatchObject({ ok: false, code: 'not_allowed' });
    const due = demoPayments.list('tenant');
    const next = due.ok ? due.data.find((p) => p.status === 'pending')! : null;
    const s1 = demoPayments.checkout(next!.id);
    expect(s1.ok && demoPayments.complete(s1.data.providerRef, 'failed')).toEqual({ ok: true, data: 'failed' });
    expect(demoPayments.checkout(next!.id).ok).toBe(true);
    setCurrentUser(DEMO_USERS.owner);
    expect(demoPayments.refund(deposit!.id)).toEqual({ ok: true, data: 'refunded' });
  });
});

describe('PaymentsScreen', () => {
  const wrap = (as: 'tenant' | 'landlord', services: PaymentServices, user = STUDENT) =>
    render(
      <LocaleProvider initialLocale="ar">
        <AuthProvider backend={fakeAuthBackend(user)}>
          <PaymentsScreen as={as} services={services} />
        </AuthProvider>
      </LocaleProvider>,
    );

  it('shows the mock warning; paying goes through the mock checkout and shows the receipt', async () => {
    let rows = [pay({ id: 'r1' })];
    const services: PaymentServices = {
      list: async () => ({ ok: true, data: rows }),
      checkout: jest.fn(async () => {
        rows = [pay({ id: 'r1', status: 'processing' })];
        return { ok: true as const, data: { transactionId: 't', providerRef: 'mock_123', amountOmr: 45, provider: 'mock_pay', mock: true } };
      }),
      complete: jest.fn(async () => {
        rows = [pay({ id: 'r1', status: 'paid', receiptNo: 'AQ-2026-000009', paidAt: '2026-11-01T10:00:00Z', providerRef: 'mock_123' })];
        return { ok: true as const, data: 'paid' };
      }),
      refund: jest.fn(),
    };
    await wrap('tenant', services);
    expect(await screen.findByTestId('mock-payment-warning')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('pay-r1'));
    expect(services.checkout).toHaveBeenCalledWith('r1');
    expect(await screen.findByTestId('mock-checkout')).toBeTruthy();
    expect(screen.getByText(t.payments.checkoutBody)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('simulate-success'));
    expect(services.complete).toHaveBeenCalledWith('mock_123', 'succeeded');
    expect(await screen.findByText(t.payments.paidOk)).toBeTruthy();
    expect(await screen.findByText(/AQ-2026-000009/)).toBeTruthy();
    expect(screen.getByText(t.payments.mockReceipt)).toBeTruthy();
    expect(screen.queryByTestId('pay-r1')).toBeNull();
  });

  it('shows the landlord report and lets the landlord refund a paid deposit', async () => {
    const services: PaymentServices = {
      list: async () => ({ ok: true, data: [pay({ id: 'd1', kind: 'deposit', amountOmr: 60, status: 'paid', receiptNo: 'AQ-1', paidAt: '2026-11-01' }), pay({ id: 'r2', status: 'paid', receiptNo: 'AQ-2', paidAt: '2026-11-01' })] }),
      checkout: jest.fn(),
      complete: jest.fn(),
      refund: jest.fn(async () => ({ ok: true as const, data: 'refunded' })),
    };
    await wrap('landlord', services, OWNER);
    expect(await screen.findByTestId('payments-report')).toBeTruthy();
    expect(screen.queryByTestId('pay-d1')).toBeNull();
    await fireEvent.press(screen.getByTestId('refund-d1'));
    expect(services.refund).toHaveBeenCalledWith('d1');
    expect(await screen.findByText(t.payments.refunded)).toBeTruthy();
  });

  it('keeps the landlord report away from tenants', async () => {
    await wrap('landlord', { list: jest.fn(), checkout: jest.fn(), complete: jest.fn(), refund: jest.fn() });
    expect(await screen.findByText(t.owner.notOwner)).toBeTruthy();
  });
});
