import type { LocaleCode } from '@platform/types';

import { createContext } from 'react';

import type { TranslationKey } from './messages';

export const LOCALE_STORAGE_KEY = 'platform.locale';

export interface I18nContextValue {
  locale: LocaleCode;
  t: (key: TranslationKey) => string;
  setLocale: (locale: LocaleCode) => void;
  applyPreferredLocale: (locale: LocaleCode) => void;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
