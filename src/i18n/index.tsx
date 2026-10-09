import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import * as Updates from 'expo-updates';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';

import { ar } from './ar';
import { en } from './en';
import type { Locale, LocalizedText, Strings } from './types';

export type { Locale, LocalizedText, Strings } from './types';

export const dictionaries: Record<Locale, Strings> = { ar, en };
const STORAGE_KEY = 'aqari.locale';

export const isRTL = (l: Locale) => l === 'ar';

/** لغة الجهاز إن كانت مدعومة، وإلا العربية. */
export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return code === 'en' ? 'en' : 'ar';
}

/** يختار النص المناسب من حقل ثنائي اللغة مع الرجوع للغة الأخرى إن كان فارغًا. */
export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] || text[locale === 'ar' ? 'en' : 'ar'];
}

function applyDirection(locale: Locale) {
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
    }
    return false;
  }
  if (I18nManager.isRTL === isRTL(locale)) return false;
  I18nManager.allowRTL(isRTL(locale));
  I18nManager.forceRTL(isRTL(locale));
  return true; // يتطلب إعادة تشغيل على الهاتف
}

interface LocaleContextValue {
  locale: Locale;
  t: Strings;
  setLocale: (l: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: 'ar', t: ar, setLocale: async () => {} });

export function LocaleProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? deviceLocale());

  useEffect(() => {
    if (initialLocale) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        const l: Locale = saved === 'en' || saved === 'ar' ? saved : deviceLocale();
        setLocaleState(l);
        if (applyDirection(l)) Updates.reloadAsync().catch(() => {});
      })
      .catch(() => applyDirection(locale));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(async (l: Locale) => {
    await AsyncStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
    if (applyDirection(l)) await Updates.reloadAsync().catch(() => {});
  }, []);

  const value = useMemo(() => ({ locale, t: dictionaries[locale], setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
export const useT = () => useContext(LocaleContext).t;
