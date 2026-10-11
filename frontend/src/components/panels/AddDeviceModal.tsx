import React, { useState } from 'react';
import {
  X,
  Plus,
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
  Shield,
  Settings,
} from 'lucide-react';
import { Device, DeviceKind } from '../../types';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (device: Device) => void;
}

const DEVICE_KINDS: Array<{
  kind: DeviceKind;
  label: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRoles: string[];
  placeholderIp: string;
}> = [
  { kind: 'router', label: 'Router / Gateway', category: 'Infrastruttura', icon: RouterIcon, defaultRoles: ['dhcp_server', 'dns_resolver'], placeholderIp: '192.168.1.1' },
  { kind: 'switch', label: 'Switch di Rete (Managed / PoE)', category: 'Infrastruttura', icon: Network, defaultRoles: [], placeholderIp: '192.168.1.2' },
  { kind: 'access_point', label: 'Access Point Wi-Fi', category: 'Wireless', icon: Wifi, defaultRoles: [], placeholderIp: '192.168.1.20' },
  { kind: 'nas', label: 'NAS / Storage Server', category: 'Server', icon: HardDrive, defaultRoles: [], placeholderIp: '192.168.1.50' },
  { kind: 'ups', label: 'UPS Gruppo Continuità', category: 'Alimentazione', icon: Zap, defaultRoles: ['power_provider'], placeholderIp: '192.168.1.10' },
  { kind: 'server', label: 'Server / Hypervisor (Proxmox)', category: 'Server', icon: Server, defaultRoles: [], placeholderIp: '192.168.1.60' },
  { kind: 'smart_hub', label: 'Server Domotico (Home Assistant)', category: 'IoT', icon: Cpu, defaultRoles: [], placeholderIp: '192.168.1.70' },
  { kind: 'poe_injector', label: 'Iniettore PoE', category: 'Alimentazione', icon: Radio, defaultRoles: [], placeholderIp: '' },
  { kind: 'service', label: 'Servizio di Rete (DNS Sinkhole)', category: 'Servizi', icon: Shield, defaultRoles: ['dns_resolver'], placeholderIp: '192.168.1.53' },
  { kind: 'client', label: 'Client / Workstation / Camera', category: 'Dispositivi', icon: Smartphone, defaultRoles: [], placeholderIp: '192.168.1.100' },
  { kind: 'wan_gateway', label: 'Internet / WAN Upstream', category: 'Infrastruttura', icon: Globe, defaultRoles: ['wan_provider'], placeholderIp: '192.168.1.254' },
  { kind: 'custom', label: 'Apparato Personalizzato', category: 'Altro', icon: Settings, defaultRoles: [], placeholderIp: '192.168.1.99' },
];

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ isOpen, onClose, onAddDevice }) => {
  const [kind, setKind] = useState<DeviceKind>('switch');
  const [name, setName] = useState<string>('');
  const [ip, setIp] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [criticality, setCriticality] = useState<number>(3);
  const [isVantagePoint, setIsVantagePoint] = useState<boolean>(false);
  const [isDhcpServer, setIsDhcpServer] = useState<boolean>(false);
  const [isDnsResolver, setIsDnsResolver] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentKindConfig = DEVICE_KINDS.find((k) => k.kind === kind) || DEVICE_KINDS[0];

  const handleKindSelect = (selectedKind: DeviceKind) => {
    setKind(selectedKind);
    const cfg = DEVICE_KINDS.find((k) => k.kind === selectedKind);
    if (cfg && !ip) {
      setIp(cfg.placeholderIp);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || currentKindConfig.label;
    const deviceId = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-') + '-' + Math.floor(100 + Math.random() * 900);

    const roles: string[] = [...currentKindConfig.defaultRoles];
    if (isVantagePoint && !roles.includes('vantage_point')) roles.push('vantage_point');
    if (isDhcpServer && !roles.includes('dhcp_server')) roles.push('dhcp_server');
    if (isDnsResolver && !roles.includes('dns_resolver')) roles.push('dns_resolver');

    const newDev: Device = {
      id: deviceId,
      name: trimmedName,
      kind,
      location: location.trim() || 'Rete Principale',
      criticality,
      addresses: { ip: ip.trim() || undefined },
      tags: [],
      roles,
      status: 'ok',
      status_since: new Date().toISOString(),
      interfaces: [],
    };

    onAddDevice(newDev);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-sm">Aggiungi Nuovo Apparato di Rete</h2>
              <p className="text-[11px] text-slate-400">Configura un dispositivo general-purpose per il monitoraggio</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Scegli Categoria Apparato */}
          <div>
            <label className="block font-medium text-slate-300 mb-2">1. Seleziona il tipo di apparato:</label>
            <div className="grid grid-cols-3 gap-2">
              {DEVICE_KINDS.map((k) => {
                const Icon = k.icon;
                const isSelected = kind === k.kind;
                return (
                  <button
                    key={k.kind}
                    type="button"
                    onClick={() => handleKindSelect(k.kind)}
                    className={`flex items-center gap-2 p-2 rounded-xl border text-left transition ${
                      isSelected
                        ? 'bg-sky-600/20 border-sky-500 text-sky-200 shadow-sm'
                        : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-400' : 'text-slate-500'}`} />
                    <span className="truncate font-medium">{k.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nome e IP */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Nome Dispositivo:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`es. ${currentKindConfig.label}`}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                required
              />
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">Indirizzo IP primario:</label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder={currentKindConfig.placeholderIp}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Posizione e Criticità */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-slate-300 mb-1">Posizione / Stanza / Rack:</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="es. Rack Salotto, Studio, Mansarda"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">Livello di Criticità:</label>
              <select
                value={criticality}
                onChange={(e) => setCriticality(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value={1}>1 — Bassa (Periferiche, Smart plug)</option>
                <option value={2}>2 — Media (Client, PC secondari)</option>
                <option value={3}>3 — Importante (Access Point, Smart Home)</option>
                <option value={4}>4 — Alta (NAS Storage, Server Proxmox)</option>
                <option value={5}>5 — Critica (Switch Core, Gateway, UPS)</option>
              </select>
            </div>
          </div>

          {/* Ruoli di Rete Avanzati */}
          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-2">
            <span className="block font-medium text-slate-300">Ruoli & Servizi Forniti:</span>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={isVantagePoint}
                  onChange={(e) => setIsVantagePoint(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>Punto di Monitor (Vantage Point)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={isDhcpServer}
                  onChange={(e) => setIsDhcpServer(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>Server DHCP</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={isDnsResolver}
                  onChange={(e) => setIsDnsResolver(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>Server DNS</span>
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Aggiungi alla Topologia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

