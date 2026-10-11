import React, { useState } from 'react';
import {
  Globe,
  Router as RouterIcon,
  Network,
  Wifi,
  Radio,
  HardDrive,
  Server,
  Cpu,
  Zap,
  Smartphone,
  Search,
  Flame,
  Camera,
  Video,
  Printer,
  Plug,
  Rss,
  Gauge,
} from 'lucide-react';
import { DeviceKind } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface PaletteItemDef {
  kind: DeviceKind;
  labelKey: string;
  categoryKey: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRoles: string[];
}

const PALETTE_DEFINITIONS: PaletteItemDef[] = [
  { kind: 'wan_gateway', labelKey: 'palette.items.wan_gateway', categoryKey: 'palette.cat_infrastructure', icon: Globe, defaultRoles: ['wan_provider'] },
  { kind: 'modem', labelKey: 'palette.items.modem', categoryKey: 'palette.cat_infrastructure', icon: Rss, defaultRoles: ['wan_provider'] },
  { kind: 'firewall', labelKey: 'palette.items.firewall', categoryKey: 'palette.cat_infrastructure', icon: Flame, defaultRoles: ['gateway'] },
  { kind: 'router', labelKey: 'palette.items.router', categoryKey: 'palette.cat_infrastructure', icon: RouterIcon, defaultRoles: ['gateway'] },
  { kind: 'switch', labelKey: 'palette.items.switch', categoryKey: 'palette.cat_infrastructure', icon: Network, defaultRoles: [] },
  { kind: 'access_point', labelKey: 'palette.items.access_point', categoryKey: 'palette.cat_wireless', icon: Wifi, defaultRoles: [] },
  { kind: 'poe_injector', labelKey: 'palette.items.poe_injector', categoryKey: 'palette.cat_power', icon: Radio, defaultRoles: [] },
  { kind: 'ups', labelKey: 'palette.items.ups', categoryKey: 'palette.cat_power', icon: Zap, defaultRoles: ['power_provider'] },
  { kind: 'smart_plug', labelKey: 'palette.items.smart_plug', categoryKey: 'palette.cat_power', icon: Plug, defaultRoles: [] },
  { kind: 'nas', labelKey: 'palette.items.nas', categoryKey: 'palette.cat_servers_services', icon: HardDrive, defaultRoles: ['dns_resolver', 'dhcp_server'] },
  { kind: 'server', labelKey: 'palette.items.server', categoryKey: 'palette.cat_servers_services', icon: Server, defaultRoles: [] },
  { kind: 'smart_hub', labelKey: 'palette.items.smart_hub', categoryKey: 'palette.cat_servers_services', icon: Cpu, defaultRoles: ['service'] },
  { kind: 'camera', labelKey: 'palette.items.camera', categoryKey: 'palette.cat_surveillance', icon: Camera, defaultRoles: [] },
  { kind: 'nvr', labelKey: 'palette.items.nvr', categoryKey: 'palette.cat_surveillance', icon: Video, defaultRoles: [] },
  { kind: 'printer', labelKey: 'palette.items.printer', categoryKey: 'palette.cat_devices', icon: Printer, defaultRoles: [] },
  { kind: 'sensor', labelKey: 'palette.items.sensor', categoryKey: 'palette.cat_devices', icon: Gauge, defaultRoles: [] },
  { kind: 'client', labelKey: 'palette.items.client', categoryKey: 'palette.cat_devices', icon: Smartphone, defaultRoles: [] },
];

interface PaletteProps {
  onAddNode?: (kind: DeviceKind, label: string, roles: string[]) => void;
}

export const Palette: React.FC<PaletteProps> = ({ onAddNode }) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');

  const items = PALETTE_DEFINITIONS.map((def) => ({
    ...def,
    label: t(def.labelKey),
    category: t(def.categoryKey),
  }));

  const onDragStart = (event: React.DragEvent, item: { kind: DeviceKind; label: string; defaultRoles: string[] }) => {
    event.dataTransfer.setData('application/reactflow/kind', item.kind);
    event.dataTransfer.setData('application/reactflow/label', item.label);
    event.dataTransfer.setData('application/reactflow/roles', JSON.stringify(item.defaultRoles));
    event.dataTransfer.effectAllowed = 'move';
  };

  const filtered = items.filter((item) =>
    item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-64 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full select-none">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
          {t('palette.title')}
        </h2>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('palette.search_placeholder')}
            className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700/80 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
        {filtered.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.kind}
              draggable
              onDragStart={(e) => onDragStart(e, item)}
              onClick={() => onAddNode && onAddNode(item.kind, item.label, item.defaultRoles)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-sky-400 dark:hover:border-sky-500/50 cursor-grab active:cursor-grabbing transition text-left group"
            >
              <div className="p-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 text-sky-500 dark:text-sky-400 group-hover:text-sky-600 dark:group-hover:text-sky-300 shadow-sm">
                <Icon className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <div className="text-xs font-medium text-slate-800 dark:text-slate-200 group-hover:text-sky-600 dark:group-hover:text-white truncate">
                  {item.label}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                  {item.category}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 text-center">
        {t('palette.footer_hint')}
      </div>
    </div>
  );
};
