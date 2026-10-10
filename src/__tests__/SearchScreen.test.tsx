import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { dictionaries, LocaleProvider } from '@/i18n';

import { mockProperties } from '@/data/mock/properties';
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
    expect(await screen.findByText(t.search.results(16))).toBeTruthy();
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
  });

  it('starts from the category passed in (e.g. from the home screen)', async () => {
    const { search } = await setup({ kind: 'student' });
    expect(await screen.findByTestId('property-mock-2')).toBeTruthy();
    expect(screen.getByText(t.search.results(3))).toBeTruthy();
    expect(lastFilters(search)).toEqual({ kind: 'student' });
    // لا معنى لفلتر غرف النوم في السكن الطلابي
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    expect(screen.getByTestId('filter-city')).toBeTruthy();
    expect(screen.queryByTestId('filter-bedrooms')).toBeNull();
  });

  it('filters by city and kind chips', async () => {
    const { search } = await setup();
    await screen.findByText(t.search.results(16));
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    await fireEvent.press(screen.getByText(t.cities.muscat));
    await fireEvent.press(screen.getByText(t.categories.sale.title));
    expect(await screen.findByText(t.search.results(4))).toBeTruthy();
    expect(screen.getByTestId('property-mock-3')).toBeTruthy();
    expect(lastFilters(search)).toEqual({ city: 'muscat', kind: 'sale' });
  });

  it('applies text and price filters, and can reset them', async () => {
    await setup();
    await screen.findByText(t.search.results(16));
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    await fireEvent.changeText(screen.getByLabelText(t.search.maxPrice), '٢٠٠');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(5))).toBeTruthy(); // 45، 55، 60، 150، 180

    await fireEvent.press(screen.getByText(t.search.reset));
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(16))).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText(t.search.placeholder), 'الخوير');
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(await screen.findByText(t.search.results(1))).toBeTruthy();
    expect(screen.getByTestId('property-mock-4')).toBeTruthy();
  });

  it('keeps the screen simple: extra filters stay hidden and show how many are active', async () => {
    await setup({ city: 'muscat', minBedrooms: 2 });
    await screen.findByTestId('toggle-filters');
    expect(screen.queryByTestId('filter-city')).toBeNull();
    expect(screen.getByText(t.search.moreFilters(2))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    expect(screen.getByTestId('filter-city')).toBeTruthy();
    expect(screen.getByText(t.search.hideFilters)).toBeTruthy();
  });

  it('filters by included services and amenities (multi-select)', async () => {
    const { search } = await setup({ kind: 'student' });
    await screen.findByText(t.search.results(3));
    await fireEvent.press(screen.getByTestId('toggle-filters'));
    await fireEvent.press(screen.getByText(t.features.utilities.internet));
    await fireEvent.press(screen.getByText(t.features.amenities.study_room));
    expect(lastFilters(search)).toEqual({ kind: 'student', utilities: ['internet'], amenities: ['study_room'] });
    expect(await screen.findByText(t.search.results(3))).toBeTruthy();
    await fireEvent.press(screen.getByText(t.features.landmarks.squ));
    expect(await screen.findByText(t.search.results(1))).toBeTruthy();
    expect(screen.getByTestId('property-mock-15')).toBeTruthy();
  });

  it('loads the next page when scrolling to the end', async () => {
    const make = (n: number, from: number) =>
      Array.from({ length: n }, (_, i) => ({ ...mockProperties[0], id: `p-${from + i}` }));
    const search = jest.fn(async (_f: SearchFilters, page = 0) => ({ status: 'ok' as const, source: 'live' as const, data: page === 0 ? make(20, 0) : page === 1 ? make(5, 20) : [] }));
    await render(
      <LocaleProvider initialLocale="ar">
        <SearchScreen search={search} debounceMs={0} />
      </LocaleProvider>,
    );
    await screen.findByText(t.search.results(20));
    const list = screen.getByTestId('search-results');
    await fireEvent(list, 'onEndReached');
    expect(search).toHaveBeenLastCalledWith({}, 1);
    expect(await screen.findByText(t.search.results(25))).toBeTruthy();
    await fireEvent(list, 'onEndReached'); // آخر صفحة كانت أقل من 20 ← لا مزيد
    expect(search.mock.calls.filter((c) => c[1] === 2)).toHaveLength(0);
  });

  it('shows an empty state when nothing matches', async () => {
    await setup({ minBedrooms: 7, kind: 'rent' });
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
