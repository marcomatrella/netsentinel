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
  Calendar,
  Eye,
} from 'lucide-react';
import { Check, Device, Dependency, DeviceKind } from '../../types';
import { executeCheckNow, fetchDeviceChecks, fetchEvents, updateDevice, createCheck, deleteCheck } from '../../api/client';
import { PRESET_COLORS, getDeviceColorId, setDeviceColorTag, getColorConfig } from '../../constants/colors';
import { formatTimeOnly } from '../../utils/date';
import { DeviceColorModal } from './DeviceColorModal';
import { useTranslation } from '../../i18n/I18nContext';


interface DeviceDetailPanelProps {
  device: Device | null;
  dependencies: Dependency[];
  allDevices: Device[];
  onClose: () => void;
  onSelectDevice?: (deviceId: string) => void;
  onDeleteDevice?: (deviceId: string) => void;
  onUpdateDevice?: (deviceId: string, updatedData: Partial<Device>) => Promise<void>;
  onRefreshTopology?: () => void;
  onOpenMaintenance?: (deviceId?: string) => void;
}

const DEVICE_KIND_KEYS: DeviceKind[] = [
  'router', 'firewall', 'switch', 'access_point', 'nas', 'server',
  'smart_hub', 'camera', 'nvr', 'printer', 'smart_plug', 'ups',
  'modem', 'sensor', 'poe_injector', 'service', 'client', 'wan_gateway', 'custom',
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

type TFunc = (key: string, opts?: Record<string, any>) => string;

const buildCheckToastDescription = (chk: Check, res: any, t: TFunc): string => {
  const details = res?.details || {};
  const val = res?.value;

  switch (chk.type) {
    case 'ping': {
      const rtt = val ?? details.avg_rtt_ms ?? details.rtt_ms;
      const loss = details.packet_loss_percent ?? 0;
      if (res?.status === 'ok') {
        return details.error || t('device_detail.toast_ping_ok', {
          rtt: rtt !== undefined ? `${Number(rtt).toFixed(1)} ms` : '—',
          loss,
        });
      }
      return details.error || t('device_detail.toast_ping_fail', { loss });
    }
    case 'synology_dsm': {
      const model = details.model || 'Synology NAS';
      const temp = details.temperature ? `${details.temperature}°C` : null;
      const ver = details.version ? `DSM v${details.version}` : null;
      const poolStatus = details.storage_pools?.map((p: any) => `${p.name || 'Pool'}: ${p.status || 'OK'}`).join(', ');
      if (res?.status === 'ok') {
        const parts = [model, ver, temp, poolStatus].filter(Boolean).join(' • ');
        return t('device_detail.toast_dsm_ok', { parts });
      }
      return details.error || t('device_detail.toast_dsm_fail');
    }
    case 'http': {
      const code = details.status_code || details.code || 200;
      const time = details.response_time_ms ? `${details.response_time_ms} ms` : '—';
      if (res?.status === 'ok') {
        return t('device_detail.toast_http_ok', { code, time });
      }
      return details.error || t('device_detail.toast_http_fail', { code });
    }
    case 'tcp_port': {
      const port = details.port || chk.params?.port || '?';
      const rtt = details.rtt_ms ? `${details.rtt_ms} ms` : '—';
      if (res?.status === 'ok') {
        return t('device_detail.toast_tcp_ok', { port, rtt });
      }
      return details.error || t('device_detail.toast_tcp_fail', { port });
    }
    case 'dns': {
      const resolved = details.resolved_ip || details.answer || '—';
      const time = details.query_time_ms ? `${details.query_time_ms} ms` : '—';
      if (res?.status === 'ok') {
        return t('device_detail.toast_dns_ok', { resolved, time });
      }
      return details.error || t('device_detail.toast_dns_fail');
    }
    case 'nut': {
      const charge = details.battery_charge ? `${details.battery_charge}%` : null;
      const status = details.ups_status || '—';
      if (res?.status === 'ok') {
        const parts = [status, charge].filter(Boolean).join(' • ');
        return t('device_detail.toast_nut_ok', { parts });
      }
      return details.error || t('device_detail.toast_nut_fail');
    }
    case 'generic_http_json':
    case 'home_assistant':
    case 'adguard_home':
    case 'unifi': {
      if (res?.status === 'ok') {
        return details.message || t('device_detail.toast_integration_ok', { type: chk.type });
      }
      return details.error || details.message || t('device_detail.toast_integration_fail', { type: chk.type });
    }
    default: {
      if (res?.status === 'ok') {
        return details.message || t('device_detail.toast_generic_ok');
      }
      return details.error || details.message || t('device_detail.toast_generic_fail');
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
  onOpenMaintenance,
}) => {
  const { t } = useTranslation();
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
  const [isColorModalOpen, setIsColorModalOpen] = useState<boolean>(false);

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
      setIsColorModalOpen(false);
    }
  }, [device]);

  if (!device) return null;

  const upstreamDeps = dependencies.filter((d) => d.dependent_id === device.id);
  const downstreamDeps = dependencies.filter((d) => d.provider_id === device.id);
  const devMap = new Map(allDevices.map((d) => [d.id, d]));

  const handleSaveColor = async (colorId: string) => {
    if (!device) return;
    const newTags = setDeviceColorTag(device.tags || [], colorId);
    setEditColor(colorId);
    if (onUpdateDevice) {
      await onUpdateDevice(device.id, { tags: newTags });
    } else {
      await updateDevice(device.id, { tags: newTags });
    }
    if (onRefreshTopology) {
      onRefreshTopology();
    }
  };

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
          ? t('device_detail.toast_ok')
          : isWarn
          ? t('device_detail.toast_warn')
          : t('device_detail.toast_crit');

        const description = buildCheckToastDescription(chk, res, t);

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
          headline: t('device_detail.toast_run_error'),
          description: err.message || t('device_detail.toast_run_error_desc'),
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
      alert(t('device_detail.ip_conflict', { ip: cleanEditIp, name: conflict.name, id: conflict.id }));
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
      console.error('Save device error:', err);
      alert(err.message || 'Save error — check backend.');
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
        if (!autoName) autoName = `TCP Port ${port}`;
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
        if (!autoName) autoName = `DNS Query`;
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
      alert('Check creation error: ' + (err.message || 'Verify parameters.'));
    } finally {
      setIsCreatingCheck(false);
    }
  };

  const handleDeleteCheck = async (checkId: string) => {
    if (!window.confirm(t('device_detail.delete_check_confirm', { name: checkId }))) return;
    try {
      await deleteCheck(checkId);
      const updated = await fetchDeviceChecks(device.id);
      setChecks(updated);
    } catch (err: any) {
      alert('Delete check error: ' + (err.message || 'Check backend.'));
    }
  };


  return (
    <div className="w-full sm:w-96 max-w-full absolute sm:relative inset-y-0 right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-30 text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/70 dark:bg-slate-950/40">
        <div className="flex-1 min-w-0 mr-2">
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
            <span className="text-sky-600 dark:text-sky-400 font-semibold">{device.addresses?.ip || t('device_detail.not_configured')}</span>
            <span>•</span>
            <span className="uppercase text-[10px] text-slate-400 dark:text-slate-500">{device.kind}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onOpenMaintenance && (
            <button
              onClick={() => onOpenMaintenance(device.id)}
              className="p-1.5 rounded-lg border bg-white hover:bg-purple-50 text-purple-600 border-purple-200 dark:bg-slate-800 dark:hover:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/80 transition"
              title={t('maintenance.btn_device_schedule') || 'Pianifica riavvio / manutenzione per questo apparato'}
            >
              <Calendar className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`p-1.5 rounded-lg border transition ${
              isEditing
                ? 'bg-sky-600 text-white border-sky-500 shadow'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700'
            }`}
            title={isEditing ? t('device_detail.btn_cancel') : t('device_detail.btn_edit_data')}
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
            {t('device_detail.tab_overview')}
          </button>
          <button
            onClick={() => setActiveTab('checks')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'checks'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t('device_detail.tab_checks')} ({checks.length})
          </button>
          <button
            onClick={() => setActiveTab('deps')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'deps'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t('device_detail.tab_dependencies')}
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-2.5 text-center font-medium border-b-2 transition ${
              activeTab === 'events'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {t('device_detail.tab_events')}
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
              <span>{t('device_detail.edit_notice')}</span>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">{t('device_detail.name_label')}</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('device_detail.name_placeholder')}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"

              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                {t('device_detail.ip_label')}
              </label>
              <input
                type="text"
                value={editIp}
                onChange={(e) => setEditIp(e.target.value)}
                placeholder={t('device_detail.ip_placeholder')}
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
                    <span>{t('device_detail.ip_conflict', { ip: clean, name: conflict.name, id: conflict.id })}</span>
                  </div>
                );
              })()}
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                {t('device_detail.ip_hint')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">{t('device_detail.kind_label')}</label>
                <select
                  value={editKind}
                  onChange={(e) => setEditKind(e.target.value as DeviceKind)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  {DEVICE_KIND_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {t(`device_kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">{t('device_detail.criticality_label')}</label>
                <select
                  value={editCriticality}
                  onChange={(e) => setEditCriticality(Number(e.target.value))}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                >
                  <option value={1}>{t('device_detail.crit_1')}</option>
                  <option value={2}>{t('device_detail.crit_2')}</option>
                  <option value={3}>{t('device_detail.crit_3')}</option>
                  <option value={4}>{t('device_detail.crit_4')}</option>
                  <option value={5}>{t('device_detail.crit_5')}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">{t('device_detail.location_label')}</label>
              <input
                type="text"
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder={t('device_detail.location_placeholder')}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Network Roles / Services */}
            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2.5">
              <span className="block font-medium text-slate-700 dark:text-slate-300 text-xs">{t('device_detail.roles_section')}</span>

              <label className="flex items-start gap-2 cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white">
                <input
                  type="checkbox"
                  checked={editRoles.includes('dns_resolver')}
                  onChange={() => handleToggleRole('dns_resolver')}
                  className="mt-0.5 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-sky-500 focus:ring-0"
                />
                <div>
                  <span className="font-semibold flex items-center gap-1.5 text-sky-600 dark:text-sky-300">
                    <Globe className="w-3.5 h-3.5 text-cyan-500 stroke-[2.5]" />
                    {t('device_detail.role_dns')}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{t('device_detail.role_dns_resolver_badge')}</span>
                </div>
              </label>
              {(() => {
                if (!editRoles.includes('dns_resolver')) return null;
                const previousDns = allDevices.find((d) => d.id !== device.id && d.roles?.includes('dns_resolver'));
                if (!previousDns) return null;
                return (
                  <div className="ml-6 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span><strong>{previousDns.name}</strong> ({previousDns.addresses?.ip || previousDns.id})</span>
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
                  <span className="font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-300">
                    <Radio className="w-3.5 h-3.5 text-amber-500 stroke-[2.5]" />
                    {t('device_detail.role_dhcp')}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{t('device_detail.role_dhcp_server_badge')}</span>
                </div>
              </label>
              {(() => {
                if (!editRoles.includes('dhcp_server')) return null;
                const previousDhcp = allDevices.find((d) => d.id !== device.id && d.roles?.includes('dhcp_server'));
                if (!previousDhcp) return null;
                return (
                  <div className="ml-6 p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                    <span><strong>{previousDhcp.name}</strong> ({previousDhcp.addresses?.ip || previousDhcp.id})</span>
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
                  <span className="font-semibold block text-purple-600 dark:text-purple-300">{t('device_detail.role_gateway')}</span>
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
                  <span className="font-semibold block text-blue-600 dark:text-blue-300">{t('device_detail.role_vantage_point_badge')}</span>
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
                  <span className="font-semibold block text-slate-600 dark:text-slate-300">{t('device_detail.role_passive')}</span>
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
                  <span className="font-semibold block text-yellow-600 dark:text-yellow-300">{t('device_detail.role_dhcp')}</span>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">{t('device_detail.notes_label')}</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder={t('device_detail.notes_placeholder')}
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
                {t('device_detail.btn_cancel')}
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
                    <span>{isSaving ? t('device_detail.btn_saving') : t('device_detail.btn_save')}</span>
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
                    <span className="text-slate-400">{t('device_detail.field_ip')}</span>
                    <span className="font-mono text-sky-400 font-semibold">{device.addresses?.ip || t('device_detail.not_configured')}</span>
                  </div>
                  {device.rtt_ms !== undefined && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">{t('device_detail.field_ping_latency')}</span>
                      <span className="font-mono text-emerald-400 font-bold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {device.rtt_ms} ms
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('device_detail.field_location')}</span>
                    <span className="text-slate-200">{device.location || t('device_detail.not_specified')}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('device_detail.field_criticality')}</span>
                    <span className="text-amber-400 font-semibold">{device.criticality} / 5</span>
                  </div>
                  <div
                    onClick={() => setIsColorModalOpen(true)}
                    className="flex justify-between items-center cursor-pointer group hover:bg-slate-800/60 -mx-1 px-1 py-1 rounded-lg transition"
                    title={t('device_detail.btn_canvas_color_tooltip')}
                  >
                    <span className="text-slate-400 group-hover:text-slate-300">{t('device_detail.field_color_stripe')}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${getColorConfig(getDeviceColorId(device.tags)).dotClass}`} />
                      <span className="text-slate-200 group-hover:text-sky-300 font-medium transition text-xs">
                        {getColorConfig(getDeviceColorId(device.tags)).name}
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">{t('device_detail.field_status_since')}</span>
                    <span className="text-slate-200">{formatTimeOnly(device.status_since)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-sky-300 border border-slate-700 hover:border-sky-500/50 rounded-xl font-medium transition text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <Edit3 className="w-3.5 h-3.5 shrink-0" />
                    <span>{t('device_detail.btn_edit_data')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsColorModalOpen(true)}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-amber-500/50 rounded-xl font-medium transition text-xs flex items-center justify-center gap-2 shadow group"
                    title={t('device_detail.btn_canvas_color_tooltip')}
                  >
                    <PaletteIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{t('device_detail.btn_canvas_color')}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${getColorConfig(getDeviceColorId(device.tags)).dotClass} ring-1 ring-white/20 shrink-0`} />
                  </button>
                </div>

                {device.roles?.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      {t('device_detail.roles_active')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {device.roles.map((r) => {
                        if (r === 'vantage_point') {
                          return (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500 text-white border border-sky-300 ring-1 ring-sky-300/60 dark:ring-sky-400/60 vantage-point-glow-subtle shadow-sm"
                            >
                              <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>{t('device_detail.role_vantage_point_badge')}</span>
                            </span>
                          );
                        }
                        if (r === 'dns_resolver') {
                          return (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border bg-cyan-950 text-cyan-300 border-cyan-800"
                            >
                              <Globe className="w-3 h-3 text-cyan-400 stroke-[2.5]" />
                              <span>{t('device_detail.role_dns_resolver_badge')}</span>
                            </span>
                          );
                        }
                        if (r === 'dhcp_server') {
                          return (
                            <span
                              key={r}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold border bg-amber-950 text-amber-300 border-amber-800"
                            >
                              <Radio className="w-3 h-3 text-amber-400 stroke-[2.5]" />
                              <span>{t('device_detail.role_dhcp_server_badge')}</span>
                            </span>
                          );
                        }
                        return (
                          <span
                            key={r}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-slate-800 text-slate-300 border-slate-700"
                          >
                            {r}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {device.notes && (
                  <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">
                      {t('device_detail.notes_title')}
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
                      {t('device_detail.delete_device')}
                    </button>
                  </div>
                )}
              </div>
            )}


            {activeTab === 'checks' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    {t('device_detail.checks_title')} ({checks.length})
                  </span>
                  <button
                    onClick={() => setShowAddCheck(!showAddCheck)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded-lg text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showAddCheck ? t('device_detail.btn_cancel') : t('device_detail.btn_add_check')}</span>
                  </button>
                </div>

                {showAddCheck && (
                  <form onSubmit={handleCreateCheck} className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-sky-500/30 space-y-3 shadow-lg">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/60 pb-1.5">
                      <span className="font-semibold text-xs text-sky-600 dark:text-sky-300">{t('device_detail.add_check_title')}</span>
                      <button type="button" onClick={() => setShowAddCheck(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">{t('device_detail.check_type_label')}</label>
                        <select
                          value={newCheckType}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNewCheckType(val);
                            if (val === 'ping') setNewCheckName('Ping ICMP');
                            else if (val === 'tcp_port') setNewCheckName(`TCP Port ${newCheckPort || 80}`);
                            else if (val === 'http') setNewCheckName('HTTP Healthcheck');
                            else if (val === 'synology_dsm') setNewCheckName('Synology DSM');
                            else if (val === 'nut') setNewCheckName('UPS NUT');
                            else if (val === 'dns') setNewCheckName('DNS Query');
                          }}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                        >
                          <option value="tcp_port">{t('device_detail.check_type_tcp')}</option>
                          <option value="ping">{t('device_detail.check_type_ping')}</option>
                          <option value="http">{t('device_detail.check_type_http')}</option>
                          <option value="synology_dsm">Synology DSM (Storage)</option>
                          <option value="nut">UPS NUT</option>
                          <option value="dns">DNS Query</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">{t('device_detail.check_name_label')}</label>
                        <input
                          type="text"
                          value={newCheckName}
                          onChange={(e) => setNewCheckName(e.target.value)}
                          placeholder={t('device_detail.check_name_placeholder')}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>

                    {(newCheckType === 'tcp_port' || newCheckType === 'synology_dsm' || newCheckType === 'nut') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                            {t('device_detail.check_port_label')}
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
                            {t('device_detail.check_interval_label')}
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
                          {t('device_detail.check_url_label')}
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
                        {t('device_detail.btn_cancel')}
                      </button>
                      <button
                        type="submit"
                        disabled={isCreatingCheck}
                        className="px-3 py-1 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold shadow transition flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isCreatingCheck ? t('device_detail.btn_creating') : t('device_detail.btn_create_check')}</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Checks List */}
                {checks.length === 0 ? (
                  <div className="text-center text-slate-500 py-6">
                    {t('device_detail.no_checks')}
                  </div>
                ) : (
                  checks.map((chk) => (
                    <div key={chk.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">{chk.name}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400">
                            {chk.type} • {t('device_detail.interval_sec', { sec: chk.interval_seconds })}
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
                          title={t('device_detail.btn_cancel')}
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
                          {t('device_detail.btn_run_now')}
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
                    {t('device_detail.deps_upstream_title')}
                  </span>
                  {upstreamDeps.length === 0 ? (
                    <div className="text-slate-500 text-xs">{t('device_detail.deps_upstream_empty')}</div>
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
                                {d.kind} ({d.strength})
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
                    {t('device_detail.deps_downstream_title')}
                  </span>
                  {downstreamDeps.length === 0 ? (
                    <div className="text-slate-500 text-xs">{t('device_detail.deps_downstream_empty')}</div>
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
                              <div className="text-[10px] text-slate-400">{d.kind}</div>
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
                  <div className="text-slate-500 text-center py-6">{t('device_detail.events_history_empty')}</div>
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

      {/* Centered Device Color Modal */}
      <DeviceColorModal
        isOpen={isColorModalOpen}
        device={device}
        onClose={() => setIsColorModalOpen(false)}
        onSave={handleSaveColor}
      />
    </div>
  );
};
