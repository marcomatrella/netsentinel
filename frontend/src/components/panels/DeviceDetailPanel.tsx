import React, { useEffect, useState } from 'react';
import { X, Play, RefreshCw, CheckCircle, AlertTriangle, ArrowRight, Clock, Shield } from 'lucide-react';
import { Check, Device, Dependency } from '../../types';
import { executeCheckNow, fetchDeviceChecks, fetchEvents } from '../../api/client';

interface DeviceDetailPanelProps {
  device: Device | null;
  dependencies: Dependency[];
  allDevices: Device[];
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
}

export const DeviceDetailPanel: React.FC<DeviceDetailPanelProps> = ({
  device,
  dependencies,
  allDevices,
  onClose,
  onSelectDevice,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'deps' | 'events'>('overview');
  const [checks, setChecks] = useState<Check[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      fetchDeviceChecks(device.id).then(setChecks).catch(() => setChecks([]));
      fetchEvents(device.id, 20).then(setEvents).catch(() => setEvents([]));
    }
  }, [device]);

  if (!device) return null;

  const upstreamDeps = dependencies.filter((d) => d.dependent_id === device.id);
  const downstreamDeps = dependencies.filter((d) => d.provider_id === device.id);
  const devMap = new Map(allDevices.map((d) => [d.id, d]));

  const handleRunCheck = async (checkId: string) => {
    setRunningCheckId(checkId);
    try {
      await executeCheckNow(checkId);
      const updated = await fetchDeviceChecks(device.id);
      setChecks(updated);
    } catch (err) {
      console.error(err);
    } finally {
      setRunningCheckId(null);
    }
  };

  return (
    <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl z-20">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-100 text-base">{device.name}</h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
              device.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
              device.status === 'down' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
              'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              {device.status}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {device.addresses?.ip || 'Nessun IP associato'} • {device.kind}
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
            activeTab === 'overview' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Panoramica
        </button>
        <button
          onClick={() => setActiveTab('checks')}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
            activeTab === 'checks' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Controlli ({checks.length})
        </button>
        <button
          onClick={() => setActiveTab('deps')}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
            activeTab === 'deps' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Dipendenze
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
            activeTab === 'events' ? 'border-sky-500 text-sky-400' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Eventi
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {activeTab === 'overview' && (
          <div className="space-y-3">
            <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">ID Apparato:</span>
                <span className="font-mono text-slate-200">{device.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Ubicazione:</span>
                <span className="text-slate-200">{device.location || 'Non specificata'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Criticità:</span>
                <span className="text-amber-400 font-semibold">{device.criticality} / 5</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Stato da:</span>
                <span className="text-slate-200">{new Date(device.status_since).toLocaleTimeString()}</span>
              </div>
            </div>

            {device.roles?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Ruoli Assegnati
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {device.roles.map((r) => (
                    <span key={r} className="bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded text-[10px]">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {device.notes && (
              <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                <span className="text-[11px] font-bold text-slate-400 block mb-1">Note Cablaggio / Installazione</span>
                <p className="text-slate-300 text-xs">{device.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'checks' && (
          <div className="space-y-2">
            {checks.length === 0 ? (
              <div className="text-center text-slate-500 py-6">Nessun controllo configurato su questo apparato.</div>
            ) : (
              checks.map((chk) => (
                <div key={chk.id} className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-200">{chk.name}</div>
                      <div className="text-[10px] text-slate-400">Tipo: {chk.type} • Intervallo: {chk.interval_seconds}s</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                      chk.current_status === 'ok' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      chk.current_status === 'crit' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {chk.current_status}
                    </span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleRunCheck(chk.id)}
                      disabled={runningCheckId === chk.id}
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-[11px] font-medium transition"
                    >
                      {runningCheckId === chk.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Esegui ora
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'deps' && (
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Dipende da (A Monte)
              </span>
              {upstreamDeps.length === 0 ? (
                <div className="text-slate-500 text-xs">Nessun nodo a monte (Nodo radice o isolato).</div>
              ) : (
                <div className="space-y-1.5">
                  {upstreamDeps.map((d) => {
                    const provider = devMap.get(d.provider_id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => onSelectDevice && onSelectDevice(d.provider_id)}
                        className="p-2 rounded bg-slate-800/60 border border-slate-700/50 hover:border-sky-500/50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-200">{provider?.name || d.provider_id}</div>
                          <div className="text-[10px] text-slate-400">Tipo: {d.kind} ({d.strength})</div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Nodi che dipendono da lui (A Valle)
              </span>
              {downstreamDeps.length === 0 ? (
                <div className="text-slate-500 text-xs">Nessun nodo a valle.</div>
              ) : (
                <div className="space-y-1.5">
                  {downstreamDeps.map((d) => {
                    const dependent = devMap.get(d.dependent_id);
                    return (
                      <div
                        key={d.id}
                        onClick={() => onSelectDevice && onSelectDevice(d.dependent_id)}
                        className="p-2 rounded bg-slate-800/60 border border-slate-700/50 hover:border-sky-500/50 cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium text-slate-200">{dependent?.name || d.dependent_id}</div>
                          <div className="text-[10px] text-slate-400">Richiede: {d.kind}</div>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-slate-500 text-center py-6">Nessun evento recente registrato.</div>
            ) : (
              events.map((ev) => (
                <div key={ev.id} className="p-2.5 bg-slate-800/50 rounded border border-slate-700/50 space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-semibold text-slate-300">{ev.event_type}</span>
                    <span className="text-slate-500">{new Date(ev.ts).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-200 font-medium">{ev.title}</div>
                  <div className="text-[11px] text-slate-400">{ev.message}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
