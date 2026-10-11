-- أدوار جديدة: فريق التحقق والدعم. ملف منفصل لأن قيمة enum الجديدة
-- لا تُستخدم في نفس المعاملة التي أُضيفت فيها.
alter type public.user_role add value if not exists 'verifier';
alter type public.user_role add value if not exists 'support';
