import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  ChevronDown,
  Sparkles,
  Network,
  Wand2,
  Mail,
  Maximize2,
  RefreshCw,
  ScrollText,
  Settings,
  Calendar,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface HeaderMenuDropdownProps {
  onOpenInitialSetup: () => void;
  onOpenRolesModal: () => void;
  onOpenWizard: () => void;
  onOpenNotificationModal: () => void;
  onOpenSettings: () => void;
  onOpenMaintenance?: () => void;
  onOpenLogs?: () => void;
  onOpenKiosk: () => void;
  onRefresh: () => void;
}

export const HeaderMenuDropdown: React.FC<HeaderMenuDropdownProps> = ({
  onOpenInitialSetup,
  onOpenRolesModal,
  onOpenWizard,
  onOpenNotificationModal,
  onOpenSettings,
  onOpenMaintenance,
  onOpenLogs,
  onOpenKiosk,
  onRefresh,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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

  const handleAction = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm ${
          isOpen
            ? 'bg-sky-600 text-white border-sky-400 shadow-sky-500/20'
            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600'
        }`}
        title={t('header.menu_tools')}
        aria-expanded={isOpen}
      >
        <Menu className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-sky-500 dark:text-sky-400'}`} />
        <span>{t('header.menu_tools')}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Flyout Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-84 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-700/90 rounded-2xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100 dark:divide-slate-800/80">
          
          {/* Section 1: Topologia & Setup */}
          <div className="pb-2 space-y-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_config')}
            </div>

            {/* Configurazione Apparati */}
            <button
              onClick={() => handleAction(onOpenInitialSetup)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-500 dark:text-sky-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition-colors">
                  {t('menu.devices_setup')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.devices_setup_desc')}
                </div>
              </div>
            </button>

            {/* Servizi DNS & DHCP */}
            <button
              onClick={() => handleAction(onOpenRolesModal)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-500 dark:text-cyan-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Network className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                  {t('menu.dns_dhcp_roles')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.dns_dhcp_roles_desc')}
                </div>
              </div>
            </button>

            {/* Wizard 8 Passi */}
            <button
              onClick={() => handleAction(onOpenWizard)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Wand2 className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                  {t('menu.wizard_8_steps')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.wizard_8_steps_desc')}
                </div>
              </div>
            </button>
          </div>

          {/* Section 2: Notifiche & Allarmi */}
          <div className="py-2 space-y-1">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_notifications')}
            </div>

            {/* Notifiche Email */}
            <button
              onClick={() => handleAction(onOpenNotificationModal)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Mail className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                  {t('menu.email_notifications')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.email_notifications_desc')}
                </div>
              </div>
            </button>
          </div>

          {/* Section 3: Visualizzazione & Strumenti */}
          <div className="pt-2 space-y-1">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_tools')}
            </div>

            {/* Registro Eventi & Log */}
            {onOpenLogs && (
              <button
                onClick={() => handleAction(onOpenLogs)}
                className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center gap-2.5 text-slate-700 dark:text-slate-200 group"
              >
                <ScrollText className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" />
                <span className="font-medium">{t('header.event_logs')}</span>
              </button>
            )}

            {/* Impostazioni Sistema & Retention */}
            <button
              onClick={() => handleAction(onOpenSettings)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Settings className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 transition-colors">
                  {t('menu.system_settings')}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.system_settings_desc')}
                </div>
              </div>
            </button>

            {/* Manutenzioni Programmate & Riavvii */}
            {onOpenMaintenance && (
              <button
                onClick={() => handleAction(onOpenMaintenance)}
                className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500 dark:text-purple-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                    {t('menu.scheduled_maintenance') || 'Manutenzioni Programmate'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t('menu.scheduled_maintenance_desc') || 'Pianifica riavvii e stop senza allarmi'}
                  </div>
                </div>
              </button>
            )}

            {/* Fullscreen / Kiosk */}
            <button
              onClick={() => handleAction(onOpenKiosk)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center gap-2.5 text-slate-700 dark:text-slate-200 group"
            >
              <Maximize2 className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              <span className="font-medium">{t('menu.fullscreen')}</span>
            </button>

            {/* Force Refresh */}
            <button
              onClick={() => handleAction(onRefresh)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center gap-2.5 text-slate-700 dark:text-slate-200 group"
            >
              <RefreshCw className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              <span className="font-medium">{t('menu.force_refresh')}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
