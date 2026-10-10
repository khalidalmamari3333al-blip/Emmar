/**
 * ⚠️ التوثيق في وضع العرض: يعمل في ذاكرة المتصفح فقط، بنفس قواعد قاعدة البيانات
 * (src/services/verificationRules.ts). لا يرفع أي مستند لأي خادم، والسجل الحكومي تجريبي.
 */
import type { LandlordProfile, VResult } from '@/services/verification';
import { canApprove, evaluateRules } from '@/services/verificationRules';
import type { DeclaredData, Decision, DocType, QueueItem, RequestStatus, VerificationRequest, VerificationSubject } from '@/types/verification';

import { audit, DemoVerification, demoState, newId, notifyChange } from './store';

const ok = <T,>(data: T): VResult<T> => ({ ok: true, data });
const denied = { ok: false as const, code: 'not_allowed' as const };
const me = () => demoState().currentUserId;
const role = () => demoState().users.find((u) => u.id === me())?.role;
const isStaff = () => role() === 'admin' || role() === 'verifier';
const now = () => new Date().toISOString();

/** بصمة تجريبية (ليست SHA-256) — في القاعدة الحقيقية تُحسب SHA-256 على الخادم. */
const demoHash = (s: string) => {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').repeat(8);
};

const canRead = (v: DemoVerification) => v.submittedBy === me() || isStaff();
const editable = (v: DemoVerification) => v.submittedBy === me() && (v.status === 'draft' || v.status === 'needs_info');

function toRequest(v: DemoVerification): VerificationRequest {
  return {
    id: v.id, subject: v.subject, propertyId: v.propertyId, submittedBy: v.submittedBy, status: v.status,
    automatedStatus: v.automatedStatus, officialStatus: v.officialStatus, humanStatus: v.humanStatus, ...v.declared,
    identityLast4: v.identityLast4, submittedAt: v.submittedAt, decidedAt: v.decidedAt, createdAt: v.createdAt,
    documents: v.documents.map((d) => ({ ...d })), checks: v.checks.map((c) => ({ ...c })),
    decisions: [...v.decisions].reverse().map(({ decision, reason, createdAt }) => ({ decision, reason, createdAt })),
  };
}

function setSubjectStatus(v: DemoVerification, status: 'pending' | 'verified' | 'rejected', official = false) {
  const s = demoState();
  if (v.subject === 'property') {
    const p = s.properties.find((x) => x.id === v.propertyId);
    if (!p) return;
    if (status === 'pending' && p.verificationStatus === 'verified') return;
    p.verificationStatus = status;
    p.verifiedAt = status === 'verified' ? now() : undefined;
    p.verifiedScope = status === 'verified' ? (official ? 'official_registry' : 'documents_reviewed') : undefined;
  } else {
    let l = s.landlords.find((x) => x.userId === v.submittedBy);
    if (!l) s.landlords.push((l = { userId: v.submittedBy, accountType: 'individual', verificationStatus: 'unverified' }));
    l.verificationStatus = status;
  }
}

function runChecks(v: DemoVerification) {
  const s = demoState();
  const foreignHashes = new Set(s.verifications.filter((o) => o.id !== v.id).flatMap((o) => o.documents.filter((d) => d.uploadedBy !== v.submittedBy).map((d) => d.sha256)));
  if (v.subject === 'property') {
    const p = s.properties.find((x) => x.id === v.propertyId)!;
    const landlord = s.landlords.find((l) => l.userId === p.ownerId);
    const deed = v.declared.deedNumber?.toUpperCase();
    const others = s.verifications.filter((o) => o.id !== v.id && o.subject === 'property' && o.declared.deedNumber?.toUpperCase() === deed && (o.status === 'submitted' || o.status === 'approved'));
    const ownerOf = (o: DemoVerification) => s.properties.find((x) => x.id === o.propertyId)?.ownerId;
    const deedReuse = !deed ? undefined : others.some((o) => ownerOf(o) !== p.ownerId) ? 'other_landlord' : others.some((o) => o.propertyId !== v.propertyId) ? 'other_listing' : undefined;
    return evaluateRules({
      subject: 'property', docs: v.documents, foreignHashes, ...v.declared, listingCity: p.city,
      landlordName: landlord?.legalName ?? s.users.find((u) => u.id === p.ownerId)?.fullName, deedReuse,
    });
  }
  const l = s.landlords.find((x) => x.userId === v.submittedBy);
  return evaluateRules({
    subject: 'landlord', docs: v.documents, foreignHashes, accountType: l?.accountType, legalName: l?.legalName, companyCr: l?.companyCr,
    hasIdentity: !!v.identityHash,
    identityReused: !!v.identityHash && s.verifications.some((o) => o.id !== v.id && o.identityHash === v.identityHash && o.submittedBy !== v.submittedBy && (o.status === 'submitted' || o.status === 'approved')),
  });
}

export const demoVerification = {
  latest(subject: VerificationSubject, propertyId?: string): VResult<VerificationRequest | null> {
    const list = demoState().verifications.filter((v) => v.subject === subject && (propertyId ? v.propertyId === propertyId : v.submittedBy === me()) && canRead(v));
    const v = list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return ok(v ? toRequest(v) : null);
  },
  get(id: string): VResult<VerificationRequest | null> {
    const v = demoState().verifications.find((x) => x.id === id);
    return ok(v && canRead(v) ? toRequest(v) : null);
  },
  start(subject: VerificationSubject, propertyId?: string): VResult<string> {
    const s = demoState();
    if (!me()) return denied;
    if (subject === 'property' && s.properties.find((p) => p.id === propertyId)?.ownerId !== me()) return denied;
    const open = s.verifications.some((v) => v.subject === subject && (subject === 'property' ? v.propertyId === propertyId : v.submittedBy === me()) && ['draft', 'submitted', 'needs_info'].includes(v.status));
    if (open) return { ok: false, code: 'invalid' };
    const id = newId('ver');
    s.verifications.push({
      id, subject, propertyId, submittedBy: me()!, status: 'draft', automatedStatus: 'not_run', officialStatus: 'not_requested', humanStatus: 'pending',
      declared: {}, documents: [], checks: [], decisions: [], createdAt: now(),
    });
    notifyChange();
    return ok(id);
  },
  saveDeclared(id: string, d: DeclaredData): VResult {
    const v = demoState().verifications.find((x) => x.id === id);
    if (!v || !editable(v)) return denied;
    v.declared = { deedNumber: d.deedNumber?.trim().toUpperCase() || undefined, declaredOwnerName: d.declaredOwnerName?.trim() || undefined, plotNumber: d.plotNumber?.trim() || undefined, declaredCity: d.declaredCity };
    notifyChange();
    return ok(undefined);
  },
  setIdentity(id: string, value: string): VResult {
    const v = demoState().verifications.find((x) => x.id === id);
    if (!v || !editable(v)) return denied;
    const n = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    v.identityHash = demoHash(n);
    v.identityLast4 = n.slice(-4);
    notifyChange();
    return ok(undefined);
  },
  addDocument(id: string, docType: DocType, file: { uri: string; name?: string; mimeType?: string | null; size?: number | null }): VResult {
    const v = demoState().verifications.find((x) => x.id === id);
    if (!v || !editable(v)) return denied;
    v.documents.push({
      id: newId('doc'), docType, path: `${me()}/${id}/${docType}-${Date.now()}`, mimeType: (file.mimeType ?? '').toLowerCase(), sizeBytes: file.size ?? 1,
      sha256: demoHash(`${file.uri}|${file.name ?? ''}|${file.size ?? ''}`), uploadedBy: me()!, createdAt: now(),
    });
    // في العرض: رابط الملف المحلي نفسه يُستخدم للمعاينة
    demoUris.set(v.documents[v.documents.length - 1].path, file.uri);
    notifyChange();
    return ok(undefined);
  },
  removeDocument(docId: string): VResult {
    const v = demoState().verifications.find((x) => x.documents.some((d) => d.id === docId));
    if (!v || !editable(v)) return denied;
    v.documents = v.documents.filter((d) => d.id !== docId);
    notifyChange();
    return ok(undefined);
  },
  submit(id: string): VResult<VerificationRequest['automatedStatus']> {
    const v = demoState().verifications.find((x) => x.id === id);
    if (!v || !editable(v)) return denied;
    const r = runChecks(v);
    Object.assign(v, { checks: r.checks, automatedStatus: r.automated, officialStatus: r.official, status: 'submitted', humanStatus: 'pending', submittedAt: now() });
    setSubjectStatus(v, 'pending');
    audit('verification.submitted', 'verification', id, { subject: v.subject, automated: r.automated });
    notifyChange();
    return ok(r.automated);
  },
  documentUrl(path: string): VResult<string> {
    const v = demoState().verifications.find((x) => x.documents.some((d) => d.path === path));
    if (!v || !canRead(v)) return denied;
    const uri = demoUris.get(path);
    return uri ? ok(uri) : { ok: false, code: 'error', message: 'demo_document' };
  },
  landlord(): VResult<LandlordProfile | null> {
    const l = demoState().landlords.find((x) => x.userId === me());
    return ok(l ? { accountType: l.accountType, legalName: l.legalName ?? '', companyCr: l.companyCr ?? '', verificationStatus: l.verificationStatus } : null);
  },
  saveLandlord(p: Omit<LandlordProfile, 'verificationStatus'>): VResult {
    if (!me()) return denied;
    const s = demoState();
    let l = s.landlords.find((x) => x.userId === me());
    if (!l) s.landlords.push((l = { userId: me()!, accountType: 'individual', verificationStatus: 'unverified' }));
    Object.assign(l, { accountType: p.accountType, legalName: p.legalName.trim() || undefined, companyCr: p.accountType === 'company' ? p.companyCr.trim() : undefined });
    notifyChange();
    return ok(undefined);
  },
  queue(status: RequestStatus | null): VResult<QueueItem[]> {
    if (!isStaff()) return denied;
    const s = demoState();
    return ok(
      s.verifications
        .filter((v) => !status || v.status === status)
        .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt))
        .map((v) => {
          const p = s.properties.find((x) => x.id === v.propertyId);
          return {
            id: v.id, subject: v.subject, propertyId: v.propertyId, propertyTitle: p?.title, city: p?.city,
            submitterName: s.users.find((u) => u.id === v.submittedBy)?.fullName, status: v.status, automatedStatus: v.automatedStatus,
            officialStatus: v.officialStatus, humanStatus: v.humanStatus, submittedAt: v.submittedAt, documents: v.documents.length,
          };
        }),
    );
  },
  decide(id: string, decision: Decision, reason?: string): VResult {
    if (!isStaff()) return denied;
    const s = demoState();
    const v = s.verifications.find((x) => x.id === id);
    if (!v || v.status !== 'submitted') return { ok: false, code: 'invalid' };
    const subjectOwner = v.subject === 'property' ? s.properties.find((p) => p.id === v.propertyId)?.ownerId : v.submittedBy;
    if (subjectOwner === me() || v.submittedBy === me()) return denied;
    if (decision !== 'approved' && !reason?.trim()) return { ok: false, code: 'reason_required' };
    if (decision === 'approved') {
      if (!canApprove(v.checks, v.automatedStatus)) return { ok: false, code: 'checks_failed' };
      if (v.automatedStatus === 'warning' && !reason?.trim()) return { ok: false, code: 'reason_required' };
    }
    v.decisions.push({ decision, reason: reason?.trim() || undefined, createdAt: now(), decidedBy: me()! });
    v.humanStatus = decision;
    v.status = decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'needs_info';
    v.decidedAt = decision === 'needs_info' ? undefined : now();
    if (decision !== 'needs_info') setSubjectStatus(v, decision === 'approved' ? 'verified' : 'rejected', v.officialStatus === 'verified');
    audit(`verification.${decision}`, 'verification', id, { subject: v.subject, property: v.propertyId, reason });
    notifyChange();
    return ok(undefined);
  },
};

const demoUris = new Map<string, string>();
