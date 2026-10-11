import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Clock,
  Shield,
  Edit3,
  Save,
  Undo2,
  Globe,
  Zap,
  Radio,
} from 'lucide-react';
import { Check, Device, Dependency, DeviceKind } from '../../types';
import { executeCheckNow, fetchDeviceChecks, fetchEvents, updateDevice } from '../../api/client';

interface DeviceDetailPanelProps {
  device: Device | null;
  dependencies: Dependency[];
  allDevices: Device[];
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
  onDeleteDevice?: (deviceId: string) => void;
  onUpdateDevice?: (deviceId: string, updatedData: Partial<Device>) => Promise<void>;
}

const DEVICE_KINDS: Array<{ kind: DeviceKind; label: string }> = [
  { kind: 'router', label: 'Router / Gateway' },
  { kind: 'switch', label: 'Switch di Rete' },
  { kind: 'access_point', label: 'Access Point Wi-Fi' },
  { kind: 'nas', label: 'NAS / Storage Server' },
  { kind: 'server', label: 'Server / Hypervisor' },
  { kind: 'smart_hub', label: 'Server Domotico (HA)' },
  { kind: 'ups', label: 'UPS Gruppo Continuità' },
  { kind: 'poe_injector', label: 'Iniettore PoE' },
  { kind: 'client', label: 'Client / TV / Telecamera' },
  { kind: 'wan_gateway', label: 'Internet WAN Upstream' },
  { kind: 'service', label: 'Servizio di Rete' },
  { kind: 'custom', label: 'Personalizzato' },
];

export const DeviceDetailPanel: React.FC<DeviceDetailPanelProps> = ({
  device,
  dependencies,
  allDevices,
  onClose,
  onSelectDevice,
  onDeleteDevice,
  onUpdateDevice,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'deps' | 'events'>('overview');
  const [checks, setChecks] = useState<Check[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editIp, setEditIp] = useState<string>('');
  const [editKind, setEditKind] = useState<DeviceKind>('switch');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editCriticality, setEditCriticality] = useState<number>(3);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (device) {
      fetchDeviceChecks(device.id).then(setChecks).catch(() => setChecks([]));
      fetchEvents(device.id, 20).then(setEvents).catch(() => setEvents([]));

      // Reset edit state to current device
      setEditName(device.name);
      setEditIp(device.addresses?.ip || '');
      setEditKind(device.kind);
      setEditLocation(device.location || '');
      setEditCriticality(device.criticality || 3);
      setEditRoles(device.roles || []);
      setEditNotes(device.notes || '');
      setIsEditing(false);
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

  const handleToggleRole = (role: string) => {
    setEditRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const payload: Partial<Device> = {
        name: editName.trim() || device.name,
        kind: editKind,
        location: editLocation.trim() || undefined,
        criticality: editCriticality,
        addresses: {
          ...device.addresses,
          ip: editIp.trim() || undefined,
        },
        roles: editRoles,
        notes: editNotes.trim() || undefined,
      };

      if (onUpdateDevice) {
        await onUpdateDevice(device.id, payload);
      } else {
        await updateDevice(device.id, payload);
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error('Errore aggiornamento apparato:', err);
      alert('Errore durante il salvataggio: ' + (err.message || 'Verifica il backend.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl z-20">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-start justify-between bg-slate-950/40">
        <div className="flex-1 mr-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-100 text-base truncate" title={device.name}>
              {device.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                device.status === 'ok'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : device.status === 'down'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {device.status}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
            <span className="text-sky-400 font-semibold">{device.addresses?.ip || 'Nessun IP configurato'}</span>
            <span>•</span>
            <span className="uppercase text-[10px] text-slate-500">{device.kind}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded-lg border transition ${
              isEditing
                ? 'bg-sky-600 text-white border-sky-500 shadow'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={isEditing ? 'Annulla modifica' : 'Modifica indirizzo IP e impostazioni'}
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {!isEditing && (
        <div className="flex border-b border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Panoramica
          </button>
          <button
            onClick={() => setActiveTab('checks')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'checks'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Controlli ({checks.length})
          </button>
          <button
            onClick={() => setActiveTab('deps')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'deps'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Dipendenze
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'events'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Eventi
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* --- EDIT MODE FORM --- */}
        {isEditing ? (
          <div className="space-y-4">
            <div className="p-3 bg-sky-950/30 border border-sky-800/50 rounded-xl text-sky-200 text-[11px] flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Modifica parametri dell'apparato (IP, nome, ruoli di rete).</span>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Nome Dispositivo:</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="es. Server Domotico Home Assistant"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">
                Indirizzo IP primario (per ping e controlli attivi):
              </label>
              <input
                type="text"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder="es. 192.168.1.70"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                NetSentinel invierà ping periodici a questo IP per misurare lo stato live e la latenza RTT.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Tipo Apparato:</label>
                <select
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as DeviceKind)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  {DEVICE_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Criticità (1-5):</label>
                <select
                  value={editCriticality}
                  onChange={(e) => setEditCriticality(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value={1}>1 — Bassa</option>
                  <option value={2}>2 — Media</option>
                  <option value={3}>3 — Importante</option>
                  <option value={4}>4 — Alta</option>
                  <option value={5}>5 — Critica</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Ubicazione / Rack / Stanza:</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="es. Rack Salotto, Studio, Mansarda"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Ruoli di Rete / Servizi */}
            <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-700/60 space-y-2.5">
              <span className="block font-medium text-slate-300 text-xs">Ruoli & Servizi di Rete:</span>

              <label className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('dns_resolver')}
                  onChange={() => handleToggleRole('dns_resolver')}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-sky-300">Server DNS (AdGuard Home / Pi-hole)</span>
                  <span className="text-[10px] text-slate-400">Questo apparato risolve le query DNS della rete domestica</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('dhcp_server')}
                  onChange={() => handleToggleRole('dhcp_server')}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-amber-300">Server DHCP</span>
                  <span className="text-[10px] text-slate-400">Assegna gli indirizzi IP ai client e dispositivi di rete</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('gateway')}
                  onChange={() => handleToggleRole('gateway')}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-purple-300">Default Gateway WAN</span>
                  <span className="text-[10px] text-slate-400">Fornisce l'instradamento verso Internet</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('vantage_point')}
                  onChange={() => handleToggleRole('vantage_point')}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-blue-300">Punto di Monitoraggio (Vantage Point)</span>
                  <span className="text-[10px] text-slate-400">Host fisico dove risiede ed esegue NetSentinel</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('power_provider')}
                  onChange={() => handleToggleRole('power_provider')}
                  className="mt-0.5 rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-yellow-300">Gruppo di Continuità (UPS)</span>
                  <span className="text-[10px] text-slate-400">Fornisce energia ausiliaria agli apparati collegati</span>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Note:</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Note cablaggio, porte o servizi ospitati..."
                rows={2}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium transition"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Salvataggio...' : 'Salva Modifiche'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* --- READ-ONLY TABS --- */
          <>
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">ID Apparato:</span>
                    <span className="font-mono text-slate-200">{device.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Indirizzo IP:</span>
                    <span className="font-mono text-sky-400 font-semibold">{device.addresses?.ip || 'Non configurato'}</span>
                  </div>
                  {device.rtt_ms !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Latenza Ping Live:</span>
                      <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {device.rtt_ms} ms (OK)
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Ubicazione:</span>
                    <span className="text-slate-200">{device.location || 'Non specificata'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Criticità:</span>
                    <span className="text-amber-400 font-semibold">{device.criticality} / 5</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Stato da:</span>
                    <span className="text-slate-200">{new Date(device.status_since).toLocaleTimeString()}</span>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-sky-300 border border-slate-700 hover:border-sky-500/50 rounded-xl font-medium transition text-xs flex items-center justify-center gap-1.5 shadow"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modifica Apparato o Indirizzo IP</span>
                </button>

                {device.roles?.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Ruoli & Servizi Attivi
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {device.roles.map((r) => (
                        <span
                          key={r}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            r === 'dns_resolver'
                              ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                              : r === 'dhcp_server'
                              ? 'bg-amber-950 text-amber-300 border-amber-800'
                              : r === 'vantage_point'
                              ? 'bg-blue-950 text-blue-300 border-blue-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {r === 'dns_resolver'
                            ? 'Server DNS (AdGuard Home)'
                            : r === 'dhcp_server'
                            ? 'Server DHCP'
                            : r === 'vantage_point'
                            ? 'Vantage Point (Monitor)'
                            : r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {device.notes && (
                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      Note Cablaggio / Installazione
                    </span>
                    <p className="text-slate-300 text-xs">{device.notes}</p>
                  </div>
                )}

                {onDeleteDevice && (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        onDeleteDevice(device.id);
                        onClose();
                      }}
                      className="w-full py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl font-medium transition text-xs flex items-center justify-center gap-1.5"
                    >
                      Elimina Questo Apparato
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'checks' && (
              <div className="space-y-2">
                {checks.length === 0 ? (
                  <div className="text-center text-slate-500 py-6">
                    Nessun controllo attivo configurato per questo apparato.
                  </div>
                ) : (
                  checks.map((chk) => (
                    <div key={chk.id} className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-200">{chk.name}</div>
                          <div className="text-[10px] text-slate-400">
                            Tipo: {chk.type} • Intervallo: {chk.interval_seconds}s
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            chk.current_status === 'ok'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : chk.current_status === 'crit'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-700 text-slate-400'
                          }`}
                        >
                          {chk.current_status}
                        </span>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRunCheck(chk.id)}
                          disabled={runningCheckId === chk.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-[11px] font-medium transition"
                        >
                          {runningCheckId === chk.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
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
                              <div className="text-[10px] text-slate-400">
                                Tipo: {d.kind} ({d.strength})
                              </div>
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
          </>
        )}
      </div>
    </div>
  );
};
