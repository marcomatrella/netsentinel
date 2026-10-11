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
} from 'lucide-react';

import { Device, Link, FullTopology, Incident } from './types';
import {
  fetchTopology,
  fetchIncidents,
  fetchHistoricalSnapshot,
  setupSSEStream,
} from './api/client';
import { NetworkCanvas } from './components/canvas/NetworkCanvas';
import { Palette } from './components/canvas/Palette';
import { IncidentBanner } from './components/panels/IncidentBanner';
import { DeviceDetailPanel } from './components/panels/DeviceDetailPanel';
import { LinkDetailPanel } from './components/panels/LinkDetailPanel';
import { WizardModal } from './components/wizard/WizardModal';
import { TimeMachineSlider } from './components/timemachine/TimeMachineSlider';

export const App: React.FC = () => {
  const [topology, setTopology] = useState<FullTopology | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncident, setActiveIncident] = useState<Incident | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);

  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(false);
  const [isKioskMode, setIsKioskMode] = useState<boolean>(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState<boolean>(false);
  const [isHistoricalMode, setIsHistoricalMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
      if (diff.devices && topology) {
        setTopology((prev) => {
          if (!prev) return prev;
          const statusMap = new Map(diff.devices.map((d: any) => [d.id, d.status]));
          const updatedDevices = prev.devices.map((dev) => ({
            ...dev,
            status: (statusMap.get(dev.id) as any) || dev.status,
          }));
          return { ...prev, devices: updatedDevices };
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
              <span>{isEditMode ? 'Modalità Modifica' : 'Vista Operativa'}</span>
            </button>

            {/* Wizard button */}
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 hover:border-indigo-500/50 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
              title="Avvia il wizard guidato passo-passo"
            >
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Wizard Configurazione</span>
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
            <Palette />
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
          ) : topology ? (
            <NetworkCanvas
              devices={topology.devices}
              links={topology.links}
              activeIncident={activeIncident}
              isEditMode={isEditMode}
              onSelectDevice={handleSelectDevice}
              onSelectLink={handleSelectLink}
            />
          ) : null}

          {/* Bottom Floating Time Machine Slider */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
            <TimeMachineSlider
              onTimeChange={handleTimeTravel}
              onLiveMode={loadData}
              isLive={!isHistoricalMode}
            />
          </div>
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
          />
        )}

        {selectedLink && topology && !isKioskMode && (
          <LinkDetailPanel
            link={selectedLink}
            devices={topology.devices}
            onClose={() => setSelectedLink(null)}
          />
        )}
      </div>

      {/* Guided Wizard Modal */}
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
    </div>
  );
};

export default App;
