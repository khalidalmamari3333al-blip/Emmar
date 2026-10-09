import { fireEvent, render, screen } from '@testing-library/react-native';

import { mockProperties } from '@/data/mock/properties';
import { ReactElement } from 'react';

import { dictionaries, Locale, LocaleProvider } from '@/i18n';
import { HomeScreen } from '@/screens/HomeScreen';
import type { City } from '@/types/property';

const mockLoader = (city: City) =>
  Promise.resolve({ status: 'ok' as const, source: 'mock' as const, data: mockProperties.filter((p) => p.city === city && p.featured) });

const t = dictionaries.ar;
const renderIn = (ui: ReactElement, locale: Locale = 'ar') => render(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('HomeScreen', () => {
  it('shows the three categories', async () => {
    await renderIn(<HomeScreen loadFeatured={mockLoader} />);
    expect(screen.getByLabelText(t.categories.rent.title)).toBeTruthy();
    expect(screen.getByLabelText(t.categories.sale.title)).toBeTruthy();
    expect(screen.getByLabelText(t.categories.student.title)).toBeTruthy();
  });

  it('shows the mock badge and filters featured listings by city', async () => {
    await renderIn(<HomeScreen loadFeatured={mockLoader} />);
    expect(await screen.findByTestId('property-mock-1')).toBeTruthy();
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
    expect(screen.queryByTestId('property-mock-3')).toBeNull();

    await fireEvent.press(screen.getByText(t.cities.muscat));
    expect(await screen.findByTestId('property-mock-3')).toBeTruthy();
    expect(screen.queryByTestId('property-mock-1')).toBeNull();
  });

  it('explains the product in three steps and labels demo mode clearly', async () => {
    await renderIn(<HomeScreen loadFeatured={mockLoader} />);
    expect(screen.getByText(t.how.title)).toBeTruthy();
    for (const step of t.how.steps) expect(screen.getByText(step.title)).toBeTruthy();
    expect(await screen.findByTestId('demo-banner')).toBeTruthy();
  });

  it('shows no demo banner for real listings', async () => {
    await renderIn(<HomeScreen loadFeatured={async () => ({ status: 'ok', source: 'live', data: [] })} />);
    await screen.findByText(t.emptyFeatured);
    expect(screen.queryByTestId('demo-banner')).toBeNull();
  });

  it('tells the user honestly when the database is not configured', async () => {
    await renderIn(<HomeScreen loadFeatured={() => Promise.resolve({ status: 'not_configured' })} />);
    expect(await screen.findByText(t.notConfigured)).toBeTruthy();
    expect(screen.queryByText(t.mockBadge)).toBeNull();
  });

  it('calls onCategory with the selected kind', async () => {
    const onCategory = jest.fn();
    await renderIn(<HomeScreen loadFeatured={mockLoader} onCategory={onCategory} />);
    await fireEvent.press(screen.getByLabelText(t.categories.student.title));
    expect(onCategory).toHaveBeenCalledWith('student');
  });

  it('renders fully in English, including listing titles', async () => {
    const en = dictionaries.en;
    await renderIn(<HomeScreen loadFeatured={mockLoader} />, 'en');
    expect(screen.getByText(en.heroTitle)).toBeTruthy();
    expect(screen.getByLabelText(en.categories.student.title)).toBeTruthy();
    expect(await screen.findByText('2-bedroom flat near the Corniche')).toBeTruthy();
    expect(screen.queryByText(t.heroTitle)).toBeNull();
  });
});
