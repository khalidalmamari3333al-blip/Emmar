/**
 * نص العقد وبصمته. المرجع الملزم هو قاعدة البيانات (render_contract / contract_body_sha في
 * supabase/migrations/20261220000001_contracts.sql). هنا:
 *  - canonicalText: نفس الصيغة التي تُحسب عليها البصمة في الخادم — يستخدمها التطبيق ليتحقق
 *    بنفسه أن النص المعروض هو نفسه الذي سيوقّع عليه.
 *  - renderStudentContract: نسخة من القالب لوضع العرض فقط.
 */
import { sha256Hex } from '@/services/verification';

export const canonicalText = (ar: string, en: string) => `${ar}\n\n---\n\n${en}`;

export async function contractSha256(ar: string, en: string): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalText(ar, en));
  return sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

const TEMPLATE_AR = `تنبيه: هذا نموذج تجريبي وليس صيغة قانونية معتمدة.

الطرف الأول (المؤجر): {{landlord_name}}
الطرف الثاني (المستأجر): {{tenant_name}}

العقار: {{property_title_ar}} — {{city_ar}}، {{district_ar}}
السرير: {{bed_label}}
مدة السكن: من {{start_date}} إلى {{end_date}} ({{months}} شهر)
الإيجار الشهري: {{monthly_price}} ر.ع
مبلغ التأمين: {{deposit}} ر.ع
سياسة الإلغاء: {{cancellation_ar}}

الشروط:
{{rules_ar}}

مرجع الحجز: {{booking_id}}`;

const TEMPLATE_EN = `Notice: this is a sample template, not an approved legal form.

First party (landlord): {{landlord_name}}
Second party (tenant): {{tenant_name}}

Property: {{property_title_en}} — {{city_en}}, {{district_en}}
Bed: {{bed_label}}
Term: from {{start_date}} to {{end_date}} ({{months}} months)
Monthly rent: {{monthly_price}} OMR
Security deposit: {{deposit}} OMR
Cancellation policy: {{cancellation_en}}

Terms:
{{rules_en}}

Booking reference: {{booking_id}}`;

export interface ContractFacts {
  landlordName: string;
  tenantName: string;
  titleAr: string;
  titleEn: string;
  city: 'sohar' | 'muscat';
  districtAr: string;
  districtEn: string;
  bedLabel: string;
  startDate: string;
  endDate: string;
  monthlyPrice: number;
  deposit?: number;
  cancellation: string;
  rulesAr?: string;
  rulesEn?: string;
  bookingId: string;
}

export function monthsBetween(start: string, end: string): number {
  const [y1, m1, d1] = start.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

const POLICY_AR: Record<string, string> = { flexible: 'مرنة', moderate: 'متوسطة', strict: 'صارمة' };
const POLICY_EN: Record<string, string> = { flexible: 'Flexible', moderate: 'Moderate', strict: 'Strict' };

const amount = (n: number) => String(Number(n.toFixed(3)));

export function renderStudentContract(f: ContractFacts): { bodyAr: string; bodyEn: string } {
  const vars: Record<string, string> = {
    landlord_name: f.landlordName, tenant_name: f.tenantName, property_title_ar: f.titleAr, property_title_en: f.titleEn,
    city_ar: f.city === 'sohar' ? 'صحار' : 'مسقط', city_en: f.city === 'sohar' ? 'Sohar' : 'Muscat',
    district_ar: f.districtAr, district_en: f.districtEn, bed_label: f.bedLabel, start_date: f.startDate, end_date: f.endDate,
    months: String(monthsBetween(f.startDate, f.endDate)), monthly_price: amount(f.monthlyPrice), deposit: amount(f.deposit ?? 0),
    cancellation_ar: POLICY_AR[f.cancellation] ?? POLICY_AR.moderate, cancellation_en: POLICY_EN[f.cancellation] ?? POLICY_EN.moderate, rules_ar: f.rulesAr?.trim() || '—', rules_en: f.rulesEn?.trim() || '—', booking_id: f.bookingId,
  };
  const fill = (tpl: string) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');
  return { bodyAr: fill(TEMPLATE_AR), bodyEn: fill(TEMPLATE_EN) };
}
