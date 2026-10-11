/**
 * ⚠️ المدفوعات في وضع العرض: مزود تجريبي في ذاكرة المتصفح — لا أموال، ولا بيانات بطاقات،
 * ولا اتصال بأي بوابة دفع. نفس قواعد قاعدة البيانات (جدول عند اكتمال العقد، "مدفوع" بعد حدث المزود فقط).
 */
import type { PResult } from '@/services/payments';
import type { Contract } from '@/types/contract';
import type { CheckoutSession, Payment } from '@/types/payment';

import { audit, demoState, findBed, newId, notifyChange } from './store';

const me = () => demoState().currentUserId;
const denied = { ok: false as const, code: 'not_allowed' as const };
const invalid = { ok: false as const, code: 'invalid_state' as const };
let receipts = 0;

const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n, d));
  return dt.toISOString().slice(0, 10);
};

/** يحاكي generate_payment_schedule عند اكتمال العقد. */
export function scheduleFor(c: Contract) {
  const s = demoState();
  if (s.payments.some((p) => p.contractId === c.id)) return;
  const b = s.bookings.find((x) => x.id === c.bookingId);
  const loc = b && findBed(b.bedId);
  const p = s.properties.find((x) => x.id === c.propertyId);
  if (!b || !loc || !p) return;
  const [y1, m1, d1] = b.start.split('-').map(Number);
  const [y2, m2, d2] = b.end.split('-').map(Number);
  const months = Math.max(1, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
  const base = { contractId: c.id, propertyId: p.id, propertyTitle: p.title, tenantId: c.tenantId, landlordId: c.landlordId, status: 'pending' as const, isMock: true };
  for (let i = 1; i <= months; i++) s.payments.push({ ...base, id: newId('pay'), kind: 'rent', seq: i, dueDate: addMonths(b.start, i - 1), amountOmr: b.monthlyPriceOmr });
  if (p.depositOmr) s.payments.push({ ...base, id: newId('pay'), kind: 'deposit', seq: 1, dueDate: b.start, amountOmr: p.depositOmr });
  if (p.feesOmr) s.payments.push({ ...base, id: newId('pay'), kind: 'fee', seq: 1, dueDate: b.start, amountOmr: p.feesOmr });
  audit('payments.scheduled', 'contract', c.id, { rent_months: months });
}

/** يحاكي record_payment_event بعد التحقق من الحدث. */
function applyEvent(type: string, providerRef: string): string {
  const s = demoState();
  const tx = s.paymentTx.find((t) => t.providerRef === providerRef);
  if (!tx) return 'unknown_transaction';
  if (tx.status !== 'initiated') return 'already_final';
  const pay = s.payments.find((p) => p.id === tx.paymentId)!;
  let outcome = 'ignored_type';
  if (type === 'payment.succeeded' && tx.type === 'charge') {
    tx.status = 'succeeded';
    receipts += 1;
    Object.assign(pay, { status: 'paid', paidAt: new Date().toISOString(), receiptNo: `AQ-DEMO-${String(receipts).padStart(6, '0')}`, providerRef });
    outcome = 'paid';
  } else if (type === 'payment.failed' && tx.type === 'charge') {
    tx.status = 'failed';
    pay.status = 'failed';
    outcome = 'failed';
  } else if (type === 'refund.succeeded' && tx.type === 'refund') {
    tx.status = 'succeeded';
    Object.assign(pay, { status: 'refunded', refundedAt: new Date().toISOString() });
    outcome = 'refunded';
  }
  audit('payment.event', 'payment', pay.id, { type, outcome });
  notifyChange();
  return outcome;
}

function startTx(paymentId: string, type: 'charge' | 'refund', actor: string) {
  const s = demoState();
  const pay = s.payments.find((p) => p.id === paymentId);
  if (!pay) return denied;
  if (type === 'charge') {
    if (actor !== pay.tenantId) return denied;
    if (pay.status !== 'pending' && pay.status !== 'failed') return invalid;
    pay.status = 'processing';
  } else {
    if (actor !== pay.landlordId) return denied;
    if (pay.kind !== 'deposit' || pay.status !== 'paid') return invalid;
    pay.status = 'refund_pending';
  }
  const providerRef = `mock_demo_${newId('tx')}`;
  s.paymentTx.push({ providerRef, paymentId, type, amountOmr: pay.amountOmr, status: 'initiated', createdBy: actor });
  audit(`payment.${type}_started`, 'payment', paymentId, { provider_ref: providerRef });
  return { ok: true as const, data: { providerRef, amountOmr: pay.amountOmr } };
}

/** للبذرة: دفعات مدفوعة سلفًا في عقد مكتمل */
export function seedPaid(paymentId: string) {
  const r = startTx(paymentId, 'charge', demoState().payments.find((p) => p.id === paymentId)!.tenantId);
  if (r.ok) applyEvent('payment.succeeded', r.data.providerRef);
}

export const demoPayments = {
  list(as: 'tenant' | 'landlord'): PResult<Payment[]> {
    const uid = me();
    if (!uid) return denied;
    const list = demoState().payments.filter((p) => (as === 'tenant' ? p.tenantId : p.landlordId) === uid);
    return {
      ok: true,
      data: list
        .map((p) => ({ ...p, tenantName: demoState().users.find((u) => u.id === p.tenantId)?.fullName }))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.kind === 'rent' ? 1 : 0) - (b.kind === 'rent' ? 1 : 0) || a.seq - b.seq),
    };
  },
  checkout(paymentId: string): PResult<CheckoutSession> {
    const r = startTx(paymentId, 'charge', me() ?? '');
    notifyChange();
    return r.ok ? { ok: true, data: { transactionId: r.data.providerRef, providerRef: r.data.providerRef, amountOmr: r.data.amountOmr, provider: 'mock_pay', mock: true } } : r;
  },
  complete(providerRef: string, outcome: 'succeeded' | 'failed'): PResult<string> {
    const tx = demoState().paymentTx.find((t) => t.providerRef === providerRef);
    if (!tx || tx.createdBy !== me() || tx.type !== 'charge') return denied;
    return { ok: true, data: applyEvent(`payment.${outcome}`, providerRef) };
  },
  refund(paymentId: string): PResult<string> {
    const r = startTx(paymentId, 'refund', me() ?? '');
    if (!r.ok) return r;
    return { ok: true, data: applyEvent('refund.succeeded', r.data.providerRef) };
  },
};
