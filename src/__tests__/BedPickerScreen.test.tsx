import { fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { BedPickerScreen } from '@/screens/BedPickerScreen';
import { getBedAvailability, getBedLayout } from '@/services/beds';

const t = dictionaries.ar;
const MOCK = { useMockData: true };
const TODAY = new Date(Date.UTC(2026, 9, 9)); // أول خيار للدخول: 1 نوفمبر 2026

async function setup(propertyId = 'mock-2') {
  const loadAvailability = jest.fn((id: string, s: string, e: string) => getBedAvailability(id, s, e, MOCK));
  await render(
    <LocaleProvider initialLocale="ar">
      <BedPickerScreen propertyId={propertyId} today={TODAY} loadLayout={(id) => getBedLayout(id, MOCK)} loadAvailability={loadAvailability} />
    </LocaleProvider>,
  );
  return { loadAvailability };
}

const isDisabled = (id: string) => screen.getByTestId(`bed-${id}`).props.accessibilityState?.disabled;

describe('BedPickerScreen', () => {
  it('shows the ground floor plan with live availability for the default period (Nov 2026, one semester)', async () => {
    const { loadAvailability } = await setup();
    expect(await screen.findByText(t.beds.availableCount(5, 9))).toBeTruthy();
    expect(loadAvailability).toHaveBeenLastCalledWith('mock-2', '2026-11-01', '2027-03-01');
    expect(isDisabled('A-001-b1')).toBe(true); // محجوز
    expect(isDisabled('A-003-b4')).toBe(true); // صيانة
    expect(isDisabled('A-001-b3')).toBe(false);
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
  });

  it('selects a bed like a cinema seat and shows dates and total price', async () => {
    await setup();
    await screen.findByText(t.beds.availableCount(5, 9));
    await fireEvent.press(screen.getByTestId('bed-A-001-b3'));
    expect(screen.getByText(`${t.beds.bed('3')} · ${t.beds.room('001')} · ${t.beds.floorLabel(0)}`, { exact: false })).toBeTruthy();
    expect(screen.getByText(/1 نوفمبر 2026 ← 1 مارس 2027/)).toBeTruthy();
    expect(screen.getByText('180 ر.ع')).toBeTruthy(); // 45 × 4

    // الضغط مرة أخرى يلغي الاختيار
    await fireEvent.press(screen.getByTestId('bed-A-001-b3'));
    expect(screen.getByText(t.beds.selectPrompt)).toBeTruthy();
  });

  it('does not let you pick a booked bed', async () => {
    await setup();
    await screen.findByText(t.beds.availableCount(5, 9));
    await fireEvent.press(screen.getByTestId('bed-A-001-b1'));
    expect(screen.getByText(t.beds.selectPrompt)).toBeTruthy();
  });

  it('switches floors and buildings', async () => {
    await setup();
    await screen.findByText(t.beds.availableCount(5, 9));
    await fireEvent.press(screen.getByText(`${t.beds.floorLabel(1)} · 4`));
    expect(screen.getByTestId('floor-plan-mock-fA1')).toBeTruthy();
    await fireEvent.press(screen.getByText('المبنى ب'));
    expect(screen.getByTestId('floor-plan-mock-fB0')).toBeTruthy();
  });

  it('re-checks availability when the period changes and drops a bed that is no longer free', async () => {
    const { loadAvailability } = await setup();
    await screen.findByText(t.beds.availableCount(5, 9));
    await fireEvent.press(screen.getByText('مارس 2027'));
    await fireEvent.press(screen.getByText(t.beds.months(1)));
    expect(loadAvailability).toHaveBeenLastCalledWith('mock-2', '2027-03-01', '2027-04-01');
    await screen.findByText(t.beds.availableCount(6, 9)); // A-001-b2 تحرر في مارس
    await fireEvent.press(screen.getByTestId('bed-A-001-b2'));

    await fireEvent.press(screen.getByText('نوفمبر 2026'));
    expect(await screen.findByText(t.beds.selectionCleared)).toBeTruthy();
    expect(screen.getByText(t.beds.selectPrompt)).toBeTruthy();
  });

  it('keeps the request button disabled until sign-in exists (no fake booking)', async () => {
    await setup();
    await screen.findByText(t.beds.availableCount(5, 9));
    expect(screen.getByText(t.beds.sendRequestSoon)).toBeTruthy();
  });

  it('explains when the owner has not added a building plan', async () => {
    await setup('mock-1');
    expect(await screen.findByText(t.beds.noLayout)).toBeTruthy();
  });
});
