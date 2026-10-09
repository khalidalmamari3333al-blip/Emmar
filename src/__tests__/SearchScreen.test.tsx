import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';
import { parsePrice, SearchScreen } from '@/screens/SearchScreen';
import { searchProperties } from '@/services/properties';
import type { SearchFilters } from '@/types/property';

const t = dictionaries.ar;
const MOCK = { useMockData: true };

async function setup(initialFilters?: SearchFilters) {
  const search = jest.fn((f: SearchFilters) => searchProperties(f, MOCK));
  const onOpen = jest.fn();
  const utils = await render(
    <LocaleProvider initialLocale="ar">
      <SearchScreen initialFilters={initialFilters} search={search} onOpen={onOpen} debounceMs={0} />
    </LocaleProvider>,
  );
  return { search, onOpen, ...utils };
}

const lastFilters = (search: jest.Mock) => search.mock.calls.at(-1)?.[0];

describe('SearchScreen', () => {
  it('shows all listings with a result count and the demo badge', async () => {
    await setup();
    expect(await screen.findByText(t.search.results(5))).toBeTruthy();
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
  });

  it('starts from the category passed in (e.g. from the home screen)', async () => {
    const { search } = await setup({ kind: 'student' });
    expect(await screen.findByTestId('property-mock-2')).toBeTruthy();
    expect(screen.getByText(t.search.results(1))).toBeTruthy();
    expect(lastFilters(search)).toEqual({ kind: 'student' });
    // لا معنى لفلتر غرف النوم في السكن الطلابي
    expect(screen.queryByTestId('filter-bedrooms')).toBeNull();
  });

  it('filters by city and kind chips', async () => {
    const { search } = await setup();
    await screen.findByText(t.search.results(5));
    await fireEvent.press(screen.getByText(t.cities.muscat));
    await fireEvent.press(screen.getByText(t.categories.sale.title));
    expect(await screen.findByText(t.search.results(1))).toBeTruthy();
    expect(screen.getByTestId('property-mock-3')).toBeTruthy();
    expect(lastFilters(search)).toEqual({ city: 'muscat', kind: 'sale' });
  });

  it('applies text and price filters, and can reset them', async () => {
    await setup();
    await screen.findByText(t.search.results(5));
    await fireEvent.changeText(screen.getByLabelText(t.search.maxPrice), '٢٠٠');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(2))).toBeTruthy(); // 45 و 180

    await fireEvent.press(screen.getByText(t.search.reset));
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(5))).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.search.placeholder), 'الخوير');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(1))).toBeTruthy();
    expect(screen.getByTestId('property-mock-4')).toBeTruthy();
  });

  it('shows an empty state when nothing matches', async () => {
    await setup({ minBedrooms: 4, kind: 'rent' });
    expect(await screen.findByText(t.search.empty)).toBeTruthy();
  });

  it('opens a property when tapped', async () => {
    const { onOpen } = await setup();
    await fireEvent.press(await screen.findByTestId('property-mock-1'));
    expect(onOpen).toHaveBeenCalledWith('mock-1');
  });

  it('is honest when the database is not connected', async () => {
    await render(
      <LocaleProvider initialLocale="ar">
        <SearchScreen search={() => Promise.resolve({ status: 'not_configured' })} debounceMs={0} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(t.notConfigured)).toBeTruthy();
  });
});

describe('parsePrice', () => {
  it('parses Western and Arabic-Indic digits and ignores junk', () => {
    expect(parsePrice('250')).toBe(250);
    expect(parsePrice('٢٥٠')).toBe(250);
    expect(parsePrice('1,500')).toBe(1500);
    expect(parsePrice('')).toBeUndefined();
    expect(parsePrice('abc')).toBeUndefined();
  });
});
