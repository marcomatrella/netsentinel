import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation, SupportedLanguage } from '../../i18n/I18nContext';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg p-0.5 text-xs shadow-sm">
      <button
        type="button"
        onClick={() => setLanguage('it')}
        className={`px-2 py-1 rounded-md font-bold transition flex items-center gap-1 ${
          language === 'it'
            ? 'bg-sky-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Imposta lingua: Italiano"
      >
        <span>🇮🇹</span>
        <span className="text-[11px]">IT</span>
      </button>

      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2 py-1 rounded-md font-bold transition flex items-center gap-1 ${
          language === 'en'
            ? 'bg-sky-600 text-white shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        title="Set language: English"
      >
        <span>🇬🇧</span>
        <span className="text-[11px]">EN</span>
      </button>
    </div>
  );
};

