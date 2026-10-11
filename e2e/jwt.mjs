// يولّد مفتاح anon محلي موقّع بسر JWT الخاص بالبيئة المحلية (ليس سرًا لأي مشروع حقيقي).
import crypto from 'node:crypto';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const secret = process.argv[2];
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: process.argv[3] ?? 'anon', iss: 'supabase-local', iat: 1700000000, exp: 2000000000 })}`;
console.log(`${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`);
