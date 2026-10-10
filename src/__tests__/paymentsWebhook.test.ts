import type { SupabaseClient } from '@supabase/supabase-js';

import { handle, handleWebhook } from '../../supabase/functions/payments/handler';
import { safeEqual, signPayload, verifySignature } from '../../supabase/functions/payments/signing';

const SECRET = 'test-webhook-secret-123456';
const body = JSON.stringify({ id: 'evt_00000001', type: 'payment.succeeded', provider_ref: 'mock_abc', amount_omr: 45 });

describe('webhook signature (HMAC-SHA256)', () => {
  it('accepts a correctly signed, fresh event', async () => {
    const sig = await signPayload(SECRET, body, 1_000_000);
    expect(await verifySignature(SECRET, sig, body, 1_000_010)).toEqual({ ok: true });
  });

  it('rejects tampering, a wrong secret, replay of old events and malformed headers', async () => {
    const sig = await signPayload(SECRET, body, 1_000_000);
    expect(await verifySignature(SECRET, sig, body.replace('45', '4500'), 1_000_000)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifySignature('another-secret-0000000', sig, body, 1_000_000)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(await verifySignature(SECRET, sig, body, 1_000_000 + 301)).toEqual({ ok: false, reason: 'expired' });
    expect(await verifySignature(SECRET, null, body)).toEqual({ ok: false, reason: 'missing' });
    expect(await verifySignature(SECRET, 't=abc,v1=zz', body)).toEqual({ ok: false, reason: 'malformed' });
  });

  it('compares in constant time', () => {
    expect(safeEqual('abcd', 'abcd')).toBe(true);
    expect(safeEqual('abcd', 'abce')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('webhook handler', () => {
  const admin = (outcome: string) => ({ rpc: jest.fn(async () => ({ data: outcome, error: null })) }) as unknown as SupabaseClient & { rpc: jest.Mock };

  it('applies a valid event through record_payment_event exactly as sent', async () => {
    const db = admin('paid');
    const res = await handleWebhook(body, await signPayload(SECRET, body), { webhookSecret: SECRET }, db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'paid' });
    expect(db.rpc).toHaveBeenCalledWith('record_payment_event', expect.objectContaining({ p_event_id: 'evt_00000001', p_type: 'payment.succeeded', p_provider_ref: 'mock_abc', p_amount: 45, p_provider: 'mock_pay' }));
  });

  it('never touches the database for an unsigned or forged event', async () => {
    const db = admin('paid');
    expect((await handleWebhook(body, null, { webhookSecret: SECRET }, db)).status).toBe(401);
    expect((await handleWebhook(body, await signPayload('wrong-secret-000000000', body), { webhookSecret: SECRET }, db)).status).toBe(401);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('refuses to run without a strong webhook secret', async () => {
    const res = await handle(new Request('http://x', { method: 'POST', body: '{}' }), { url: 'http://x', anonKey: 'a', serviceKey: 's', webhookSecret: 'short' });
    expect(res.status).toBe(503);
  });
});
