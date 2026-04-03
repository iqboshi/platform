import type { LocaleCode } from '@platform/types';

import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import { type ReactNode, useMemo, useState } from 'react';

import { messages } from './messages';
import { I18nContext, LOCALE_STORAGE_KEY, type I18nContextValue } from './i18n-context';

function detectLocale(): LocaleCode {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'zh-CN' || stored === 'en-US') {
    return stored;
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(detectLocale);

  const setLocale = (nextLocale: LocaleCode) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  };

  const applyPreferredLocale = (nextLocale: LocaleCode) => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!stored) {
      setLocaleState(nextLocale);
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (key) => messages[locale][key] ?? messages['en-US'][key] ?? key,
      setLocale,
      applyPreferredLocale,
    }),
    [locale],
  );

  return (
    <I18nContext.Provider value={value}>
      <ConfigProvider
        locale={locale === 'zh-CN' ? zhCN : enUS}
        theme={{
          token: {
            colorPrimary: '#0f766e',
            borderRadius: 18,
            fontFamily: "'Aptos', 'Trebuchet MS', 'Segoe UI', sans-serif",
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </I18nContext.Provider>
  );
}
