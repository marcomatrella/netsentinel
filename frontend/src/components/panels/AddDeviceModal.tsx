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
  Search,
  RefreshCw,
  Sliders,
  Check,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceKind } from '../../types';
import { PRESET_COLORS, getDefaultColorForKind, getColorConfig } from '../../constants/colors';
import { createCheck, quickPing, scanNetwork, DiscoveredDeviceItem } from '../../api/client';

interface AddDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevice: (device: Device) => void;
  existingDevices?: Device[];
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
  { kind: 'client', label: 'Client / Workstation', category: 'Dispositivi', icon: Smartphone, defaultRoles: ['passive_tracking'], placeholderIp: '192.168.1.100' },
  { kind: 'wan_gateway', label: 'Internet / WAN Upstream', category: 'Infrastruttura', icon: Globe, defaultRoles: ['wan_provider'], placeholderIp: '1.1.1.1' },
  { kind: 'custom', label: 'Apparato Personalizzato', category: 'Altro', icon: Settings, defaultRoles: [], placeholderIp: '192.168.1.99', defaultPort: 80, portLabel: 'Porta TCP Monitorata' },
];

export const AddDeviceModal: React.FC<AddDeviceModalProps> = ({
  isOpen,
  onClose,
  onAddDevice,
  existingDevices = [],
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'scan' | 'manual'>('scan');

  // Network Scan State
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSubnet, setScanSubnet] = useState<string>('');
  const [scannedDevices, setScannedDevices] = useState<DiscoveredDeviceItem[]>([]);
  const [selectedScannedIds, setSelectedScannedIds] = useState<string[]>([]);
  const [scannedKindOverrides, setScannedKindOverrides] = useState<Record<string, DeviceKind>>({});
  const [scannedDnsOverrides, setScannedDnsOverrides] = useState<Record<string, boolean>>({});
  const [scannedDhcpOverrides, setScannedDhcpOverrides] = useState<Record<string, boolean>>({});

  // Manual Form State
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
  const [isPassiveTracking, setIsPassiveTracking] = useState<boolean>(false);

  // Ping reachability probe state for manual form
  const [pingChecking, setPingChecking] = useState<boolean>(false);
  const [pingReachable, setPingReachable] = useState<boolean | null>(null);
  const [pingRtt, setPingRtt] = useState<number | null>(null);

  // Set of existing IPs, MACs, and IDs to strictly exclude already present nodes
  const existingIps = new Set(
    existingDevices.map((d) => d.addresses?.ip?.trim()).filter(Boolean) as string[]
  );
  const existingMacs = new Set(
    existingDevices.map((d) => (d.addresses as any)?.mac?.toLowerCase().trim()).filter(Boolean) as string[]
  );
  const existingIds = new Set(existingDevices.map((d) => d.id));

  // Current DNS and DHCP holders in the existing topology
  const currentDnsDevice = existingDevices.find((d) => d.roles?.includes('dns_resolver'));
  const currentDhcpDevice = existingDevices.find((d) => d.roles?.includes('dhcp_server'));

  // Trigger scan automatically when modal opens on 'scan' tab
  const handleTriggerScan = async (subnet?: string) => {
    setIsScanning(true);
    try {
      const data = await scanNetwork(subnet ? subnet.trim() : undefined);
      if (data.subnet) setScanSubnet(data.subnet);
      setScannedDevices(data.devices || []);
    } catch (err) {
      console.error('Errore scansione rete:', err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (scannedDevices.length === 0) {
        handleTriggerScan();
      }
    }
  }, [isOpen]);

  // Debounce ping check when IP changes in manual mode
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

  // Filter available scanned devices (strictly excluding those already in canvas/topology)
  const availableScanned = scannedDevices.filter((item) => {
    const ipClean = item.ip ? item.ip.trim() : '';
    if (ipClean && existingIps.has(ipClean)) return false;
    const macClean = item.mac ? item.mac.toLowerCase().trim() : '';
    if (macClean && existingMacs.has(macClean)) return false;
    if (existingIds.has(item.id)) return false;
    return true;
  });

  const alreadyInTopoCount = scannedDevices.length - availableScanned.length;

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

      // Automatically toggle roles according to kind
      if (selectedKind === 'router') {
        setIsDhcpServer(true);
        setIsDnsResolver(true);
        setIsPassiveTracking(false);
      } else if (selectedKind === 'service') {
        setIsDnsResolver(true);
        setIsDhcpServer(false);
        setIsPassiveTracking(false);
      } else if (selectedKind === 'client') {
        setIsDhcpServer(false);
        setIsDnsResolver(false);
        setIsPassiveTracking(true);
      } else {
        setIsDhcpServer(false);
        setIsDnsResolver(false);
        setIsPassiveTracking(false);
      }
    }
  };

  // Convert a scanned item to a Device and add it
  const handleAddScannedItem = (item: DiscoveredDeviceItem) => {
    const finalKind = scannedKindOverrides[item.id] || (item.kind as DeviceKind) || 'client';
    const isDns = scannedDnsOverrides[item.id] ?? item.roles.includes('dns_resolver');
    const isDhcp = scannedDhcpOverrides[item.id] ?? item.roles.includes('dhcp_server');
    const isClient = finalKind === 'client';

    const roles: string[] = [...item.roles];
    if (isDns && !roles.includes('dns_resolver')) roles.push('dns_resolver');
    if (!isDns) {
      const idx = roles.indexOf('dns_resolver');
      if (idx !== -1) roles.splice(idx, 1);
    }

    if (isDhcp && !roles.includes('dhcp_server')) roles.push('dhcp_server');
    if (!isDhcp) {
      const idx = roles.indexOf('dhcp_server');
      if (idx !== -1) roles.splice(idx, 1);
    }

    if (isClient && !roles.includes('passive_tracking')) {
      roles.push('passive_tracking');
    }

    const defaultColor = getDefaultColorForKind(finalKind);

    const newDev: Device = {
      id: item.id,
      name: item.name,
      kind: finalKind,
      location: item.location || 'LAN',
      criticality: finalKind === 'router' || item.is_gateway ? 5 : finalKind === 'switch' ? 4 : isClient ? 1 : 3,
      addresses: { ip: item.ip, mac: item.mac },
      tags: [`color:${defaultColor}`],
      roles,
      status: item.reachable ? 'ok' : 'unknown',
      status_since: new Date().toISOString(),
      interfaces: [],
    };

    onAddDevice(newDev);

    // Auto-create standard ping check
    if (item.ip) {
      createCheck({
        id: `chk-${item.id}-ping`,
        device_id: item.id,
        type: 'ping',
        name: `Ping ${item.name}`,
        params: { target: item.ip, count: 2 },
        interval_seconds: isClient ? 30 : 15,
      }).catch((e) => console.warn('Errore auto-creazione check:', e));
    }

    // Remove from available list in UI
    setScannedDevices((prev) => prev.filter((d) => d.id !== item.id));
  };

  // Add multiple selected items
  const handleAddSelectedScanned = () => {
    const toAdd = availableScanned.filter((d) => selectedScannedIds.includes(d.id));
    toAdd.forEach((d) => handleAddScannedItem(d));
    setSelectedScannedIds([]);
    onClose();
  };

  // Submit manual form
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIp = ip.trim();

    // Backend/client duplicate IP validation
    if (cleanIp && existingIps.has(cleanIp)) {
      const conflict = existingDevices.find((d) => d.addresses?.ip === cleanIp);
      alert(`L'indirizzo IP '${cleanIp}' è già assegnato a '${conflict?.name || cleanIp}' (${conflict?.id}). Gli indirizzi IP devono essere univoci.`);
      return;
    }

    const trimmedName = name.trim() || currentKindConfig.label;
    const deviceId = trimmedName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-') + '-' + Math.floor(100 + Math.random() * 900);

    const roles: string[] = [...currentKindConfig.defaultRoles];
    if (isVantagePoint && !roles.includes('vantage_point')) roles.push('vantage_point');
    if (isDhcpServer && !roles.includes('dhcp_server')) roles.push('dhcp_server');
    if (!isDhcpServer) {
      const idx = roles.indexOf('dhcp_server');
      if (idx !== -1) roles.splice(idx, 1);
    }
    if (isDnsResolver && !roles.includes('dns_resolver')) roles.push('dns_resolver');
    if (!isDnsResolver) {
      const idx = roles.indexOf('dns_resolver');
      if (idx !== -1) roles.splice(idx, 1);
    }
    if ((isPassiveTracking || kind === 'client') && !roles.includes('passive_tracking')) {
      roles.push('passive_tracking');
    }

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

    if (createAutoChecks && cleanIp) {
      try {
        await createCheck({
          id: `chk-${deviceId}-ping`,
          device_id: deviceId,
          type: 'ping',
          name: `Ping ${trimmedName}`,
          params: { target: cleanIp, count: 2 },
          interval_seconds: isPassiveTracking || kind === 'client' ? 30 : 15,
        });

        const portNum = Number(customPort);
        if (portNum > 0 && portNum <= 65535) {
          if (kind === 'nas' && (portNum === 5000 || portNum === 5001)) {
            await createCheck({
              id: `chk-${deviceId}-dsm`,
              device_id: deviceId,
              type: 'synology_dsm',
              name: 'Stato DSM Synology',
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

  const manualIpConflict = ip.trim() && existingIps.has(ip.trim())
    ? existingDevices.find((d) => d.addresses?.ip === ip.trim())
    : null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header with Two Tabs */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-slate-100 text-sm">Aggiungi Apparato alla Topologia</h2>
                <p className="text-[11px] text-slate-400">
                  Importa apparati rilevati dalla scansione di rete o aggiungine uno manualmente
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('scan')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-xs transition ${
                activeTab === 'scan'
                  ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Aggiungi da scansione di rete</span>
              {availableScanned.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full bg-sky-500/30 text-sky-300 text-[10px] font-bold">
                  {availableScanned.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-xs transition ${
                activeTab === 'manual'
                  ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/10 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Aggiungi manualmente</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Aggiungi da scansione di rete */}
        {activeTab === 'scan' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
            {/* Subnet Input and Scan Trigger */}
            <div className="flex items-center justify-between gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <div className="flex-1">
                <span className="block font-medium text-slate-300 text-xs mb-1">
                  Sottorete LAN da scansionare:
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={scanSubnet}
                    onChange={(e) => setScanSubnet(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTriggerScan(scanSubnet);
                    }}
                    placeholder="es. 192.168.1.0/24 (vuoto per rilevazione automatica)"
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500 w-full"
                  />
                  <button
                    type="button"
                    onClick={() => handleTriggerScan(scanSubnet)}
                    disabled={isScanning}
                    className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition flex items-center gap-1.5 shrink-0 shadow-md shadow-sky-500/20 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? 'Scansione in corso...' : 'Scansiona Rete'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Stats Bar */}
            {!isScanning && scannedDevices.length > 0 && (
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span>
                  Trovati <strong>{scannedDevices.length}</strong> apparati (
                  <span className="text-slate-500">{alreadyInTopoCount} già presenti nella topologia</span>,{' '}
                  <strong className="text-sky-400">{availableScanned.length} nuovi disponibili</strong>)
                </span>
                {availableScanned.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedScannedIds.length === availableScanned.length) {
                        setSelectedScannedIds([]);
                      } else {
                        setSelectedScannedIds(availableScanned.map((d) => d.id));
                      }
                    }}
                    className="text-sky-400 hover:text-sky-300 transition underline"
                  >
                    {selectedScannedIds.length === availableScanned.length
                      ? 'Deseleziona tutti'
                      : 'Seleziona tutti i nuovi'}
                  </button>
                )}
              </div>
            )}

            {/* Scanning State */}
            {isScanning && (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 bg-slate-900/40 rounded-xl border border-slate-800">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full border-2 border-sky-500/30 border-t-sky-400 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-slate-200 text-sm">Scansione ARP/ICMP in corso...</h4>
                  <p className="text-xs text-slate-400 max-w-sm mt-1">
                    NetSentinel sta identificando gli host attivi ed escludendo quelli già inseriti nella topologia.
                  </p>
                </div>
              </div>
            )}

            {/* Empty Available List */}
            {!isScanning && scannedDevices.length > 0 && availableScanned.length === 0 && (
              <div className="p-8 text-center bg-slate-900/40 rounded-xl border border-dashed border-slate-800 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="font-semibold text-slate-200">Tutti gli apparati rilevati sono già presenti!</h4>
                <p className="text-slate-400 max-w-md mx-auto text-[11px]">
                  Tutti i {scannedDevices.length} dispositivi scoperti sulla rete locale sono già inclusi nella tua topologia.
                  Se vuoi aggiungere un dispositivo esterno o statico, usa la scheda &quot;Aggiungi manualmente&quot;.
                </p>
              </div>
            )}

            {/* Available Scanned Items */}
            {!isScanning && availableScanned.length > 0 && (
              <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                {availableScanned.map((d) => {
                  const currentKind = scannedKindOverrides[d.id] || (d.kind as DeviceKind) || 'client';
                  const kindCfg = DEVICE_KINDS.find((k) => k.kind === currentKind) || DEVICE_KINDS[0];
                  const Icon = kindCfg.icon;
                  const isChecked = selectedScannedIds.includes(d.id);

                  const isDns = scannedDnsOverrides[d.id] ?? d.roles.includes('dns_resolver');
                  const isDhcp = scannedDhcpOverrides[d.id] ?? d.roles.includes('dhcp_server');
                  const isPassive = currentKind === 'client' || d.roles.includes('passive_tracking');

                  return (
                    <div
                      key={d.id}
                      className={`p-3 rounded-xl border transition ${
                        isChecked
                          ? 'border-sky-500 bg-sky-950/20'
                          : 'border-slate-800 bg-slate-900/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        {/* Left Checkbox & Icon */}
                        <div className="flex items-start gap-2.5 flex-1 overflow-hidden">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedScannedIds((prev) => [...prev, d.id]);
                              } else {
                                setSelectedScannedIds((prev) => prev.filter((id) => id !== d.id));
                              }
                            }}
                            className="mt-1 rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0 shrink-0"
                          />
                          <div className="p-2 rounded-lg bg-slate-800 text-sky-400 shrink-0 mt-0.5">
                            <Icon className="w-4 h-4" />
                          </div>

                          <div className="flex-1 overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200 truncate">{d.name}</span>
                              {d.reachable ? (
                                <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{d.rtt_ms !== null && d.rtt_ms !== undefined ? `${d.rtt_ms.toFixed(1)} ms` : 'OK'}</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-950/40 border border-amber-800 px-1.5 py-0.2 rounded font-mono">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Non risponde</span>
                                </span>
                              )}
                              {isPassive && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-mono">
                                  Tracciamento Passivo
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1 font-mono">
                              <span className="text-sky-400 font-semibold">{d.ip}</span>
                              {d.mac && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500 text-[10px]">{d.mac}</span>
                                </>
                              )}
                            </div>

                            {/* Options: Kind Selector & Roles */}
                            <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-800/80">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">Tipo Apparato:</label>
                                <select
                                  value={currentKind}
                                  onChange={(e) => {
                                    const nextKind = e.target.value as DeviceKind;
                                    setScannedKindOverrides((prev) => ({ ...prev, [d.id]: nextKind }));
                                  }}
                                  className="w-full bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-sky-500"
                                >
                                  {DEVICE_KINDS.map((k) => (
                                    <option key={k.kind} value={k.kind}>
                                      {k.label}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-2 space-y-1">
                                <label className="block text-[10px] text-slate-400 mb-0.5">Ruoli Assegnati:</label>
                                <div className="flex items-center gap-3">
                                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={isDns}
                                      onChange={(e) => {
                                        setScannedDnsOverrides((prev) => ({ ...prev, [d.id]: e.target.checked }));
                                      }}
                                      className="rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0"
                                    />
                                    <span className="text-sky-300">Server DNS</span>
                                  </label>

                                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={isDhcp}
                                      onChange={(e) => {
                                        setScannedDhcpOverrides((prev) => ({ ...prev, [d.id]: e.target.checked }));
                                      }}
                                      className="rounded bg-slate-950 border-slate-700 text-sky-500 focus:ring-0"
                                    />
                                    <span className="text-amber-300">Server DHCP</span>
                                  </label>
                                </div>

                                {/* Reassignment Warning Banners */}
                                {isDns && currentDnsDevice && currentDnsDevice.id !== d.id && (
                                  <p className="text-[10px] text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    <span>
                                      Sostituirà il Server DNS attuale (<strong>{currentDnsDevice.name}</strong>).
                                    </span>
                                  </p>
                                )}
                                {isDhcp && currentDhcpDevice && currentDhcpDevice.id !== d.id && (
                                  <p className="text-[10px] text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    <span>
                                      Sostituirà il Server DHCP attuale (<strong>{currentDhcpDevice.name}</strong>).
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action: Quick Add single */}
                        <div className="shrink-0 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleAddScannedItem(d)}
                            className="px-3 py-1.5 bg-sky-600/30 hover:bg-sky-600 text-sky-200 hover:text-white border border-sky-500/50 rounded-lg text-xs font-semibold transition flex items-center gap-1 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Aggiungi</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Bulk Actions */}
            <div className="pt-3 flex justify-between items-center border-t border-slate-800">
              <span className="text-slate-500 text-[11px]">
                {selectedScannedIds.length > 0
                  ? `${selectedScannedIds.length} apparati selezionati`
                  : 'Seleziona uno o più apparati da aggiungere in massa'}
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
                >
                  Chiudi
                </button>
                {selectedScannedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAddSelectedScanned}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Aggiungi selezionati ({selectedScannedIds.length})</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Aggiungi manualmente */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs custom-scrollbar">
            {/* 1. Scegli Categoria Apparato */}
            <div>
              <label className="block font-medium text-slate-300 mb-2">1. Seleziona il tipo di apparato:</label>
              <div className="grid grid-cols-3 gap-2 max-h-44 overflow-y-auto pr-1">
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

            {/* Nome e IP con Validazione IP Duplicati */}
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
                    manualIpConflict
                      ? 'border-rose-500 bg-rose-950/20 focus:border-rose-400'
                      : pingReachable === false
                      ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                      : 'border-slate-700 focus:border-sky-500'
                  }`}
                />
                {manualIpConflict && (
                  <div className="mt-1.5 p-2 bg-rose-950/40 border border-rose-800 rounded-lg text-rose-300 text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                    <span>
                      L&apos;indirizzo IP <strong>{ip.trim()}</strong> è già assegnato a <strong>{manualIpConflict.name}</strong> ({manualIpConflict.id}). Gli IP devono essere univoci.
                    </span>
                  </div>
                )}
                {!manualIpConflict && !pingChecking && pingReachable === false && (
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
                  <option value={1}>1 — Bassa (Periferiche, Smart plug, Client)</option>
                  <option value={2}>2 — Media (PC secondari, Stampanti)</option>
                  <option value={3}>3 — Importante (Access Point, Smart Home)</option>
                  <option value={4}>4 — Alta (NAS Storage, Server Proxmox)</option>
                  <option value={5}>5 — Critica (Switch Core, Gateway, UPS)</option>
                </select>
              </div>
            </div>

            {/* 3. Parametri Specifici & Controlli Custom */}
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
            </div>

            {/* Ruoli di Rete con Avvisi di Riassegnazione */}
            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-2.5">
              <span className="block font-medium text-slate-300">Ruoli & Servizi Forniti:</span>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isDnsResolver}
                      onChange={(e) => setIsDnsResolver(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span className="font-semibold text-sky-400">Server DNS (AdGuard/Pi-hole)</span>
                  </label>
                  {isDnsResolver && currentDnsDevice && (
                    <div className="mt-1 ml-5 p-1.5 bg-amber-950/40 border border-amber-800 rounded text-[10px] text-amber-300 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Sostituirà il Server DNS attuale (<strong>{currentDnsDevice.name}</strong>).
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isDhcpServer}
                      onChange={(e) => setIsDhcpServer(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span className="font-semibold text-amber-400">Server DHCP</span>
                  </label>
                  {isDhcpServer && currentDhcpDevice && (
                    <div className="mt-1 ml-5 p-1.5 bg-amber-950/40 border border-amber-800 rounded text-[10px] text-amber-300 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        Sostituirà il Server DHCP attuale (<strong>{currentDhcpDevice.name}</strong>).
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isVantagePoint}
                      onChange={(e) => setIsVantagePoint(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <span>Punto di Monitor (Vantage Point)</span>
                  </label>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white">
                    <input
                      type="checkbox"
                      checked={isPassiveTracking || kind === 'client'}
                      onChange={(e) => setIsPassiveTracking(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                    />
                    <div>
                      <span className="font-semibold text-slate-300">Tracciamento Passivo</span>
                      <span className="block text-[10px] text-slate-400">Nessun allarme se offline</span>
                    </div>
                  </label>
                </div>
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
                disabled={Boolean(manualIpConflict)}
                className={`px-4 py-2 rounded-xl font-medium shadow-md transition flex items-center gap-1.5 ${
                  manualIpConflict
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed shadow-none'
                    : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20'
                }`}
              >
                <Plus className="w-4 h-4" />
                Aggiungi alla Topologia
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
