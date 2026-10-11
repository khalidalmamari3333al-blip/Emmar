/**
 * أرقام الهواتف العُمانية: 8 أرقام بعد +968، والجوال يبدأ بـ 7 أو 9.
 * يقبل: 91234567، +968 9123 4567، 0096891234567، وبالأرقام العربية-الهندية.
 */
export function normalizeOmanMobile(input: string): string | null {
  const digits = input.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9+]/g, '');
  const local = digits.replace(/^(\+968|00968|968)/, '');
  return /^[79][0-9]{7}$/.test(local) ? `+968${local}` : null;
}

/** عرض مقروء: +968 9123 4567 */
export const formatOmanMobile = (e164: string) => e164.replace(/^\+968(\d{4})(\d{4})$/, '+968 $1 $2');
