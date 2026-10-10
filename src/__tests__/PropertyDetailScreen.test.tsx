import { fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, Locale, LocaleProvider } from '@/i18n';
import { PropertyDetailScreen } from '@/screens/PropertyDetailScreen';
import { getPropertyById } from '@/services/properties';

const load = (id: string) => getPropertyById(id, { useMockData: true });
const renderIn = (id: string, locale: Locale = 'ar') =>
  render(
    <LocaleProvider initialLocale={locale}>
      <PropertyDetailScreen id={id} load={load} />
    </LocaleProvider>,
  );

describe('PropertyDetailScreen', () => {
  it('shows title, price, facts and description', async () => {
    const t = dictionaries.ar;
    await renderIn('mock-1');
    expect(await screen.findByText('شقة غرفتين قرب الكورنيش')).toBeTruthy();
    expect(screen.getByText(`220 ${t.currency} ${t.perMonth}`)).toBeTruthy();
    expect(screen.getByText('110 م²')).toBeTruthy();
    expect(screen.getByText(/قريبة من الكورنيش/)).toBeTruthy();
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
  });

  it('shows costs, included services, amenities and cancellation policy', async () => {
    const t = dictionaries.ar;
    await renderIn('mock-1');
    await screen.findByTestId('costs');
    expect(screen.getByText(t.features.costs.firstPayment)).toBeTruthy();
    expect(screen.getByText(t.features.sections.included)).toBeTruthy();
    expect(screen.getByText(t.features.sections.cancellation)).toBeTruthy();
  });

  it('hides rental costs for sale listings', async () => {
    await renderIn('mock-3', 'en');
    await screen.findByText('Modern Omani-style villa');
    expect(screen.queryByTestId('costs')).toBeNull();
  });

  it('renders in English', async () => {
    await renderIn('mock-3', 'en');
    expect(await screen.findByText('Modern Omani-style villa')).toBeTruthy();
    expect(screen.getByText('185,000 OMR')).toBeTruthy();
    expect(screen.getByText('Muscat, Al Azaiba')).toBeTruthy();
  });

  it('opens the bed picker for student housing', async () => {
    const onChooseBed = jest.fn();
    await render(
      <LocaleProvider initialLocale="ar">
        <PropertyDetailScreen id="mock-2" load={load} onChooseBed={onChooseBed} />
      </LocaleProvider>,
    );
    await fireEvent.press(await screen.findByText(dictionaries.ar.detail.chooseBed));
    expect(onChooseBed).toHaveBeenCalled();
  });

  it('does not offer bed selection for regular rentals', async () => {
    await renderIn('mock-1');
    await screen.findByText('شقة غرفتين قرب الكورنيش');
    expect(screen.queryByText(dictionaries.ar.detail.chooseBed)).toBeNull();
  });

  it('shows a not-found message for unknown ids', async () => {
    await renderIn('does-not-exist');
    expect(await screen.findByText(dictionaries.ar.detail.notFound)).toBeTruthy();
  });
});
