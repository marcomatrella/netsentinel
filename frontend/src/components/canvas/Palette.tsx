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
} from 'lucide-react';
import { DeviceKind } from '../../types';

interface PaletteItem {
  kind: DeviceKind;
  label: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRoles: string[];
}

const PALETTE_ITEMS: PaletteItem[] = [
  { kind: 'wan_gateway', label: 'Internet / WAN', category: 'Infrastruttura', icon: Globe, defaultRoles: ['wan_provider'] },
  { kind: 'router', label: 'Router / Gateway', category: 'Infrastruttura', icon: RouterIcon, defaultRoles: ['gateway'] },
  { kind: 'switch', label: 'Switch Ethernet', category: 'Infrastruttura', icon: Network, defaultRoles: [] },
  { kind: 'access_point', label: 'Access Point Wi-Fi', category: 'Wireless', icon: Wifi, defaultRoles: [] },
  { kind: 'poe_injector', label: 'Iniettore PoE', category: 'Alimentazione', icon: Radio, defaultRoles: [] },
  { kind: 'ups', label: 'UPS Rack / Batteria', category: 'Alimentazione', icon: Zap, defaultRoles: [] },
  { kind: 'nas', label: 'NAS / Storage', category: 'Server & Servizi', icon: HardDrive, defaultRoles: ['dns_resolver', 'dhcp_server'] },
  { kind: 'server', label: 'Server / VM', category: 'Server & Servizi', icon: Server, defaultRoles: [] },
  { kind: 'smart_hub', label: 'Server Domotico (HA)', category: 'Server & Servizi', icon: Cpu, defaultRoles: ['service'] },
  { kind: 'client', label: 'Gruppo Client / TV', category: 'Dispositivi', icon: Smartphone, defaultRoles: [] },
];

interface PaletteProps {
  onAddNode?: (kind: DeviceKind, label: string, roles: string[]) => void;
}

export const Palette: React.FC<PaletteProps> = ({ onAddNode }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const onDragStart = (event: React.DragEvent, item: PaletteItem) => {
    event.dataTransfer.setData('application/reactflow/kind', item.kind);
    event.dataTransfer.setData('application/reactflow/label', item.label);
    event.dataTransfer.setData('application/reactflow/roles', JSON.stringify(item.defaultRoles));
    event.dataTransfer.effectAllowed = 'move';
  };

  const filtered = PALETTE_ITEMS.filter((item) =>
    item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-64 bg-white/95 dark:bg-slate-900/95 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full select-none">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
          Tavolozza Apparati
        </h2>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca apparato..."
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
        Trascina sulla tela o clicca per inserire
      </div>
    </div>
  );
};

