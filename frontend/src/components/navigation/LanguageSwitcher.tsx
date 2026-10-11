import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Globe } from 'lucide-react';
import { useTranslation, SupportedLanguage } from '../../i18n/I18nContext';

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, availableLanguages, currentLanguageMeta, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (code: SupportedLanguage) => {
    setLanguage(code);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button with Active Flag */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm ${
          isOpen
            ? 'bg-sky-600 text-white border-sky-400 shadow-sky-500/20'
            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 dark:border-slate-700'
        }`}
        title={t('header.language_switch_hint')}
        aria-expanded={isOpen}
      >
        <span className="text-sm leading-none">{currentLanguageMeta.flag}</span>
        <span className="text-[11px] font-bold uppercase">{currentLanguageMeta.code}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-white' : 'text-slate-400 dark:text-slate-500'
          }`}
        />
      </button>

      {/* Floating Language Selection Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-52 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl p-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 space-y-0.5">
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1 flex items-center gap-1.5">
            <Globe className="w-3 h-3 text-sky-500 dark:text-sky-400" />
            <span>{t('header.language_toggle')}</span>
          </div>

          {availableLanguages.map((item) => {
            const isSelected = item.code === language;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => handleSelect(item.code)}
                className={`w-full px-2.5 py-2 rounded-xl text-left transition flex items-center justify-between group ${
                  isSelected
                    ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 font-bold border border-sky-200/80 dark:border-sky-800/80'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base leading-none drop-shadow-sm">{item.flag}</span>
                  <div>
                    <div className="text-xs font-medium leading-tight">{item.nativeName}</div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
                      {item.name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold uppercase ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {item.code}
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
