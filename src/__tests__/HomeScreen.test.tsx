import { fireEvent, render, screen } from '@testing-library/react-native';

import { mockProperties } from '@/data/mock/properties';
import { t } from '@/i18n';
import { HomeScreen } from '@/screens/HomeScreen';
import type { City } from '@/types/property';

const mockLoader = (city: City) =>
  Promise.resolve({ status: 'ok' as const, source: 'mock' as const, items: mockProperties.filter((p) => p.city === city && p.featured) });

describe('HomeScreen', () => {
  it('shows the three categories', async () => {
    await render(<HomeScreen loadFeatured={mockLoader} />);
    expect(screen.getByLabelText(t.categories.rent.title)).toBeTruthy();
    expect(screen.getByLabelText(t.categories.sale.title)).toBeTruthy();
    expect(screen.getByLabelText(t.categories.student.title)).toBeTruthy();
  });

  it('shows the mock badge and filters featured listings by city', async () => {
    await render(<HomeScreen loadFeatured={mockLoader} />);
    expect(await screen.findByTestId('property-mock-1')).toBeTruthy();
    expect(screen.getByText(t.mockBadge)).toBeTruthy();
    expect(screen.queryByTestId('property-mock-3')).toBeNull();

    await fireEvent.press(screen.getByText(t.cities.muscat));
    expect(await screen.findByTestId('property-mock-3')).toBeTruthy();
    expect(screen.queryByTestId('property-mock-1')).toBeNull();
  });

  it('tells the user honestly when the database is not configured', async () => {
    await render(<HomeScreen loadFeatured={() => Promise.resolve({ status: 'not_configured' })} />);
    expect(await screen.findByText(t.notConfigured)).toBeTruthy();
    expect(screen.queryByText(t.mockBadge)).toBeNull();
  });

  it('calls onCategory with the selected kind', async () => {
    const onCategory = jest.fn();
    await render(<HomeScreen loadFeatured={mockLoader} onCategory={onCategory} />);
    await fireEvent.press(screen.getByLabelText(t.categories.student.title));
    expect(onCategory).toHaveBeenCalledWith('student');
  });
});
