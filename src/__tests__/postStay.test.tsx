import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { ReportListing } from '@/components/postStay/ReportListing';
import { ReviewForm } from '@/components/postStay/ReviewForm';
import { ReviewsSection } from '@/components/postStay/ReviewsSection';
import { demoPostStay } from '@/demo/postStay';
import { DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';
import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { AdminScreen } from '@/screens/admin/AdminScreen';
import { MaintenanceScreen, MaintenanceServices } from '@/screens/postStay/MaintenanceScreen';
import { ADMIN, fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';
import { allowedTransitions, averageRating, canReviewStay, MaintenanceRequest } from '@/types/postStay';

const t = dictionaries.ar;
const p = t.post;
const wrap = (ui: ReactElement, user: typeof STUDENT | null = STUDENT) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={fakeAuthBackend(user)}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

describe('post-stay rules (mirror of the database)', () => {
  it('limits maintenance transitions by role', () => {
    expect(allowedTransitions('open', 'landlord')).toEqual(['in_progress', 'resolved']);
    expect(allowedTransitions('open', 'tenant')).toEqual(['cancelled']);
    expect(allowedTransitions('resolved', 'tenant')).toEqual(['closed', 'open']);
    expect(allowedTransitions('closed', 'landlord')).toEqual([]);
  });

  it('allows reviews only after a confirmed stay has ended', () => {
    expect(canReviewStay({ status: 'confirmed', end: '2026-06-01' }, '2026-10-10')).toBe(true);
    expect(canReviewStay({ status: 'confirmed', end: '2027-03-01' }, '2026-10-10')).toBe(false);
    expect(canReviewStay({ status: 'cancelled', end: '2026-06-01' }, '2026-10-10')).toBe(false);
    expect(averageRating([{ rating: 5 }, { rating: 4 }, { rating: 4 }])).toBe(4.3);
    expect(averageRating([])).toBeNull();
  });
});

describe('demo post-stay flows', () => {
  beforeEach(() => resetDemo());

  it('maintenance: tenant opens, landlord resolves with a note, tenant closes', () => {
    setCurrentUser(DEMO_USERS.tenant);
    const booking = demoState().bookings.find((b) => b.userId === DEMO_USERS.tenant && b.status === 'confirmed' && b.end > '2026-10-10')!;
    const r = demoPostStay.openMaintenance({ bookingId: booking.id, category: 'plumbing', priority: 'normal', title: 'تسرب في الحمام' });
    if (!r.ok) throw new Error('open failed');
    expect(demoPostStay.updateMaintenance(r.data, 'resolved')).toMatchObject({ ok: false, code: 'invalid' });
    setCurrentUser('demo-reem');
    expect(demoPostStay.openMaintenance({ bookingId: booking.id, category: 'ac', priority: 'low', title: 'xxx' })).toMatchObject({ ok: false, code: 'not_allowed' });
    setCurrentUser(DEMO_USERS.owner);
    expect(demoPostStay.updateMaintenance(r.data, 'resolved', 'تم تغيير الوصلة').ok).toBe(true);
    setCurrentUser(DEMO_USERS.tenant);
    expect(demoPostStay.updateMaintenance(r.data, 'closed').ok).toBe(true);
    expect(demoState().maintenance.find((m) => m.id === r.data)).toMatchObject({ status: 'closed', landlordNote: 'تم تغيير الوصلة' });
  });

  it('reviews: only the resident, only after the stay, only once; one landlord reply', () => {
    setCurrentUser(DEMO_USERS.tenant);
    const current = demoState().bookings.find((b) => b.userId === DEMO_USERS.tenant && b.status === 'confirmed' && b.end > '2026-10-10')!;
    expect(demoPostStay.review(current.id, 5)).toMatchObject({ ok: false, code: 'not_completed' });
    expect(demoPostStay.review('past-salem', 5, 'ممتاز').ok).toBe(true);
    expect(demoPostStay.review('past-salem', 4)).toMatchObject({ ok: false, code: 'duplicate' });
    expect(demoPostStay.review('past-reem', 1)).toMatchObject({ ok: false, code: 'not_allowed' });
    const prop = demoState().reviews.find((r) => r.bookingId === 'past-salem')!;
    const list = demoPostStay.reviews(prop.propertyId);
    expect(list.ok && list.data.map((r) => r.reviewer)).toEqual(['سالم', 'ريم', 'أحمد']);
    expect(JSON.stringify(list)).not.toContain(DEMO_USERS.tenant); // لا معرّفات في العرض العام
    expect(demoPostStay.reply(prop.id, 'شكرًا')).toMatchObject({ ok: false });
    setCurrentUser(DEMO_USERS.owner);
    expect(demoPostStay.reply(prop.id, 'شكرًا سالم').ok).toBe(true);
    expect(demoPostStay.reply(prop.id, 'مرة ثانية')).toMatchObject({ ok: false });
  });

  it('reports: one open report per user; only admins see and handle them', () => {
    setCurrentUser(DEMO_USERS.tenant);
    expect(demoPostStay.report('mock-3', 'fraud', 'طلب تحويل خارج المنصة').ok).toBe(true);
    expect(demoPostStay.report('mock-3', 'wrong_info')).toMatchObject({ ok: false, code: 'duplicate' });
    expect(demoPostStay.listReports('open')).toMatchObject({ ok: true, data: [expect.objectContaining({ propertyId: 'mock-3' })] });
    expect(demoPostStay.handleReport('rep-1', 'resolved')).toMatchObject({ ok: false, code: 'not_allowed' });
    setCurrentUser(DEMO_USERS.admin);
    const all = demoPostStay.listReports('open');
    expect(all.ok && all.data).toHaveLength(2);
    expect(demoPostStay.handleReport('rep-1', 'resolved', 'صُححت المساحة').ok).toBe(true);
  });
});

describe('post-stay screens', () => {
  const req = (over: Partial<MaintenanceRequest> = {}): MaintenanceRequest => ({
    id: 'm1', bookingId: 'b1', propertyId: 'p', tenantId: STUDENT.id, landlordId: OWNER.id, category: 'ac', priority: 'urgent', title: 'المكيف معطل', status: 'open', createdAt: '2026-10-09T10:00:00Z', ...over,
  });

  it('tenant opens a maintenance request for a booking', async () => {
    const services: MaintenanceServices = { list: async () => ({ ok: true, data: [] }), open: jest.fn(async () => ({ ok: true as const, data: 'm9' })), update: jest.fn() };
    await wrap(<MaintenanceScreen as="tenant" bookingId="b1" services={services} />);
    await fireEvent.press(await screen.findByText(p.categories.plumbing));
    await fireEvent.press(screen.getByText(p.priorities.urgent));
    await fireEvent.changeText(screen.getByTestId('m-title'), 'تسرب ماء');
    await fireEvent.press(screen.getByTestId('m-submit'));
    expect(services.open).toHaveBeenCalledWith({ bookingId: 'b1', category: 'plumbing', priority: 'urgent', title: 'تسرب ماء', description: '' });
    expect(await screen.findByText(p.submitted)).toBeTruthy();
  });

  it('landlord sees only the allowed actions and sends a note', async () => {
    const services: MaintenanceServices = { list: async () => ({ ok: true, data: [req()] }), open: jest.fn(), update: jest.fn(async () => ({ ok: true as const, data: undefined })) };
    await wrap(<MaintenanceScreen as="landlord" services={services} />, OWNER);
    await fireEvent.changeText(await screen.findByTestId('m-note-m1'), 'الفني غدًا');
    expect(screen.queryByTestId('m-cancelled-m1')).toBeNull();
    await fireEvent.press(screen.getByTestId('m-in_progress-m1'));
    expect(services.update).toHaveBeenCalledWith('m1', 'in_progress', 'الفني غدًا');
  });

  it('shows the average rating and lets only the owner reply', async () => {
    const services = {
      load: async () => ({ ok: true as const, data: [{ id: 'r1', rating: 5, comment: 'رائع', reviewer: 'ريم', stayEnd: '2026-01-01', createdAt: '' }, { id: 'r2', rating: 4, reviewer: 'أحمد', stayEnd: '2025-06-01', createdAt: '', landlordReply: 'شكرًا' }] }),
      reply: jest.fn(async () => ({ ok: true as const, data: undefined })),
    };
    await wrap(<ReviewsSection propertyId="p" ownerId={OWNER.id} services={services} />, OWNER);
    expect(await screen.findByText(p.average(4.5, 2))).toBeTruthy();
    expect(screen.getByText('شكرًا')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('reply-r1'), 'سعدنا بك');
    await fireEvent.press(screen.getAllByText(p.reply)[1]);
    expect(services.reply).toHaveBeenCalledWith('r1', 'سعدنا بك');
  });

  it('hides reply tools from visitors', async () => {
    const services = { load: async () => ({ ok: true as const, data: [{ id: 'r1', rating: 3, reviewer: 'ريم', stayEnd: '2026-01-01', createdAt: '' }] }), reply: jest.fn() };
    await wrap(<ReviewsSection propertyId="p" ownerId={OWNER.id} services={services} />);
    await screen.findByTestId('review-r1');
    expect(screen.queryByTestId('reply-r1')).toBeNull();
  });

  it('review form needs a star rating', async () => {
    const submit = jest.fn(async () => ({ ok: true as const, data: undefined }));
    await wrap(<ReviewForm bookingId="b1" submit={submit} />);
    await fireEvent.press(screen.getByTestId('rate-b1'));
    await fireEvent.press(screen.getByTestId('send-review-b1'));
    expect(submit).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('star-4'));
    await fireEvent.press(screen.getByTestId('send-review-b1'));
    expect(submit).toHaveBeenCalledWith('b1', 4, '');
    expect(await screen.findByText(p.reviewSent)).toBeTruthy();
  });

  it('reports a listing and explains duplicates', async () => {
    const send = jest.fn(async () => ({ ok: false as const, code: 'duplicate' as const }));
    await wrap(<ReportListing propertyId="p" send={send} />);
    await fireEvent.press(screen.getByTestId('report-listing'));
    await fireEvent.press(screen.getByText(p.reasons.fraud));
    await fireEvent.press(screen.getByTestId('send-report'));
    expect(send).toHaveBeenCalledWith('p', 'fraud', '');
    expect(await screen.findByText(p.duplicateReport)).toBeTruthy();
  });

  it('admin handles reports from the reports tab', async () => {
    const handleReport = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const listReports = jest.fn(async () => ({ ok: true as const, data: [{ id: 'rp', propertyId: 'p', propertyTitle: { ar: 'فيلا', en: 'Villa' }, reason: 'fraud' as const, status: 'open' as const, createdAt: '' }] }));
    await wrap(<AdminScreen listReports={listReports} handleReport={handleReport} debounceMs={0} />, ADMIN);
    await fireEvent.press(await screen.findByText(p.reportsTab));
    await fireEvent.press(await screen.findByTestId('resolve-rp'));
    expect(handleReport).toHaveBeenCalledWith('rp', 'resolved', undefined);
  });
});
