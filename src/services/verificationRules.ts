/**
 * محرك قواعد التوثيق بصيغة TypeScript — نسخة مطابقة لـ public.run_verification_checks
 * (supabase/migrations/20261210000001_verification.sql). المرجع الملزم هو قاعدة البيانات؛
 * هذه النسخة تُستخدم في وضع العرض واختبارات الوحدة فقط.
 */
import type { City } from '@/types/property';
import type { AutomatedStatus, CheckResult, OfficialStatus, VerificationCheck, VerificationSubject } from '@/types/verification';

export interface RulePolicy {
  code: string;
  subject: VerificationSubject;
  required: boolean;
}

export const DEFAULT_POLICIES: RulePolicy[] = [
  { code: 'doc_title_deed', subject: 'property', required: true },
  { code: 'doc_formats', subject: 'property', required: true },
  { code: 'deed_number_format', subject: 'property', required: true },
  { code: 'city_match', subject: 'property', required: true },
  { code: 'name_match', subject: 'property', required: true },
  { code: 'duplicate_deed', subject: 'property', required: true },
  { code: 'duplicate_file', subject: 'property', required: true },
  { code: 'official_registry', subject: 'property', required: false },
  { code: 'doc_identity', subject: 'landlord', required: true },
  { code: 'doc_formats_l', subject: 'landlord', required: true },
  { code: 'identity_number', subject: 'landlord', required: true },
  { code: 'legal_name', subject: 'landlord', required: true },
  { code: 'duplicate_identity', subject: 'landlord', required: true },
  { code: 'duplicate_file_l', subject: 'landlord', required: true },
];

export interface RegistryRecord {
  deedNumber: string;
  ownerName: string;
  city: City;
}

/** ⚠️ سجل حكومي تجريبي — ليس من أي جهة رسمية. */
export const MOCK_GOV_REGISTRY: RegistryRecord[] = [
  { deedNumber: 'TEST-OK-1001', ownerName: 'خالد المعمري', city: 'sohar' },
  { deedNumber: 'TEST-OK-1002', ownerName: 'خالد المعمري', city: 'muscat' },
  { deedNumber: 'TEST-OK-2001', ownerName: 'Owner Test', city: 'muscat' },
];

export interface RuleInput {
  subject: VerificationSubject;
  docs: { docType: string; sha256: string }[];
  /** بصمات مستندات رفعها مستخدمون آخرون */
  foreignHashes: Set<string>;
  // عقار
  deedNumber?: string;
  declaredOwnerName?: string;
  declaredCity?: City;
  listingCity?: City;
  landlordName?: string;
  /** "other_landlord" إن استُخدم السند لدى مؤجر آخر، "other_listing" لعقار آخر للمؤجر نفسه */
  deedReuse?: 'other_landlord' | 'other_listing';
  // مؤجر
  accountType?: 'individual' | 'company';
  legalName?: string;
  companyCr?: string;
  hasIdentity?: boolean;
  identityReused?: boolean;
  govProvider?: 'mock' | 'disabled';
  registry?: RegistryRecord[];
}

export const normalizeName = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[\sً-ٰٟـ]/g, '');

export function evaluateRules(i: RuleInput, policies: RulePolicy[] = DEFAULT_POLICIES): {
  checks: VerificationCheck[];
  automated: AutomatedStatus;
  official: OfficialStatus;
} {
  const has = (t: string) => i.docs.some((d) => d.docType === t);
  const reused = i.docs.some((d) => i.foreignHashes.has(d.sha256));
  let official: OfficialStatus = 'not_requested';
  const checks: VerificationCheck[] = [];

  for (const pol of policies.filter((p) => p.subject === i.subject)) {
    let result: CheckResult = 'pass';
    let details: Record<string, unknown> = {};
    let source: VerificationCheck['source'] = 'automated';
    switch (pol.code) {
      case 'doc_title_deed':
        if (!has('title_deed')) result = 'fail';
        break;
      case 'doc_formats':
      case 'doc_formats_l':
        if (!i.docs.length) result = 'fail';
        break;
      case 'deed_number_format':
        if (!/^[A-Za-z0-9][A-Za-z0-9/-]{3,39}$/.test(i.deedNumber ?? '')) result = 'fail';
        break;
      case 'city_match':
        if (i.declaredCity !== i.listingCity) { result = 'fail'; details = { declared: i.declaredCity, listing: i.listingCity }; }
        break;
      case 'name_match':
        if (!normalizeName(i.declaredOwnerName)) { result = 'fail'; details = { reason: 'missing_name' }; }
        else if (normalizeName(i.declaredOwnerName) !== normalizeName(i.landlordName)) {
          if (has('authorization')) { result = 'warn'; details = { reason: 'different_owner_with_authorization' }; }
          else { result = 'fail'; details = { reason: 'different_owner' }; }
        }
        break;
      case 'duplicate_deed':
        if (i.deedReuse === 'other_landlord') { result = 'fail'; details = { reason: 'deed_used_by_other_landlord' }; }
        else if (i.deedReuse === 'other_listing') { result = 'warn'; details = { reason: 'deed_used_on_another_listing' }; }
        break;
      case 'duplicate_file':
      case 'duplicate_file_l':
        if (reused) result = 'fail';
        break;
      case 'official_registry': {
        source = 'official';
        if ((i.govProvider ?? 'mock') !== 'mock') { official = 'unavailable'; result = 'unavailable'; }
        else {
          const rec = (i.registry ?? MOCK_GOV_REGISTRY).find((r) => r.deedNumber === (i.deedNumber ?? '').toUpperCase());
          if (!rec) { official = 'not_found'; result = 'fail'; }
          else if (normalizeName(rec.ownerName) === normalizeName(i.declaredOwnerName) && rec.city === i.declaredCity) official = 'verified';
          else { official = 'mismatch'; result = 'fail'; }
        }
        details = { status: official };
        break;
      }
      case 'doc_identity':
        if (!has(i.accountType === 'company' ? 'cr_certificate' : 'id_card')) result = 'fail';
        break;
      case 'identity_number':
        if (i.accountType === 'company' ? !i.companyCr : !i.hasIdentity) result = 'fail';
        break;
      case 'legal_name':
        if (!i.legalName?.trim()) result = 'fail';
        break;
      case 'duplicate_identity':
        if (i.identityReused) result = 'fail';
        break;
      default:
        result = 'unavailable';
    }
    checks.push({
      code: pol.code, source, result, required: pol.required, details,
      provider: source === 'official' ? 'mock_gov' : 'rules_v1', isMock: source === 'official',
    });
  }

  const auto = checks.filter((c) => c.source === 'automated');
  const automated: AutomatedStatus = auto.some((c) => c.result === 'fail' && c.required)
    ? 'failed'
    : auto.some((c) => c.result === 'warn' || c.result === 'fail')
      ? 'warning'
      : 'passed';
  return { checks, automated, official };
}

/** هل تسمح الفحوص بالموافقة؟ (نفس شرط decide_verification) */
export function canApprove(checks: VerificationCheck[], automated: AutomatedStatus): boolean {
  return automated !== 'failed' && automated !== 'not_run' && !checks.some((c) => c.required && (c.result === 'fail' || c.result === 'unavailable'));
}
