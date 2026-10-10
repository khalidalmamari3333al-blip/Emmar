import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { OwnerDashboardScreen } from '@/screens/owner/OwnerDashboardScreen';
import { OwnerRequestsScreen } from '@/screens/owner/OwnerRequestsScreen';
import { PropertyEditorScreen } from '@/screens/owner/PropertyEditorScreen';
import { StructureEditor } from '@/screens/owner/StructureEditor';
import { ImageManager, ImageServices } from '@/screens/owner/ImageManager';
import { emptyPropertyInput, OwnerImage, OwnerProperty, OwnerRequest, validateImage } from '@/services/owner';
import { fakeAuthBackend, OWNER, STUDENT } from '@/test-utils/fakeAuth';
import type { BuildingLayout } from '@/types/layout';

const t = dictionaries.ar;
const wrap = (ui: ReactElement, auth: AuthBackend = fakeAuthBackend(OWNER)) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={auth}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

const prop: OwnerProperty = {
  id: 'p1', title: { ar: 'سكن الطالبات', en: 'Girls housing' }, city: 'sohar', kind: 'student', status: 'draft', featured: false, updatedAt: '',
  input: { ...emptyPropertyInput(), kind: 'student', type: 'student_housing', titleAr: 'سكن الطالبات', titleEn: 'Girls housing', districtAr: 'الهمبار', districtEn: 'Al Humbar', price: '45' },
};

describe('OwnerDashboardScreen', () => {
  it('blocks non-owners', async () => {
    await wrap(<OwnerDashboardScreen />, fakeAuthBackend(STUDENT));
    expect(await screen.findByText(t.owner.notOwner)).toBeTruthy();
  });

  it('shows stats and my properties', async () => {
    const onEdit = jest.fn();
    await wrap(
      <OwnerDashboardScreen
        loadStats={async () => ({ ok: true, data: { properties: 1, published: 0, beds: 12, occupiedToday: 3, pendingRequests: 2 } })}
        loadProperties={async (id) => (expect(id).toBe(OWNER.id), { ok: true, data: [prop] })}
        onEdit={onEdit}
      />,
    );
    expect(await screen.findByText('سكن الطالبات')).toBeTruthy();
    expect(screen.getByText(`${t.owner.requests} (2)`)).toBeTruthy();
    expect(screen.getByText(t.owner.status.draft)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('owner-property-p1'));
    expect(onEdit).toHaveBeenCalledWith('p1');
  });
});

describe('PropertyEditorScreen', () => {
  it('validates before saving and shows field errors', async () => {
    const create = jest.fn();
    await wrap(<PropertyEditorScreen create={create} />);
    await fireEvent.press(await screen.findByTestId('save-property'));
    expect(screen.getByText(t.owner.fixErrors)).toBeTruthy();
    expect(screen.getAllByText(t.owner.errors.required).length).toBeGreaterThanOrEqual(4);
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a property for the signed-in owner and reports the new id', async () => {
    const create = jest.fn(async () => ({ ok: true as const, data: 'new-id' }));
    const onCreated = jest.fn();
    await wrap(<PropertyEditorScreen create={create} onCreated={onCreated} />);
    await fireEvent.press(await screen.findByText(t.categories.sale.title));
    await fireEvent.press(screen.getByText(t.types.land));
    await fireEvent.changeText(screen.getByLabelText(t.owner.fields.titleAr), 'أرض سكنية');
    await fireEvent.changeText(screen.getByLabelText(t.owner.fields.titleEn), 'Residential plot');
    await fireEvent.changeText(screen.getByLabelText(t.owner.fields.districtAr), 'فلج القبائل');
    await fireEvent.changeText(screen.getByLabelText(t.owner.fields.districtEn), 'Falaj Al Qabail');
    expect(screen.getByLabelText(t.owner.fields.priceTotal)).toBeTruthy(); // البيع: سعر إجمالي
    await fireEvent.changeText(screen.getByLabelText(t.owner.fields.priceTotal), '28000');
    await fireEvent.press(screen.getByTestId('save-property'));
    expect(create).toHaveBeenCalledWith(OWNER.id, expect.objectContaining({ kind: 'sale', type: 'land', titleEn: 'Residential plot', price: '28000' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-id'));
  });

  it('switching to student housing sets the matching type and hides bedrooms', async () => {
    await wrap(<PropertyEditorScreen />);
    await fireEvent.press(await screen.findByText(t.categories.student.title));
    expect(screen.queryByLabelText(t.owner.fields.bedrooms)).toBeNull();
    expect(screen.getByText(t.owner.structureAfterSave)).toBeTruthy();
  });

  it('loads an existing property, saves edits, and uploads a cover photo', async () => {
    const update = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const upload = jest.fn(async () => ({ ok: true as const, data: 'https://cdn/x.jpg' }));
    await wrap(
      <PropertyEditorScreen
        propertyId="p1"
        load={async () => ({ ok: true, data: prop })}
        update={update}
        upload={upload}
        pickImage={async () => ({ uri: 'file:///x.jpg', mimeType: 'image/jpeg' })}
        structure={{ loadLayout: async () => ({ ok: true, data: [] }) }}
      />,
    );
    expect(await screen.findByDisplayValue('سكن الطالبات')).toBeTruthy();
    await fireEvent.press(screen.getByText(t.owner.status.published));
    await fireEvent.press(screen.getByTestId('save-property'));
    expect(update).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'published' }));
    expect(await screen.findByText(t.owner.saved)).toBeTruthy();
    await fireEvent.press(screen.getByText(t.owner.pickPhoto));
    expect(upload).toHaveBeenCalledWith('p1', { uri: 'file:///x.jpg', mimeType: 'image/jpeg' });
    expect(await screen.findByText(t.owner.changePhoto)).toBeTruthy();
    expect(screen.getByText(t.owner.structure.noBuildings)).toBeTruthy();
  });
});

describe('ImageManager', () => {
  it('validates, adds, sets cover, reorders and deletes photos', async () => {
    let imgs: OwnerImage[] = [];
    const services: ImageServices = {
      list: async () => ({ ok: true, data: imgs.map((i) => ({ ...i })) }),
      add: jest.fn(async (_p, a, position) => {
        if (validateImage(a)) return { ok: false as const, code: 'error' as const, message: validateImage(a)! };
        const img = { id: `i${imgs.length}`, url: a.uri, position, isCover: imgs.length === 0 };
        imgs = [...imgs, img];
        return { ok: true as const, data: img };
      }),
      setCover: jest.fn(async (_p, id) => {
        imgs = imgs.map((i) => ({ ...i, isCover: i.id === id }));
        return { ok: true as const, data: undefined };
      }),
      remove: jest.fn(async (_p, id) => {
        imgs = imgs.filter((i) => i.id !== id);
        return { ok: true as const, data: undefined };
      }),
      reorder: jest.fn(async (_p, ids: string[]) => {
        imgs = ids.map((id, position) => ({ ...imgs.find((i) => i.id === id)!, position }));
        return { ok: true as const, data: undefined };
      }),
    };
    const picks = [{ uri: 'a.gif', mimeType: 'image/gif' }, { uri: 'a.jpg', mimeType: 'image/jpeg' }, { uri: 'b.png', mimeType: 'image/png' }];
    await wrap(<ImageManager propertyId="p1" services={services} pickImage={async () => picks.shift()!} />);
    await fireEvent.press(await screen.findByTestId('add-image'));
    expect(await screen.findByText(t.extras.gallery.badType)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-image'));
    await fireEvent.press(await screen.findByTestId('add-image'));
    expect(await screen.findByTestId('image-i1')).toBeTruthy();
    await fireEvent.press(screen.getByText(t.extras.gallery.makeCover));
    expect(services.setCover).toHaveBeenCalledWith('p1', 'i1');
    await fireEvent.press((await screen.findAllByText(t.extras.gallery.moveEarlier))[1]);
    expect(services.reorder).toHaveBeenCalledWith('p1', ['i1', 'i0']);
    await fireEvent.press((await screen.findAllByText(t.extras.gallery.remove))[0]);
    expect(services.remove).toHaveBeenCalledWith('p1', 'i1');
    await waitFor(() => expect(screen.queryByTestId('image-i1')).toBeNull());
  });
});

describe('StructureEditor', () => {
  const layout: BuildingLayout[] = [
    {
      id: 'b1', name: { ar: 'المبنى أ', en: 'A' },
      floors: [{ id: 'f0', level: 0, rooms: [{ id: 'r1', code: '001', x: 0, y: 0, w: 1, h: 1, beds: [{ id: 'bd1', code: '1', monthlyPriceOmr: 45, status: 'active', position: 1 }] }] }],
    },
  ];

  it('generates rooms with validated numbers and toggles bed maintenance', async () => {
    const onAddRooms = jest.fn(async () => ({ ok: true as const, data: 3 }));
    const onUpdateBed = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const onAddFloor = jest.fn(async () => ({ ok: true as const, data: 'f1' }));
    await wrap(<StructureEditor propertyId="p1" loadLayout={async () => ({ ok: true, data: layout })} onAddRooms={onAddRooms} onUpdateBed={onUpdateBed} onAddFloor={onAddFloor} />);
    await fireEvent.press(await screen.findByTestId('generate-rooms'));
    expect(screen.getByText(t.owner.structure.invalidGenerator)).toBeTruthy(); // السعر فارغ
    await fireEvent.changeText(screen.getByLabelText(t.owner.structure.roomsCount), '3');
    await fireEvent.changeText(screen.getByLabelText(t.owner.structure.bedPrice), '40');
    await fireEvent.press(screen.getByTestId('generate-rooms'));
    expect(onAddRooms).toHaveBeenCalledWith('f0', 0, ['001'], 3, 2, 40);
    expect(await screen.findByText(t.owner.structure.generated(3))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('struct-bed-001-1'));
    expect(onUpdateBed).toHaveBeenCalledWith('bd1', { status: 'maintenance' });

    await fireEvent.press(screen.getByTestId('add-floor'));
    expect(onAddFloor).toHaveBeenCalledWith('b1', 1);
  });

  it('explains why a room with bookings cannot be deleted', async () => {
    await wrap(<StructureEditor propertyId="p1" loadLayout={async () => ({ ok: true, data: layout })} onDeleteRoom={async () => ({ ok: false, code: 'in_use' })} />);
    await fireEvent.press(await screen.findByText(t.owner.structure.deleteRoom));
    expect(await screen.findByText(t.owner.structure.roomInUse)).toBeTruthy();
  });
});

describe('OwnerRequestsScreen', () => {
  const req = (id: string, status: OwnerRequest['status']): OwnerRequest => ({
    id, status, start: '2026-11-01', end: '2027-03-01', monthlyPriceOmr: 45, createdAt: '', bedCode: '2', roomCode: '003', floorLevel: 0,
    buildingName: { ar: 'المبنى أ', en: 'A' }, propertyId: 'p1', propertyTitle: { ar: 'سكن الطالبات', en: 'G' }, requesterName: 'سالم', requesterPhone: '91234567',
  });

  it('lists pending requests with requester contact, and approves', async () => {
    const decide = jest.fn(async () => ({ ok: true as const, data: undefined }));
    const openUrl = jest.fn();
    const load = jest.fn(async () => ({ ok: true as const, data: [req('a', 'pending'), req('b', 'confirmed'), req('c', 'rejected')] }));
    await wrap(<OwnerRequestsScreen load={load} decide={decide} openUrl={openUrl} />);
    expect(await screen.findByText(`${t.requests.tabs.pending} (1)`)).toBeTruthy();
    expect(screen.getByText('سالم')).toBeTruthy();
    expect(screen.getByText(/\u2066\+?91234567\u2069/)).toBeTruthy(); // الرقم معزول كنص من اليسار لليمين
    expect(screen.getByText(/45 ر.ع × 4 = 180 ر.ع/)).toBeTruthy();
    await fireEvent.press(screen.getByText(t.requests.whatsapp));
    expect(openUrl).toHaveBeenCalledWith('https://wa.me/96891234567');
    await fireEvent.press(screen.getByTestId('approve-a'));
    expect(decide).toHaveBeenCalledWith('a', 'confirmed');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('shows an error when the database refuses (e.g. expired)', async () => {
    await wrap(<OwnerRequestsScreen load={async () => ({ ok: true, data: [req('a', 'pending')] })} decide={async () => ({ ok: false, code: 'not_allowed' })} />);
    await fireEvent.press(await screen.findByTestId('approve-a'));
    expect(await screen.findByText(t.requests.actionFailed)).toBeTruthy();
  });
});
