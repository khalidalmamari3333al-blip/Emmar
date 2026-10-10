import { demoOwner } from '@/demo/services';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { demoVerification } from '@/demo/verification';
import { emptyPropertyInput } from '@/services/owner';
import { mapRequestRow, RequestRow, validateDocument } from '@/services/verification';
import { canApprove, evaluateRules, RuleInput } from '@/services/verificationRules';

const base: RuleInput = {
  subject: 'property',
  docs: [{ docType: 'title_deed', sha256: 'a'.repeat(64) }],
  foreignHashes: new Set(),
  deedNumber: 'TEST-OK-1001',
  declaredOwnerName: 'خالد  المعمري',
  declaredCity: 'sohar',
  listingCity: 'sohar',
  landlordName: 'خالد المعمري',
};
const failed = (r: ReturnType<typeof evaluateRules>) => r.checks.filter((c) => c.result === 'fail').map((c) => c.code).sort();

describe('verification rules (mirror of run_verification_checks)', () => {
  it('passes a consistent request and marks the official result as mock', () => {
    const r = evaluateRules(base);
    expect(r.automated).toBe('passed');
    expect(r.official).toBe('verified');
    expect(r.checks.find((c) => c.code === 'official_registry')).toMatchObject({ source: 'official', isMock: true, provider: 'mock_gov' });
    expect(canApprove(r.checks, r.automated)).toBe(true);
  });

  it('fails on a reused deed, reused file, other owner and wrong city — and blocks approval', () => {
    const r = evaluateRules({ ...base, deedReuse: 'other_landlord', foreignHashes: new Set(['a'.repeat(64)]), landlordName: 'شخص آخر', declaredCity: 'muscat' });
    expect(r.automated).toBe('failed');
    expect(failed(r)).toEqual(['city_match', 'duplicate_deed', 'duplicate_file', 'name_match', 'official_registry']);
    expect(canApprove(r.checks, r.automated)).toBe(false);
  });

  it('turns a different owner into a warning when an authorization is attached', () => {
    const r = evaluateRules({ ...base, landlordName: 'وكيل عقاري', docs: [...base.docs, { docType: 'authorization', sha256: 'b'.repeat(64) }] });
    expect(r.automated).toBe('warning');
    expect(r.checks.find((c) => c.code === 'name_match')?.result).toBe('warn');
    expect(canApprove(r.checks, r.automated)).toBe(true);
  });

  it('reports the mock registry honestly: not found, mismatch, or unavailable', () => {
    expect(evaluateRules({ ...base, deedNumber: 'REAL-12345' }).official).toBe('not_found');
    expect(evaluateRules({ ...base, declaredCity: 'muscat', listingCity: 'muscat' }).official).toBe('mismatch');
    expect(evaluateRules({ ...base, govProvider: 'disabled' }).official).toBe('unavailable');
    // الفحص الرسمي اختياري افتراضيًا: لا يمنع الموافقة
    expect(evaluateRules({ ...base, deedNumber: 'REAL-12345' }).automated).toBe('passed');
  });

  it('checks landlord identity, documents and reuse', () => {
    const empty = evaluateRules({ subject: 'landlord', docs: [], foreignHashes: new Set() });
    expect(failed(empty)).toEqual(['doc_formats_l', 'doc_identity', 'identity_number', 'legal_name']);
    const ok = evaluateRules({ subject: 'landlord', docs: [{ docType: 'id_card', sha256: 'c'.repeat(64) }], foreignHashes: new Set(), legalName: 'خالد', hasIdentity: true });
    expect(ok.automated).toBe('passed');
    const company = evaluateRules({ subject: 'landlord', accountType: 'company', docs: [{ docType: 'id_card', sha256: 'c'.repeat(64) }], foreignHashes: new Set(), legalName: 'شركة' });
    expect(failed(company)).toEqual(['doc_identity', 'identity_number']);
    expect(failed(evaluateRules({ subject: 'landlord', docs: [{ docType: 'id_card', sha256: 'c'.repeat(64) }], foreignHashes: new Set(), legalName: 'x', hasIdentity: true, identityReused: true }))).toEqual(['duplicate_identity']);
  });
});

describe('documents and mapping', () => {
  it('accepts PDF/JPG/PNG up to 10 MB only', () => {
    expect(validateDocument({ uri: 'x', mimeType: 'application/pdf', size: 1000 })).toBeNull();
    expect(validateDocument({ uri: 'x', mimeType: 'application/zip' })).toBe('bad_type');
    expect(validateDocument({ uri: 'x', mimeType: 'image/png', size: 11 * 1024 * 1024 })).toBe('too_large');
  });

  it('shows only the latest run of checks and newest decision first', () => {
    const row = {
      id: 'r', subject: 'property', property_id: 'p', submitted_by: 'u', status: 'needs_info', automated_status: 'passed', official_status: 'verified', human_status: 'needs_info',
      deed_number: 'TEST-OK-1', declared_owner_name: null, plot_number: null, declared_city: 'sohar', identity_last4: null, run_no: 2,
      submitted_at: null, decided_at: null, created_at: '2026-01-01',
      verification_checks: [
        { id: 1, run_no: 1, code: 'doc_title_deed', source: 'automated', result: 'fail', required: true, details: null, provider: 'rules_v1', is_mock: false },
        { id: 2, run_no: 2, code: 'doc_title_deed', source: 'automated', result: 'pass', required: true, details: null, provider: 'rules_v1', is_mock: false },
      ],
      verification_decisions: [
        { decision: 'needs_info', reason: 'أولى', created_at: '2026-01-01' },
        { decision: 'needs_info', reason: 'ثانية', created_at: '2026-01-02' },
      ],
    } as RequestRow;
    const r = mapRequestRow(row);
    expect(r.checks).toEqual([expect.objectContaining({ code: 'doc_title_deed', result: 'pass' })]);
    expect(r.decisions[0].reason).toBe('ثانية');
  });
});

describe('demo verification flow follows the database rules', () => {
  beforeEach(() => resetDemo());
  const input = {
    ...emptyPropertyInput(), titleAr: 'شقة للتوثيق', titleEn: 'Flat to verify', districtAr: 'الطريف', districtEn: 'Al Tareef', price: '200', city: 'sohar' as const,
  };

  it('blocks publishing until a verifier approves, then drops verification after a substantive edit', () => {
    setCurrentUser(DEMO_USERS.owner);
    expect(demoOwner.create(DEMO_USERS.owner, { ...input, status: 'published' }, Number)).toMatchObject({ ok: false, code: 'needs_verification' });
    const created = demoOwner.create(DEMO_USERS.owner, input, Number);
    if (!created.ok) throw new Error('create failed');
    const pid = created.data;
    expect(demoOwner.setStatus(pid, 'published')).toMatchObject({ ok: false, code: 'needs_verification' });

    const req = demoVerification.start('property', pid);
    if (!req.ok) throw new Error('start failed');
    expect(demoVerification.start('property', pid)).toMatchObject({ ok: false }); // طلب مفتوح واحد فقط
    demoVerification.saveDeclared(req.data, { deedNumber: 'test-ok-1001', declaredOwnerName: 'خالد المعمري', declaredCity: 'sohar' });
    demoVerification.addDocument(req.data, 'title_deed', { uri: 'file:///deed.pdf', name: 'deed.pdf', mimeType: 'application/pdf', size: 1000 });
    // نفس السند مستخدم في طلب معلّق لعقار آخر للمالك نفسه ← تنبيه لا فشل
    expect(demoVerification.submit(req.data)).toEqual({ ok: true, data: 'warning' });
    expect(demoVerification.decide(req.data, 'approved')).toMatchObject({ ok: false, code: 'not_allowed' }); // المالك ليس موظف تحقق

    setCurrentUser(DEMO_USERS.verifier);
    const q = demoVerification.queue('submitted');
    expect(q.ok && q.data.map((x) => x.id)).toContain(req.data);
    expect(demoVerification.decide(req.data, 'rejected')).toMatchObject({ ok: false, code: 'reason_required' });
    expect(demoVerification.decide(req.data, 'approved')).toMatchObject({ ok: false, code: 'reason_required' });
    expect(demoVerification.decide(req.data, 'approved', 'نفس المبنى — سند واحد لوحدتين').ok).toBe(true);
    const p = () => demoState().properties.find((x) => x.id === pid)!;
    expect(p()).toMatchObject({ verificationStatus: 'verified', verifiedScope: 'official_registry' });

    setCurrentUser(DEMO_USERS.owner);
    expect(demoOwner.setStatus(pid, 'published').ok).toBe(true);
    expect(demoOwner.update(pid, { ...input, price: '210', status: 'published' }, Number).ok).toBe(true);
    expect(p()).toMatchObject({ status: 'published', verificationStatus: 'verified' });
    demoOwner.update(pid, { ...input, districtAr: 'فلج القبائل', districtEn: 'Falaj', status: 'published' }, Number);
    expect(p()).toMatchObject({ status: 'draft', verificationStatus: 'unverified' });
  });

  it('rejects a deed already used by another landlord and refuses approval', () => {
    setCurrentUser(DEMO_USERS.tenant);
    demoState().users.find((u) => u.id === DEMO_USERS.tenant)!.role = 'owner';
    const created = demoOwner.create(DEMO_USERS.tenant, input, Number);
    if (!created.ok) throw new Error('create failed');
    const req = demoVerification.start('property', created.data);
    if (!req.ok) throw new Error('start failed');
    // نفس سند الطلب المعلّق للمالك التجريبي
    demoVerification.saveDeclared(req.data, { deedNumber: 'TEST-OK-1001', declaredOwnerName: 'سالم البلوشي', declaredCity: 'sohar' });
    demoVerification.addDocument(req.data, 'title_deed', { uri: 'file:///copy.pdf', mimeType: 'application/pdf', size: 10 });
    expect(demoVerification.submit(req.data)).toEqual({ ok: true, data: 'failed' });
    setCurrentUser(DEMO_USERS.verifier);
    expect(demoVerification.decide(req.data, 'approved', 'ok')).toMatchObject({ ok: false, code: 'checks_failed' });
    const r = demoVerification.get(req.data);
    expect(r.ok && r.data?.checks.filter((c) => c.result === 'fail').map((c) => c.code)).toEqual(['duplicate_deed', 'official_registry']);
  });

  it('keeps documents private and the queue staff-only; stores only the last 4 identity digits', () => {
    setCurrentUser(DEMO_USERS.tenant);
    expect(demoVerification.get('seed-ver-1')).toEqual({ ok: true, data: null });
    expect(demoVerification.queue('submitted')).toMatchObject({ ok: false, code: 'not_allowed' });
    const l = demoVerification.start('landlord');
    if (!l.ok) throw new Error('start failed');
    demoVerification.setIdentity(l.data, '12345678');
    const v = demoState().verifications.find((x) => x.id === l.data)!;
    expect(v.identityLast4).toBe('5678');
    expect(JSON.stringify(v)).not.toContain('12345678');
  });
});
