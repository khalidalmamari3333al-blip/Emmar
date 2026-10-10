import type { City } from './property';

export type VerificationSubject = 'property' | 'landlord';
export type RequestStatus = 'draft' | 'submitted' | 'needs_info' | 'approved' | 'rejected' | 'cancelled';
export type AutomatedStatus = 'not_run' | 'passed' | 'warning' | 'failed';
export type OfficialStatus = 'not_requested' | 'verified' | 'not_found' | 'mismatch' | 'unavailable';
export type HumanStatus = 'pending' | 'approved' | 'rejected' | 'needs_info';
export type Decision = 'approved' | 'rejected' | 'needs_info';
export type CheckResult = 'pass' | 'warn' | 'fail' | 'unavailable';
export type DocType = 'title_deed' | 'id_card' | 'cr_certificate' | 'authorization' | 'utility_bill' | 'other';
/** حالة التوثيق المعروضة على العقار نفسه */
export type ListingVerification = 'unverified' | 'pending' | 'verified' | 'rejected';
export type VerifiedScope = 'documents_reviewed' | 'official_registry';

export const DOC_TYPES: Record<VerificationSubject, DocType[]> = {
  property: ['title_deed', 'authorization', 'utility_bill', 'other'],
  landlord: ['id_card', 'cr_certificate', 'authorization', 'other'],
};
export const DOC_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

export interface VerificationDocument {
  id: string;
  docType: DocType;
  path: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  uploadedBy: string;
  createdAt: string;
}

export interface VerificationCheck {
  code: string;
  source: 'automated' | 'official' | 'ai';
  result: CheckResult;
  required: boolean;
  details: Record<string, unknown>;
  provider?: string;
  isMock: boolean;
}

export interface VerificationDecision {
  decision: Decision;
  reason?: string;
  createdAt: string;
}

export interface DeclaredData {
  deedNumber?: string;
  declaredOwnerName?: string;
  plotNumber?: string;
  declaredCity?: City;
}

export interface VerificationRequest extends DeclaredData {
  id: string;
  subject: VerificationSubject;
  propertyId?: string;
  submittedBy: string;
  status: RequestStatus;
  automatedStatus: AutomatedStatus;
  officialStatus: OfficialStatus;
  humanStatus: HumanStatus;
  identityLast4?: string;
  submittedAt?: string;
  decidedAt?: string;
  createdAt: string;
  documents: VerificationDocument[];
  /** نتائج آخر تشغيل للفحوص فقط */
  checks: VerificationCheck[];
  decisions: VerificationDecision[];
}

export interface QueueItem {
  id: string;
  subject: VerificationSubject;
  propertyId?: string;
  propertyTitle?: { ar: string; en: string };
  city?: City;
  submitterName?: string;
  status: RequestStatus;
  automatedStatus: AutomatedStatus;
  officialStatus: OfficialStatus;
  humanStatus: HumanStatus;
  submittedAt?: string;
  documents: number;
}
