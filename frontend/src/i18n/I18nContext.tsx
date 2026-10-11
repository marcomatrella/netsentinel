import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import itTranslations from './locales/it.json';
import enTranslations from './locales/en.json';

export type SupportedLanguage = 'it' | 'en';

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const STORAGE_KEY = 'netsentinel_lang';

const translationsMap: Record<SupportedLanguage, any> = {
  it: itTranslations,
  en: enTranslations,
};

function resolveInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'it' || saved === 'en') {
      return saved;
    }
    // Auto-detect from browser locale
    const browserLang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
    if (browserLang.startsWith('it')) {
      return 'it';
    }
  } catch (e) {
    console.warn('Could not read language from localStorage/navigator:', e);
  }
  // Default fallback is English
  return 'en';
}

const I18nContext = createContext<I18nContextType | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<SupportedLanguage>(resolveInitialLanguage);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      console.warn('Could not save language to localStorage:', e);
    }
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'it' ? 'en' : 'it');
  }, [language, setLanguage]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const getNested = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
      };

      // Try current language
      let text = getNested(translationsMap[language], key);

      // Fallback to English if missing
      if (text === undefined && language !== 'en') {
        text = getNested(translationsMap['en'], key);
      }

      // If still missing, return the key itself
      if (text === undefined) {
        return key;
      }

      // Replace {{param}} placeholders
      if (params && typeof text === 'string') {
        let result = text;
        Object.entries(params).forEach(([k, v]) => {
          result = result.split(`{{${k}}}`).join(String(v));
        });
        return result;
      }

      return String(text);
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return ctx;
}
