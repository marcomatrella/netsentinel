import React, { useState, useEffect } from 'react';
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
  Flame,
  Camera,
  Video,
  Printer,
  Plug,
  Rss,
  Gauge,
  Activity,
  CheckCircle2,
  Palette as PaletteIcon,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceKind } from '../../types';
import { PRESET_COLORS, getDefaultColorForKind, getColorConfig } from '../../constants/colors';
import { createCheck, quickPing } from '../../api/client';

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
  defaultPort?: number;
  portLabel?: string;
  defaultHealthUrl?: string;
}> = [
  { kind: 'router', label: 'Router / Gateway', category: 'Infrastruttura', icon: RouterIcon, defaultRoles: ['gateway', 'dhcp_server', 'dns_resolver'], placeholderIp: '192.168.1.1', defaultPort: 443, portLabel: 'Porta Web GUI / SSL (es. 443/80)' },
  { kind: 'firewall', label: 'Firewall (pfSense/OPNsense)', category: 'Infrastruttura', icon: Flame, defaultRoles: ['gateway', 'firewall'], placeholderIp: '192.168.1.1', defaultPort: 443, portLabel: 'Porta GUI HTTPS (es. 443/8443)' },
  { kind: 'switch', label: 'Switch di Rete (Managed / PoE)', category: 'Infrastruttura', icon: Network, defaultRoles: [], placeholderIp: '192.168.1.2', defaultPort: 80, portLabel: 'Porta Gestione Web (es. 80/443)' },
  { kind: 'access_point', label: 'Access Point Wi-Fi', category: 'Wireless', icon: Wifi, defaultRoles: [], placeholderIp: '192.168.1.20', defaultPort: 443, portLabel: 'Porta Controller / Web (es. 443)' },
  { kind: 'nas', label: 'NAS / Storage Server', category: 'Server', icon: HardDrive, defaultRoles: [], placeholderIp: '192.168.1.50', defaultPort: 5000, portLabel: 'Porta DSM / Storage (es. 5000/5001)' },
  { kind: 'server', label: 'Server / Hypervisor (Proxmox)', category: 'Server', icon: Server, defaultRoles: [], placeholderIp: '192.168.1.60', defaultPort: 8006, portLabel: 'Porta Web Console (es. Proxmox 8006)' },
  { kind: 'smart_hub', label: 'Server Domotico (Home Assistant)', category: 'IoT', icon: Cpu, defaultRoles: ['service'], placeholderIp: '192.168.1.70', defaultPort: 8123, portLabel: 'Porta Home Assistant (8123)' },
  { kind: 'camera', label: 'Telecamera IP (RTSP/ONVIF)', category: 'Videosorveglianza', icon: Camera, defaultRoles: [], placeholderIp: '192.168.1.120', defaultPort: 554, portLabel: 'Porta Stream RTSP (554) o ONVIF' },
  { kind: 'nvr', label: 'NVR / Videosorveglianza', category: 'Videosorveglianza', icon: Video, defaultRoles: [], placeholderIp: '192.168.1.110', defaultPort: 8000, portLabel: 'Porta Stream / Web NVR' },
  { kind: 'printer', label: 'Stampante di Rete', category: 'Dispositivi', icon: Printer, defaultRoles: [], placeholderIp: '192.168.1.150', defaultPort: 631, portLabel: 'Porta IPP (631) o RAW (9100)' },
  { kind: 'smart_plug', label: 'Presa Smart / PDU Gestita', category: 'Alimentazione', icon: Plug, defaultRoles: [], placeholderIp: '192.168.1.80', defaultPort: 80, portLabel: 'Porta HTTP / Web UI (Shelly/Tasmota)' },
  { kind: 'ups', label: 'UPS Gruppo Continuità', category: 'Alimentazione', icon: Zap, defaultRoles: ['power_provider'], placeholderIp: '192.168.1.10', defaultPort: 3493, portLabel: 'Porta Demone NUT (3493)' },
  { kind: 'modem', label: 'Modem Fibra / ONT Upstream', category: 'Infrastruttura', icon: Rss, defaultRoles: ['wan_provider'], placeholderIp: '192.168.1.254', defaultPort: 80, portLabel: 'Porta Gestione Web' },
  { kind: 'sensor', label: 'Sensore IoT / Ambiente', category: 'IoT', icon: Gauge, defaultRoles: [], placeholderIp: '192.168.1.85', defaultPort: 80, portLabel: 'Porta Telemetria HTTP' },
  { kind: 'poe_injector', label: 'Iniettore PoE', category: 'Alimentazione', icon: Radio, defaultRoles: [], placeholderIp: '' },
  { kind: 'service', label: 'Servizio di Rete (DNS Sinkhole)', category: 'Servizi', icon: Shield, defaultRoles: ['dns_resolver'], placeholderIp: '192.168.1.53', defaultPort: 53, portLabel: 'Porta Servizio DNS (53)' },
  { kind: 'client', label: 'Client / Workstation', category: 'Dispositivi', icon: Smartphone, defaultRoles: [], placeholderIp: '192.168.1.100' },
  { kind: 'wan_gateway', label: 'Internet / WAN Upstream', category: 'Infrastruttura', icon: Globe, defaultRoles: ['wan_provider'], placeholderIp: '1.1.1.1' },
  { kind: 'custom', label: 'Apparato Personalizzato', category: 'Altro', icon: Settings, defaultRoles: [], placeholderIp: '192.168.1.99', defaultPort: 80, portLabel: 'Porta TCP Monitorata' },
];

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({ isOpen, onClose, onAddDevice }) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<DeviceKind>('switch');
  const [name, setName] = useState<string>('');
  const [ip, setIp] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [criticality, setCriticality] = useState<number>(3);
  const [selectedColor, setSelectedColor] = useState<string>('sky');
  const [customPort, setCustomPort] = useState<string>('80');
  const [customHealthUrl, setCustomHealthUrl] = useState<string>('');
  const [createAutoChecks, setCreateAutoChecks] = useState<boolean>(true);
  const [isVantagePoint, setIsVantagePoint] = useState<boolean>(false);
  const [isDhcpServer, setIsDhcpServer] = useState<boolean>(false);
  const [isDnsResolver, setIsDnsResolver] = useState<boolean>(false);

  // Ping reachability probe state
  const [pingChecking, setPingChecking] = useState<boolean>(false);
  const [pingReachable, setPingReachable] = useState<boolean | null>(null);
  const [pingRtt, setPingRtt] = useState<number | null>(null);

  // Debounce ping check when IP changes
  useEffect(() => {
    const clean = ip.trim();
    if (!clean || clean.length < 7 || !clean.includes('.')) {
      setPingReachable(null);
      setPingRtt(null);
      setPingChecking(false);
      return;
    }
    const timer = setTimeout(async () => {
      setPingChecking(true);
      try {
        const res = await quickPing(clean, 1.5);
        setPingReachable(res.reachable);
        setPingRtt(res.rtt_ms ?? null);
      } catch {
        setPingReachable(false);
      } finally {
        setPingChecking(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [ip]);

  if (!isOpen) return null;

  const currentKindConfig = DEVICE_KINDS.find((k) => k.kind === kind) || DEVICE_KINDS[0];

  const handleKindSelect = (selectedKind: DeviceKind) => {
    setKind(selectedKind);
    const cfg = DEVICE_KINDS.find((k) => k.kind === selectedKind);
    if (cfg) {
      if (!ip || ip.trim() === '') {
        setIp(cfg.placeholderIp);
      }
      setSelectedColor(getDefaultColorForKind(selectedKind));
      setCustomPort(cfg.defaultPort ? String(cfg.defaultPort) : '');
      if (selectedKind === 'server') {
        setCustomHealthUrl('http://' + (ip || cfg.placeholderIp) + ':8006');
      } else if (selectedKind === 'smart_hub') {
        setCustomHealthUrl('http://' + (ip || cfg.placeholderIp) + ':8123');
      } else {
        setCustomHealthUrl('');
      }

      // Automatically configure DNS and DHCP roles based on device kind
      if (selectedKind === 'router') {
        setIsDhcpServer(true);
        setIsDnsResolver(true);
      } else if (selectedKind === 'service') {
        setIsDnsResolver(true);
        setIsDhcpServer(false);
      } else {
        setIsDhcpServer(false);
        setIsDnsResolver(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    const cleanIp = ip.trim();
    const newDev: Device = {
      id: deviceId,
      name: trimmedName,
      kind,
      location: location.trim() || 'Rete Principale',
      criticality,
      addresses: { ip: cleanIp || undefined },
      tags: [`color:${selectedColor}`],
      roles,
      status: 'ok',
      status_since: new Date().toISOString(),
      interfaces: [],
    };

    onAddDevice(newDev);

    // Auto-create category checks if requested and IP is available
    if (createAutoChecks && cleanIp) {
      try {
        // 1. Primary Ping check
        await createCheck({
          id: `chk-${deviceId}-ping`,
          device_id: deviceId,
          type: 'ping',
          name: `Ping ${trimmedName}`,
          params: { target: cleanIp, count: 3 },
          interval_seconds: 15,
        });

        // 2. Custom Port check if configured
        const portNum = Number(customPort);
        if (portNum > 0 && portNum <= 65535) {
          if (kind === 'nas' && (portNum === 5000 || portNum === 5001)) {
            await createCheck({
              id: `chk-${deviceId}-dsm`,
              device_id: deviceId,
              type: 'synology_dsm',
              name: 'Stato DSM & Storage Synology',
              params: { host: cleanIp, port: portNum },
              interval_seconds: 60,
            });
          } else {
            await createCheck({
              id: `chk-${deviceId}-port-${portNum}`,
              device_id: deviceId,
              type: 'tcp_port',
              name: `${currentKindConfig.portLabel?.split('(')[0]?.trim() || 'Porta TCP'} (${portNum})`,
              params: { target: cleanIp, port: portNum },
              interval_seconds: 30,
            });
          }
        }

        // 3. HTTP Healthcheck URL if provided
        if (customHealthUrl && customHealthUrl.startsWith('http')) {
          await createCheck({
            id: `chk-${deviceId}-http`,
            device_id: deviceId,
            type: 'http',
            name: `Healthcheck Web UI`,
            params: { url: customHealthUrl.trim() },
            interval_seconds: 30,
          });
        }
      } catch (err) {
        console.warn('Errore auto-creazione controlli per', deviceId, err);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-sm">Aggiungi Nuovo Apparato di Rete</h2>
              <p className="text-[11px] text-slate-400">
                Seleziona categoria, colore identificativo e parametri specifici di controllo
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
          {/* 1. Scegli Categoria Apparato */}
          <div>
            <label className="block font-medium text-slate-300 mb-2">1. Seleziona il tipo di apparato:</label>
            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
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

          {/* 2. Palette Colori Box Canvas */}
          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <PaletteIcon className="w-3.5 h-3.5 text-sky-400" />
                2. Colore identificativo del box nel Canvas:
              </span>
              <span className="text-[11px] font-semibold text-slate-400">
                {getColorConfig(selectedColor).name}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {PRESET_COLORS.map((c) => {
                const isPicked = selectedColor === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    title={c.name}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition ${
                      isPicked
                        ? 'bg-slate-800 border-sky-400 text-white shadow-md ring-2 ring-sky-500/40'
                        : 'bg-slate-900/60 border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${c.dotClass} shrink-0 shadow-sm`} />
                    <span className="truncate">{c.name.split(' ')[0]}</span>
                    {isPicked && <CheckCircle2 className="w-3 h-3 text-sky-400 shrink-0 ml-0.5" />}
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
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-300">Indirizzo IP primario:</label>
                {pingChecking && (
                  <span className="flex items-center gap-1 text-[10px] text-sky-400" title={t('wizard.ping_checking')}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Verifica...</span>
                  </span>
                )}
                {!pingChecking && pingReachable === true && (
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{pingRtt !== null ? `${pingRtt.toFixed(1)} ms` : 'OK'}</span>
                  </span>
                )}
                {!pingChecking && pingReachable === false && (
                  <span
                    className="flex items-center gap-1 text-[10px] text-amber-400 cursor-help"
                    title={t('wizard.ping_unreachable_warning')}
                  >
                    <AlertTriangle className="w-3 h-3 animate-pulse" />
                    <span>Non risponde</span>
                  </span>
                )}
              </div>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder={currentKindConfig.placeholderIp}
                className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-slate-100 placeholder-slate-500 font-mono focus:outline-none transition ${
                  pingReachable === false
                    ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                    : 'border-slate-700 focus:border-sky-500'
                }`}
              />
              {!pingChecking && pingReachable === false && (
                <p className="text-[10px] text-amber-400/90 mt-1 leading-tight flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{t('wizard.ping_unreachable_warning')}</span>
                </p>
              )}
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

          {/* 3. Parametri Specifici & Controlli Custom per Categoria */}
          <div className="bg-slate-800/40 p-3.5 rounded-xl border border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                3. Parametri Specifici & Controlli per {currentKindConfig.label}:
              </span>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={createAutoChecks}
                  onChange={(e) => setCreateAutoChecks(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <span>Crea controlli iniziali</span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  {currentKindConfig.portLabel || 'Porta TCP Servizio:'}
                </label>
                <input
                  type="number"
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  placeholder={currentKindConfig.defaultPort ? String(currentKindConfig.defaultPort) : 'es. 80'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  URL Healthcheck / Heartbeat (opzionale):
                </label>
                <input
                  type="text"
                  value={customHealthUrl}
                  onChange={(e) => setCustomHealthUrl(e.target.value)}
                  placeholder={
                    kind === 'server'
                      ? 'http://192.168.1.60:8006'
                      : kind === 'smart_hub'
                      ? 'http://192.168.1.70:8123'
                      : 'http://.../healthz'
                  }
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-400 leading-normal">
              💡 NetSentinel verificherà lo stato tramite Ping ICMP periodico e testerà la reattività della porta specifica
              configurata ({customPort || 'standard'}) segnalando subito anomalie e cadute di servizio.
            </p>
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
