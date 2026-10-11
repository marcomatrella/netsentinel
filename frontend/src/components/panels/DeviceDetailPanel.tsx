import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Play,
  RefreshCw,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ArrowRight,
  Clock,
  Shield,
  Edit3,
  Save,
  Undo2,
  Globe,
  Zap,
  Radio,
  Plus,
  Trash2,
  Palette as PaletteIcon,
} from 'lucide-react';
import { Check, Device, Dependency, DeviceKind } from '../../types';
import { executeCheckNow, fetchDeviceChecks, fetchEvents, updateDevice, createCheck, deleteCheck } from '../../api/client';
import { PRESET_COLORS, getDeviceColorId, setDeviceColorTag, getColorConfig } from '../../constants/colors';
import { formatTimeOnly } from '../../utils/date';

interface DeviceDetailPanelProps {
  device: Device | null;
  dependencies: Dependency[];
  allDevices: Device[];
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
  onDeleteDevice?: (deviceId: string) => void;
  onUpdateDevice?: (deviceId: string, updatedData: Partial<Device>) => Promise<void>;
  onRefreshTopology?: () => void;
}

const DEVICE_KINDS: Array<{ kind: DeviceKind; label: string }> = [
  { kind: 'router', label: 'Router / Gateway' },
  { kind: 'firewall', label: 'Firewall (pfSense/OPNsense)' },
  { kind: 'switch', label: 'Switch di Rete (Managed/PoE)' },
  { kind: 'access_point', label: 'Access Point Wi-Fi' },
  { kind: 'nas', label: 'NAS / Storage Server' },
  { kind: 'server', label: 'Server / Hypervisor (Proxmox)' },
  { kind: 'smart_hub', label: 'Server Domotico (Home Assistant)' },
  { kind: 'camera', label: 'Telecamera IP (RTSP/ONVIF)' },
  { kind: 'nvr', label: 'NVR / Videosorveglianza' },
  { kind: 'printer', label: 'Stampante di Rete' },
  { kind: 'smart_plug', label: 'Presa Smart / PDU Gestita' },
  { kind: 'ups', label: 'UPS Gruppo Continuità' },
  { kind: 'modem', label: 'Modem Fibra / ONT' },
  { kind: 'sensor', label: 'Sensore IoT / Ambiente' },
  { kind: 'poe_injector', label: 'Iniettore PoE' },
  { kind: 'service', label: 'Servizio di Rete (DNS/AdGuard)' },
  { kind: 'client', label: 'Client / TV / Workstation' },
  { kind: 'wan_gateway', label: 'Internet WAN Upstream' },
  { kind: 'custom', label: 'Personalizzato' },
];

interface CheckToast {
  id: string;
  type: 'ok' | 'warn' | 'crit';
  checkName: string;
  checkType: string;
  deviceName: string;
  deviceIp?: string;
  headline: string;
  description: string;
}

const buildCheckToastDescription = (chk: Check, res: any): string => {
  const details = res?.details || {};
  const val = res?.value;

  switch (chk.type) {
    case 'ping': {
      const rtt = val ?? details.avg_rtt_ms ?? details.rtt_ms;
      const loss = details.packet_loss_percent ?? 0;
      if (res?.status === 'ok') {
        return `Risposta ICMP ricevuta in ${rtt !== undefined ? `${Number(rtt).toFixed(1)} ms` : 'tempo regolare'} • Nessuna perdita pacchetti (${loss}%). Host online e raggiungibile.`;
      }
      return details.error || `Nessuna risposta dal target • Perdita pacchetti: ${loss}%. Host non risponde al ping.`;
    }
    case 'synology_dsm': {
      const model = details.model || 'Synology NAS';
      const temp = details.temperature ? `Temperatura: ${details.temperature}°C` : null;
      const ver = details.version ? `DSM v${details.version}` : null;
      const poolStatus = details.storage_pools?.map((p: any) => `${p.name || 'Pool'}: ${p.status || 'OK'}`).join(', ');
      if (res?.status === 'ok') {
        const parts = [model, ver, temp, poolStatus || 'Storage pool integro'].filter(Boolean);
        return `${parts.join(' • ')}. Servizi DSM operativi regolarmente.`;
      }
      return details.error || (poolStatus ? `Stato storage: ${poolStatus}` : 'Anomalia rilevata sullo storage o sui dischi del NAS.');
    }
    case 'http': {
      const code = details.status_code || details.code || 200;
      const time = details.response_time_ms ? `${details.response_time_ms} ms` : null;
      if (res?.status === 'ok') {
        return `Risposta HTTP ${code} OK${time ? ` in ${time}` : ''}. Endpoint web raggiungibile e funzionante.`;
      }
      return details.error || `HTTP ${code} • Errore o timeout durante la richiesta web.`;
    }
    case 'tcp_port': {
      const port = details.port || chk.params?.port || 'servizio';
      const rtt = details.rtt_ms ? `${details.rtt_ms} ms` : null;
      if (res?.status === 'ok') {
        return `Porta TCP ${port} aperta e reattiva${rtt ? ` (connessione in ${rtt})` : ''}.`;
      }
      return details.error || `Porta TCP ${port} non risponde o connessione rifiutata.`;
    }
    case 'dns': {
      const resolved = details.resolved_ip || details.answer;
      const time = details.query_time_ms ? `${details.query_time_ms} ms` : null;
      if (res?.status === 'ok') {
        return `Risoluzione DNS riuscita${resolved ? `: ${resolved}` : ''}${time ? ` in ${time}` : ''}. Server DNS attivo.`;
      }
      return details.error || 'Mancata risoluzione del nome di dominio o timeout DNS.';
    }
    case 'nut': {
      const charge = details.battery_charge ? `Batteria: ${details.battery_charge}%` : null;
      const status = details.ups_status || 'In linea';
      if (res?.status === 'ok') {
        return `UPS attivo • ${[status, charge].filter(Boolean).join(' • ')}. Rete elettrica regolare.`;
      }
      return details.error || 'Allarme UPS: alimentazione a batteria o disconnessione.';
    }
    case 'generic_http_json':
    case 'home_assistant':
    case 'adguard_home':
    case 'unifi': {
      if (res?.status === 'ok') {
        return details.message || `Integrazione ${chk.type} verificata con successo. API raggiungibili e funzionanti.`;
      }
      return details.error || details.message || `Errore comunicazione con l'API ${chk.type}.`;
    }
    default: {
      if (res?.status === 'ok') {
        return details.message || (val !== undefined && val !== null ? `Controllo completato regolarmente (Valore: ${val}).` : 'Controllo completato regolarmente con esito positivo.');
      }
      return details.error || details.message || 'Controllo terminato con errore o valori fuori soglia.';
    }
  }
};

export const DeviceDetailPanel: React.FC<DeviceDetailPanelProps> = ({
  device,
  dependencies,
  allDevices,
  onClose,
  onSelectDevice,
  onDeleteDevice,
  onUpdateDevice,
  onRefreshTopology,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'checks' | 'deps' | 'events'>('overview');
  const [checks, setChecks] = useState<Check[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [runningCheckId, setRunningCheckId] = useState<string | null>(null);

  // Timed Toast state
  const [toast, setToast] = useState<CheckToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (toastData: CheckToast) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(toastData);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, 5000);
  };

  const dismissToast = () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast(null);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editIp, setEditIp] = useState<string>('');
  const [editKind, setEditKind] = useState<DeviceKind>('switch');
  const [editLocation, setEditLocation] = useState<string>('');
  const [editCriticality, setEditCriticality] = useState<number>(3);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('slate');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Custom check creation state
  const [showAddCheck, setShowAddCheck] = useState<boolean>(false);
  const [newCheckType, setNewCheckType] = useState<string>('tcp_port');
  const [newCheckName, setNewCheckName] = useState<string>('');
  const [newCheckPort, setNewCheckPort] = useState<string>('80');
  const [newCheckUrl, setNewCheckUrl] = useState<string>('');
  const [newCheckInterval, setNewCheckInterval] = useState<number>(30);
  const [isCreatingCheck, setIsCreatingCheck] = useState<boolean>(false);

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
      setEditColor(getDeviceColorId(device.tags));
      setIsEditing(false);
      setShowAddCheck(false);
    }
  }, [device]);

  if (!device) return null;

  const upstreamDeps = dependencies.filter((d) => d.dependent_id === device.id);
  const downstreamDeps = dependencies.filter((d) => d.provider_id === device.id);
  const devMap = new Map(allDevices.map((d) => [d.id, d]));

  const handleRunCheck = async (checkId: string) => {
    const chk = checks.find((c) => c.id === checkId);
    setRunningCheckId(checkId);
    try {
      const res = await executeCheckNow(checkId);
      const updated = await fetchDeviceChecks(device.id);
      setChecks(updated);

      if (onRefreshTopology) {
        onRefreshTopology();
      }

      if (chk) {
        const isOk = res.status === 'ok';
        const isWarn = res.status === 'warn' || res.status === 'degraded';
        const headline = isOk
          ? 'Test completato con successo (OK)'
          : isWarn
          ? 'Controllo completato con avvisi (Degradato)'
          : 'Test fallito (Critico / Non raggiungibile)';

        const description = buildCheckToastDescription(chk, res);

        showToast({
          id: `${checkId}-${Date.now()}`,
          type: isOk ? 'ok' : isWarn ? 'warn' : 'crit',
          checkName: chk.name,
          checkType: chk.type,
          deviceName: device.name,
          deviceIp: device.addresses?.ip,
          headline,
          description,
        });
      }
    } catch (err: any) {
      console.error(err);
      if (chk) {
        showToast({
          id: `${checkId}-${Date.now()}`,
          type: 'crit',
          checkName: chk.name,
          checkType: chk.type,
          deviceName: device.name,
          deviceIp: device.addresses?.ip,
          headline: 'Errore esecuzione test',
          description: err.message || 'Impossibile completare il controllo. Verifica la connettività del server NetSentinel.',
        });
      }
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
    const cleanEditIp = editIp.trim();
    const conflict = cleanEditIp && cleanEditIp !== device.addresses?.ip
      ? allDevices.find((d) => d.id !== device.id && d.addresses?.ip === cleanEditIp)
      : null;
    if (conflict) {
      alert(`L'indirizzo IP '${cleanEditIp}' è già assegnato all'apparato '${conflict.name}' (${conflict.id}). Gli indirizzi IP devono essere univoci.`);
      return;
    }

    setIsSaving(true);
    try {
      const newTags = setDeviceColorTag(device.tags || [], editColor);
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
        tags: newTags,
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

  const handleCreateCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    setIsCreatingCheck(true);
    try {
      const checkId = `chk-${device.id}-${newCheckType}-${Date.now().toString(36)}`;
      let params: Record<string, any> = {};
      let autoName = newCheckName.trim();
      const ip = device.addresses?.ip || '127.0.0.1';

      if (newCheckType === 'ping') {
        params = { target: ip, count: 3 };
        if (!autoName) autoName = `Ping ICMP (${ip})`;
      } else if (newCheckType === 'tcp_port') {
        const port = Number(newCheckPort) || 80;
        params = { target: ip, port };
        if (!autoName) autoName = `Porta TCP ${port}`;
      } else if (newCheckType === 'http') {
        const url = newCheckUrl.trim() || `http://${ip}/`;
        params = { url };
        if (!autoName) autoName = `HTTP ${url.replace(/^https?:\/\//, '')}`;
      } else if (newCheckType === 'synology_dsm') {
        const port = Number(newCheckPort) || 5000;
        params = { host: ip, port };
        if (!autoName) autoName = `Synology DSM (${port})`;
      } else if (newCheckType === 'nut') {
        const port = Number(newCheckPort) || 3493;
        params = { host: ip, port };
        if (!autoName) autoName = `UPS NUT (${port})`;
      } else if (newCheckType === 'dns') {
        params = { server: ip, query_name: 'google.com', record_type: 'A' };
        if (!autoName) autoName = `Query Risoluzione DNS`;
      }

      await createCheck({
        id: checkId,
        device_id: device.id,
        type: newCheckType,
        name: autoName,
        params,
        interval_seconds: newCheckInterval,
        timeout_seconds: 5.0,
      });

      const updated = await fetchDeviceChecks(device.id);
      setChecks(updated);
      setShowAddCheck(false);
      setNewCheckName('');
      setNewCheckPort('80');
      setNewCheckUrl('');

      // Immediately run the check so user sees the result in toast!
      handleRunCheck(checkId);
    } catch (err: any) {
      alert('Errore creazione controllo: ' + (err.message || 'Verifica parametri.'));
    } finally {
      setIsCreatingCheck(false);
    }
  };

  const handleDeleteCheck = async (checkId: string) => {
    if (!window.confirm('Vuoi rimuovere questo controllo?')) return;
    try {
      await deleteCheck(checkId);
      const updated = await fetchDeviceChecks(device.id);
      setChecks(updated);
    } catch (err: any) {
      alert('Errore eliminazione controllo: ' + (err.message || 'Verifica il backend.'));
    }
  };

  return (
    <div className="w-96 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-20 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-950/40">
        <div className="flex-1 mr-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base truncate" title={device.name}>
              {device.name}
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                device.status === 'ok'
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : device.status === 'down'
                  ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
              }`}
            >
              {device.status}
            </span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
            <span className="text-sky-600 dark:text-sky-400 font-semibold">{device.addresses?.ip || 'Nessun IP configurato'}</span>
            <span>•</span>
            <span className="uppercase text-[10px] text-slate-400 dark:text-slate-500">{device.kind}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded-lg border transition ${
              isEditing
                ? 'bg-sky-600 text-white border-sky-500 shadow'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700'
            }`}
            title={isEditing ? 'Annulla modifica' : 'Modifica indirizzo IP e impostazioni'}
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      {!isEditing && (
        <div className="flex border-b border-slate-200 dark:border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'overview'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Panoramica
          </button>
          <button
            onClick={() => setActiveTab('checks')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'checks'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Controlli ({checks.length})
          </button>
          <button
            onClick={() => setActiveTab('deps')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'deps'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Dipendenze
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'events'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
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
            <div className="p-3 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 rounded-xl text-sky-800 dark:text-sky-200 text-[11px] flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
              <span>Modifica parametri dell'apparato (IP, nome, ruoli di rete).</span>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Nome Dispositivo:</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="es. Server Domotico Home Assistant"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                Indirizzo IP primario (per ping e controlli attivi):
              </label>
              <input
                type="text"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder="es. 192.168.1.70"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
              />
              {(() => {
                const clean = editIp.trim();
                const conflict = clean && clean !== device.addresses?.ip
                  ? allDevices.find((d) => d.id !== device.id && d.addresses?.ip === clean)
                  : null;
                if (!conflict) return null;
                return (
                  <div className="mt-2 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-700 dark:text-rose-300 text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                    <span>L'indirizzo IP <strong>{clean}</strong> è già assegnato a <strong>{conflict.name}</strong> ({conflict.id}). Gli IP devono essere univoci.</span>
                  </div>
                );
              })()}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                NetSentinel invierà ping periodici a questo IP per misurare lo stato live e la latenza RTT.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Tipo Apparato:</label>
                <select
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as DeviceKind)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  {DEVICE_KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Criticità (1-5):</label>
                <select
                  value={editCriticality}
                  onChange={(e) => setEditCriticality(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value={1}>1 — Bassa</option>
                  <option value={2}>2 — Media</option>
                  <option value={3}>3 — Importante</option>
                  <option value={4}>4 — Alta</option>
                  <option value={5}>5 — Critica</option>
                </select>
              </div>
            </div>

            {/* Color Swatch Picker */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium text-xs flex items-center gap-1.5">
                  <PaletteIcon className="w-3.5 h-3.5 text-sky-500" />
                  Colore Box Canvas:
                </span>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {getColorConfig(editColor).name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_COLORS.map((c) => {
                  const isPicked = editColor === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setEditColor(c.id)}
                      title={c.name}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] transition ${
                        isPicked
                          ? 'bg-sky-500/20 border-sky-500 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500 font-semibold'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${c.dotClass} shrink-0`} />
                      <span>{c.name.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Ubicazione / Rack / Stanza:</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="es. Rack Salotto, Studio, Mansarda"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Ruoli di Rete / Servizi */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <span className="block font-medium text-slate-700 dark:text-slate-300 text-xs">Ruoli & Servizi di Rete:</span>

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('dns_resolver')}
                  onChange={() => handleToggleRole('dns_resolver')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-sky-600 dark:text-sky-300">Server DNS (AdGuard Home / Pi-hole)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Questo apparato risolve le query DNS della rete domestica</span>
                </div>
              </label>
              {(() => {
                if (!editRoles.includes('dns_resolver')) return null;
                const previousDns = allDevices.find((d) => d.id !== device.id && d.roles?.includes('dns_resolver'));
                if (!previousDns) return null;
                return (
                  <div className="ml-6 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span>
                      <strong>Riassegnazione:</strong> il ruolo DNS è attualmente assegnato a <strong>{previousDns.name}</strong> ({previousDns.addresses?.ip || previousDns.id}). Salvando, verrà rimosso da {previousDns.name} e assegnato a questo apparato.
                    </span>
                  </div>
                );
              })()}

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('dhcp_server')}
                  onChange={() => handleToggleRole('dhcp_server')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-amber-600 dark:text-amber-300">Server DHCP</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Assegna gli indirizzi IP ai client e dispositivi di rete</span>
                </div>
              </label>
              {(() => {
                if (!editRoles.includes('dhcp_server')) return null;
                const previousDhcp = allDevices.find((d) => d.id !== device.id && d.roles?.includes('dhcp_server'));
                if (!previousDhcp) return null;
                return (
                  <div className="ml-6 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span>
                      <strong>Riassegnazione:</strong> il ruolo DHCP è attualmente assegnato a <strong>{previousDhcp.name}</strong> ({previousDhcp.addresses?.ip || previousDhcp.id}). Salvando, verrà rimosso da {previousDhcp.name} e assegnato a questo apparato.
                    </span>
                  </div>
                );
              })()}

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('gateway')}
                  onChange={() => handleToggleRole('gateway')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-purple-600 dark:text-purple-300">Default Gateway WAN</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Fornisce l'instradamento verso Internet</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('vantage_point')}
                  onChange={() => handleToggleRole('vantage_point')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-blue-600 dark:text-blue-300">Punto di Monitoraggio (Vantage Point)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Host fisico dove risiede ed esegue NetSentinel</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('passive_tracking')}
                  onChange={() => handleToggleRole('passive_tracking')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-slate-600 dark:text-slate-300">Tracciamento Passivo (Client non allarmato)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Per smartphone, laptop, TV, IoT: non genera allarmi critici o notifiche flapping in caso di disconnessione</span>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('power_provider')}
                  onChange={() => handleToggleRole('power_provider')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold block text-yellow-600 dark:text-yellow-300">Gruppo di Continuità (UPS)</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Fornisce energia ausiliaria agli apparati collegati</span>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Note:</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Note cablaggio, porte o servizi ospitati..."
                rows={2}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition"
              >
                Annulla
              </button>
              {(() => {
                const clean = editIp.trim();
                const conflict = clean && clean !== device.addresses?.ip
                  ? allDevices.find((d) => d.id !== device.id && d.addresses?.ip === clean)
                  : null;
                return (
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSaving || Boolean(conflict)}
                    className={`px-4 py-1.5 rounded-lg font-bold shadow-md transition flex items-center gap-1.5 ${
                      isSaving || Boolean(conflict)
                        ? 'bg-slate-400 dark:bg-slate-700 text-slate-200 cursor-not-allowed shadow-none'
                        : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-500/20'
                    }`}
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Salvataggio...' : 'Salva Modifiche'}</span>
                  </button>
                );
              })()}
            </div>
          </div>
        ) : (
          /* --- READ-ONLY TABS --- */
          <>
            {activeTab === 'overview' && (
              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 space-y-2">
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
                    <span className="text-slate-400">Colore Box Canvas:</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${getColorConfig(getDeviceColorId(device.tags)).dotClass}`} />
                      <span className="text-slate-200 font-medium">{getColorConfig(getDeviceColorId(device.tags)).name}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Stato da:</span>
                    <span className="text-slate-200">{formatTimeOnly(device.status_since)}</span>
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
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Controlli Attivi ({checks.length})
                  </span>
                  <button
                    onClick={() => setShowAddCheck(!showAddCheck)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-lg text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddCheck ? 'Chiudi' : 'Aggiungi Controllo'}</span>
                  </button>
                </div>

                {showAddCheck && (
                  <form onSubmit={handleCreateCheck} className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-sky-500/30 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-1.5">
                      <span className="font-semibold text-xs text-sky-600 dark:text-sky-300">Nuovo Controllo Personalizzato</span>
                      <button type="button" onClick={() => setShowAddCheck(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">Tipo di Test:</label>
                        <select
                          value={newCheckType}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewCheckType(val);
                            if (val === 'ping') setNewCheckName(`Ping ICMP`);
                            else if (val === 'tcp_port') setNewCheckName(`Porta TCP ${newCheckPort || 80}`);
                            else if (val === 'http') setNewCheckName(`Healthcheck Web`);
                            else if (val === 'synology_dsm') setNewCheckName(`Stato Synology DSM`);
                            else if (val === 'nut') setNewCheckName(`Demone UPS NUT`);
                            else if (val === 'dns') setNewCheckName(`Risoluzione DNS`);
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        >
                          <option value="tcp_port">Porta TCP Specifica</option>
                          <option value="ping">Ping ICMP (Latenza)</option>
                          <option value="http">Healthcheck URL HTTP</option>
                          <option value="synology_dsm">Synology DSM (Storage)</option>
                          <option value="nut">UPS NUT (Batteria/Alim)</option>
                          <option value="dns">Query DNS Server</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">Nome Controllo:</label>
                        <input
                          type="text"
                          value={newCheckName}
                          onChange={(e) => setNewCheckName(e.target.value)}
                          placeholder="es. Porta 8006, Ping, Web GUI"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {(newCheckType === 'tcp_port' || newCheckType === 'synology_dsm' || newCheckType === 'nut') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                            Porta TCP Target:
                          </label>
                          <input
                            type="number"
                            value={newCheckPort}
                            onChange={(e) => setNewCheckPort(e.target.value)}
                            placeholder={newCheckType === 'synology_dsm' ? '5000' : newCheckType === 'nut' ? '3493' : '80'}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                            Intervallo (secondi):
                          </label>
                          <input
                            type="number"
                            value={newCheckInterval}
                            onChange={(e) => setNewCheckInterval(Number(e.target.value))}
                            min={5}
                            max={3600}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                          />
                        </div>
                      </div>
                    )}

                    {newCheckType === 'http' && (
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                          URL Completo (Heartbeat/Healthcheck):
                        </label>
                        <input
                          type="text"
                          value={newCheckUrl}
                          onChange={(e) => setNewCheckUrl(e.target.value)}
                          placeholder={`http://${device.addresses?.ip || '192.168.1.1'}:80/`}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                          required
                        />
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-1 border-t border-slate-200 dark:border-slate-700/60">
                      <button
                        type="button"
                        onClick={() => setShowAddCheck(false)}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition"
                      >
                        Annulla
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingCheck}
                        className="px-3 py-1 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow transition flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isCreatingCheck ? 'Aggiunta...' : 'Aggiungi e Testa Subito'}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Checks List */}
                {checks.length === 0 ? (
                  <div className="text-center text-slate-500 py-6">
                    Nessun controllo attivo configurato per questo apparato.
                  </div>
                ) : (
                  checks.map((chk) => (
                    <div key={chk.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{chk.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            Tipo: {chk.type} • Intervallo: {chk.interval_seconds}s
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                            chk.current_status === 'ok'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : chk.current_status === 'crit'
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {chk.current_status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700/40">
                        <button
                          type="button"
                          onClick={() => handleDeleteCheck(chk.id)}
                          className="text-slate-400 hover:text-rose-500 transition p-1 rounded"
                          title="Elimina controllo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleRunCheck(chk.id)}
                          disabled={runningCheckId === chk.id}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded text-[11px] font-medium transition shadow-sm"
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
                        <span className="text-slate-500">{formatTimeOnly(ev.ts)}</span>
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

      {/* Timed Toast Notification */}
      {toast && (
        <div className="fixed top-16 right-6 z-50 max-w-sm w-[360px] animate-in fade-in slide-in-from-top-3 duration-200 pointer-events-auto">
          <div
            className={`relative rounded-2xl shadow-2xl backdrop-blur-xl border p-4 overflow-hidden transition-all ${
              toast.type === 'ok'
                ? 'bg-white/95 dark:bg-slate-900/95 border-emerald-500/40 dark:border-emerald-500/40 text-slate-800 dark:text-slate-100 shadow-emerald-500/10'
                : toast.type === 'warn'
                ? 'bg-white/95 dark:bg-slate-900/95 border-amber-500/40 dark:border-amber-500/40 text-slate-800 dark:text-slate-100 shadow-amber-500/10'
                : 'bg-white/95 dark:bg-slate-900/95 border-rose-500/40 dark:border-rose-500/40 text-slate-800 dark:text-slate-100 shadow-rose-500/10'
            }`}
          >
            {/* Top accent bar */}
            <div
              className={`absolute top-0 left-0 right-0 h-1.5 ${
                toast.type === 'ok'
                  ? 'bg-emerald-500'
                  : toast.type === 'warn'
                  ? 'bg-amber-500'
                  : 'bg-rose-500'
              }`}
            />

            <div className="flex items-start gap-3 pt-0.5">
              <div
                className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  toast.type === 'ok'
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                    : toast.type === 'warn'
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {toast.type === 'ok' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : toast.type === 'warn' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <AlertOctagon className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    {toast.headline}
                  </h4>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      toast.type === 'ok'
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                        : toast.type === 'warn'
                        ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {toast.type.toUpperCase()}
                  </span>
                </div>

                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {toast.deviceName} {toast.deviceIp ? `(${toast.deviceIp})` : ''} • {toast.checkName}
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-200 mt-1.5 leading-relaxed font-normal">
                  {toast.description}
                </p>
              </div>

              <button
                onClick={dismissToast}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition -mr-1 -mt-1 shrink-0"
                title="Chiudi notifica"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Bottom animated progress bar shrinking over 5s */}
            <div className="mt-3 -mx-4 -mb-4 bg-slate-100 dark:bg-slate-800/80 h-1 overflow-hidden">
              <div
                className={`h-full toast-progress ${
                  toast.type === 'ok'
                    ? 'bg-emerald-500'
                    : toast.type === 'warn'
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
                }`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
