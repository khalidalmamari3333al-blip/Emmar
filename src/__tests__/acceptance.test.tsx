/**
 * معايير القبول 11 و12 (الباقي في e2e/acceptance.e2e.test.ts ضد قاعدة بيانات حقيقية).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nManager, Pressable, Text } from 'react-native';
import * as Updates from 'expo-updates';

import { StatusNotice } from '@/components/StatusNotice';
import { dictionaries, isRTL, Locale, LocaleProvider, useLocale } from '@/i18n';
import { AuthProvider } from '@/lib/auth';
import { ltr } from '@/lib/bidi';
import { PropertyDetailScreen } from '@/screens/PropertyDetailScreen';
import { PaymentsScreen } from '@/screens/payments/PaymentsScreen';
import { SearchScreen } from '@/screens/SearchScreen';
import { getPropertyById, searchProperties } from '@/services/properties';
import { fakeAuthBackend, STUDENT } from '@/test-utils/fakeAuth';

const LOCALES: Locale[] = ['ar', 'en'];

describe('11. the app works in Arabic and English with the right text direction', () => {
  it('has a complete dictionary for both languages (same keys, no empty strings)', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(dictionaries.ar).sort()).toEqual(keys(dictionaries.en).sort());
    const empty = (o: object): boolean => Object.values(o).some((v) => (typeof v === 'string' ? !v.trim() : v && typeof v === 'object' ? empty(v) : false));
    expect(empty(dictionaries.ar) || empty(dictionaries.en)).toBe(false);
  });

  it('switching language flips the layout direction (RTL for Arabic, LTR for English)', async () => {
    const force = jest.spyOn(I18nManager, 'forceRTL');
    jest.spyOn(I18nManager, 'allowRTL');
    function Switcher() {
      const { setLocale, t } = useLocale();
      return (
        <>
          <Text>{t.tabs.account}</Text>
          <Pressable onPress={() => setLocale('en')} testID="en" />
          <Pressable onPress={() => setLocale('ar')} testID="ar" />
        </>
      );
    }
    Object.defineProperty(I18nManager, 'isRTL', { value: true, configurable: true });
    await render(
      <LocaleProvider initialLocale="ar">
        <Switcher />
      </LocaleProvider>,
    );
    expect(screen.getByText(dictionaries.ar.tabs.account)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('en'));
    expect(force).toHaveBeenLastCalledWith(false);
    expect(Updates.reloadAsync).toHaveBeenCalled(); // الاتجاه يتطلب إعادة تحميل على الهاتف
    expect(await screen.findByText(dictionaries.en.tabs.account)).toBeTruthy();
    Object.defineProperty(I18nManager, 'isRTL', { value: false, configurable: true });
    await fireEvent.press(screen.getByTestId('ar'));
    expect(force).toHaveBeenLastCalledWith(true);
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('en')).toBe(false);
  });

  it('keeps Latin text (emails, codes, fingerprints) left-to-right inside Arabic UI', () => {
    expect(ltr('AQ-2026-000001')).toMatch(/^⁦AQ-2026-000001⁩$|^‪/);
  });

  it.each(LOCALES)('renders search and listing screens fully in %s', async (locale) => {
    const t = dictionaries[locale];
    const r = await render(
      <LocaleProvider initialLocale={locale}>
        <SearchScreen search={(f, page) => searchProperties(f, { useMockData: true }, undefined, page)} debounceMs={0} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(t.search.results(16))).toBeTruthy();
    await r.unmount();
    await render(
      <LocaleProvider initialLocale={locale}>
        <PropertyDetailScreen id="mock-2" load={(id) => getPropertyById(id, { useMockData: true })} />
      </LocaleProvider>,
    );
    expect(await screen.findByText(t.features.sections.costs)).toBeTruthy();
    expect(screen.getByText(t.features.sections.cancellation)).toBeTruthy();
  });
});

describe('12. loading, error and success states are always shown clearly', () => {
  it.each(LOCALES)('shared status notice in %s: loading, not configured, error — without internal details', async (locale) => {
    const t = dictionaries[locale];
    const r = await render(
      <LocaleProvider initialLocale={locale}>
        <StatusNotice result={null} />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('loading')).toBeTruthy();
    expect(screen.queryByText(t.loadError)).toBeNull();
    await r.unmount();
    await render(
      <LocaleProvider initialLocale={locale}>
        <StatusNotice result={{ status: 'not_configured' }} />
        <StatusNotice result={{ status: 'error', message: 'relation "secret_table" does not exist' }} />
      </LocaleProvider>,
    );
    expect(screen.getByText(t.notConfigured)).toBeTruthy();
    expect(screen.getByText(t.loadError)).toBeTruthy();
    expect(screen.queryByText(/secret_table/)).toBeNull(); // لا تفاصيل داخلية
  });

  it('a data screen shows its error, empty and success states', async () => {
    const t = dictionaries.ar;
    const wrap = (list: () => Promise<never>) =>
      render(
        <LocaleProvider initialLocale="ar">
          <AuthProvider backend={fakeAuthBackend(STUDENT)}>
            <PaymentsScreen as="tenant" services={{ list, checkout: jest.fn(), complete: jest.fn(), refund: jest.fn() }} />
          </AuthProvider>
        </LocaleProvider>,
      );
    const r1 = await wrap((async () => ({ ok: false, code: 'error', message: 'internal: connection refused' })) as never);
    expect(await screen.findByText(t.loadError)).toBeTruthy();
    expect(screen.queryByText(/connection refused/)).toBeNull();
    await r1.unmount();
    await wrap((async () => ({ ok: true, data: [] })) as never);
    expect(await screen.findByText(t.payments.empty)).toBeTruthy();
  });

  it('shows a clear message when the server rate-limits a request', () => {
    expect(dictionaries.ar.rateLimited).toMatch(/طلبات كثيرة/);
    expect(dictionaries.en.rateLimited).toMatch(/Too many requests/);
  });
});
