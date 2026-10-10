import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ReactElement } from 'react';

import { dictionaries, LocaleProvider } from '@/i18n';
import { AuthBackend, AuthProvider } from '@/lib/auth';
import { PropertyDetailScreen } from '@/screens/PropertyDetailScreen';
import { PropertyEditorScreen } from '@/screens/owner/PropertyEditorScreen';
import { VerificationQueueScreen } from '@/screens/verification/VerificationQueueScreen';
import { ReviewServices, VerificationReviewScreen } from '@/screens/verification/VerificationReviewScreen';
import { VerificationScreen, VerificationServices } from '@/screens/verification/VerificationScreen';
import { emptyPropertyInput, OwnerProperty } from '@/services/owner';
import { getPropertyById } from '@/services/properties';
import { validateDocument } from '@/services/verification';
import { fakeAuthBackend, OWNER, VERIFIER } from '@/test-utils/fakeAuth';
import type { VerificationRequest } from '@/types/verification';

const t = dictionaries.ar;
const v = t.verification;
const wrap = (ui: ReactElement, auth: AuthBackend = fakeAuthBackend(OWNER)) =>
  render(
    <LocaleProvider initialLocale="ar">
      <AuthProvider backend={auth}>{ui}</AuthProvider>
    </LocaleProvider>,
  );

const prop: OwnerProperty = {
  id: 'p1', title: { ar: 'شقة الطريف', en: 'Tareef flat' }, city: 'sohar', kind: 'rent', status: 'draft', featured: false, updatedAt: '', verificationStatus: 'unverified',
  input: { ...emptyPropertyInput(), titleAr: 'شقة الطريف', titleEn: 'Tareef flat', districtAr: 'الطريف', districtEn: 'Al Tareef', price: '200' },
};
const draft = (over: Partial<VerificationRequest> = {}): VerificationRequest => ({
  id: 'r1', subject: 'property', propertyId: 'p1', submittedBy: OWNER.id, status: 'draft', automatedStatus: 'not_run', officialStatus: 'not_requested',
  humanStatus: 'pending', createdAt: '2026-10-01', documents: [], checks: [], decisions: [], ...over,
});

describe('VerificationScreen (owner)', () => {
  it('starts a request, validates documents, saves the declared data and submits', async () => {
    let req: VerificationRequest | null = null;
    const ok = { ok: true as const, data: undefined };
    const services: VerificationServices = {
      latest: jest.fn(async () => ({ ok: true as const, data: req })),
      start: jest.fn(async () => {
        req = draft();
        return { ok: true as const, data: 'r1' };
      }),
      saveDeclared: jest.fn(async () => ok),
      setIdentity: jest.fn(async () => ok),
      upload: jest.fn(async (_r, docType, file) => {
        const bad = validateDocument(file);
        if (bad) return { ok: false as const, code: bad };
        req = draft({ documents: [{ id: 'd1', docType, path: 'u/r1/x.pdf', mimeType: 'application/pdf', sizeBytes: 2048, sha256: 'a'.repeat(64), uploadedBy: OWNER.id, createdAt: '' }] });
        return ok;
      }),
      remove: jest.fn(async () => ok),
      submit: jest.fn(async () => {
        req = draft({ status: 'submitted', automatedStatus: 'passed', officialStatus: 'verified', checks: [{ code: 'official_registry', source: 'official', result: 'pass', required: false, details: {}, isMock: true }] });
        return { ok: true as const, data: 'passed' as const };
      }),
      landlord: jest.fn(async () => ({ ok: true as const, data: null })),
      saveLandlord: jest.fn(async () => ok),
      documentUrl: jest.fn(async () => ({ ok: true as const, data: 'https://signed' })),
      property: jest.fn(async () => ({ ok: true as const, data: prop })),
    };
    const picks = [{ uri: 'a.zip', mimeType: 'application/zip' }, { uri: 'deed.pdf', mimeType: 'application/pdf', size: 2048 }];
    await wrap(<VerificationScreen subject="property" propertyId="p1" services={services} pickDocument={async () => picks.shift()!} />);

    expect(await screen.findByText(v.mockNotice)).toBeTruthy();
    expect(screen.getByText(v.privacy)).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('start-verification'));
    await fireEvent.changeText(await screen.findByTestId('deed-number'), 'TEST-OK-1001');
    await fireEvent.changeText(screen.getByTestId('deed-owner'), 'مالك');
    await fireEvent.press(screen.getByText(t.cities.sohar));
    await fireEvent.press(screen.getByTestId('add-document'));
    expect(await screen.findByText(v.badType)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('add-document'));
    expect(await screen.findByTestId('doc-d1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('submit-verification'));
    expect(services.saveDeclared).toHaveBeenCalledWith('r1', expect.objectContaining({ deedNumber: 'TEST-OK-1001', declaredOwnerName: 'مالك', declaredCity: 'sohar' }));
    expect(services.submit).toHaveBeenCalledWith('r1');
    expect(await screen.findByText(v.submitted)).toBeTruthy();
    // الحالات منفصلة، والنتيجة الرسمية معلَّمة "تجريبي"
    expect(screen.getByText(v.official.verified)).toBeTruthy();
    expect(screen.getByText(`${v.optional} · ${v.mockTag}`)).toBeTruthy();
    expect(screen.queryByTestId('submit-verification')).toBeNull();
  });
});

describe('VerificationReviewScreen (verification team)', () => {
  const failedReq = draft({
    status: 'submitted', submittedBy: 'someone', automatedStatus: 'failed', officialStatus: 'not_found', deedNumber: 'FAKE-1',
    checks: [{ code: 'duplicate_deed', source: 'automated', result: 'fail', required: true, details: {}, isMock: false }],
  });
  const services = (req: VerificationRequest): ReviewServices & { decide: jest.Mock } => ({
    get: async () => ({ ok: true, data: req }),
    decide: jest.fn(async () => ({ ok: true as const, data: undefined })),
    documentUrl: async () => ({ ok: true, data: 'https://signed' }),
    property: async () => ({ ok: true, data: prop }),
  });

  it('cannot approve when mandatory checks failed; rejecting needs a reason', async () => {
    const s = services(failedReq);
    await wrap(<VerificationReviewScreen id="r1" services={s} />, fakeAuthBackend(VERIFIER));
    expect(await screen.findByText(v.cannotApprove)).toBeTruthy();
    expect(screen.getByText('FAKE-1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('approve'));
    expect(s.decide).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('reject'));
    expect(await screen.findByText(v.reasonRequired)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('decision-reason'), 'سند مكرر');
    await fireEvent.press(screen.getByTestId('reject'));
    expect(s.decide).toHaveBeenCalledWith('r1', 'rejected', 'سند مكرر');
    expect(await screen.findByText(v.decided)).toBeTruthy();
  });

  it('approves a passing request', async () => {
    const s = services({ ...failedReq, automatedStatus: 'passed', checks: [] });
    await wrap(<VerificationReviewScreen id="r1" services={s} />, fakeAuthBackend(VERIFIER));
    await fireEvent.press(await screen.findByTestId('approve'));
    expect(s.decide).toHaveBeenCalledWith('r1', 'approved', '');
  });

  it('is for the verification team only', async () => {
    await wrap(<VerificationReviewScreen id="r1" services={services(failedReq)} />);
    expect(await screen.findByText(v.notStaff)).toBeTruthy();
  });
});

describe('VerificationQueueScreen', () => {
  it('lists submitted requests for staff and opens one', async () => {
    const onOpen = jest.fn();
    const load = jest.fn(async () => ({
      ok: true as const,
      data: [{ id: 'r9', subject: 'property' as const, propertyTitle: { ar: 'شقة الطريف', en: 'x' }, city: 'sohar' as const, submitterName: 'مالك', status: 'submitted' as const, automatedStatus: 'passed' as const, officialStatus: 'verified' as const, humanStatus: 'pending' as const, documents: 2 }],
    }));
    await wrap(<VerificationQueueScreen load={load} onOpen={onOpen} />, fakeAuthBackend(VERIFIER));
    await fireEvent.press(await screen.findByTestId('queue-r9'));
    expect(onOpen).toHaveBeenCalledWith('r9');
    await fireEvent.press(screen.getByText(v.filters.rejected));
    expect(load).toHaveBeenLastCalledWith('rejected');
  });

  it('hides the queue from owners', async () => {
    const load = jest.fn();
    await wrap(<VerificationQueueScreen load={load} />);
    expect(await screen.findByText(v.notStaff)).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });
});

describe('verification in existing screens', () => {
  it('shows the verified badge with its scope on the listing page', async () => {
    await wrap(<PropertyDetailScreen id="mock-1" load={(id) => getPropertyById(id, { useMockData: true })} />);
    expect(await screen.findByTestId('verified-badge')).toBeTruthy();
    expect(screen.getByText(new RegExp(v.scope.official_registry.slice(0, 10)))).toBeTruthy();
  });

  it('explains that publishing needs verification and links to it', async () => {
    const onVerify = jest.fn();
    await wrap(
      <PropertyEditorScreen
        propertyId="p1"
        load={async () => ({ ok: true, data: prop })}
        update={async () => ({ ok: false, code: 'needs_verification' })}
        upload={async () => ({ ok: true, data: '' })}
        onVerify={onVerify}
      />,
    );
    await fireEvent.press(await screen.findByText(t.owner.status.published));
    await fireEvent.press(screen.getByTestId('save-property'));
    expect(await screen.findByText(v.publishBlocked)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('go-verify'));
    await waitFor(() => expect(onVerify).toHaveBeenCalledWith('p1'));
  });
});
