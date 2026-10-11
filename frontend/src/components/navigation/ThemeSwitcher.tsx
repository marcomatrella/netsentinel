import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useTranslation } from '../../i18n/I18nContext';

export const ThemeSwitcher: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 dark:border-slate-700"
      title={isDark ? t('header.theme_switch_to_light') : t('header.theme_switch_to_dark')}
      aria-label={isDark ? t('header.theme_switch_to_light') : t('header.theme_switch_to_dark')}
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline text-[11px] text-slate-300">{t('header.theme_dark')}</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-indigo-600" />
          <span className="hidden sm:inline text-[11px] text-slate-700">{t('header.theme_light')}</span>
        </>
      )}
    </button>
  );
};

