// بديل expo-crypto في بيئة Node للاختبارات الشاملة فقط (نفس الواجهة المستخدمة في التطبيق).
import { webcrypto } from 'node:crypto';

export enum CryptoDigestAlgorithm {
  SHA256 = 'SHA-256',
}
export const digest = (algorithm: CryptoDigestAlgorithm, data: Uint8Array) => webcrypto.subtle.digest(algorithm, new Uint8Array(data));
