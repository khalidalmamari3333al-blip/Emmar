import type { LocalizedText } from '@/i18n/types';

export const MAINTENANCE_CATEGORIES = ['plumbing', 'electrical', 'ac', 'appliance', 'furniture', 'cleaning', 'internet', 'other'] as const;
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORIES)[number];
export type MaintenancePriority = 'low' | 'normal' | 'urgent';
export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';

export interface MaintenanceRequest {
  id: string;
  bookingId: string;
  propertyId: string;
  propertyTitle?: LocalizedText;
  tenantId: string;
  landlordId: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
  description?: string;
  status: MaintenanceStatus;
  landlordNote?: string;
  resolvedAt?: string;
  createdAt: string;
}

export const REPORT_REASONS = ['fake_listing', 'wrong_info', 'fraud', 'unavailable', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface PropertyReport {
  id: string;
  propertyId: string;
  propertyTitle?: LocalizedText;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  adminNote?: string;
  createdAt: string;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment?: string;
  reviewer: string;
  stayEnd: string;
  landlordReply?: string;
  createdAt: string;
}

/** الانتقالات المسموحة (نفس update_maintenance في قاعدة البيانات) */
export function allowedTransitions(status: MaintenanceStatus, role: 'tenant' | 'landlord'): MaintenanceStatus[] {
  if (role === 'landlord') return status === 'open' ? ['in_progress', 'resolved'] : status === 'in_progress' ? ['resolved'] : [];
  return status === 'open' ? ['cancelled'] : status === 'resolved' ? ['closed', 'open'] : [];
}

/** هل انتهت الإقامة بما يسمح بالتقييم؟ (نفس check_review_eligibility) */
export const canReviewStay = (b: { status: string; end: string }, today = new Date().toISOString().slice(0, 10)) => b.status === 'confirmed' && b.end <= today;

export const averageRating = (list: { rating: number }[]) => (list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : null);
