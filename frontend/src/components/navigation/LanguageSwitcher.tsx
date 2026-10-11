import React from 'react';
import { useTranslation } from '../../i18n/I18nContext';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useTranslation();

  const toggleLanguage = () => {
    setLanguage(language === 'it' ? 'en' : 'it');
  };

  const isItalian = language === 'it';

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 dark:border-slate-700"
      title={isItalian ? 'Lingua: Italiano (clicca per Inglese)' : 'Language: English (click for Italian)'}
      aria-label={t('header.language_toggle')}
    >
      <span className="text-sm leading-none">{isItalian ? '🇮🇹' : '🇬🇧'}</span>
      <span className="text-[11px] font-bold">{isItalian ? 'IT' : 'EN'}</span>
    </button>
  );
};
