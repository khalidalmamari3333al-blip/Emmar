/**
 * المدفوعات. العميل لا يكتب أي حالة دفع: يبدأ المعاملة عبر دالة payments، و"مدفوع" يصل فقط
 * بعد حدث موقّع من المزود. ⚠️ المزود الحالي تجريبي — لا أموال حقيقية، ولا بيانات بطاقات.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { ensureDemoContracts } from '@/demo/contracts';
import { demoPayments } from '@/demo/payments';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type { CheckoutSession, Payment, PaymentKind, PaymentStatus } from '@/types/payment';

const demo = () => readConfig().useMockData;

export type PaymentError = 'not_configured' | 'not_allowed' | 'invalid_state' | 'provider_not_configured' | 'error';
export type PResult<T = void> = { ok: true; data: T } | { ok: false; code: PaymentError; message?: string };

async function guard<T>(fn: (sb: SupabaseClient) => Promise<PResult<T>>): Promise<PResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

async function invoke<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<PResult<T>> {
  const { data, error } = await sb.functions.invoke('payments', { body });
  if (!error) return { ok: true, data: data as T };
  const ctx = (error as { context?: Response }).context;
  const payload = ctx && typeof ctx.status === 'number' ? await ctx.json().catch(() => ({})) : {};
  const code = (payload as { error?: string }).error;
  return {
    ok: false,
    code: code === 'not_allowed' ? 'not_allowed' : code === 'invalid_state' ? 'invalid_state' : code === 'provider_not_configured' ? 'provider_not_configured' : 'error',
    message: (payload as { message?: string }).message ?? error.message,
  };
}

export interface PaymentRow {
  id: string;
  contract_id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  kind: PaymentKind;
  seq: number;
  due_date: string;
  amount_omr: number | string;
  status: PaymentStatus;
  paid_at: string | null;
  receipt_no: string | null;
  refunded_at: string | null;
  properties?: { title_ar: string; title_en: string } | null;
  payment_transactions?: { provider_ref: string; status: string; type: string; is_mock: boolean }[];
}

export function mapPaymentRow(r: PaymentRow): Payment {
  const ok = (r.payment_transactions ?? []).find((t) => t.type === 'charge' && t.status === 'succeeded');
  return {
    id: r.id, contractId: r.contract_id, propertyId: r.property_id, tenantId: r.tenant_id, landlordId: r.landlord_id, kind: r.kind, seq: r.seq,
    dueDate: r.due_date, amountOmr: Number(r.amount_omr), status: r.status, paidAt: r.paid_at ?? undefined, receiptNo: r.receipt_no ?? undefined,
    refundedAt: r.refunded_at ?? undefined, providerRef: ok?.provider_ref, isMock: ok ? ok.is_mock : true,
    propertyTitle: r.properties ? { ar: r.properties.title_ar, en: r.properties.title_en } : undefined,
  };
}

const SELECT = '*,properties(title_ar,title_en),payment_transactions(provider_ref,status,type,is_mock)';
const ORDER = (a: Payment, b: Payment) => a.dueDate.localeCompare(b.dueDate) || (a.kind === 'rent' ? 1 : 0) - (b.kind === 'rent' ? 1 : 0) || a.seq - b.seq;

/** دفعاتي كمستأجر (أو كل دفعات عقاراتي كمالك عند as='landlord'). */
export function listPayments(as: 'tenant' | 'landlord'): Promise<PResult<Payment[]>> {
  if (demo()) return ensureDemoContracts().then(() => demoPayments.list(as));
  return guard(async (sb) => {
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return { ok: false, code: 'not_allowed' };
    const { data, error } = await sb.from('payments').select(SELECT).eq(as === 'tenant' ? 'tenant_id' : 'landlord_id', uid).order('due_date');
    if (error) return { ok: false, code: error.code === '42501' ? 'not_allowed' : 'error', message: error.message };
    return { ok: true, data: ((data ?? []) as unknown as PaymentRow[]).map(mapPaymentRow).sort(ORDER) };
  });
}

/** يبدأ الدفع لدى المزود. المبلغ يحدده الخادم من الجدول، لا العميل. */
export function startCheckout(paymentId: string): Promise<PResult<CheckoutSession>> {
  if (demo()) return Promise.resolve(demoPayments.checkout(paymentId));
  return guard((sb) => invoke<CheckoutSession>(sb, { action: 'checkout', paymentId }));
}

/** ⚠️ مزود تجريبي فقط: يحاكي نتيجة الدفع لدى المزود (يرسل حدثًا موقّعًا من الخادم). */
export function completeMockCheckout(providerRef: string, outcome: 'succeeded' | 'failed'): Promise<PResult<string>> {
  if (demo()) return Promise.resolve(demoPayments.complete(providerRef, outcome));
  return guard(async (sb) => {
    const r = await invoke<{ outcome: string }>(sb, { action: 'mock_complete', providerRef, outcome });
    return r.ok ? { ok: true, data: r.data.outcome } : r;
  });
}

export function refundDeposit(paymentId: string): Promise<PResult<string>> {
  if (demo()) return Promise.resolve(demoPayments.refund(paymentId));
  return guard(async (sb) => {
    const r = await invoke<{ outcome: string }>(sb, { action: 'refund', paymentId });
    return r.ok ? { ok: true, data: r.data.outcome } : r;
  });
}

export const isPayable = (p: Payment) => p.status === 'pending' || p.status === 'failed';
export const isOverdue = (p: Payment, today = new Date().toISOString().slice(0, 10)) => isPayable(p) && p.dueDate < today;

export interface LandlordReport {
  collected: number;
  outstanding: number;
  overdue: number;
  depositsHeld: number;
  refunded: number;
}

export function landlordReport(list: Payment[], today?: string): LandlordReport {
  const sum = (f: (p: Payment) => boolean) => Number(list.filter(f).reduce((s, p) => s + p.amountOmr, 0).toFixed(3));
  return {
    collected: sum((p) => p.status === 'paid' && p.kind !== 'deposit'),
    outstanding: sum(isPayable),
    overdue: sum((p) => isOverdue(p, today)),
    depositsHeld: sum((p) => p.kind === 'deposit' && (p.status === 'paid' || p.status === 'refund_pending')),
    refunded: sum((p) => p.status === 'refunded'),
  };
}
