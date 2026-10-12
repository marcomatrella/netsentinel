import React, { useEffect, useState, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Edit3,
  Eye,
  Wand2,
  RefreshCw,
  Maximize2,
  Minimize2,
  PauseCircle,
  Plus,
  Save,
  Undo2,
  CheckCircle2,
  Sparkles,
  Network,
  Mail,
  ScrollText,
  History,
  AlertTriangle,
  RotateCcw,
  Clock,
  FlaskConical,
  Search,
  FileJson,
} from 'lucide-react';

import { Device, Link, FullTopology, Incident, CanvasLayout, SimulationResponse } from './types';
import {
  fetchTopology,
  fetchIncidents,
  fetchHistoricalSnapshot,
  applyTopology,
  deduceDependencies,
  updateDevice,
  setupSSEStream,
  fetchSettings,
  fetchActiveScheduledMaintenance,
  simulateFailure,
} from './api/client';
import { NetworkCanvas } from './components/canvas/NetworkCanvas';
import { Palette } from './components/canvas/Palette';
import { IncidentBanner } from './components/panels/IncidentBanner';
import { DeviceDetailPanel } from './components/panels/DeviceDetailPanel';
import { LinkDetailPanel } from './components/panels/LinkDetailPanel';
import { WizardModal } from './components/wizard/WizardModal';
import { InitialSetupModal } from './components/onboarding/InitialSetupModal';
import { AddDeviceModal } from './components/panels/AddDeviceModal';
import { NetworkRolesModal } from './components/panels/NetworkRolesModal';
import { BackupRestoreModal } from './components/panels/BackupRestoreModal';
import { NetworkDiscoveryModal } from './components/panels/NetworkDiscoveryModal';
import { NotificationSettingsModal } from './components/notifications/NotificationSettingsModal';
import { EventLogsModal } from './components/events/EventLogsModal';
import { SystemSettingsModal } from './components/modals/SystemSettingsModal';
import { ScheduledMaintenanceModal } from './components/modals/ScheduledMaintenanceModal';
import { HeaderMenuDropdown } from './components/navigation/HeaderMenuDropdown';
import { LanguageSwitcher } from './components/navigation/LanguageSwitcher';
import { ThemeSwitcher } from './components/navigation/ThemeSwitcher';
import { TimeMachineSlider } from './components/timemachine/TimeMachineSlider';
import { useTranslation } from './i18n/I18nContext';

export const App: React.FC = () => {
  const { t } = useTranslation();
  const [topology, setTopology] = useState<FullTopology | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isInitialSetupOpen, setIsInitialSetupOpen] = useState<boolean>(false);
  const [isAddDeviceOpen, setIsAddDeviceOpen] = useState<boolean>(false);
  const [isRolesModalOpen, setIsRolesModalOpen] = useState<boolean>(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState<boolean>(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState<boolean>(false);
  const [simulatedIncident, setSimulatedIncident] = useState<SimulationResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [retentionPeriod, setRetentionPeriod] = useState<string>('24h');
  const [isScheduledMaintenanceOpen, setIsScheduledMaintenanceOpen] = useState<boolean>(false);
  const [maintenanceTargetDeviceId, setMaintenanceTargetDeviceId] = useState<string | null>(null);
  const [isEventLogsOpen, setIsEventLogsOpen] = useState<boolean>(false);
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(false);
  const [isHistoricalMode, setIsHistoricalMode] = useState<boolean>(false);
  const [historicalTime, setHistoricalTime] = useState<Date | null>(null);
  const [historicalErrorSummary, setHistoricalErrorSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const [activeScheduledMaintenance, setActiveScheduledMaintenance] = useState<{
    is_global_active: boolean;
    global_window: any | null;
    active_device_windows: any[];
  }>({
    is_global_active: false,
    global_window: null,
    active_device_windows: [],
  });

  const isHistoricalModeRef = React.useRef<boolean>(false);
  useEffect(() => {
    isHistoricalModeRef.current = isHistoricalMode;
  }, [isHistoricalMode]);

  // Load topology and incidents
  const loadData = useCallback(async (resetHistorical: boolean = false) => {
    try {
      const [topoData, incData, settingsData, maintActiveData] = await Promise.all([
        fetchTopology(),
        fetchIncidents('open'),
        fetchSettings().catch(() => ({ retention_period: '24h', settings: {} })),
        fetchActiveScheduledMaintenance().catch(() => ({
          is_global_active: false,
          global_window: null,
          active_device_windows: [],
        })),
      ]);
      setTopology(topoData);
      setIncidents(incData);
      setActiveIncident(incData.length > 0 ? incData[0] : null);
      setActiveScheduledMaintenance(maintActiveData);
      if (settingsData?.retention_period) {
        setRetentionPeriod(settingsData.retention_period);
      }
      if (resetHistorical) {
        setIsHistoricalMode(false);
      }
      setError(null);

      // First run detection: if 0 devices, show onboarding setup modal
      if (topoData.devices.length === 0) {
        setIsInitialSetupOpen(true);
      }
    } catch (err: any) {
      console.error('Errore caricamento dati:', err);
      setError(err.message || 'Impossibile connettersi al server NetSentinel');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Connect Server-Sent Events (SSE) for incremental real-time streaming
    // Crucial: Use isHistoricalModeRef so the live stream NEVER overwrites historical canvas state!
    const cleanupSSE = setupSSEStream((diff) => {
      if (isHistoricalModeRef.current) return;
      if (diff.devices) {
        setTopology((prev) => {
          if (!prev) return prev;
          const statusMap = new Map(diff.devices.map((d: any) => [d.id, d.status]));
          const rttMap = new Map(diff.devices.map((d: any) => [d.id, d.rtt_ms]));
          const updatedDevices = prev.devices.map((dev) => ({
            ...dev,
            status: (statusMap.get(dev.id) as any) || dev.status,
            rtt_ms: rttMap.has(dev.id) ? (rttMap.get(dev.id) as any) : dev.rtt_ms,
          }));
          return { ...prev, devices: updatedDevices };
        });
      }
      if (diff.links) {
        setTopology((prev) => {
          if (!prev) return prev;
          const linkStatusMap = new Map(diff.links.map((l: any) => [l.id, l.status]));
          const updatedLinks = prev.links.map((lnk) => ({
            ...lnk,
            status: (linkStatusMap.get(lnk.id) as any) || lnk.status,
          }));
          return { ...prev, links: updatedLinks };
        });
      }
      if (diff.active_incident !== undefined) {
        setActiveIncident(diff.active_incident);
      }
      if (diff.maintenance !== undefined) {
        setActiveScheduledMaintenance(diff.maintenance);
      }
    });

    return () => cleanupSSE();
  }, [loadData]);

  // Handle Time Machine historical scrubbing
  const handleTimeTravel = async (targetDate: Date, targetDeviceId?: string) => {
    isHistoricalModeRef.current = true;
    setIsHistoricalMode(true);
    setHistoricalTime(targetDate);

    try {
      const snapshot = await fetchHistoricalSnapshot(targetDate.toISOString(), targetDeviceId);
      if (snapshot && topology) {
        const histIdMap = new Map(snapshot.devices.map((d: any) => [d.id, d.status]));
        const histNameMap = new Map(snapshot.devices.map((d: any) => [(d.name || '').toLowerCase(), d.status]));
        setTopology((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            devices: prev.devices.map((dev) => {
              const newStatus =
                histIdMap.get(dev.id) ||
                histNameMap.get((dev.name || '').toLowerCase()) ||
                dev.status;
              return {
                ...dev,
                status: newStatus as any,
              };
            }),
          };
        });
        setActiveIncident(snapshot.active_incident);

        if (snapshot.maintenance) {
          setActiveScheduledMaintenance(snapshot.maintenance);
        }

        if (snapshot.active_incident?.summary) {
          setHistoricalErrorSummary(snapshot.active_incident.summary);
        } else if (snapshot.events_around?.length > 0) {
          const firstEv = snapshot.events_around[0];
          setHistoricalErrorSummary(`${firstEv.title}: ${firstEv.message}`);
        } else {
          setHistoricalErrorSummary(null);
        }
      }
    } catch (err) {
      console.error('Errore snapshot storico:', err);
    }
  };

  // Add device to topology in edit mode
  const handleAddDevice = (newDev: Device, position?: { x: number; y: number }) => {
    if (!topology) return;
    const currentNodes = topology.layout?.nodes || [];
    const newLayoutNodes = position
      ? [...currentNodes.filter((n: any) => n.id !== newDev.id), { id: newDev.id, x: position.x, y: position.y }]
      : currentNodes;

    const isNewDns = newDev.roles?.includes('dns_resolver');
    const isNewDhcp = newDev.roles?.includes('dhcp_server');

    const cleanDevices = topology.devices.map((d) => {
      let r = d.roles || [];
      if (isNewDns && r.includes('dns_resolver')) r = r.filter((x) => x !== 'dns_resolver');
      if (isNewDhcp && r.includes('dhcp_server')) r = r.filter((x) => x !== 'dhcp_server');
      return { ...d, roles: r };
    });

    setTopology({
      ...topology,
      devices: [...cleanDevices, newDev],
      layout: {
        ...(topology.layout || { id: 'default', edges: [], groups: [], updated_at: new Date().toISOString() }),
        nodes: newLayoutNodes,
      },
    });
  };

  // Add multiple discovered devices from Auto-Discovery scan
  const handleAddDiscoveredDevices = (newDevices: Device[]) => {
    if (!topology || newDevices.length === 0) return;
    const currentNodes = [...(topology.layout?.nodes || [])];
    const existingIds = new Set(topology.devices.map((d) => d.id));
    const toAppend: Device[] = [];

    let startX = 120;
    let startY = 80;
    if (currentNodes.length > 0) {
      const maxY = Math.max(...currentNodes.map((n: any) => n.y || 0));
      startY = maxY + 180;
    }

    newDevices.forEach((dev, idx) => {
      if (!existingIds.has(dev.id)) {
        toAppend.push(dev);
        currentNodes.push({
          id: dev.id,
          x: startX + (idx % 4) * 240,
          y: startY + Math.floor(idx / 4) * 160,
        });
      }
    });

    if (toAppend.length === 0) return;

    setTopology({
      ...topology,
      devices: [...topology.devices, ...toAppend],
      layout: {
        ...(topology.layout || { id: 'default', edges: [], groups: [], updated_at: new Date().toISOString() }),
        nodes: currentNodes,
      },
    });
    // Turn on Edit Mode so user can save or rearrange
    setIsEditMode(true);
  };

  // Start What-If failure simulation for a device
  const handleSimulateDevice = async (deviceId: string) => {
    setIsSimulating(true);
    try {
      const res = await simulateFailure({
        failed_device_ids: [deviceId],
        failed_link_ids: [],
      });
      setSimulatedIncident(res);
      setSelectedDevice(null);
    } catch (err: any) {
      alert(err.message || 'Errore durante la simulazione del guasto.');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleExitSimulation = () => {
    setSimulatedIncident(null);
  };

  // Track canvas layout updates when nodes are dragged or auto-layouted
  const handleLayoutChange = useCallback((newLayout: CanvasLayout) => {
    setTopology((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        layout: newLayout,
      };
    });
  }, []);

  // Update device in topology
  const handleUpdateDevice = async (deviceId: string, updatedData: Partial<Device>) => {
    if (!topology) return;
    try {
      const updated = await updateDevice(deviceId, updatedData);
      const isNewDns = updatedData.roles?.includes('dns_resolver');
      const isNewDhcp = updatedData.roles?.includes('dhcp_server');

      setTopology((prev) => {
        if (!prev) return prev;
        const newDevs = prev.devices.map((d) => {
          if (d.id === deviceId) return { ...d, ...updated };
          let roles = d.roles || [];
          if (isNewDns && roles.includes('dns_resolver')) {
            roles = roles.filter((r) => r !== 'dns_resolver');
          }
          if (isNewDhcp && roles.includes('dhcp_server')) {
            roles = roles.filter((r) => r !== 'dhcp_server');
          }
          return { ...d, roles };
        });
        return { ...prev, devices: newDevs };
      });
      setSelectedDevice((prev) => (prev && prev.id === deviceId ? { ...prev, ...updated } : prev));
      await loadData();
    } catch (err: any) {
      console.error(err);
      alert('Errore aggiornamento apparato: ' + err.message);
    }
  };

  // Delete device from topology in edit mode
  const handleDeleteDevice = (devId: string) => {
    if (!topology) return;
    setTopology({
      ...topology,
      devices: topology.devices.filter((d) => d.id !== devId),
      links: topology.links.filter((l) => l.from_device_id !== devId && l.to_device_id !== devId),
    });
    if (selectedDevice?.id === devId) setSelectedDevice(null);
  };

  // Connect link in edit mode
  const handleConnectLink = (newLink: Link) => {
    if (!topology) return;
    setTopology({
      ...topology,
      links: [...topology.links, newLink],
    });
  };

  // Delete link from topology
  const handleDeleteLink = (linkId: string) => {
    if (!topology) return;
    setTopology({
      ...topology,
      links: topology.links.filter((l) => l.id !== linkId),
    });
    if (selectedLink?.id === linkId) setSelectedLink(null);
  };

  // Save changes from Edit Mode
  const handleSaveTopology = async () => {
    if (!topology) return;
    setIsSaving(true);
    try {
      const vp =
        topology.vantage_point_id ||
        (topology.devices[0] ? topology.devices[0].id : 'nas-server');

      const deducedDeps = await deduceDependencies({
        vantage_point_id: vp,
        devices: topology.devices.map((d) => ({
          id: d.id,
          name: d.name,
          kind: d.kind,
          roles: d.roles,
        })),
        links: topology.links.map((l) => ({
          id: l.id,
          from: l.from_device_id,
          to: l.to_device_id,
          medium: l.medium,
          poe: l.poe,
        })),
      });

      const currentLayout = topology.layout || {
        id: 'default',
        nodes: [],
        edges: [],
        groups: [],
        updated_at: new Date().toISOString(),
      };

      await applyTopology({
        vantage_point_id: vp,
        description: 'Salvataggio modifiche dalla tela grafica',
        devices: topology.devices,
        links: topology.links,
        dependencies: deducedDeps,
        layout: currentLayout,
      });

      setSaveSuccessMsg('Configurazione salvata con successo!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
      setIsEditMode(false); // Return to live view with animated interconnections
      await loadData();
    } catch (err: any) {
      console.error('Errore salvataggio:', err);
      alert('Errore durante il salvataggio: ' + (err.message || 'Verifica il backend.'));
    } finally {
      setIsSaving(false);
    }
  };

  // Handle node selection
  const handleSelectDevice = (dev: Device | null) => {
    setSelectedDevice(dev);
    setSelectedLink(null);
  };

  // Handle edge selection
  const handleSelectLink = (lnk: Link | null) => {
    setSelectedLink(lnk);
    setSelectedDevice(null);
  };

  const renderStatusIcon = () => {
    let statusClass = 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-900/50';
    let Icon = ShieldCheck;
    let label = t('header.status_ok');
    let sublabel = t('header.status_ok_desc');
    let isPulse = false;

    if (activeIncident) {
      statusClass = 'bg-rose-50 text-rose-600 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800 ring-2 ring-rose-500/30 hover:bg-rose-100 dark:hover:bg-rose-900/50';
      Icon = ShieldAlert;
      label = t('header.status_incident');
      sublabel = activeIncident.summary || t('header.status_incident_desc');
      isPulse = true;
    } else if (isMaintenanceMode) {
      statusClass = 'bg-amber-50 text-amber-600 border-amber-300 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50';
      Icon = PauseCircle;
      label = t('header.status_maintenance');
      sublabel = t('header.status_maintenance_desc');
    }

    return (
      <div className="relative group hidden sm:block">
        <button
          type="button"
          onClick={() => {
            if (activeIncident) {
              setIsEventLogsOpen(true);
            }
          }}
          className={`w-9 h-9 rounded-xl border flex items-center justify-center transition-all shadow-sm ${statusClass} ${
            isPulse ? 'animate-pulse' : ''
          }`}
          title={`${label}${sublabel ? ` - ${sublabel}` : ''}`}
          aria-label={label}
        >
          <Icon className="w-4 h-4" />
        </button>

        {/* Hover Tooltip Description */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 hidden group-hover:flex flex-col items-center z-50 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95">
          <div className="w-2 h-2 bg-slate-900 dark:bg-slate-800 rotate-45 border-l border-t border-slate-700/60 -mb-1" />
          <div className="bg-slate-900 text-white dark:bg-slate-800 dark:text-slate-100 border border-slate-700 shadow-xl rounded-xl px-3 py-2 text-xs min-w-[210px] max-w-xs text-center backdrop-blur-md">
            <div className="font-bold flex items-center justify-center gap-1.5 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  activeIncident
                    ? 'bg-rose-500 animate-ping'
                    : isMaintenanceMode
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
              />
              <span>{label}</span>
            </div>
            {sublabel && (
              <div className="text-[11px] text-slate-300 dark:text-slate-300 mt-0.5 leading-snug">
                {sublabel}
              </div>
            )}
            {activeIncident && (
              <div className="text-[10px] text-sky-400 mt-1 font-medium">
                {t('header.status_click_logs')}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Navbar (Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <header className="h-14 border-b border-slate-200 bg-white/90 dark:border-slate-800 dark:bg-slate-900/90 backdrop-blur-md px-2.5 sm:px-4 flex items-center justify-between z-30 transition-all">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20 shrink-0">
              <Shield className="w-4 h-4 sm:w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 dark:text-white truncate">NetSentinel</h1>
                <span className="text-[9px] sm:text-[10px] bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-mono px-1 py-0.2 sm:px-1.5 sm:py-0.5 rounded border border-slate-300 dark:border-slate-700 shrink-0">
                  v1.1.0
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden md:block truncate">{t('header.subtitle')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {renderStatusIcon()}

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1 hidden sm:block" />

            {/* 1 - Modifica plancia */}
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm ${
                isEditMode
                  ? 'bg-amber-600 text-white border-amber-500 shadow-amber-500/20'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 dark:border-slate-700'
              }`}
              title={isEditMode ? t('menu.toggle_live_view') : t('header.edit_canvas')}
            >
              {isEditMode ? (
                <Eye className="w-3.5 h-3.5 text-white" />
              ) : (
                <Edit3 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              )}
              <span className="hidden md:inline">{isEditMode ? t('header.view_live') : t('header.edit_canvas')}</span>
            </button>

            {/* 2 - Registro Eventi (Log) */}
            <button
              onClick={() => setIsEventLogsOpen(true)}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border shadow-sm bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
              title={t('header.event_logs')}
            >
              <ScrollText className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              <span className="hidden md:inline">{t('header.event_logs')}</span>
            </button>

            {/* 3 - Light/Dark mode */}
            <ThemeSwitcher />

            {/* 4 - Lingua (con bandiera della lingua) */}
            <LanguageSwitcher />

            {/* 5 - Tasto per menu contestuale con tutte le voci */}
            <HeaderMenuDropdown
              onOpenInitialSetup={() => setIsInitialSetupOpen(true)}
              onOpenDiscovery={() => setIsDiscoveryOpen(true)}
              onOpenBackupRestore={() => setIsBackupRestoreOpen(true)}
              onOpenRolesModal={() => setIsRolesModalOpen(true)}
              onOpenWizard={() => setIsWizardOpen(true)}
              onOpenNotificationModal={() => setIsNotificationModalOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenMaintenance={() => {
                setMaintenanceTargetDeviceId(null);
                setIsScheduledMaintenanceOpen(true);
              }}
              onOpenLogs={() => setIsEventLogsOpen(true)}
              onOpenKiosk={() => setIsKioskMode(true)}
              onRefresh={() => loadData()}
            />
          </div>
        </header>
      )}

      {/* Edit Mode Top Floating Action Bar */}
      {isEditMode && !isKioskMode && (
        <div className="bg-sky-50/95 dark:bg-sky-950/70 border-b border-sky-200 dark:border-sky-800/60 px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs z-20 backdrop-blur-md">
          <div className="flex items-center gap-1.5 sm:gap-2 text-sky-900 dark:text-sky-200">
            <Edit3 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="font-semibold">{t('edit_bar.title')}</span>
            <span className="text-slate-600 dark:text-slate-400 hidden sm:inline truncate">
              {t('edit_bar.instructions')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {saveSuccessMsg && (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold animate-pulse text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {saveSuccessMsg}
              </span>
            )}
            <button
              onClick={() => setIsDiscoveryOpen(true)}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 rounded-lg font-medium transition flex items-center gap-1 shadow-sm"
              title="Scansiona la subnet e rileva apparati in un clic"
            >
              <Search className="w-3.5 h-3.5 text-amber-500" />
              <span>{t('discovery.start_scan') || 'Rileva Rete'}</span>
            </button>
            <button
              onClick={() => setIsAddDeviceOpen(true)}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-lg font-medium transition flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              <span>{t('edit_bar.add_device')}</span>
            </button>
            <button
              onClick={handleSaveTopology}
              disabled={isSaving}
              className="px-3 py-1 sm:px-4 sm:py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-md shadow-sky-500/25 transition flex items-center gap-1"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? t('edit_bar.saving') : t('edit_bar.save_changes')}</span>
            </button>
            <button
              onClick={() => {
                loadData();
                setIsEditMode(false);
              }}
              className="px-2.5 py-1 sm:px-3 sm:py-1.5 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-300 dark:border-transparent rounded-lg font-medium transition flex items-center gap-1"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>{t('edit_bar.cancel')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Kiosk exit button when in Kiosk Mode */}
      {isKioskMode && (
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
          <button
            onClick={() => setIsKioskMode(false)}
            className="px-3 py-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium shadow-xl backdrop-blur-md flex items-center gap-1.5"
            title={t('header.kiosk_exit')}
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>{t('header.kiosk_exit')}</span>
          </button>
          {renderStatusIcon()}
        </div>
      )}

      {/* What-If Simulation Active Banner */}
      {simulatedIncident && (
        <div className="bg-gradient-to-r from-rose-950/90 via-purple-950/90 to-rose-950/90 border-b border-rose-500/40 px-4 py-2.5 text-xs text-white flex flex-wrap items-center justify-between gap-3 shadow-lg z-30 backdrop-blur-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg animate-pulse">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-rose-300 flex items-center gap-2">
                <span>{t('simulation.banner_title') || '🧪 Simulazione What-If attiva'}</span>
                <span className="font-mono px-2 py-0.2 rounded-full bg-rose-500/20 text-rose-200 border border-rose-500/40 text-[10px]">
                  {simulatedIncident.diagnosis_title}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                {t('simulation.banner_root_cause') || 'Causa radice simulata:'}{' '}
                <strong className="text-white font-mono">{simulatedIncident.root_cause_device_id}</strong> •{' '}
                {t('simulation.banner_impacted', { count: simulatedIncident.impacted_devices.length }) ||
                  `Apparati impattati: ${simulatedIncident.impacted_devices.length}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExitSimulation}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>{t('simulation.btn_exit') || 'Termina Simulazione'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Incident Banner (visible if incident open) */}
      {!simulatedIncident && <IncidentBanner incident={activeIncident} onRefresh={loadData} />}

      {/* Main Body */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Palette in Edit Mode */}
        {isEditMode && !isKioskMode && (
          <aside className="w-56 sm:w-64 absolute sm:relative inset-y-0 left-0 z-30 transition-all duration-300 shadow-xl sm:shadow-none animate-in slide-in-from-left duration-200">
            <Palette onAddNode={(kind, label, roles) => {
              handleAddDevice({
                id: `${kind}-${Math.floor(100 + Math.random() * 900)}`,
                name: label,
                kind,
                location: 'Casa',
                criticality: 3,
                addresses: { ip: `192.168.1.${Math.floor(10 + Math.random() * 200)}` },
                tags: [],
                roles,
                status: 'ok',
                status_since: new Date().toISOString(),
                interfaces: [],
              });
            }} />
          </aside>
        )}

        {/* Central Canvas */}
        <main className="flex-1 h-full relative">
          {loading && !topology ? (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
              <span>{t('canvas.loading')}</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-rose-400 gap-2 p-6 text-center">
              <ShieldAlert className="w-10 h-10 text-rose-500" />
              <p className="font-semibold">{error}</p>
              <button
                onClick={() => loadData()}
                className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
              >
                {t('canvas.retry')}
              </button>
            </div>
          ) : topology && topology.devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 p-8 text-center">
              <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
                <Shield className="w-12 h-12 text-sky-400" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-bold text-slate-200 text-lg">{t('canvas.empty_title')}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('canvas.empty_desc')}
                </p>
              </div>
              <button
                onClick={() => setIsInitialSetupOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-sky-500/25 transition flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{t('canvas.start_setup')}</span>
              </button>
            </div>
          ) : topology ? (
            <NetworkCanvas
              devices={topology.devices}
              links={topology.links}
              activeIncident={activeIncident}
              simulatedIncident={simulatedIncident}
              activeMaintenanceWindows={activeScheduledMaintenance.active_device_windows}
              layout={topology.layout}
              isEditMode={isEditMode}
              onSelectDevice={handleSelectDevice}
              onSelectLink={handleSelectLink}
              onConnectLink={handleConnectLink}
              onAddDeviceDrop={handleAddDevice}
              onLayoutChange={handleLayoutChange}
            />
          ) : null}

          {/* Top-Right Big Violet Badge: ACTIVE GLOBAL SCHEDULED MAINTENANCE */}
          {activeScheduledMaintenance.is_global_active && (
            <div className={`absolute ${isHistoricalMode ? 'top-20' : 'top-4'} right-4 z-30 pointer-events-auto flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300`}>
              <div className="bg-purple-600 dark:bg-purple-600 text-white font-black px-4 py-2.5 rounded-2xl shadow-2xl border-2 border-purple-400 dark:border-purple-300 flex items-center gap-2.5 select-none maintenance-point-glow">
                <div className="p-1.5 bg-black/20 rounded-xl">
                  <Clock className="w-5 h-5 text-purple-200 animate-spin-slow" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wider font-extrabold text-white">
                      {t('maintenance.canvas_global_badge') || 'MANUTENZIONE PROGRAMMATA ATTIVA'}
                    </span>
                    {activeScheduledMaintenance.global_window?.title && (
                      <span className="px-1.5 py-0.5 rounded-md bg-black/25 text-[10px] font-mono font-bold text-purple-100">
                        {activeScheduledMaintenance.global_window.title}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-purple-100/90 leading-tight">
                    {t('maintenance.canvas_global_badge_sub') || 'Rete in manutenzione globale • Gli allarmi e le notifiche sono soppressi.'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Top-Right Big Yellow Badge: NON-LIVE HISTORICAL VIEW */}
          {isHistoricalMode && (
            <div className="absolute top-4 right-4 z-30 pointer-events-auto flex items-center gap-2">
              <div className="bg-amber-400 dark:bg-amber-500 text-slate-950 font-black px-4 py-2 rounded-2xl shadow-2xl border-2 border-amber-300 dark:border-amber-400 flex items-center gap-2.5 animate-pulse select-none">
                <div className="p-1.5 bg-black/15 rounded-xl">
                  <History className="w-5 h-5 text-slate-950 animate-spin" style={{ animationDuration: '6s' }} />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs uppercase tracking-wider font-extrabold">
                      {t('timemachine.non_live_badge')}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-black/20 text-[10px] font-mono font-bold">
                      {historicalTime ? historicalTime.toLocaleTimeString() : ''}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium opacity-90 leading-tight">
                    {t('timemachine.non_live_badge_sub')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsHistoricalMode(false);
                    setHistoricalTime(null);
                    setHistoricalErrorSummary(null);
                    loadData();
                  }}
                  className="ml-2 px-2.5 py-1 bg-slate-950 text-amber-300 hover:text-white hover:bg-slate-900 rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md"
                  title={t('timemachine.return_live')}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('timemachine.return_live')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Bottom Floating Time Machine Slider (Visible in Live/Normal Mode) */}
          {!isEditMode && topology && topology.devices.length > 0 && (
            <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:bottom-4 left-2 right-2 sm:left-4 sm:right-4 md:left-8 md:right-8 z-20 pointer-events-auto flex justify-center">
              <div className="w-full max-w-5xl">
                <TimeMachineSlider
                  onTimeChange={(targetDate) => handleTimeTravel(targetDate)}
                  onLiveMode={() => {
                    setIsHistoricalMode(false);
                    setHistoricalTime(null);
                    setHistoricalErrorSummary(null);
                    loadData();
                  }}
                  onOpenLogs={() => setIsEventLogsOpen(true)}
                  isLive={!isHistoricalMode}
                  externalTargetTime={historicalTime}
                  errorAtTime={historicalErrorSummary}
                  retentionPeriod={retentionPeriod}
                />
              </div>
            </div>
          )}
        </main>

        {/* Right Details Panel - ONLY VISIBLE IN LIVE MODE */}
        {selectedDevice && topology && !isKioskMode && !isHistoricalMode && (
          <DeviceDetailPanel
            device={selectedDevice}
            dependencies={topology.dependencies}
            allDevices={topology.devices}
            onClose={() => setSelectedDevice(null)}
            onSelectDevice={(id) => {
              const d = topology.devices.find((item) => item.id === id);
              if (d) setSelectedDevice(d);
            }}
            onDeleteDevice={isEditMode ? handleDeleteDevice : undefined}
            onUpdateDevice={handleUpdateDevice}
            onRefreshTopology={loadData}
            onOpenMaintenance={(devId) => {
              setMaintenanceTargetDeviceId(devId || null);
              setIsScheduledMaintenanceOpen(true);
            }}
            onSimulateDevice={handleSimulateDevice}
          />
        )}

        {selectedLink && topology && !isKioskMode && !isHistoricalMode && (
          <LinkDetailPanel
            link={selectedLink}
            devices={topology.devices}
            onClose={() => setSelectedLink(null)}
            onDeleteLink={isEditMode ? handleDeleteLink : undefined}
          />
        )}
      </div>

      {/* Initial Setup Onboarding Modal */}
      {isInitialSetupOpen && (
        <InitialSetupModal
          isOpen={isInitialSetupOpen}
          onClose={() => setIsInitialSetupOpen(false)}
          onTopologyApplied={(newTopo) => {
            setTopology(newTopo);
            setIsInitialSetupOpen(false);
            loadData();
          }}
          onStartManualDrawing={() => {
            setIsInitialSetupOpen(false);
            setIsEditMode(true);
          }}
        />
      )}

      {/* Add Device Modal */}
      {isAddDeviceOpen && (
        <AddDeviceModal
          isOpen={isAddDeviceOpen}
          onClose={() => setIsAddDeviceOpen(false)}
          onAddDevice={handleAddDevice}
          existingDevices={topology?.devices || []}
        />
      )}

      {/* Network Roles Modal (DNS & DHCP) */}
      {isRolesModalOpen && topology && (
        <NetworkRolesModal
          isOpen={isRolesModalOpen}
          onClose={() => setIsRolesModalOpen(false)}
          devices={topology.devices}
          vantagePointId={topology.vantage_point_id}
          onRolesAssigned={(updatedTopo) => {
            setTopology(updatedTopo);
            loadData();
          }}
        />
      )}

      {/* Guided Wizard Modal (8 steps) */}
      {isWizardOpen && topology && (
        <WizardModal
          initialTopology={topology}
          isOpen={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onApplied={() => {
            loadData();
            setIsWizardOpen(false);
          }}
        />
      )}

      {/* Dedicated Notification Settings Modal */}
      {isNotificationModalOpen && (
        <NotificationSettingsModal
          isOpen={isNotificationModalOpen}
          onClose={() => setIsNotificationModalOpen(false)}
        />
      )}

      {/* System Settings & Retention Modal */}
      <SystemSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentRetention={retentionPeriod}
        onRetentionChanged={(newRet) => {
          setRetentionPeriod(newRet);
        }}
      />

      {/* Scheduled Maintenance Modal */}
      <ScheduledMaintenanceModal
        isOpen={isScheduledMaintenanceOpen}
        onClose={() => {
          setIsScheduledMaintenanceOpen(false);
          setMaintenanceTargetDeviceId(null);
        }}
        devices={topology?.devices || []}
        preselectedDeviceId={maintenanceTargetDeviceId}
      />

      {/* Event Logs & Diagnostics Modal */}
      <EventLogsModal
        isOpen={isEventLogsOpen}
        onClose={() => setIsEventLogsOpen(false)}
        devices={topology?.devices || []}
        onTimeTravelToEvent={(targetTime, deviceId) => {
          handleTimeTravel(targetTime, deviceId);
        }}
        currentHistoricalTime={isHistoricalMode ? historicalTime : null}
      />

      {/* Backup & Ripristino Modal */}
      <BackupRestoreModal
        isOpen={isBackupRestoreOpen}
        onClose={() => setIsBackupRestoreOpen(false)}
        onRestoreSuccess={() => loadData()}
      />

      {/* Network Auto-Discovery Modal */}
      <NetworkDiscoveryModal
        isOpen={isDiscoveryOpen}
        onClose={() => setIsDiscoveryOpen(false)}
        existingDevices={topology?.devices || []}
        onAddDiscoveredDevices={handleAddDiscoveredDevices}
      />
    </div>
  );
};

export default App;
