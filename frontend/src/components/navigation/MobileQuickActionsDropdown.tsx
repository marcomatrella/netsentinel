import React, { useState, useRef, useEffect } from 'react';
import {
  MoreHorizontal,
  Edit3,
  Eye,
  ScrollText,
  Sun,
  Moon,
  Check,
  X,
} from 'lucide-react';
import { useTranslation, SupportedLanguage } from '../../i18n/I18nContext';
import { useTheme } from '../../theme/ThemeContext';

interface MobileQuickActionsDropdownProps {
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onOpenEventLogs: () => void;
}

export const MobileQuickActionsDropdown: React.FC<MobileQuickActionsDropdownProps> = ({
  isEditMode,
  onToggleEditMode,
  onOpenEventLogs,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage, availableLanguages, currentLanguageMeta } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const isDark = theme === 'dark';

  // Close on click outside
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

  // Close on Escape
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

  return (
    <div className="relative block sm:hidden" ref={dropdownRef}>
      {/* Mobile trigger button "..." */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg text-xs font-semibold transition flex items-center justify-center border shadow-sm ${
          isOpen
            ? 'bg-sky-600 text-white border-sky-400 shadow-sky-500/20'
            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
        }`}
        title={t('header.quick_actions')}
        aria-label={t('header.quick_actions')}
        aria-expanded={isOpen}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 max-w-[85vw] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-lg">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {t('header.quick_actions')}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {/* 1 - Modifica Plancia */}
            <button
              onClick={() => {
                onToggleEditMode();
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                isEditMode
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {isEditMode ? (
                  <Eye className="w-4 h-4 text-amber-500" />
                ) : (
                  <Edit3 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
                )}
                <span>{isEditMode ? t('header.view_live') : t('header.edit_canvas')}</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">
                {isEditMode ? t('header.live_view') : t('header.edit_mode')}
              </span>
            </button>

            {/* 2 - Log Eventi */}
            <button
              onClick={() => {
                onOpenEventLogs();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ScrollText className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <span>{t('header.event_logs')}</span>
            </button>

            {/* 3 - Dark / Light Mode */}
            <button
              onClick={() => toggleTheme()}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <div className="flex items-center gap-2.5">
                {isDark ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600" />
                )}
                <span>{t('header.theme_toggle')}</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {isDark ? t('header.theme_dark') : t('header.theme_light')}
              </span>
            </button>
          </div>

          {/* 4 - Selettore Lingua */}
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
              {t('header.language_toggle')} ({currentLanguageMeta.name})
            </span>
            <div className="grid grid-cols-5 gap-1">
              {availableLanguages.map((lang) => {
                const isSelected = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code);
                      setIsOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center p-1.5 rounded-lg border transition ${
                      isSelected
                        ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 text-sky-600 dark:text-sky-300 font-bold shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                    title={lang.name}
                  >
                    <span className="text-base leading-none mb-0.5">{lang.flag}</span>
                    <span className="text-[9px] uppercase font-mono">{lang.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
