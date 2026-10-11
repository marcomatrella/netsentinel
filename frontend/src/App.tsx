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
} from 'lucide-react';

import { Device, Link, FullTopology, Incident, CanvasLayout } from './types';
import {
  fetchTopology,
  fetchIncidents,
  fetchHistoricalSnapshot,
  applyTopology,
  deduceDependencies,
  updateDevice,
  setupSSEStream,
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
import { NotificationSettingsModal } from './components/notifications/NotificationSettingsModal';
import { TimeMachineSlider } from './components/timemachine/TimeMachineSlider';

export const App: React.FC = () => {
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
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(false);
  const [isHistoricalMode, setIsHistoricalMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Load topology and incidents
  const loadData = useCallback(async () => {
    try {
      const [topoData, incData] = await Promise.all([
        fetchTopology(),
        fetchIncidents('open'),
      ]);
      setTopology(topoData);
      setIncidents(incData);
      setActiveIncident(incData.length > 0 ? incData[0] : null);
      setIsHistoricalMode(false);
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
    const cleanupSSE = setupSSEStream((diff) => {
      if (isHistoricalMode) return; // Don't overwrite if user is scrubbing time machine
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
    });

    return () => cleanupSSE();
  }, [loadData, isHistoricalMode]);

  // Handle Time Machine historical scrubbing
  const handleTimeTravel = async (targetDate: Date) => {
    setIsHistoricalMode(true);
    try {
      const snapshot = await fetchHistoricalSnapshot(targetDate.toISOString());
      if (snapshot && topology) {
        const histMap = new Map(snapshot.devices.map((d: any) => [d.id, d.status]));
        setTopology({
          ...topology,
          devices: topology.devices.map((dev) => ({
            ...dev,
            status: (histMap.get(dev.id) as any) || dev.status,
          })),
        });
        setActiveIncident(snapshot.active_incident);
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

    setTopology({
      ...topology,
      devices: [...topology.devices, newDev],
      layout: {
        ...(topology.layout || { id: 'default', edges: [], groups: [], updated_at: new Date().toISOString() }),
        nodes: newLayoutNodes,
      },
    });
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
      setTopology((prev) => {
        if (!prev) return prev;
        const newDevs = prev.devices.map((d) => (d.id === deviceId ? { ...d, ...updated } : d));
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

  const statusBadge = () => {
    if (activeIncident) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-full text-xs font-semibold animate-pulse">
          <ShieldAlert className="w-3.5 h-3.5" />
          Incidente in corso
        </span>
      );
    }
    if (isMaintenanceMode) {
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full text-xs font-semibold">
          <PauseCircle className="w-3.5 h-3.5" />
          Manutenzione attiva
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-xs font-semibold">
        <ShieldCheck className="w-3.5 h-3.5" />
        Sistema Operativo OK
      </span>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Navbar (Hidden in Kiosk Mode) */}
      {!isKioskMode && (
        <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 flex items-center justify-between z-30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-sm tracking-tight text-white">NetSentinel</h1>
                <span className="text-[10px] bg-slate-800 text-slate-400 font-mono px-1.5 py-0.5 rounded border border-slate-700">
                  v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Monitoraggio Intelligente con Correlazione Topologica</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {statusBadge()}

            <div className="h-4 w-px bg-slate-800" />

            {/* Mode Switch (Sola lettura / Modifica) */}
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
                isEditMode
                  ? 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-500/20'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="Attiva la modalità disegno/modifica sulla tela"
            >
              {isEditMode ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{isEditMode ? 'Modalità Modifica' : 'Vista Operativa LIVE'}</span>
            </button>

            {/* Initial Setup / Reset Button */}
            <button
              onClick={() => setIsInitialSetupOpen(true)}
              className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 hover:border-sky-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              title="Apri configurazione guidata apparati o carica modelli"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              <span>Configurazione Apparati</span>
            </button>

            {/* Network Roles (DNS & DHCP) */}
            <button
              onClick={() => setIsRolesModalOpen(true)}
              className="px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 hover:border-cyan-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              title="Configura chi eroga i servizi DNS (AdGuard Home/Pi-hole) e DHCP"
            >
              <Network className="w-3.5 h-3.5 text-cyan-400" />
              <span>Servizi DNS & DHCP</span>
            </button>

            {/* Wizard button */}
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              title="Avvia il wizard guidato passo-passo"
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Wizard 8 Passi</span>
            </button>

            {/* Notification Settings button */}
            <button
              onClick={() => setIsNotificationModalOpen(true)}
              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              title="Configura il server SMTP e i destinatari delle notifiche email con test in tempo reale"
            >
              <Mail className="w-3.5 h-3.5 text-emerald-400" />
              <span>Notifiche Email</span>
            </button>

            {/* Kiosk Mode Toggle */}
            <button
              onClick={() => setIsKioskMode(true)}
              className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg text-xs transition"
              title="Passa a Schermo Intero / Modalità Kiosk"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            {/* Refresh button */}
            <button
              onClick={() => loadData()}
              className="p-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg text-xs transition"
              title="Aggiorna dati"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>
      )}

      {/* Edit Mode Top Floating Action Bar */}
      {isEditMode && !isKioskMode && (
        <div className="bg-sky-950/70 border-b border-sky-800/60 px-6 py-2 flex items-center justify-between text-xs z-20 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sky-200">
            <Edit3 className="w-4 h-4 text-sky-400" />
            <span className="font-semibold">Modalità Modifica Attiva:</span>
            <span className="text-slate-400">
              Trascina gli apparati dalla tavolozza o creane di nuovi. Collega i nodi trascinando le maniglie.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccessMsg && (
              <span className="text-emerald-400 flex items-center gap-1 font-semibold animate-pulse">
                <CheckCircle2 className="w-4 h-4" />
                {saveSuccessMsg}
              </span>
            )}
            <button
              onClick={() => setIsAddDeviceOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg font-medium transition flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>+ Aggiungi Apparato</span>
            </button>
            <button
              onClick={handleSaveTopology}
              disabled={isSaving}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-md shadow-sky-500/25 transition flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Salvataggio...' : 'Salva Modifiche'}</span>
            </button>
            <button
              onClick={() => {
                loadData();
                setIsEditMode(false);
              }}
              className="px-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg font-medium transition flex items-center gap-1.5"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Annulla</span>
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
            title="Esci dalla modalità Kiosk"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>Esci da Kiosk</span>
          </button>
          {statusBadge()}
        </div>
      )}

      {/* Incident Banner (visible if incident open) */}
      <IncidentBanner incident={activeIncident} onRefresh={loadData} />

      {/* Main Body */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Palette in Edit Mode */}
        {isEditMode && !isKioskMode && (
          <aside className="w-64 z-20 transition-all duration-300">
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
              <span>Caricamento topologia di rete...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-rose-400 gap-2 p-6 text-center">
              <ShieldAlert className="w-10 h-10 text-rose-500" />
              <p className="font-semibold">{error}</p>
              <button
                onClick={loadData}
                className="mt-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs"
              >
                Riprova
              </button>
            </div>
          ) : topology && topology.devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 p-8 text-center">
              <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl">
                <Shield className="w-12 h-12 text-sky-400" />
              </div>
              <div className="max-w-md space-y-1">
                <h3 className="font-bold text-slate-200 text-lg">Nessun apparato configurato</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Per iniziare a monitorare e visualizzare le progressioni di interconnessione, aggiungi i tuoi apparati o carica un modello di rete preconfigurato.
                </p>
              </div>
              <button
                onClick={() => setIsInitialSetupOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-sky-500/25 transition flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Avvia Configurazione Rete</span>
              </button>
            </div>
          ) : topology ? (
            <NetworkCanvas
              devices={topology.devices}
              links={topology.links}
              activeIncident={activeIncident}
              layout={topology.layout}
              isEditMode={isEditMode}
              onSelectDevice={handleSelectDevice}
              onSelectLink={handleSelectLink}
              onConnectLink={handleConnectLink}
              onAddDeviceDrop={handleAddDevice}
              onLayoutChange={handleLayoutChange}
            />
          ) : null}

          {/* Bottom Floating Time Machine Slider (Visible in Live/Normal Mode) */}
          {!isEditMode && topology && topology.devices.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
              <TimeMachineSlider
                onTimeChange={handleTimeTravel}
                onLiveMode={loadData}
                isLive={!isHistoricalMode}
              />
            </div>
          )}
        </main>

        {/* Right Details Panel */}
        {selectedDevice && topology && !isKioskMode && (
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
          />
        )}

        {selectedLink && topology && !isKioskMode && (
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
    </div>
  );
};

export default App;
