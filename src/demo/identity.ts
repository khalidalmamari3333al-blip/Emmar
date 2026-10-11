/** ⚠️ الهوية في وضع العرض: تحقق تجريبي محلي فقط، بلا أي اتصال بـ«ثقة» أو أي جهة. */
import type { IResult, MyIdentity } from '@/services/identity';

import { audit, demoState, notifyChange } from './store';

const me = () => demoState().currentUserId;
const usedIds = new Map<string, string>(); // رقم مدني (في الذاكرة فقط) ← مستخدم

export const demoIdentity = {
  mine(): IResult<MyIdentity | null> {
    const uid = me();
    if (!uid) return { ok: false, code: 'not_allowed' };
    const i = demoState().identities[uid];
    return { ok: true, data: i ? { provider: i.provider, isMock: true, verifiedName: i.verifiedName, last4: i.last4, verifiedAt: i.verifiedAt } : null };
  },
  mockVerify(fullName: string, nationalId: string): IResult {
    const uid = me();
    if (!uid) return { ok: false, code: 'not_allowed' };
    const id = nationalId.replace(/[^0-9]/g, '');
    const owner = usedIds.get(id);
    if (owner && owner !== uid) return { ok: false, code: 'identity_in_use' };
    usedIds.set(id, uid);
    const name = fullName.trim().replace(/\s+/g, ' ');
    demoState().identities[uid] = { provider: 'mock_theqa', verifiedName: name, last4: id.slice(-4), verifiedAt: new Date().toISOString() };
    const u = demoState().users.find((x) => x.id === uid);
    if (u) u.fullName = name;
    audit('identity.verified', 'identity', uid, { provider: 'mock_theqa', mock: true });
    notifyChange();
    return { ok: true, data: undefined };
  },
};
