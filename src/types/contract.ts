import type { LocalizedText } from '@/i18n/types';

export type ContractStatus = 'pending_tenant' | 'pending_landlord' | 'completed' | 'cancelled';
export type SignerRole = 'tenant' | 'landlord';

export interface ContractVersion {
  versionNo: number;
  bodyAr: string;
  bodyEn: string;
  sha256: string;
  note?: string;
  createdAt: string;
}

export interface ContractSignature {
  versionNo: number;
  signerId: string;
  role: SignerRole;
  provider: string;
  isMock: boolean;
  signedSha256: string;
  signedAt: string;
}

export interface ContractSummary {
  id: string;
  bookingId: string;
  propertyId: string;
  propertyTitle?: LocalizedText;
  landlordId: string;
  tenantId: string;
  status: ContractStatus;
  currentVersion: number;
  finalSha256?: string;
  completedAt?: string;
  cancelledReason?: string;
  createdAt: string;
}

export interface Contract extends ContractSummary {
  versions: ContractVersion[];
  signatures: ContractSignature[];
}
