import { render, screen } from '@testing-library/react-native';

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

  it('renders in English', async () => {
    await renderIn('mock-3', 'en');
    expect(await screen.findByText('Modern Omani-style villa')).toBeTruthy();
    expect(screen.getByText('185,000 OMR')).toBeTruthy();
    expect(screen.getByText('Muscat, Al Azaiba')).toBeTruthy();
  });

  it('marks bed selection as not yet available for student housing (no fake button)', async () => {
    const t = dictionaries.ar;
    await renderIn('mock-2');
    expect(await screen.findByText(t.detail.chooseBedSoon)).toBeTruthy();
  });

  it('shows a not-found message for unknown ids', async () => {
    await renderIn('does-not-exist');
    expect(await screen.findByText(dictionaries.ar.detail.notFound)).toBeTruthy();
  });
});
