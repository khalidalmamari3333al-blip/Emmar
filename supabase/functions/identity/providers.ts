// مزودو التحقق من الهوية.
//
// «ثقة» (THEQA) — الهوية الرقمية الوطنية في سلطنة عُمان (وزارة النقل والاتصالات وتقنية المعلومات).
// ⚠️ غير متصل بعد: تفاصيل الربط (نقاط النهاية، البروتوكول، الشهادات، معرّف العميل) تُمنح فقط
//    بعد اعتماد المنصة لدى فريق الثقة الرقمية في الوزارة. لا نخمّنها هنا.
//    عند الاعتماد: نفّذ TheqaProvider (startUrl + handleCallback) ثم اضبط IDENTITY_PROVIDER=theqa.
//
// المزود التجريبي (mock): يقبل اسمًا ورقمًا مدنيًا بصيغة صحيحة دون أي تحقق حقيقي — للعرض والاختبار فقط،
// ولا يعمل إلا إذا ضُبط IDENTITY_MODE=mock صراحةً.

export interface VerifiedIdentity {
  fullName: string;
  nationalId: string;
  providerRef: string;
  level: 'basic' | 'high';
}

export interface IdentityProvider {
  readonly id: 'theqa' | 'mock_theqa';
  readonly isMock: boolean;
  /** هل الإعدادات اللازمة موجودة؟ */
  configured(): boolean;
}

export interface TheqaConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUrl?: string;
}

/** واجهة «ثقة» — تنتظر وثائق الربط الرسمية. */
export class TheqaProvider implements IdentityProvider {
  readonly id = 'theqa' as const;
  readonly isMock = false;
  constructor(private cfg: TheqaConfig) {}
  configured() {
    return !!(this.cfg.clientId && this.cfg.clientSecret && this.cfg.redirectUrl);
  }
}

const CIVIL_ID = /^[0-9]{6,12}$/;

export class MockIdentityProvider implements IdentityProvider {
  readonly id = 'mock_theqa' as const;
  readonly isMock = true;
  constructor(private enabled: boolean) {}
  configured() {
    return this.enabled;
  }
  verify(fullName: string, nationalId: string): VerifiedIdentity | 'invalid' {
    const name = fullName.trim().replace(/\s+/g, ' ');
    const id = nationalId.replace(/[^0-9]/g, '');
    if (name.length < 3 || name.length > 160 || !CIVIL_ID.test(id)) return 'invalid';
    return { fullName: name, nationalId: id, providerRef: `mock-${crypto.randomUUID()}`, level: 'basic' };
  }
}
