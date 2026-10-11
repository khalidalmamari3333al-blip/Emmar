import type { LocalizedText } from '@/i18n/types';

export type PaymentKind = 'rent' | 'deposit' | 'fee';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refund_pending' | 'refunded' | 'cancelled';

export interface Payment {
  id: string;
  contractId: string;
  propertyId: string;
  propertyTitle?: LocalizedText;
  tenantId: string;
  landlordId: string;
  tenantName?: string;
  kind: PaymentKind;
  seq: number;
  dueDate: string;
  amountOmr: number;
  status: PaymentStatus;
  paidAt?: string;
  receiptNo?: string;
  refundedAt?: string;
  /** مرجع آخر معاملة ناجحة لدى المزود (للإيصال) */
  providerRef?: string;
  isMock: boolean;
}

export interface CheckoutSession {
  transactionId: string;
  providerRef: string;
  amountOmr: number;
  provider: string;
  mock: boolean;
}
