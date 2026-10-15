import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Database,
  GitFork,
  Radio,
  Globe,
  Eye,
  Mail,
  Play,
  FileCheck,
  Plus,
  Trash2,
  Edit3,
  Check,
  Sparkles,
  Wifi,
  Network,
  Router as RouterIcon,
  HardDrive,
  Server,
  Zap,
  Cpu,
  Smartphone,
  Bell,
  Sliders,
  AlertTriangle,
} from 'lucide-react';
import { Dependency, Device, DeviceKind, FullTopology, Link, LinkMedium } from '../../types';
import {
  applyTopology,
  deduceDependencies,
  simulateFailure,
  saveNotificationChannel,
  testNotificationChannel,
} from '../../api/client';
import { getLayoutedElements } from '../../utils/elkLayout';
import { useTranslation } from '../../i18n/I18nContext';
import { translateDiagnosisTitle, translateDiagnosisSummary } from '../../utils/diagnosisI18n';

interface WizardModalProps {
  initialTopology: FullTopology;
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

const STEPS = [
  { id: 1, label: 'Fonti & Sonde', icon: Database },
  { id: 2, label: 'Apparati Rete', icon: GitFork },
  { id: 3, label: 'Collegamenti', icon: Network },
  { id: 4, label: 'Controlli & Isteresi', icon: Sliders },
  { id: 5, label: 'Ruoli & Vantage Point', icon: Eye },
  { id: 6, label: 'Notifiche', icon: Bell },
  { id: 7, label: 'Dipendenze & Simulazione', icon: Play },
  { id: 8, label: 'Riepilogo & Salva', icon: FileCheck },
];

const GENERIC_CATEGORIES: Array<{
  kind: DeviceKind;
  label: string;
  defaultName: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRoles: string[];
  defaultIp: string;
}> = [
  { kind: 'router', label: 'Router / Gateway', defaultName: 'Router Gateway', icon: RouterIcon, defaultRoles: ['gateway'], defaultIp: '192.168.1.1' },
  { kind: 'switch', label: 'Switch di Rete', defaultName: 'Switch Core Gigabit', icon: Network, defaultRoles: [], defaultIp: '192.168.1.2' },
  { kind: 'access_point', label: 'Access Point Wi-Fi', defaultName: 'AP Wi-Fi Salotto', icon: Wifi, defaultRoles: [], defaultIp: '192.168.1.20' },
  { kind: 'nas', label: 'Storage NAS (AdGuard)', defaultName: 'NAS Storage & DNS', icon: HardDrive, defaultRoles: ['dns_resolver', 'dhcp_server'], defaultIp: '192.168.1.50' },
  { kind: 'server', label: 'Server / VM', defaultName: 'Server Applicativo', icon: Server, defaultRoles: [], defaultIp: '192.168.1.60' },
  { kind: 'ups', label: 'UPS / Batteria', defaultName: 'UPS Rack NUT', icon: Zap, defaultRoles: ['power_provider'], defaultIp: '192.168.1.15' },
  { kind: 'smart_hub', label: 'Server Domotico (HA)', defaultName: 'Home Automation Hub', icon: Cpu, defaultRoles: ['service'], defaultIp: '192.168.1.70' },
  { kind: 'client', label: 'Gruppo Terminali / Client', defaultName: 'Client e Workstation', icon: Smartphone, defaultRoles: [], defaultIp: '192.168.1.100' },
];

export const WizardModal: React.FC<WizardModalProps> = ({
  initialTopology,
  isOpen,
  onClose,
  onApplied,
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);

  // Topology state
  const [devices, setDevices] = useState<Device[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);

  // Key Roles
  const [vantagePointId, setVantagePointId] = useState<string>('');
  const [dnsServerId, setDnsServerId] = useState<string>('');
  const [dhcpServerId, setDhcpServerId] = useState<string>('');
  const [deadMansUrl, setDeadMansUrl] = useState<string>('https://hc-ping.com/your-uuid-here');

  // Step 1: Generic Data Sources & Protocols
  const [dataSources, setDataSources] = useState([
    { id: 'icmp', name: 'Sonda Ping ICMP / TCP', desc: 'Rilevamento presenza host e latenza RTT millisecondo', active: true, core: true },
    { id: 'dns', name: 'Probe Risoluzione DNS', desc: 'Query periodica record A per verificare server DNS locale/upstream', active: true, core: true },
    { id: 'http', name: 'Sonde HTTP / JSON REST', desc: 'Controllo codici 200/500 e payload per dashboard web e servizi', active: true, core: false },
    { id: 'snmp', name: 'Metriche Switch SNMP (v2c/v3)', desc: 'Contatori porte, stato link up/down, errori interfaccia', active: true, core: false },
    { id: 'nut', name: 'UPS Network Protocol (NUT)', desc: 'Monitoraggio stato blackout AC, autonomia residua e carico batteria', active: true, core: false },
    { id: 'wifi', name: 'Controller Wi-Fi / AP (UniFi/OpenWrt)', desc: 'Stato canali radio, AP orfani, disconnessioni isolate', active: true, core: false },
    { id: 'nas_dsm', name: 'Storage & NAS Health API', desc: 'Salute volumi disco, stato S.M.A.R.T. e allarmi RAID', active: true, core: false },
    { id: 'ha', name: 'Home Automation Broker (HA/MQTT)', desc: 'Integrazione stato entità domotiche e sensori di rete', active: false, core: false },
  ]);

  // Step 2 Form: Device Adder & Editor
  const [newKind, setNewKind] = useState<DeviceKind>('switch');
  const [newName, setNewName] = useState<string>('');
  const [newIp, setNewIp] = useState<string>('');
  const [newLocation, setNewLocation] = useState<string>('Casa');
  const [newCriticality, setNewCriticality] = useState<number>(3);
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);

  // Step 3 Form: Link Creator
  const [linkFrom, setLinkFrom] = useState<string>('');
  const [linkTo, setLinkTo] = useState<string>('');
  const [linkMedium, setLinkMedium] = useState<LinkMedium>('ethernet');
  const [linkFromPort, setLinkFromPort] = useState<string>('');
  const [linkToPort, setLinkToPort] = useState<string>('');

  // Step 4: Checks & Thresholds
  const [pingInterval, setPingInterval] = useState<number>(15);
  const [dnsInterval, setDnsInterval] = useState<number>(30);
  const [timeoutSec, setTimeoutSec] = useState<number>(3);
  const [hysteresisFails, setHysteresisFails] = useState<number>(3);
  const [flappingThreshold, setFlappingThreshold] = useState<number>(3);

  // Step 6: Notifications & Quiet Hours
  const [smtpEnabled, setSmtpEnabled] = useState<boolean>(false);
  const [smtpHost, setSmtpHost] = useState<string>('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUser, setSmtpUser] = useState<string>('');
  const [smtpPass, setSmtpPass] = useState<string>('');
  const [smtpFrom, setSmtpFrom] = useState<string>('netsentinel@homelab.local');
  const [smtpTo, setSmtpTo] = useState<string>('');
  const [quietHoursStart, setQuietHoursStart] = useState<string>('23:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState<string>('07:00');
  const [bypassCritical, setBypassCritical] = useState<boolean>(true);
  const [testNotificationMsg, setTestNotificationMsg] = useState<string | null>(null);
  const [isTestingNotif, setIsTestingNotif] = useState<boolean>(false);

  // Step 7: Simulation State
  const [simulatedDevice, setSimulatedDevice] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Step 8: Layout and Saving
  const [useAutoLayout, setUseAutoLayout] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Initialize from initialTopology or defaults
  useEffect(() => {
    if (isOpen) {
      if (initialTopology && initialTopology.devices && initialTopology.devices.length > 0) {
        setDevices(initialTopology.devices);
        setLinks(initialTopology.links || []);
        setDependencies(initialTopology.dependencies || []);

        const vp = initialTopology.vantage_point_id || initialTopology.devices.find((d) => d.roles.includes('vantage_point'))?.id || initialTopology.devices[0]?.id || '';
        setVantagePointId(vp);

        const dns = initialTopology.devices.find((d) => d.roles.includes('dns_resolver'))?.id || initialTopology.devices[0]?.id || '';
        setDnsServerId(dns);

        const dhcp = initialTopology.devices.find((d) => d.roles.includes('dhcp_server'))?.id || initialTopology.devices[0]?.id || '';
        setDhcpServerId(dhcp);
      } else {
        // Fallback default generic devices
        const defaultDevs: Device[] = [
          {
            id: 'router-gw',
            name: 'Router Gateway',
            kind: 'router',
            location: 'Rack Salotto',
            criticality: 5,
            addresses: { ip: '192.168.1.1' },
            tags: [],
            roles: ['gateway'],
            status: 'ok',
            status_since: new Date().toISOString(),
            interfaces: [],
          },
          {
            id: 'switch-core',
            name: 'Switch Core PoE',
            kind: 'switch',
            location: 'Rack Salotto',
            criticality: 4,
            addresses: { ip: '192.168.1.2' },
            tags: [],
            roles: [],
            status: 'ok',
            status_since: new Date().toISOString(),
            interfaces: [],
          },
          {
            id: 'nas-storage',
            name: 'NAS Storage & AdGuard Home',
            kind: 'nas',
            location: 'Rack Salotto',
            criticality: 4,
            addresses: { ip: '192.168.1.50' },
            tags: [],
            roles: ['vantage_point', 'dns_resolver', 'dhcp_server'],
            status: 'ok',
            status_since: new Date().toISOString(),
            interfaces: [],
          },
        ];
        setDevices(defaultDevs);
        setVantagePointId('nas-storage');
        setDnsServerId('nas-storage');
        setDhcpServerId('nas-storage');
      }
    }
  }, [isOpen, initialTopology]);

  if (!isOpen) return null;

  // Add or update device in step 2
  const handleSaveDevice = () => {
    if (editingDeviceId) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === editingDeviceId
            ? {
                ...d,
                name: newName.trim() || d.name,
                kind: newKind,
                location: newLocation.trim() || 'Casa',
                criticality: newCriticality,
                addresses: { ip: newIp.trim() || undefined },
              }
            : d
        )
      );
      setEditingDeviceId(null);
      setNewName('');
      setNewIp('');
      return;
    }

    const cat = GENERIC_CATEGORIES.find((c) => c.kind === newKind) || GENERIC_CATEGORIES[0];
    const devName = newName.trim() || cat.defaultName;
    const devId =
      devName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-') +
      '-' +
      Math.floor(10 + Math.random() * 90);

    const devIp = newIp.trim() || cat.defaultIp;

    const newDev: Device = {
      id: devId,
      name: devName,
      kind: newKind,
      location: newLocation.trim() || 'Casa',
      criticality: newCriticality,
      addresses: { ip: devIp },
      tags: [],
      roles: [...cat.defaultRoles],
      status: 'ok',
      status_since: new Date().toISOString(),
      interfaces: [],
    };

    setDevices((prev) => [...prev, newDev]);
    if (!vantagePointId && newDev.roles.includes('vantage_point')) {
      setVantagePointId(newDev.id);
    }

    setNewName('');
    setNewIp('');
  };

  const handleStartEditDevice = (dev: Device) => {
    setEditingDeviceId(dev.id);
    setNewName(dev.name);
    setNewIp(dev.addresses?.ip || '');
    setNewKind(dev.kind);
    setNewLocation(dev.location || 'Casa');
    setNewCriticality(dev.criticality || 3);
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_device_id !== id && l.to_device_id !== id));
    if (vantagePointId === id) setVantagePointId(devices[0]?.id || '');
    if (dnsServerId === id) setDnsServerId('');
    if (dhcpServerId === id) setDhcpServerId('');
    if (editingDeviceId === id) setEditingDeviceId(null);
  };

  // Add custom link in step 3
  const handleAddLink = () => {
    if (!linkFrom || !linkTo || linkFrom === linkTo) return;
    const linkId = `lnk-${linkFrom}-${linkTo}-${Math.floor(Math.random() * 1000)}`;
    const newLnk: Link = {
      id: linkId,
      from_device_id: linkFrom,
      to_device_id: linkTo,
      medium: linkMedium,
      poe: linkMedium === 'poe',
      from_port: linkFromPort.trim() || undefined,
      to_port: linkToPort.trim() || undefined,
      status: 'ok',
      updated_at: new Date().toISOString(),
    };
    setLinks((prev) => [...prev, newLnk]);
    setLinkFrom('');
    setLinkTo('');
    setLinkFromPort('');
    setLinkToPort('');
  };

  const handleRemoveLink = (id: string) => {
    setLinks((prev) => prev.filter((l) => l.id !== id));
  };

  // Auto-suggest links
  const handleAutoSuggestLinks = () => {
    const suggested: Link[] = [];
    const router = devices.find((d) => d.kind === 'router');
    const switches = devices.filter((d) => d.kind === 'switch');
    const coreSwitch = switches[0];
    const hub = coreSwitch || router || devices[0];

    if (!hub) return;

    if (router && coreSwitch && router.id !== coreSwitch.id) {
      suggested.push({
        id: `lnk-${router.id}-${coreSwitch.id}`,
        from_device_id: router.id,
        to_device_id: coreSwitch.id,
        medium: 'ethernet',
        poe: false,
        from_port: 'LAN1',
        to_port: 'Uplink',
        status: 'ok',
        updated_at: new Date().toISOString(),
      });
    }

    devices.forEach((d) => {
      if (d.id === hub.id || (router && d.id === router.id)) return;
      let medium: LinkMedium = 'ethernet';
      let poe = false;
      if (d.kind === 'access_point') {
        medium = 'poe';
        poe = true;
      } else if (d.kind === 'client') {
        medium = 'wifi';
      }

      suggested.push({
        id: `lnk-${hub.id}-${d.id}`,
        from_device_id: hub.id,
        to_device_id: d.id,
        medium,
        poe,
        status: 'ok',
        updated_at: new Date().toISOString(),
      });
    });

    setLinks(suggested);
  };

  // Update dependencies when navigating to step 7
  const handleUpdateDependencies = async () => {
    const vp = vantagePointId || devices[0]?.id || 'vp';
    try {
      const configuredDevices: Device[] = devices.map((d) => {
        const rolesSet = new Set(d.roles || []);
        if (dnsServerId) {
          if (d.id === dnsServerId) rolesSet.add('dns_resolver');
          else rolesSet.delete('dns_resolver');
        }
        if (dhcpServerId) {
          if (d.id === dhcpServerId) rolesSet.add('dhcp_server');
          else rolesSet.delete('dhcp_server');
        }
        if (d.id === vp) {
          rolesSet.add('vantage_point');
        } else {
          rolesSet.delete('vantage_point');
        }
        return { ...d, roles: Array.from(rolesSet) };
      });

      const deduced = await deduceDependencies({
        vantage_point_id: vp,
        devices: configuredDevices.map((d) => ({ id: d.id, name: d.name, kind: d.kind, roles: d.roles })),
        links: links.map((l) => ({ id: l.id, from: l.from_device_id, to: l.to_device_id, medium: l.medium, poe: l.poe })),
      });
      setDependencies(deduced);
    } catch (err) {
      console.error('Errore deduzione dipendenze:', err);
    }
  };

  // Test notification channel in step 6
  const handleTestNotification = async () => {
    setIsTestingNotif(true);
    setTestNotificationMsg(null);
    try {
      await saveNotificationChannel({
        id: 'smtp-primary',
        name: 'Email SMTP Primario',
        type: 'smtp',
        config: {
          host: smtpHost,
          port: smtpPort,
          user: smtpUser,
          pass: smtpPass,
          from_addr: smtpFrom,
          to_addr: smtpTo,
        },
        enabled: smtpEnabled,
        min_severity: 'warn',
        quiet_hours: {
          start: quietHoursStart,
          end: quietHoursEnd,
          bypass_for_critical: bypassCritical,
        },
      });

      const res = await testNotificationChannel('smtp-primary');
      setTestNotificationMsg(res.message || 'Notifica di prova inviata con successo!');
    } catch (err: any) {
      setTestNotificationMsg(`Errore: ${err.message || 'Impossibile inviare la mail di prova.'}`);
    } finally {
      setIsTestingNotif(false);
    }
  };

  // Dry-run simulation in step 7
  const handleRunSimulation = async (devId: string) => {
    setSimulatedDevice(devId);
    setIsSimulating(true);
    try {
      const res = await simulateFailure({
        failed_device_ids: [devId],
        failed_link_ids: [],
      });
      setSimulationResult(res);
    } catch (err: any) {
      console.error(err);
      alert('Errore simulazione: ' + err.message);
    } finally {
      setIsSimulating(false);
    }
  };

  // Save and apply entire topology in step 8
  const handleSaveAndApply = async () => {
    setSaving(true);
    try {
      const vp = vantagePointId || devices[0]?.id || 'vp';

      const configuredDevices: Device[] = devices.map((d) => {
        const rolesSet = new Set(d.roles || []);
        if (dnsServerId) {
          if (d.id === dnsServerId) rolesSet.add('dns_resolver');
          else rolesSet.delete('dns_resolver');
        }
        if (dhcpServerId) {
          if (d.id === dhcpServerId) rolesSet.add('dhcp_server');
          else rolesSet.delete('dhcp_server');
        }
        if (d.id === vp) {
          rolesSet.add('vantage_point');
        } else {
          rolesSet.delete('vantage_point');
        }
        return { ...d, roles: Array.from(rolesSet) };
      });

      const deduced = await deduceDependencies({
        vantage_point_id: vp,
        devices: configuredDevices.map((d) => ({ id: d.id, name: d.name, kind: d.kind, roles: d.roles })),
        links: links.map((l) => ({ id: l.id, from: l.from_device_id, to: l.to_device_id, medium: l.medium, poe: l.poe })),
      });

      let finalLayout = initialTopology.layout || { id: 'default', nodes: [], edges: [], groups: [], updated_at: new Date().toISOString() };

      if (useAutoLayout) {
        const rfNodes = configuredDevices.map((d, idx) => ({
          id: d.id,
          type: 'customNode',
          position: { x: 120 + (idx % 3) * 260, y: 80 + Math.floor(idx / 3) * 180 },
          data: { id: d.id, name: d.name, kind: d.kind, ip: d.addresses?.ip, status: 'ok', roles: d.roles },
        }));

        const rfEdges = links.map((l) => ({
          id: l.id,
          source: l.from_device_id,
          target: l.to_device_id,
          type: 'customEdge',
          data: { medium: l.medium, poe: l.poe, status: 'ok' },
        }));

        const layouted = await getLayoutedElements(rfNodes, rfEdges);
        finalLayout = {
          id: 'default',
          nodes: layouted.nodes.map((n) => ({ id: n.id, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
          edges: rfEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
          groups: [],
          updated_at: new Date().toISOString(),
        };
      }

      // Save notification channel if configured
      if (smtpEnabled && smtpUser && smtpTo) {
        await saveNotificationChannel({
          id: 'smtp-primary',
          name: 'Email SMTP Primario',
          type: 'smtp',
          config: {
            host: smtpHost,
            port: smtpPort,
            user: smtpUser,
            pass: smtpPass,
            from_addr: smtpFrom,
            to_addr: smtpTo,
          },
          enabled: true,
          min_severity: 'warn',
          quiet_hours: {
            start: quietHoursStart,
            end: quietHoursEnd,
            bypass_for_critical: bypassCritical,
          },
        }).catch((e) => console.warn('Could not save notification channel:', e));
      }

      await applyTopology({
        vantage_point_id: vp,
        description: 'Salvataggio completo da Wizard 8 Passi NetSentinel',
        devices: configuredDevices,
        links,
        dependencies: deduced,
        layout: finalLayout,
      });

      onApplied();
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Errore durante il salvataggio della configurazione: ' + (err.message || 'Verifica il server.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[94vh] sm:h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Wizard Header */}
        <div className="px-3.5 py-3 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold text-slate-100 text-sm sm:text-base truncate">
                Wizard di Configurazione Guidata (8 Passi)
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate hidden xs:block">
                Passo {currentStep} di {STEPS.length}: <span className="text-sky-300 font-semibold">{STEPS[currentStep - 1].label}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
            title="Chiudi"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Navigation Bar */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 py-2 overflow-x-auto gap-1.5 custom-scrollbar">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isDone = s.id < currentStep;
            const isCurrent = s.id === currentStep;
            return (
              <button
                key={s.id}
                onClick={async () => {
                  if (s.id === 7) await handleUpdateDependencies();
                  setCurrentStep(s.id);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition whitespace-nowrap ${
                  isCurrent
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                    : isDone
                    ? 'bg-slate-800/80 text-emerald-400 hover:bg-slate-800'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-850'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.id}. {s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          {/* Step 1: Data Sources & Protocols */}
          {currentStep === 1 && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div>
                <h3 className="font-bold text-slate-100 text-base">1. Fonti Dati & Sonde di Monitoraggio</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  NetSentinel è progettato per essere generico e indipendente da marchi specifici. Abilita i protocolli di telemetria desiderati:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                {dataSources.map((src) => (
                  <div
                    key={src.id}
                    className={`p-3.5 rounded-2xl border transition flex flex-col justify-between ${
                      src.active ? 'bg-slate-900 border-sky-500/40' : 'bg-slate-950/60 border-slate-800 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-200 text-xs">{src.name}</span>
                        <input
                          type="checkbox"
                          checked={src.active}
                          disabled={src.core}
                          onChange={(e) => {
                            setDataSources((prev) =>
                              prev.map((s) => (s.id === src.id ? { ...s, active: e.target.checked } : s))
                            );
                          }}
                          className="rounded border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{src.desc}</p>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-800/60 text-[10px]">
                      <span className={`px-2 py-0.5 rounded font-mono ${src.active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                        {src.core ? 'Sonda Nativa' : src.active ? 'Attivo' : 'Disattivato'}
                      </span>
                      <span className="text-slate-500 font-mono">Poll: {src.id === 'icmp' ? `${pingInterval}s` : '30s'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Generic Device Inventory */}
          {currentStep === 2 && (
            <div className="flex-1 h-full grid grid-cols-12 gap-6">
              {/* Left Form: Add/Edit Device */}
              <div className="col-span-5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                      {editingDeviceId ? (
                        <>
                          <Edit3 className="w-4 h-4 text-emerald-400" /> Modifica Apparato
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-sky-400" /> Aggiungi Apparato
                        </>
                      )}
                    </h3>
                    {editingDeviceId && (
                      <button
                        onClick={() => {
                          setEditingDeviceId(null);
                          setNewName('');
                          setNewIp('');
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200"
                      >
                        Annulla
                      </button>
                    )}
                  </div>

                  {/* Kinds Grid */}
                  <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {GENERIC_CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isSel = newKind === cat.kind;
                      return (
                        <button
                          key={cat.kind}
                          type="button"
                          onClick={() => {
                            setNewKind(cat.kind);
                            if (!newName) setNewName(cat.defaultName);
                            if (!newIp) setNewIp(cat.defaultIp);
                          }}
                          className={`p-2 rounded-xl border text-left flex items-center gap-2 transition ${
                            isSel
                              ? 'bg-sky-600/20 border-sky-500 text-sky-200'
                              : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400'
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isSel ? 'text-sky-400' : 'text-slate-500'}`} />
                          <span className="text-[10px] font-medium leading-tight truncate">{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Nome Apparato:</label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="es. Switch Core Gigabit"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Indirizzo IP:</label>
                      <input
                        type="text"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="es. 192.168.1.10"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Posizione / Stanza:</label>
                      <input
                        type="text"
                        value={newLocation}
                        onChange={(e) => setNewLocation(e.target.value)}
                        placeholder="es. Rack, Studio"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Criticità (1 = Minore, 5 = Bloccante):</label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={newCriticality}
                      onChange={(e) => setNewCriticality(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>1 (Bassa)</span>
                      <span className="text-sky-400 font-bold">Livello: {newCriticality}</span>
                      <span>5 (Critica)</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveDevice}
                  className={`w-full mt-3 py-2 rounded-xl font-medium transition flex items-center justify-center gap-1.5 shadow text-xs text-white ${
                    editingDeviceId ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {editingDeviceId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{editingDeviceId ? 'Salva Modifiche' : 'Aggiungi alla Lista'}</span>
                </button>
              </div>

              {/* Right: Device List */}
              <div className="col-span-7 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-hidden">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-200 text-sm">Apparati Configurati ({devices.length})</h3>
                    <span className="text-[11px] text-slate-400">Clicca la matita per modificare IP o parametri</span>
                  </div>

                  <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
                    {devices.map((d) => {
                      const cat = GENERIC_CATEGORIES.find((c) => c.kind === d.kind) || GENERIC_CATEGORIES[0];
                      const Icon = cat.icon;
                      return (
                        <div
                          key={d.id}
                          className={`p-2.5 bg-slate-900 border rounded-xl flex items-center justify-between text-xs transition ${
                            editingDeviceId === d.id ? 'border-sky-500 bg-sky-950/20' : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <div className="p-2 rounded-lg bg-slate-800 text-sky-400 shrink-0">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="overflow-hidden">
                              <div className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                <span>{d.name}</span>
                                {d.id === vantagePointId && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono">
                                    Vantage Point
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-sky-400">{d.addresses?.ip || 'Nessun IP'}</span>
                                <span>•</span>
                                <span>{d.location}</span>
                                <span>•</span>
                                <span className="uppercase font-mono text-[9px] text-slate-500">{d.kind}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleStartEditDevice(d)}
                              className="p-1.5 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 rounded-lg transition"
                              title="Modifica IP o nome"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDevice(d.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                              title="Rimuovi apparato"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Connections / Topology */}
          {currentStep === 3 && (
            <div className="flex-1 h-full grid grid-cols-12 gap-6">
              {/* Left Form: Add Link */}
              <div className="col-span-5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-3.5 text-xs">
                  <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                    <Network className="w-4 h-4 text-sky-400" /> Collega due Apparati
                  </h3>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Da (Sorgente / Switch / Gateway):</label>
                    <select
                      value={linkFrom}
                      onChange={(e) => setLinkFrom(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="">-- Seleziona apparato sorgente --</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.kind})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">A (Destinazione / Apparato collegato):</label>
                    <select
                      value={linkTo}
                      onChange={(e) => setLinkTo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="">-- Seleziona apparato destinazione --</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.kind})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Mezzo di Collegamento:</label>
                    <select
                      value={linkMedium}
                      onChange={(e) => setLinkMedium(e.target.value as LinkMedium)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                    >
                      <option value="ethernet">Ethernet (Cavo LAN Cat6/7)</option>
                      <option value="poe">PoE (Cavo Ethernet con Alimentazione PoE)</option>
                      <option value="wifi">Wi-Fi (Connessione Wireless)</option>
                      <option value="power">Alimentazione Protetta (da UPS)</option>
                      <option value="wan">WAN (Collegamento verso Internet)</option>
                      <option value="logical">Logico (Dipendenza applicativa/servizio)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Porta Sorgente (opz.):</label>
                      <input
                        type="text"
                        value={linkFromPort}
                        onChange={(e) => setLinkFromPort(e.target.value)}
                        placeholder="es. LAN1 o P1"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Porta Destinazione (opz.):</label>
                      <input
                        type="text"
                        value={linkToPort}
                        onChange={(e) => setLinkToPort(e.target.value)}
                        placeholder="es. Uplink o Eth0"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddLink}
                  disabled={!linkFrom || !linkTo || linkFrom === linkTo}
                  className="w-full mt-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-medium transition flex items-center justify-center gap-1.5 shadow text-xs"
                >
                  <Plus className="w-4 h-4" /> Aggiungi Collegamento
                </button>
              </div>

              {/* Right: Existing Links */}
              <div className="col-span-7 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-hidden">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-200 text-sm">Collegamenti Fisici & Logici ({links.length})</h3>
                    <button
                      onClick={handleAutoSuggestLinks}
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Suggerisci collegamenti
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
                    {links.map((lnk) => {
                      const fromDev = devices.find((d) => d.id === lnk.from_device_id);
                      const toDev = devices.find((d) => d.id === lnk.to_device_id);
                      return (
                        <div
                          key={lnk.id}
                          className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-medium text-slate-200 truncate">{fromDev?.name || lnk.from_device_id}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span className="font-medium text-slate-200 truncate">{toDev?.name || lnk.to_device_id}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-sky-400 uppercase border border-slate-700 shrink-0">
                              {lnk.medium}
                            </span>
                            {(lnk.from_port || lnk.to_port) && (
                              <span className="text-slate-500 text-[10px] shrink-0 font-mono">
                                [{lnk.from_port || '*'}&rarr;{lnk.to_port || '*'}]
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => handleRemoveLink(lnk.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                            title="Rimuovi collegamento"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Checks & Thresholds */}
          {currentStep === 4 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="font-bold text-slate-100 text-base">4. Frequenze di Controllo & Soglie di Isteresi</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Regola con che frequenza NetSentinel verifica gli apparati e quante volte deve fallire un controllo prima di emettere allarme:
                </p>
              </div>

              <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Frequenza Ping ICMP (Secondi):
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={120}
                      value={pingInterval}
                      onChange={(e) => setPingInterval(parseInt(e.target.value) || 15)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Consigliato: 15s (leggero su NAS).</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Frequenza Probe DNS (Secondi):
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={300}
                      value={dnsInterval}
                      onChange={(e) => setDnsInterval(parseInt(e.target.value) || 30)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Consigliato: 30s.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Timeout Risposta Sonda (Secondi):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={timeoutSec}
                      onChange={(e) => setTimeoutSec(parseInt(e.target.value) || 3)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Superato questo valore, il ping fallisce.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Isteresi Guasto (Campioni falliti consecutivi):
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={hysteresisFails}
                      onChange={(e) => setHysteresisFails(parseInt(e.target.value) || 3)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                    />
                    <span className="text-[10px] text-slate-500">Evita falsi positivi da jitter transitorio.</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Soglia Flapping Cavo (Oscillazioni in 10 minuti):
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={flappingThreshold}
                    onChange={(e) => setFlappingThreshold(parseInt(e.target.value) || 3)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Identifica cavi crimpati male prima che cadano del tutto.</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Vantage Point & Network Roles */}
          {currentStep === 5 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="font-bold text-slate-100 text-base">5. Vantage Point & Assegnazione Ruoli di Rete</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Distingui chi eroga ciascun servizio critico. Ad esempio, se usi un NAS con AdGuard Home o Pi-hole, seleziona il NAS come Server DNS e DHCP:
                </p>
              </div>

              <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Vantage Point (Host dove gira NetSentinel):
                  </label>
                  <select
                    value={vantagePointId}
                    onChange={(e) => setVantagePointId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-medium"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.addresses?.ip || 'IP N/D'}) — [{d.kind}]
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />
                      <span>Server DNS Primario (AdGuard / Pi-hole / Router):</span>
                    </label>
                    <select
                      value={dnsServerId}
                      onChange={(e) => setDnsServerId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-medium"
                    >
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.addresses?.ip || 'IP N/D'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                      <span>Server DHCP (Assegnazione Lease IP):</span>
                    </label>
                    <select
                      value={dhcpServerId}
                      onChange={(e) => setDhcpServerId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-sky-500 font-medium"
                    >
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.addresses?.ip || 'IP N/D'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    URL Dead-Man's Switch Esterno (Healthchecks.io):
                  </label>
                  <input
                    type="text"
                    value={deadMansUrl}
                    onChange={(e) => setDeadMansUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Se l'host di NetSentinel si spegne o la linea cade completamente, questo servizio esterno invierà un alert.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Notifications & Quiet Hours */}
          {currentStep === 6 && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div>
                <h3 className="font-bold text-slate-100 text-base">6. Canali di Allerta & Orari di Silenzio</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ricevi notifiche quando un incidente apre una root cause, senza raffiche di messaggi:
                </p>
              </div>

              <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-400" />
                    <span className="font-bold text-slate-200 text-xs">Notifiche Email SMTP</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={smtpEnabled}
                    onChange={(e) => setSmtpEnabled(e.target.checked)}
                    className="rounded border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
                  />
                </div>

                {smtpEnabled && (
                  <div className="space-y-3 pt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Host SMTP:</label>
                        <input
                          type="text"
                          value={smtpHost}
                          onChange={(e) => setSmtpHost(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Porta SMTP (587 o 465):</label>
                        <input
                          type="number"
                          value={smtpPort}
                          onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Username / Mail account:</label>
                        <input
                          type="text"
                          value={smtpUser}
                          onChange={(e) => setSmtpUser(e.target.value)}
                          placeholder="es. utente@gmail.com"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Password / App Password:</label>
                        <input
                          type="password"
                          value={smtpPass}
                          onChange={(e) => setSmtpPass(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Mittente (From):</label>
                        <input
                          type="text"
                          value={smtpFrom}
                          onChange={(e) => setSmtpFrom(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[11px] mb-1">Destinatario (To):</label>
                        <input
                          type="text"
                          value={smtpTo}
                          onChange={(e) => setSmtpTo(e.target.value)}
                          placeholder="es. admin@homelab.local"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestNotification}
                      disabled={isTestingNotif || !smtpUser || !smtpTo}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-750 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1.5 mt-2"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>{isTestingNotif ? 'Invio test in corso...' : 'Invia Notifica di Prova'}</span>
                    </button>

                    {testNotificationMsg && (
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
                        {testNotificationMsg}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-800 space-y-2 text-xs">
                  <h4 className="font-semibold text-slate-300">Orari di Silenzio (Quiet Hours):</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-500 text-[11px] mb-1">Inizio Silenzio:</label>
                      <input
                        type="time"
                        value={quietHoursStart}
                        onChange={(e) => setQuietHoursStart(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[11px] mb-1">Fine Silenzio:</label>
                      <input
                        type="time"
                        value={quietHoursEnd}
                        onChange={(e) => setQuietHoursEnd(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bypassCritical}
                      onChange={(e) => setBypassCritical(e.target.checked)}
                      className="rounded border-slate-700 text-sky-600 focus:ring-0"
                    />
                    <span className="text-slate-400 text-[11px]">Bypassa orari di silenzio per incidenti critici (Severità 5)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Deductions Review & Failure Simulator */}
          {currentStep === 7 && (
            <div className="max-w-3xl mx-auto space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-100 text-base">7. Revisione Dipendenze & Simulazione Guasti (Dry-Run)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verifica le dipendenze dedotte dal grafo e simula la rottura di un apparato per osservare la root cause:
                  </p>
                </div>
                <button
                  onClick={handleUpdateDependencies}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Aggiorna Deduzioni
                </button>
              </div>

              {/* Deduced Dependencies List */}
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 bg-slate-950/60 p-3 rounded-2xl border border-slate-800">
                {dependencies.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500">Nessuna dipendenza dedotta. Clicca "Aggiorna Deduzioni".</div>
                ) : (
                  dependencies.map((dep, idx) => (
                    <div key={idx} className="p-2 bg-slate-900 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{dep.dependent_id}</span>
                        <span className="text-slate-500 text-[11px]">dipende da</span>
                        <span className="font-semibold text-slate-200">{dep.provider_id}</span>
                        <span className="bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[9px] text-sky-400 font-mono uppercase">
                          {dep.kind}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 italic truncate max-w-xs">{dep.reason}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Simulation Sandbox */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-rose-500/30 space-y-3">
                <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5" /> Simulatore di Guasto Istantaneo
                </span>
                <div className="flex gap-2">
                  <select
                    value={simulatedDevice}
                    onChange={(e) => setSimulatedDevice(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="">-- Seleziona apparato da guastare nella simulazione --</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.kind}) [{d.addresses?.ip || 'N/D'}]
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => simulatedDevice && handleRunSimulation(simulatedDevice)}
                    disabled={!simulatedDevice || isSimulating}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow"
                  >
                    <Play className="w-3.5 h-3.5" /> {isSimulating ? 'Simulazione...' : 'Simula Guasto'}
                  </button>
                </div>

                {simulationResult && (
                  <div className="p-3.5 bg-slate-900 rounded-xl border border-rose-500/40 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-400 uppercase tracking-wider text-[11px]">
                        Diagnosi Root Cause: {translateDiagnosisTitle(t, simulationResult.rule_id, simulationResult.diagnosis_title)}
                      </span>
                      <span className="font-mono text-slate-300 text-[10px] bg-slate-800 px-2 py-0.5 rounded">
                        Confidenza: {Math.round((simulationResult.confidence || 0.95) * 100)}%
                      </span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      {translateDiagnosisSummary(t, simulationResult.rule_id, simulationResult.diagnosis_summary, simulationResult.diagnosis_title)}
                    </p>
                    {simulationResult.impacted_devices && simulationResult.impacted_devices.length > 0 && (
                      <div>
                        <span className="text-slate-500 text-[10px] block mb-1">
                          Sintomi silenziati (nessun falso allarme per questi nodi):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {simulationResult.impacted_devices.map((id: string) => (
                            <span key={id} className="bg-rose-950/60 border border-rose-800/80 text-rose-300 px-2 py-0.5 rounded text-[10px]">
                              {id}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 8: Final Summary & Launch */}
          {currentStep === 8 && (
            <div className="max-w-xl mx-auto space-y-5 text-center">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center border border-emerald-500/30">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-lg">Configurazione Pronta per l'Attivazione!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Tutti gli apparati, i collegamenti fisici, le dipendenze e i canali sono configurati.
                </p>
              </div>

              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs space-y-2.5 text-left">
                <div className="flex justify-between pb-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Apparati Monitorati:</span>
                  <span className="font-bold text-slate-200">{devices.length} nodi</span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Collegamenti Fisici:</span>
                  <span className="font-bold text-slate-200">{links.length} link</span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Vantage Point:</span>
                  <span className="font-bold text-indigo-300">{devices.find((d) => d.id === vantagePointId)?.name || vantagePointId}</span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Server DNS:</span>
                  <span className="font-bold text-cyan-300 inline-flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />
                    <span>{devices.find((d) => d.id === dnsServerId)?.name || dnsServerId}</span>
                  </span>
                </div>
                <div className="flex justify-between pb-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Server DHCP:</span>
                  <span className="font-bold text-amber-300 inline-flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                    <span>{devices.find((d) => d.id === dhcpServerId)?.name || dhcpServerId}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Frequenza Verifiche:</span>
                  <span className="font-bold text-slate-300">Ping ogni {pingInterval}s • DNS ogni {dnsInterval}s</span>
                </div>
              </div>

              <label className="flex items-center justify-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={useAutoLayout}
                  onChange={(e) => setUseAutoLayout(e.target.checked)}
                  className="rounded border-slate-700 text-sky-600 focus:ring-0"
                />
                <span>Applica Auto-Layout gerarchico (ELK) per disporre i nodi ordinatamente sulla tela</span>
              </label>
            </div>
          )}
        </div>

        {/* Wizard Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 text-xs font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" /> Indietro
          </button>

          {currentStep < 8 ? (
            <button
              onClick={async () => {
                if (currentStep === 2 && links.length === 0) {
                  handleAutoSuggestLinks();
                }
                if (currentStep === 6) {
                  await handleUpdateDependencies();
                }
                setCurrentStep(currentStep + 1);
              }}
              className="flex items-center gap-1.5 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/25 transition"
            >
              <span>Avanti: {STEPS[currentStep].label}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSaveAndApply}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-emerald-500/25 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Salvataggio in corso...' : 'Salva e Attiva Monitoraggio'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
