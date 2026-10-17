import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  ChevronDown,
  Sparkles,
  Network,
  Bell,
  Maximize2,
  RefreshCw,
  Settings,
  Calendar,
  Search,
  FileJson,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';

interface HeaderMenuDropdownProps {
  onOpenInitialSetup: () => void;
  onOpenDiscovery: () => void;
  onOpenBackupRestore: () => void;
  onOpenRolesModal: () => void;
  onOpenNotificationModal: () => void;
  onOpenSettings: () => void;
  onOpenMaintenance?: () => void;
  onOpenKiosk: () => void;
  onRefresh: () => void;
  // Deprecated/optional props to maintain backward compatibility
  onOpenWizard?: () => void;
  onOpenLogs?: () => void;
}

export const HeaderMenuDropdown: React.FC<HeaderMenuDropdownProps> = ({
  onOpenInitialSetup,
  onOpenDiscovery,
  onOpenBackupRestore,
  onOpenRolesModal,
  onOpenNotificationModal,
  onOpenSettings,
  onOpenMaintenance,
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
        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm cursor-pointer ${
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
          
          {/* Sezione 1: Topologia & Mappa */}
          <div className="pb-2 space-y-1">
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_topology') || 'Topologia & Mappa'}
            </div>

            {/* Configurazione Apparati */}
            <button
              onClick={() => handleAction(onOpenInitialSetup)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
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

            {/* Rilevamento Automatico Rete (Discovery) */}
            <button
              onClick={() => handleAction(onOpenDiscovery)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500 dark:text-amber-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Search className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-300 transition-colors">
                  {t('menu.network_discovery') || 'Scansione & Rilevamento Rete'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.network_discovery_desc') || 'Scansiona la subnet LAN e aggiungi apparati con 1 click'}
                </div>
              </div>
            </button>

            {/* Servizi DNS & DHCP */}
            <button
              onClick={() => handleAction(onOpenRolesModal)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
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
          </div>

          {/* Sezione 2: Configurazioni generali */}
          <div className="py-2 space-y-1">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_general_config') || 'Configurazioni generali'}
            </div>

            {/* Notifiche */}
            <button
              onClick={() => handleAction(onOpenNotificationModal)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-rose-600 dark:group-hover:text-rose-300 transition-colors">
                  {t('menu.notifications') || 'Notifiche'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.notifications_desc') || 'Email SMTP e Notifiche Push Web PWA'}
                </div>
              </div>
            </button>

            {/* Interventi programmati */}
            {onOpenMaintenance && (
              <button
                onClick={() => handleAction(onOpenMaintenance)}
                className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500 dark:text-purple-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                    {t('menu.scheduled_maintenance') || 'Interventi programmati'}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {t('menu.scheduled_maintenance_desc') || 'Pianifica manutenzioni e finestre di fermo'}
                  </div>
                </div>
              </button>
            )}

            {/* Impostazione Log Retention */}
            <button
              onClick={() => handleAction(onOpenSettings)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
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
          </div>

          {/* Sezione 3: Strumenti & Visualizzazione */}
          <div className="pt-2 space-y-1">
            <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {t('menu.section_tools')}
            </div>

            {/* Backup & Ripristino Plancia */}
            <button
              onClick={() => handleAction(onOpenBackupRestore)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-start gap-3 group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                <FileJson className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition-colors">
                  {t('menu.backup_restore') || 'Backup & Ripristino Plancia'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {t('menu.backup_restore_desc') || 'Esporta o ripristina la topologia e layout via JSON'}
                </div>
              </div>
            </button>

            {/* Schermo Intero (Fullscreen / Kiosk) */}
            <button
              onClick={() => handleAction(onOpenKiosk)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center gap-2.5 text-slate-700 dark:text-slate-200 group cursor-pointer"
            >
              <Maximize2 className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
              <span className="font-medium">{t('menu.fullscreen')}</span>
            </button>

            {/* Aggiorna Dati (Force Refresh) */}
            <button
              onClick={() => handleAction(onRefresh)}
              className="w-full px-3 py-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-slate-800/80 transition flex items-center gap-2.5 text-slate-700 dark:text-slate-200 group cursor-pointer"
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
