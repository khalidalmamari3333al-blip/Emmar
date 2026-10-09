-- حالة جديدة للطلبات المعلقة التي انتهت مهلتها.
-- ملف منفصل: PostgreSQL لا يسمح باستخدام قيمة enum جديدة في نفس المعاملة التي أُضيفت فيها.
alter type public.booking_status add value if not exists 'expired';
