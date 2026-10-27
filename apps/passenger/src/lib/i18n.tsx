import { LANGUAGES, type Language, type TranslationKey, translate } from '@gta/shared';
import { getLocales } from 'expo-localization';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { readSetting, writeSetting } from './storage';

interface I18n {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLanguage(): Language {
  const saved = readSetting('language');
  if (saved && (LANGUAGES as readonly string[]).includes(saved)) return saved as Language;
  // Akan/Twi devices report "ak" or "tw".
  const deviceLang = getLocales()[0]?.languageCode;
  return deviceLang === 'ak' || deviceLang === 'tw' ? 'tw' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(initialLanguage);

  const setLang = useCallback((next: Language) => {
    writeSetting('language', next);
    setLangState(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (key, params) => translate(lang, key, params) }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Short date in the user's language, Accra time (stored as UTC, shown in Africa/Accra). */
/** "3:40 pm" in Ghana time. */
export function formatTime(date: Date, lang: Language): string {
  return date.toLocaleTimeString(lang === 'tw' ? 'en-GH' : 'en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Accra',
  });
}

export function formatDate(iso: string, lang: Language): string {
  return new Date(iso).toLocaleDateString(lang === 'tw' ? 'en-GH' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Africa/Accra',
  });
}
