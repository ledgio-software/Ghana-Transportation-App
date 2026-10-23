import { en, type TranslationKey, type Translations } from './en';
import { tw } from './tw';

/** Adding Ga, Ewe, Dagbani or Hausa later is a new file plus one line here; no screen changes. */
export const translations = { en, tw } satisfies Record<string, Translations>;

export type Language = keyof typeof translations;
export const LANGUAGES: readonly Language[] = ['en', 'tw'];
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', tw: 'Twi' };

export function translate(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const template = translations[lang][key] ?? en[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export type { TranslationKey, Translations };
