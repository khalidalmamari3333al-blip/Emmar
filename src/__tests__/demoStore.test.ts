import { parseNeeds, demoReply } from '@/demo/assistant';
import { demoAdmin, demoNotifications, demoOwner } from '@/demo/services';
import { bedIsFree, createBooking, decide, DEMO_USERS, demoState, resetDemo, setCurrentUser } from '@/demo/store';

beforeEach(() => resetDemo());

describe('demo store follows the real database rules', () => {
  const req = { bedId: 'Y-201-b2', start: '2027-01-01', end: '2027-05-01' };

  it('starts with realistic activity: two requests waiting for the owner and a confirmed stay for the student', () => {
    setCurrentUser(DEMO_USERS.owner);
    const r = demoOwner.requests();
    expect(r.ok && r.data.filter((x) => x.status === 'pending')).toHaveLength(2);
    expect(demoState().bookings.some((b) => b.userId === DEMO_USERS.tenant && b.status === 'confirmed')).toBe(true);
  });

  it('prevents double booking but allows back-to-back stays', () => {
    expect(createBooking(DEMO_USERS.tenant, req).status).toBe('ok');
    expect(createBooking('demo-reem', { ...req, start: '2027-04-01', end: '2027-06-01' })).toEqual({ status: 'conflict' });
    expect(createBooking('demo-reem', { ...req, start: '2027-05-01', end: '2027-06-01' }).status).toBe('ok');
  });

  it('lets an expired hold free the bed and blocks approving it', () => {
    const now = Date.now();
    const r = createBooking(DEMO_USERS.tenant, req, now);
    const later = now + 49 * 3600e3;
    expect(bedIsFree(req.bedId, req.start, req.end, later)).toBe(true);
    expect(r.status === 'ok' && decide(DEMO_USERS.owner, r.id, 'confirmed', later)).toBe(false);
  });

  it('only the owner approves; the tenant can only cancel', () => {
    const r = createBooking(DEMO_USERS.tenant, req);
    if (r.status !== 'ok') throw new Error();
    expect(decide(DEMO_USERS.tenant, r.id, 'confirmed')).toBe(false);
    expect(decide('demo-reem', r.id, 'cancelled')).toBe(false);
    expect(decide(DEMO_USERS.owner, r.id, 'confirmed')).toBe(true);
    expect(decide(DEMO_USERS.tenant, r.id, 'cancelled')).toBe(true);
  });

  it('sends the same notifications as the database trigger', async () => {
    const r = createBooking(DEMO_USERS.tenant, req);
    if (r.status !== 'ok') throw new Error();
    setCurrentUser(DEMO_USERS.owner);
    expect((await demoNotifications.list())[0]).toMatchObject({ kind: 'booking_requested', data: { requester_name: 'سالم البلوشي' } });
    decide(DEMO_USERS.owner, r.id, 'confirmed');
    setCurrentUser(DEMO_USERS.tenant);
    expect((await demoNotifications.list())[0].kind).toBe('booking_confirmed');
    expect(await demoNotifications.unreadCount()).toBeGreaterThan(0);
    await demoNotifications.markAllRead();
    expect(await demoNotifications.unreadCount()).toBe(0);
  });

  it('reset brings everything back', () => {
    createBooking(DEMO_USERS.tenant, req);
    resetDemo();
    expect(demoState().bookings.some((b) => b.bedId === req.bedId)).toBe(false);
  });
});

describe('demo assistant', () => {
  it('reads city, kind, type, budget and bedrooms from Arabic or English', () => {
    expect(parseNeeds('أبحث عن سرير في سكن طلابي بصحار بأقل من ٦٠ ريال')).toEqual({ city: 'sohar', kind: 'student', maxPrice: 60 });
    expect(parseNeeds('فيلا للبيع في مسقط بميزانية 300 ألف')).toEqual({ city: 'muscat', kind: 'sale', type: 'villa', maxPrice: 300000 });
    expect(parseNeeds('2 bedroom flat for rent in Muscat under 500')).toEqual({ city: 'muscat', kind: 'rent', type: 'apartment', minBedrooms: 2, maxPrice: 500 });
  });

  it('keeps context across follow-up messages', () => {
    const r = demoReply(
      [
        { role: 'user', content: 'شقة للإيجار' },
        { role: 'assistant', content: '...' },
        { role: 'user', content: 'في مسقط' },
      ],
      'ar',
    );
    expect(r.properties.length).toBeGreaterThan(0);
    expect(r.properties.every((p) => p.city === 'muscat' && p.kind === 'rent' && p.type === 'apartment')).toBe(true);
  });

  it('says so when nothing matches, and asks when it knows nothing', () => {
    expect(demoReply([{ role: 'user', content: 'فيلا للبيع في صحار بأقل من 100' }], 'ar').properties).toEqual([]);
    expect(demoReply([{ role: 'user', content: 'مرحبا' }], 'ar').reply).toMatch(/أخبرني/);
  });
});

describe('demo gallery and audit log', () => {
  it('first photo becomes the cover; cover, reorder and delete stay consistent', () => {
    setCurrentUser(DEMO_USERS.owner);
    const a = demoOwner.addImage('mock-1', { uri: 'a.jpg' });
    const b = demoOwner.addImage('mock-1', { uri: 'b.jpg' });
    if (!a.ok || !b.ok) throw new Error('add failed');
    expect(a.data.isCover).toBe(true);
    demoOwner.setCover('mock-1', b.data.id);
    const p = () => demoState().properties.find((x) => x.id === 'mock-1')!;
    expect(p().imageUrl).toBe('b.jpg');
    expect(p().images).toEqual(['b.jpg', 'a.jpg']);
    demoOwner.removeImage('mock-1', b.data.id);
    expect(p().imageUrl).toBe('a.jpg');
    const left = demoOwner.listImages('mock-1');
    expect(left.ok && left.data.map((i) => i.isCover)).toEqual([true]);
  });

  it('other users cannot manage images', () => {
    setCurrentUser(DEMO_USERS.tenant);
    expect(demoOwner.addImage('mock-1', { uri: 'x.jpg' })).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('records sensitive actions, readable by admins only', () => {
    setCurrentUser(DEMO_USERS.admin);
    demoAdmin.setRole('demo-reem', 'owner');
    demoOwner.setStatus('mock-1', 'archived');
    const log = demoAdmin.auditLog();
    expect(log.ok && log.data.map((e) => e.action)).toEqual(['property.status', 'role.changed']);
    expect(log.ok && log.data[1].actorName).toBe('مدير المنصة');
    setCurrentUser(DEMO_USERS.owner);
    expect(demoAdmin.auditLog()).toMatchObject({ ok: false, code: 'not_allowed' });
  });
});

describe('demo assistant understands amenities, proximity and costs', () => {
  it('parses universities, amenities and furnishing without confusing "university" for its own sake', () => {
    expect(parseNeeds('سكن قريب من جامعة صحار فيه واي فاي وغرفة مذاكرة')).toMatchObject({ landmark: 'sohar_university', amenities: ['wifi', 'study_room'], kind: 'student' });
    expect(parseNeeds('furnished studio near SQU with parking')).toMatchObject({ landmark: 'squ', amenities: ['parking'], furnishedOnly: true, type: 'studio' });
    expect(parseNeeds('شقة غير مفروشة').furnishedOnly).toBeUndefined();
  });

  it('quotes the real first payment, verification and rating, and compares when asked', () => {
    const r = demoReply([{ role: 'user', content: 'قارن سكن طلابي في صحار قريب من جامعة صحار' }], 'ar');
    expect(r.properties.length).toBeGreaterThanOrEqual(2);
    expect(r.reply).toMatch(/أول دفعة متوقعة/);
    expect(r.reply).toMatch(/موثّق/);
    expect(r.reply).toMatch(/للمقارنة/);
    const en = demoReply([{ role: 'user', content: 'student bed in Sohar near Sohar University' }], 'en');
    expect(en.reply).toMatch(/The expected first payment/);
  });
});
