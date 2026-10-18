import React, { useState, useEffect } from 'react';
import {
  Shield,
  Layers,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Globe,
  Router as RouterIcon,
  Network,
  Wifi,
  HardDrive,
  Server,
  Zap,
  Cpu,
  Smartphone,
  Radio,
  FileCheck,
  Edit3,
  AlertTriangle,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceKind, Link, LinkMedium, FullTopology } from '../../types';
import {
  fetchTopologyTemplates,
  applyTopology,
  deduceDependencies,
  scanNetwork,
  quickPing,
} from '../../api/client';
import { getLayoutedElements } from '../../utils/elkLayout';

interface InitialSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopologyApplied: (newTopology: FullTopology) => void;
  onStartManualDrawing: () => void;
}

const DEVICE_CATEGORIES: Array<{
  kind: DeviceKind;
  label: string;
  defaultName: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultRoles: string[];
  defaultIp: string;
}> = [
  { kind: 'router', label: 'Router / Gateway', defaultName: 'Router Gateway', icon: RouterIcon, defaultRoles: ['gateway', 'dhcp_server', 'dns_resolver'], defaultIp: '192.168.1.1' },
  { kind: 'switch', label: 'Switch di Rete', defaultName: 'Switch Core PoE', icon: Network, defaultRoles: [], defaultIp: '192.168.1.2' },
  { kind: 'access_point', label: 'Access Point Wi-Fi', defaultName: 'AP Wi-Fi Salotto', icon: Wifi, defaultRoles: [], defaultIp: '192.168.1.20' },
  { kind: 'nas', label: 'NAS / Storage Server', defaultName: 'NAS Storage', icon: HardDrive, defaultRoles: [], defaultIp: '192.168.1.50' },
  { kind: 'ups', label: 'UPS Gruppo Continuità', defaultName: 'UPS Gruppo Continuità', icon: Zap, defaultRoles: ['power_provider'], defaultIp: '192.168.1.10' },
  { kind: 'server', label: 'Server / Hypervisor', defaultName: 'Server Proxmox VE', icon: Server, defaultRoles: [], defaultIp: '192.168.1.60' },
  { kind: 'smart_hub', label: 'Server Domotico', defaultName: 'Home Assistant Hub', icon: Cpu, defaultRoles: ['service'], defaultIp: '192.168.1.70' },
  { kind: 'wan_gateway', label: 'Internet / WAN Upstream', defaultName: 'Internet WAN', icon: Globe, defaultRoles: ['wan_provider'], defaultIp: '1.1.1.1' },
  { kind: 'client', label: 'Client / Workstation', defaultName: 'PC Workstation', icon: Smartphone, defaultRoles: [], defaultIp: '192.168.1.100' },
];

export const InitialSetupModal: React.FC<InitialSetupModalProps> = ({
  isOpen,
  onClose,
  onTopologyApplied,
  onStartManualDrawing,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'guided' | 'templates' | 'canvas'>('guided');
  const [guidedStep, setGuidedStep] = useState<number>(1);

  // Guided state
  const [devices, setDevices] = useState<Device[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [vantagePointId, setVantagePointId] = useState<string>('');
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [dnsServerId, setDnsServerId] = useState<string>('');
  const [dhcpServerId, setDhcpServerId] = useState<string>('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'infra' | 'clients'>('all');

  // Scanning & Reachability state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSubnet, setScanSubnet] = useState<string>('');
  const [reachabilityMap, setReachabilityMap] = useState<
    Record<string, { reachable: boolean; checking: boolean; rtt_ms?: number | null }>
  >({});
  const [excludedClientsCount, setExcludedClientsCount] = useState<number>(0);
  const [rawScannedClients, setRawScannedClients] = useState<any[]>([]);

  // Add device form state
  const [newKind, setNewKind] = useState<DeviceKind>('switch');
  const [newName, setNewName] = useState<string>('');
  const [newIp, setNewIp] = useState<string>('');
  const [newLocation, setNewLocation] = useState<string>('Casa');
  const [isDnsServer, setIsDnsServer] = useState<boolean>(false);
  const [isDhcpServer, setIsDhcpServer] = useState<boolean>(false);

  // Add link form state
  const [linkFrom, setLinkFrom] = useState<string>('');
  const [linkTo, setLinkTo] = useState<string>('');
  const [linkMedium, setLinkMedium] = useState<LinkMedium>('ethernet');
  const [linkFromPort, setLinkFromPort] = useState<string>('');
  const [linkToPort, setLinkToPort] = useState<string>('');

  // Templates state
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reachability check helper
  const checkDeviceReachability = async (deviceId: string, ip?: string) => {
    if (!ip || ip.trim() === '') return;
    setReachabilityMap((prev) => ({
      ...prev,
      [deviceId]: { reachable: true, checking: true },
    }));
    try {
      const res = await quickPing(ip.trim(), 1.5);
      setReachabilityMap((prev) => ({
        ...prev,
        [deviceId]: { reachable: res.reachable, checking: false, rtt_ms: res.rtt_ms },
      }));
    } catch {
      setReachabilityMap((prev) => ({
        ...prev,
        [deviceId]: { reachable: false, checking: false },
      }));
    }
  };

  // Automatic network scan handler
  const handleScanNetwork = async (subnetToScan?: string) => {
    setIsScanning(true);
    try {
      const targetSubnet = subnetToScan !== undefined ? subnetToScan : scanSubnet;
      const data = await scanNetwork(targetSubnet ? targetSubnet.trim() : undefined);
      if (data.subnet) setScanSubnet(data.subnet);
      if (data.devices && data.devices.length > 0) {
        const rawDevs = data.devices;
        const detectedClients = rawDevs.filter((d) => d.kind === 'client');
        setExcludedClientsCount(detectedClients.length);
        setRawScannedClients(detectedClients);

        // Exclude CLIENT devices by default per requirement
        const infrastructureDevices = rawDevs.filter((d) => d.kind !== 'client');

        const scannedDevs: Device[] = infrastructureDevices.map((d) => {
          const roles = [...d.roles];
          return {
            id: d.id,
            name: d.name,
            kind: d.kind as DeviceKind,
            location: d.location || 'LAN',
            criticality: d.kind === 'router' || d.is_gateway ? 5 : d.kind === 'switch' ? 4 : 3,
            addresses: { ip: d.ip, mac: d.mac },
            tags: [],
            roles,
            status: d.reachable ? 'ok' : 'unknown',
            status_since: new Date().toISOString(),
            interfaces: [],
          };
        });
        setDevices(scannedDevs);

        // Pre-fill reachability from scan results for infrastructure devices
        const rMap: Record<string, { reachable: boolean; checking: boolean; rtt_ms?: number | null }> = {};
        infrastructureDevices.forEach((d) => {
          rMap[d.id] = { reachable: d.reachable, checking: false, rtt_ms: d.rtt_ms };
        });
        setReachabilityMap(rMap);

        // Auto-select single vantage point, primary dns, and dhcp
        const vp =
          scannedDevs.find((d) => d.roles.includes('vantage_point')) ||
          scannedDevs.find((d) => d.kind === 'smart_hub' || d.kind === 'server') ||
          scannedDevs[0];
        if (vp) {
          setVantagePointId(vp.id);
          scannedDevs.forEach((d) => {
            if (d.id === vp.id) {
              if (!d.roles.includes('vantage_point')) d.roles.push('vantage_point');
            } else {
              d.roles = d.roles.filter((r) => r !== 'vantage_point');
            }
          });
        }

        const dns = scannedDevs.find((d) => d.roles.includes('dns_resolver')) || scannedDevs.find((d) => d.kind === 'router');
        if (dns) {
          setDnsServerId(dns.id);
          scannedDevs.forEach((d) => {
            if (d.id === dns.id) {
              if (!d.roles.includes('dns_resolver')) d.roles.push('dns_resolver');
            } else {
              d.roles = d.roles.filter((r) => r !== 'dns_resolver');
            }
          });
        }

        const dhcp = scannedDevs.find((d) => d.roles.includes('dhcp_server')) || scannedDevs.find((d) => d.kind === 'router');
        if (dhcp) {
          setDhcpServerId(dhcp.id);
          scannedDevs.forEach((d) => {
            if (d.id === dhcp.id) {
              if (!d.roles.includes('dhcp_server')) d.roles.push('dhcp_server');
            } else {
              d.roles = d.roles.filter((r) => r !== 'dhcp_server');
            }
          });
        }
      }
    } catch (err) {
      console.error('Errore durante la scansione di rete:', err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      // Scan network automatically on first opening if device list is empty
      if (devices.length === 0) {
        handleScanNetwork();
      }
    }
  }, [isOpen]);

  // Synchronize DNS and DHCP dropdowns whenever guidedStep becomes 3
  useEffect(() => {
    if (guidedStep === 3) {
      const devDns = devices.find((d) => d.roles?.includes('dns_resolver'));
      if (devDns) setDnsServerId(devDns.id);
      const devDhcp = devices.find((d) => d.roles?.includes('dhcp_server'));
      if (devDhcp) setDhcpServerId(devDhcp.id);
    }
  }, [guidedStep, devices]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await fetchTopologyTemplates();
      setTemplates(data);
    } catch (err) {
      console.error('Errore caricamento templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Include detected clients if user explicitly decides to do so
  const handleIncludeExcludedClients = () => {
    if (rawScannedClients.length === 0) return;
    const additionalDevs: Device[] = rawScannedClients.map((d) => {
      const roles = [...d.roles];
      if (!roles.includes('passive_tracking')) {
        roles.push('passive_tracking');
      }
      return {
        id: d.id,
        name: d.name,
        kind: 'client',
        location: d.location || 'LAN',
        criticality: 1,
        addresses: { ip: d.ip, mac: d.mac },
        tags: [],
        roles,
        status: d.reachable ? 'ok' : 'unknown',
        status_since: new Date().toISOString(),
        interfaces: [],
      };
    });

    setDevices((prev) => {
      const existingIds = new Set(prev.map((dev) => dev.id));
      const filtered = additionalDevs.filter((dev) => !existingIds.has(dev.id));
      return [...prev, ...filtered];
    });

    setReachabilityMap((prev) => {
      const next = { ...prev };
      rawScannedClients.forEach((d) => {
        next[d.id] = { reachable: d.reachable, checking: false, rtt_ms: d.rtt_ms };
      });
      return next;
    });

    setExcludedClientsCount(0);
    setRawScannedClients([]);
  };

  if (!isOpen) return null;

  // Add custom device to guided list
  const handleAddDevice = () => {
    if (editingDeviceId) {
      if (isDnsServer) setDnsServerId(editingDeviceId);
      if (isDhcpServer) setDhcpServerId(editingDeviceId);

      setDevices((prev) =>
        prev.map((d) => {
          if (d.id === editingDeviceId) {
            const updatedRoles = (d.roles || []).filter((r) => r !== 'dns_resolver' && r !== 'dhcp_server');
            if (isDnsServer) updatedRoles.push('dns_resolver');
            if (isDhcpServer) updatedRoles.push('dhcp_server');
            if (newKind === 'client' && !updatedRoles.includes('passive_tracking')) {
              updatedRoles.push('passive_tracking');
            }
            const updatedIp = newIp.trim() || d.addresses?.ip;
            if (updatedIp && updatedIp !== d.addresses?.ip) {
              checkDeviceReachability(d.id, updatedIp);
            }
            return {
              ...d,
              name: newName.trim() || d.name,
              kind: newKind,
              location: newLocation.trim() || d.location || 'Casa',
              addresses: { ...d.addresses, ip: updatedIp },
              roles: updatedRoles,
            };
          } else {
            // Strip dns_resolver or dhcp_server from previous holder if reassigned
            let otherRoles = d.roles || [];
            if (isDnsServer && otherRoles.includes('dns_resolver')) {
              otherRoles = otherRoles.filter((r) => r !== 'dns_resolver');
            }
            if (isDhcpServer && otherRoles.includes('dhcp_server')) {
              otherRoles = otherRoles.filter((r) => r !== 'dhcp_server');
            }
            return { ...d, roles: otherRoles };
          }
        })
      );
      setEditingDeviceId(null);
      setNewName('');
      setNewIp('');
      setIsDnsServer(false);
      setIsDhcpServer(false);
      return;
    }

    const cat = DEVICE_CATEGORIES.find((c) => c.kind === newKind) || DEVICE_CATEGORIES[0];
    const devName = newName.trim() || cat.defaultName;
    const devId =
      devName
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-')
        .replace(/-+/g, '-') +
      '-' +
      Math.floor(10 + Math.random() * 90);

    const devIp = newIp.trim() || cat.defaultIp;

    const initialRoles: string[] = [...cat.defaultRoles];
    if (isDnsServer && !initialRoles.includes('dns_resolver')) initialRoles.push('dns_resolver');
    if (isDhcpServer && !initialRoles.includes('dhcp_server')) initialRoles.push('dhcp_server');
    if (newKind === 'client' && !initialRoles.includes('passive_tracking')) initialRoles.push('passive_tracking');

    const newDev: Device = {
      id: devId,
      name: devName,
      kind: newKind,
      location: newLocation.trim() || 'Casa',
      criticality: newKind === 'client' ? 1 : 3,
      addresses: { ip: devIp },
      tags: [],
      roles: initialRoles,
      status: 'unknown',
      status_since: new Date().toISOString(),
      interfaces: [],
    };

    if (isDnsServer) setDnsServerId(devId);
    if (isDhcpServer) setDhcpServerId(devId);

    setDevices((prev) => {
      const cleaned = prev.map((d) => {
        let otherRoles = d.roles || [];
        if (isDnsServer && otherRoles.includes('dns_resolver')) {
          otherRoles = otherRoles.filter((r) => r !== 'dns_resolver');
        }
        if (isDhcpServer && otherRoles.includes('dhcp_server')) {
          otherRoles = otherRoles.filter((r) => r !== 'dhcp_server');
        }
        return { ...d, roles: otherRoles };
      });
      return [...cleaned, newDev];
    });

    if (!vantagePointId && newDev.roles.includes('vantage_point')) {
      setVantagePointId(newDev.id);
    }
    if (devIp) {
      checkDeviceReachability(newDev.id, devIp);
    }

    setNewName('');
    setNewIp('');
    setIsDnsServer(false);
    setIsDhcpServer(false);
  };

  const handleStartEdit = (dev: Device) => {
    setEditingDeviceId(dev.id);
    setNewName(dev.name);
    setNewIp(dev.addresses?.ip || '');
    setNewKind(dev.kind);
    setNewLocation(dev.location || 'Casa');
    setIsDnsServer(dev.roles.includes('dns_resolver'));
    setIsDhcpServer(dev.roles.includes('dhcp_server'));
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
    setLinks((prev) => prev.filter((l) => l.from_device_id !== id && l.to_device_id !== id));
    if (vantagePointId === id) setVantagePointId('');
    if (editingDeviceId === id) setEditingDeviceId(null);
  };

  // Add custom link
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

  // Auto-connect typical topology
  const handleAutoSuggestLinks = () => {
    const suggested: Link[] = [];
    const findByKind = (k: DeviceKind) => devices.filter((d) => d.kind === k);

    const wan = findByKind('wan_gateway')[0];
    const routers = findByKind('router');
    const switches = findByKind('switch');
    const aps = findByKind('access_point');
    const nases = findByKind('nas');
    const upses = findByKind('ups');
    const servers = findByKind('server');
    const clients = findByKind('client');

    const router = routers[0];
    const switchCore = switches[0];

    // WAN -> Router
    if (wan && router) {
      suggested.push({
        id: `lnk-${wan.id}-${router.id}`,
        from_device_id: wan.id,
        to_device_id: router.id,
        medium: 'wan',
        poe: false,
        status: 'ok',
        updated_at: new Date().toISOString(),
      });
    }

    // Router -> Switch
    if (router && switchCore) {
      suggested.push({
        id: `lnk-${router.id}-${switchCore.id}`,
        from_device_id: router.id,
        to_device_id: switchCore.id,
        medium: 'ethernet',
        poe: false,
        from_port: 'LAN1',
        to_port: 'Uplink',
        status: 'ok',
        updated_at: new Date().toISOString(),
      });
    }

    const mainDistributor = switchCore || router;
    if (mainDistributor) {
      // Switch -> APs
      aps.forEach((ap, idx) => {
        suggested.push({
          id: `lnk-${mainDistributor.id}-${ap.id}`,
          from_device_id: mainDistributor.id,
          to_device_id: ap.id,
          medium: 'poe',
          poe: true,
          from_port: `P${idx + 1}`,
          to_port: 'Eth0',
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      });

      // Switch -> NAS
      nases.forEach((nas, idx) => {
        suggested.push({
          id: `lnk-${mainDistributor.id}-${nas.id}`,
          from_device_id: mainDistributor.id,
          to_device_id: nas.id,
          medium: 'ethernet',
          poe: false,
          from_port: `P${idx + 5}`,
          to_port: 'LAN1',
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      });

      // Switch -> Servers
      servers.forEach((srv, idx) => {
        suggested.push({
          id: `lnk-${mainDistributor.id}-${srv.id}`,
          from_device_id: mainDistributor.id,
          to_device_id: srv.id,
          medium: 'ethernet',
          poe: false,
          from_port: `P${idx + 10}`,
          to_port: 'eno1',
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      });

      // Switch -> Clients:
      // Note: Client devices (smartphones, laptops, IoT plugs) roam wirelessly or disconnect dynamically.
      // They are tagged with passive tracking and not linked with static infrastructure cables to prevent false down alarms.
    }

    // UPS -> NAS & Servers (Power)
    if (upses.length > 0) {
      const ups = upses[0];
      [...nases, ...servers].forEach((target) => {
        suggested.push({
          id: `lnk-${ups.id}-${target.id}`,
          from_device_id: ups.id,
          to_device_id: target.id,
          medium: 'power',
          poe: false,
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      });
    }

    setLinks(suggested);
  };

  // Build and apply guided topology
  const handleApplyGuidedTopology = async () => {
    if (devices.length === 0) {
      alert('Aggiungi almeno un apparato di rete prima di proseguire.');
      return;
    }

    const vp = vantagePointId || devices[0].id;
    setSubmitting(true);
    try {
      // Map configured roles based on user choices for DNS, DHCP, and Vantage Point
      const configuredDevices: Device[] = devices.map((d) => {
        const rolesSet = new Set(d.roles || []);

        if (dnsServerId) {
          if (d.id === dnsServerId) {
            rolesSet.add('dns_resolver');
          } else {
            rolesSet.delete('dns_resolver');
          }
        }

        if (dhcpServerId) {
          if (d.id === dhcpServerId) {
            rolesSet.add('dhcp_server');
          } else {
            rolesSet.delete('dhcp_server');
          }
        }

        if (d.id === vp) {
          rolesSet.add('vantage_point');
        } else {
          rolesSet.delete('vantage_point');
        }

        if (d.kind === 'client' && !rolesSet.has('passive_tracking')) {
          rolesSet.add('passive_tracking');
        }

        return {
          ...d,
          roles: Array.from(rolesSet),
        };
      });

      // Deduce dependencies
      const deducedDeps = await deduceDependencies({
        vantage_point_id: vp,
        devices: configuredDevices.map((d) => ({ id: d.id, name: d.name, kind: d.kind, roles: d.roles })),
        links: links.map((l) => ({ id: l.id, from: l.from_device_id, to: l.to_device_id, medium: l.medium, poe: l.poe })),
      });

      // Generate ELK auto-layout nodes
      const rfNodes = configuredDevices.map((d, idx) => ({
        id: d.id,
        type: 'customNode',
        position: { x: 100 + (idx % 3) * 260, y: 100 + Math.floor(idx / 3) * 180 },
        data: { id: d.id, name: d.name, kind: d.kind, ip: d.addresses?.ip, status: 'ok', roles: d.roles },
      }));

      const rfEdges = links.map((l) => ({
        id: l.id,
        source: l.from_device_id,
        target: l.to_device_id,
        type: 'customEdge',
        data: { medium: l.medium, poe: l.poe, status: 'ok', fromPort: l.from_port, toPort: l.to_port },
      }));

      const layouted = await getLayoutedElements(rfNodes, rfEdges);

      const savedLayout = {
        id: 'default',
        nodes: layouted.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        edges: rfEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
        groups: [],
        updated_at: new Date().toISOString(),
      };

      await applyTopology({
        vantage_point_id: vp,
        description: 'Configurazione iniziale guidata NetSentinel',
        devices: configuredDevices,
        links,
        dependencies: deducedDeps,
        layout: savedLayout,
      });

      onTopologyApplied({
        vantage_point_id: vp,
        devices: configuredDevices,
        links,
        dependencies: deducedDeps,
        layout: savedLayout,
      });
      onClose();
    } catch (err: any) {
      console.error('Errore salvataggio:', err);
      alert('Errore salvataggio topologia: ' + (err.message || 'Verifica il backend.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Load selected pre-built template
  const handleApplyTemplate = async (template: any) => {
    setSubmitting(true);
    try {
      const deducedDeps = await deduceDependencies({
        vantage_point_id: template.vantage_point_id,
        devices: template.devices,
        links: template.links,
      });

      const rfNodes = template.devices.map((d: any, idx: number) => ({
        id: d.id,
        type: 'customNode',
        position: { x: 100 + (idx % 3) * 260, y: 100 + Math.floor(idx / 3) * 180 },
        data: { id: d.id, name: d.name, kind: d.kind, ip: d.addresses?.ip, status: 'ok', roles: d.roles },
      }));

      const rfEdges = template.links.map((l: any) => ({
        id: l.id,
        source: l.from_device_id,
        target: l.to_device_id,
        type: 'customEdge',
        data: { medium: l.medium, poe: l.poe, status: 'ok', fromPort: l.from_port, toPort: l.to_port },
      }));

      const layouted = await getLayoutedElements(rfNodes, rfEdges);

      const savedLayout = {
        id: 'default',
        nodes: layouted.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
        edges: rfEdges.map((e: any) => ({ id: e.id, source: e.source, target: e.target })),
        groups: [],
        updated_at: new Date().toISOString(),
      };


      const finalDevices: Device[] = template.devices.map((d: any) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        location: d.location || 'Casa',
        criticality: 3,
        addresses: d.addresses || {},
        tags: [],
        roles: d.roles || [],
        status: 'ok',
        status_since: new Date().toISOString(),
        interfaces: [],
      }));

      const finalLinks: Link[] = template.links.map((l: any) => ({
        id: l.id,
        from_device_id: l.from_device_id,
        to_device_id: l.to_device_id,
        medium: l.medium,
        poe: !!l.poe,
        from_port: l.from_port,
        to_port: l.to_port,
        status: 'ok',
        updated_at: new Date().toISOString(),
      }));

      await applyTopology({
        vantage_point_id: template.vantage_point_id,
        description: `Caricamento template: ${template.name}`,
        devices: finalDevices,
        links: finalLinks,
        dependencies: deducedDeps,
        layout: savedLayout,
      });

      onTopologyApplied({
        vantage_point_id: template.vantage_point_id,
        devices: finalDevices,
        links: finalLinks,
        dependencies: deducedDeps,
        layout: savedLayout,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      alert('Errore durante il caricamento del template: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[94vh] sm:h-[88vh] shadow-2xl overflow-hidden flex flex-col relative">
        {/* Modal Top Banner */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 border-b border-slate-800 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/30 shrink-0">
                <Shield className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-extrabold text-white text-base sm:text-xl tracking-tight truncate">
                  {t('wizard.title')}
                </h1>
                <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5 hidden xs:block truncate">
                  {t('wizard.subtitle')}
                </p>
              </div>
            </div>

            {/* Desktop Tab Selector */}
            <div className="hidden md:flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs shrink-0">
              <button
                onClick={() => setActiveTab('guided')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  activeTab === 'guided' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t('wizard.tab_guided')}</span>
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
                  activeTab === 'templates' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('wizard.tab_templates')}</span>
              </button>
              <button
                onClick={() => {
                  onStartManualDrawing();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg font-medium text-slate-400 hover:text-slate-200 transition flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{t('wizard.tab_canvas')}</span>
              </button>
            </div>

            {/* Close Button: Fixed & Always Visible */}
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/90 rounded-xl transition shrink-0 ml-1 cursor-pointer border border-slate-700/60 shadow-xs"
              title={t('common.close')}
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Mobile Tab Selector (dedicated row) */}
          <div className="flex md:hidden items-center gap-1 bg-slate-900/95 p-1 rounded-xl border border-slate-800 text-xs mt-2.5 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('guided')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition flex items-center justify-center gap-1 whitespace-nowrap ${
                activeTab === 'guided' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('wizard.tab_guided')}</span>
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium transition flex items-center justify-center gap-1 whitespace-nowrap ${
                activeTab === 'templates' ? 'bg-sky-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t('wizard.tab_templates')}</span>
            </button>
            <button
              onClick={() => {
                onStartManualDrawing();
                onClose();
              }}
              className="flex-1 py-1.5 px-2 rounded-lg font-medium text-slate-400 hover:text-slate-200 transition flex items-center justify-center gap-1 whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t('wizard.tab_canvas')}</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Guided Configuration */}
        {activeTab === 'guided' && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {/* Step Pills */}
            <div className="px-3.5 sm:px-6 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs shrink-0 overflow-x-auto max-w-full">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGuidedStep(1)}
                  className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    guidedStep === 1 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">1</span>
                  <span>{t('wizard.step_1', { count: devices.length })}</span>
                </button>
                <ArrowRight className="w-3 h-3 text-slate-600" />
                <button
                  onClick={() => setGuidedStep(2)}
                  className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    guidedStep === 2 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">2</span>
                  <span>{t('wizard.step_2', { count: links.length })}</span>
                </button>
                <ArrowRight className="w-3 h-3 text-slate-600" />
                <button
                  onClick={() => setGuidedStep(3)}
                  className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                    guidedStep === 3 ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'text-slate-400'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">3</span>
                  <span>{t('wizard.step_3')}</span>
                </button>
              </div>

              {guidedStep === 2 && links.length === 0 && (
                <button
                  onClick={handleAutoSuggestLinks}
                  className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg font-medium transition flex items-center gap-1 text-[11px]"
                >
                  <Sparkles className="w-3 h-3" /> {t('wizard.suggest_links')}
                </button>
              )}
            </div>

            {/* Step 1: Manage Devices */}
            {guidedStep === 1 && (
              <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-12 p-4 md:p-6 gap-6">
                {/* Left: Device Adder Form */}
                <div className="md:col-span-5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                  <div className="space-y-3 text-xs">
                    <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                      {editingDeviceId ? (
                        <>
                          <Edit3 className="w-4 h-4 text-emerald-400" /> {t('wizard.edit_device')}
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 text-sky-400" /> {t('wizard.add_device')}
                        </>
                      )}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      {editingDeviceId
                        ? t('wizard.edit_device_desc')
                        : t('wizard.add_device_desc')}
                    </p>

                    {/* Kinds Grid */}
                    <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto pr-1">
                      {DEVICE_CATEGORIES.map((cat) => {
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
                              if (cat.kind === 'router') {
                                setIsDnsServer(true);
                                setIsDhcpServer(true);
                              } else if (['switch', 'access_point', 'wan_gateway', 'client'].includes(cat.kind)) {
                                setIsDnsServer(false);
                                setIsDhcpServer(false);
                              }
                            }}
                            className={`p-2 rounded-xl border text-left flex flex-col items-center justify-center gap-1 transition ${
                              isSel
                                ? 'bg-sky-600/20 border-sky-500 text-sky-200'
                                : 'bg-slate-900 border-slate-800 hover:bg-slate-850 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <Icon className={`w-4 h-4 ${isSel ? 'text-sky-400' : 'text-slate-500'}`} />
                            <span className="text-[10px] text-center font-medium leading-tight">{cat.label}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">{t('wizard.device_name')}</label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={t('wizard.device_name_placeholder')}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">{t('wizard.ip_address')}</label>
                        <input
                          type="text"
                          value={newIp}
                          onChange={(e) => setNewIp(e.target.value)}
                          placeholder={t('wizard.ip_placeholder')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 font-mono text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">{t('wizard.location')}</label>
                        <input
                          type="text"
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          placeholder={t('wizard.location_placeholder')}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {/* Roles Checkboxes: DNS and DHCP Server */}
                    <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
                      <span className="block text-[11px] font-medium text-slate-300">
                        Ruoli & Servizi di Rete:
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <label
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                            isDnsServer
                              ? 'bg-sky-600/20 border-sky-500 text-sky-200'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDnsServer}
                            onChange={(e) => setIsDnsServer(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                          />
                          <Globe className={`w-3.5 h-3.5 stroke-[2.5] ${isDnsServer ? 'text-cyan-400' : 'text-slate-500'}`} />
                          <span className="font-medium text-[11px] leading-tight">{t('wizard.dns_server_role')}</span>
                        </label>

                        <label
                          className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                            isDhcpServer
                              ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                              : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDhcpServer}
                            onChange={(e) => setIsDhcpServer(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-0"
                          />
                          <Radio className={`w-3.5 h-3.5 stroke-[2.5] ${isDhcpServer ? 'text-amber-400' : 'text-slate-500'}`} />
                          <span className="font-medium text-[11px] leading-tight">{t('wizard.dhcp_server_role')}</span>
                        </label>
                      </div>

                      {(() => {
                        if (!isDnsServer) return null;
                        const prevDns = devices.find((d) => d.id !== editingDeviceId && d.roles?.includes('dns_resolver'));
                        if (!prevDns) return null;
                        return (
                          <div className="p-1.5 bg-amber-950/40 border border-amber-800/80 rounded text-[10px] text-amber-300 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <span>Il ruolo DNS verrà rimosso da <strong>{prevDns.name}</strong> e assegnato a questo apparato.</span>
                          </div>
                        );
                      })()}

                      {(() => {
                        if (!isDhcpServer) return null;
                        const prevDhcp = devices.find((d) => d.id !== editingDeviceId && d.roles?.includes('dhcp_server'));
                        if (!prevDhcp) return null;
                        return (
                          <div className="p-1.5 bg-amber-950/40 border border-amber-800/80 rounded text-[10px] text-amber-300 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                            <span>Il ruolo DHCP verrà rimosso da <strong>{prevDhcp.name}</strong> e assegnato a questo apparato.</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {editingDeviceId ? (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={handleAddDevice}
                        className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-1.5 shadow text-xs"
                      >
                        <Check className="w-4 h-4" /> {t('wizard.save_changes')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingDeviceId(null);
                          setNewName('');
                          setNewIp('');
                          setIsDnsServer(false);
                          setIsDhcpServer(false);
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition text-xs"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddDevice}
                      className="w-full mt-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-1.5 shadow text-xs font-semibold"
                    >
                      <Plus className="w-4 h-4" /> {t('wizard.add_to_list')}
                    </button>
                  )}
                </div>

                {/* Right: Configured Devices List */}
                <div className="md:col-span-7 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                  <div>
                    <div className="flex items-center justify-between mb-3 gap-2">
                      <div>
                        <h3 className="font-bold text-slate-200 text-sm">
                          {t('wizard.configured_devices', { count: devices.length })}
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          {t('wizard.configured_devices_desc')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-1 text-xs">
                          <span className="text-slate-400 mr-1.5 text-[11px] font-medium">{t('wizard.subnet_label')}:</span>
                          <input
                            type="text"
                            value={scanSubnet}
                            onChange={(e) => setScanSubnet(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleScanNetwork(scanSubnet);
                            }}
                            placeholder={t('wizard.subnet_placeholder')}
                            className="bg-transparent text-sky-300 font-mono text-xs w-28 focus:outline-none placeholder:text-slate-600"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleScanNetwork(scanSubnet)}
                          disabled={isScanning}
                          className="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 rounded-lg text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
                          title={t('wizard.rescan_button')}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                          <span className="hidden sm:inline">{isScanning ? t('wizard.scan_in_progress') : t('wizard.rescan_button')}</span>
                        </button>
                      </div>
                    </div>

                    {isScanning ? (
                      <div className="flex flex-col items-center justify-center p-12 text-center space-y-3 bg-slate-900/40 rounded-xl border border-slate-800">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-2 border-sky-500/30 border-t-sky-400 animate-spin" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Radio className="w-5 h-5 text-sky-400 animate-pulse" />
                          </div>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-200 text-sm">{t('wizard.scan_in_progress')}</h4>
                          <p className="text-xs text-slate-400 max-w-sm mt-1">{t('wizard.scan_subtitle')}</p>
                        </div>
                      </div>
                    ) : devices.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-10 text-center space-y-2 bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                        <p className="text-xs text-slate-300 font-medium">{t('wizard.scan_empty')}</p>
                        <p className="text-[11px] text-slate-500 max-w-xs">{t('wizard.scan_empty_hint')}</p>
                        <button
                          type="button"
                          onClick={() => handleScanNetwork(scanSubnet)}
                          className="mt-2 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-medium transition flex items-center gap-1.5 shadow"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{t('wizard.scan_button')}</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Informative notice on client exclusion */}
                        <div className="mb-3 p-3 bg-gradient-to-r from-sky-950/40 to-slate-900 border border-sky-500/30 rounded-xl text-xs space-y-1.5">
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex items-start gap-2 min-w-0">
                              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <span className="font-semibold text-sky-200 block text-[11px]">
                                  {t('wizard.clients_excluded_notice_title')}
                                </span>
                                <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                                  {t('wizard.clients_excluded_notice_desc')}
                                </p>
                              </div>
                            </div>
                            {excludedClientsCount > 0 && (
                              <button
                                type="button"
                                onClick={handleIncludeExcludedClients}
                                className="shrink-0 px-2.5 py-1 bg-sky-600/30 hover:bg-sky-600/50 text-sky-300 border border-sky-500/40 rounded-lg text-[10px] font-medium transition cursor-pointer"
                                title={t('wizard.include_clients_anyway_tooltip')}
                              >
                                {t('wizard.include_clients_anyway', { count: excludedClientsCount })}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 mb-2.5">
                          <button
                            type="button"
                            onClick={() => setDeviceFilter('all')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                              deviceFilter === 'all'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Tutti ({devices.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeviceFilter('infra')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                              deviceFilter === 'infra'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Solo Infrastruttura ({devices.filter((d) => d.kind !== 'client').length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeviceFilter('clients')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                              deviceFilter === 'clients'
                                ? 'bg-sky-600 text-white shadow-sm'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                          >
                            Solo Client / Passivi ({devices.filter((d) => d.kind === 'client').length})
                          </button>
                        </div>

                        <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                          {devices
                            .filter((d) => {
                              if (deviceFilter === 'infra') return d.kind !== 'client';
                              if (deviceFilter === 'clients') return d.kind === 'client';
                              return true;
                            })
                            .map((d) => {
                              const cat = DEVICE_CATEGORIES.find((c) => c.kind === d.kind) || DEVICE_CATEGORIES[0];
                              const Icon = cat.icon;
                              const isVp = d.id === vantagePointId || d.roles.includes('vantage_point');
                              const reach = reachabilityMap[d.id];
                              const isUnreachable = reach && !reach.checking && !reach.reachable;
                              const isChecking = reach?.checking;
                              const isPassive = d.roles.includes('passive_tracking') || d.kind === 'client';

                                return (
                                  <div
                                    key={d.id}
                                    onClick={() => handleStartEdit(d)}
                                    className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition cursor-pointer select-none ${
                                      editingDeviceId === d.id
                                        ? 'border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/50 shadow-sm shadow-sky-500/10'
                                        : isUnreachable
                                        ? 'border-amber-500/80 bg-amber-950/20 shadow-sm shadow-amber-500/10 hover:border-amber-400 hover:bg-amber-950/30'
                                        : 'border-slate-800 bg-slate-900 hover:border-slate-600 hover:bg-slate-800/60'
                                    }`}
                                  >
                                  <div className="flex items-center gap-2.5 overflow-hidden">
                                    <div
                                      className={`p-2 rounded-lg ${
                                        isUnreachable ? 'bg-amber-900/40 text-amber-400' : 'bg-slate-800 text-sky-400'
                                      }`}
                                    >
                                      <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="overflow-hidden">
                                      <div className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                                        <span>{d.name}</span>
                                        {isUnreachable && (
                                          <div
                                            className="flex items-center text-amber-400 cursor-help"
                                            title={t('wizard.ping_unreachable_warning')}
                                          >
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                                          </div>
                                        )}
                                        {isChecking && (
                                          <span className="flex items-center" title={t('wizard.ping_checking')}>
                                            <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                                          </span>
                                        )}
                                        {isVp && (
                                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono">
                                            {t('wizard.vantage_point_badge')}
                                          </span>
                                        )}
                                        {d.roles.includes('dns_resolver') && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[9px] font-mono">
                                            <Globe className="w-2.5 h-2.5 text-cyan-400 stroke-[2.5]" />
                                            <span>{t('wizard.dns_badge')}</span>
                                          </span>
                                        )}
                                        {d.roles.includes('dhcp_server') && (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-mono">
                                            <Radio className="w-2.5 h-2.5 text-amber-400 stroke-[2.5]" />
                                            <span>{t('wizard.dhcp_badge')}</span>
                                          </span>
                                        )}
                                        {isPassive && (
                                          <span
                                            className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 text-[9px] font-mono"
                                            title="Client tracciato passivamente (nessun falso allarme)"
                                          >
                                            Passivo
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                                        <span
                                          className={`font-mono ${
                                            isUnreachable ? 'text-amber-400 font-semibold' : 'text-sky-400'
                                          }`}
                                        >
                                          {d.addresses?.ip || 'Nessun IP'}
                                        </span>
                                        {reach?.reachable && reach.rtt_ms !== null && reach.rtt_ms !== undefined && (
                                          <span className="text-[10px] text-emerald-400 font-mono">
                                            ({reach.rtt_ms.toFixed(1)} ms)
                                          </span>
                                        )}
                                        <span>•</span>
                                        <span>{d.location}</span>
                                        <span>•</span>
                                        <span className="uppercase font-mono text-[9px] text-slate-500">{d.kind}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartEdit(d);
                                      }}
                                      className={`p-1.5 rounded-lg transition ${
                                        editingDeviceId === d.id
                                          ? 'text-sky-400 bg-sky-500/20'
                                          : 'text-slate-400 hover:text-sky-400 hover:bg-sky-500/10'
                                      }`}
                                      title={t('common.edit')}
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveDevice(d.id);
                                      }}
                                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                                      title={t('common.delete')}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
                    <button
                      onClick={() => {
                        if (links.length === 0) handleAutoSuggestLinks();
                        setGuidedStep(2);
                      }}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition flex items-center gap-1.5 shadow"
                    >
                      <span>{t('wizard.proceed_to_links')}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Manage Links / Relationships */}
            {guidedStep === 2 && (
              <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 md:grid-cols-12 p-4 md:p-6 gap-6">
                {/* Left: Link Creator */}
                <div className="md:col-span-5 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                  <div className="space-y-3.5 text-xs">
                    <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                      <Network className="w-4 h-4 text-sky-400" /> Crea Collegamento Fisico o Logico
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Indica come sono fisicamente o logicamente connessi gli apparati:
                    </p>

                    <div>
                      <label className="block text-slate-400 font-medium mb-1">Da (Sorgente / Switch / Provider):</label>
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
                      <label className="block text-slate-400 font-medium mb-1">Tipo Collegamento (Mezzo):</label>
                      <select
                        value={linkMedium}
                        onChange={(e) => setLinkMedium(e.target.value as LinkMedium)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-sky-500"
                      >
                        <option value="ethernet">Ethernet (Cavo LAN Cat6/7)</option>
                        <option value="poe">PoE (Cavo Ethernet con Alimentazione PoE)</option>
                        <option value="wifi">Wi-Fi (Connessione Radio Wireless)</option>
                        <option value="power">Alimentazione Protetta (da UPS)</option>
                        <option value="wan">WAN (Collegamento verso Internet)</option>
                        <option value="logical">Logico (Dipendenza di servizio DNS/DHCP)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Porta Sorgente (opz.):</label>
                        <input
                          type="text"
                          value={linkFromPort}
                          onChange={(e) => setLinkFromPort(e.target.value)}
                          placeholder="es. Port 1 o LAN"
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
                    className="w-full mt-3 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-medium transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <Plus className="w-4 h-4" /> Aggiungi Collegamento
                  </button>
                </div>

                {/* Right: Existing Links List */}
                <div className="md:col-span-7 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 flex flex-col justify-between overflow-y-auto">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-200 text-sm">Collegamenti Stabiliti ({links.length})</h3>
                      <button
                        onClick={handleAutoSuggestLinks}
                        className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                      >
                        Ricrea collegamenti tipici
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

                  <div className="pt-3 border-t border-slate-800 flex justify-between shrink-0">
                    <button
                      onClick={() => setGuidedStep(1)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition flex items-center gap-1.5 text-xs"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> Indietro
                    </button>
                    <button
                      onClick={() => setGuidedStep(3)}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium transition flex items-center gap-1.5 shadow"
                    >
                      <span>Vantage Point & Conferma</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Vantage Point and Network Roles */}
            {guidedStep === 3 && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 flex flex-col justify-between max-w-2xl mx-auto w-full">
                <div className="space-y-4">
                  <h3 className="font-bold text-slate-100 text-base">3. Ruoli di Rete e Vantage Point</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Specifica quale apparato svolge ciascun ruolo critico. Puoi assegnare DNS e DHCP al tuo Router, oppure al tuo NAS (se usi AdGuard Home, Pi-hole o container dedicati).
                  </p>

                  <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Host di NetSentinel (Vantage Point):
                      </label>
                      <p className="text-[11px] text-slate-400 mb-1.5">
                        L'apparato fisico/virtuale da cui partono i controlli e i ping di rete:
                      </p>
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

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-cyan-400 stroke-[2.5]" />
                          <span>Server DNS Primario:</span>
                        </label>
                        <p className="text-[11px] text-slate-400 mb-1.5">
                          AdGuard Home, Pi-hole o Router:
                        </p>
                        <select
                          value={dnsServerId}
                          onChange={(e) => {
                            const newDnsId = e.target.value;
                            setDnsServerId(newDnsId);
                            setDevices((prev) =>
                              prev.map((d) => {
                                const roles = (d.roles || []).filter((r) => r !== 'dns_resolver');
                                if (d.id === newDnsId) roles.push('dns_resolver');
                                return { ...d, roles };
                              })
                            );
                          }}
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
                          <span>Server DHCP (Assegnazione IP):</span>
                        </label>
                        <p className="text-[11px] text-slate-400 mb-1.5">
                          Router, NAS o Server DHCP:
                        </p>
                        <select
                          value={dhcpServerId}
                          onChange={(e) => {
                            const newDhcpId = e.target.value;
                            setDhcpServerId(newDhcpId);
                            setDevices((prev) =>
                              prev.map((d) => {
                                const roles = (d.roles || []).filter((r) => r !== 'dhcp_server');
                                if (d.id === newDhcpId) roles.push('dhcp_server');
                                return { ...d, roles };
                              })
                            );
                          }}
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
                  </div>

                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                    <h4 className="font-semibold text-sky-400">Riepilogo Configurazione Pronta:</h4>
                    <div className="text-slate-300">• {devices.length} apparati di rete monitorati</div>
                    <div className="text-slate-300">• {links.length} collegamenti fisici/logici stabiliti</div>
                    <div className="text-slate-300">
                      • Server DNS configurato su:{' '}
                      <span className="text-sky-300 font-semibold">
                        {devices.find((d) => d.id === dnsServerId)?.name || dnsServerId}
                      </span>
                    </div>
                    <div className="text-slate-300">
                      • Server DHCP configurato su:{' '}
                      <span className="text-amber-300 font-semibold">
                        {devices.find((d) => d.id === dhcpServerId)?.name || dhcpServerId}
                      </span>
                    </div>
                    <div className="text-slate-300">• Motore di deduzione dipendenze e progressioni live: ATTIVI</div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-800 flex justify-between shrink-0">
                  <button
                    onClick={() => setGuidedStep(2)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition flex items-center gap-1.5 text-xs"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Indietro
                  </button>
                  <button
                    onClick={handleApplyGuidedTopology}
                    disabled={submitting}
                    className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-sky-500/25 transition flex items-center gap-2 text-xs"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{submitting ? 'Generazione in corso...' : 'Genera Topologia e Avvia Live!'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Preconfigured Templates */}
        {activeTab === 'templates' && (
          <div className="flex-1 p-6 overflow-y-auto space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-100">Modelli di Rete Preconfigurati</h2>
              <p className="text-xs text-slate-400">
                Seleziona uno schema tipico già pronto. Verrà caricato sulla tela e potrai personalizzare subito nomi, IP e collegamenti.
              </p>
            </div>

            {loadingTemplates ? (
              <div className="py-12 text-center text-slate-500 text-xs">Caricamento modelli in corso...</div>
            ) : (
              <div className="grid grid-cols-3 gap-4 pt-2">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="bg-slate-950/70 border border-slate-800 hover:border-sky-500/60 rounded-2xl p-5 flex flex-col justify-between space-y-4 transition group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-extrabold text-slate-100 text-sm group-hover:text-sky-300 transition">
                          {tpl.name}
                        </span>
                        <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded font-mono text-slate-400">
                          {tpl.devices.length} nodi
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{tpl.description}</p>

                      <div className="mt-4 space-y-1 text-[11px] text-slate-500 font-mono">
                        <div>• {tpl.devices.length} apparati tipizzati</div>
                        <div>• {tpl.links.length} collegamenti fisici/logici</div>
                        <div>• Vantage Point: {tpl.vantage_point_id}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleApplyTemplate(tpl)}
                      disabled={submitting}
                      className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Applicazione...' : 'Carica Questo Template'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
