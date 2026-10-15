import React, { useState } from 'react';
import {
  X,
  Search,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Router as RouterIcon,
  HardDrive,
  Server,
  Wifi,
  Network,
  Cpu,
  Zap,
  Globe,
  Settings,
  Shield,
  Smartphone,
  Eye,
  Check,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceKind } from '../../types';
import { scanNetwork, DiscoveredDeviceItem } from '../../api/client';
import { getDefaultColorForKind } from '../../constants/colors';

interface NetworkDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDevices: Device[];
  onAddDiscoveredDevices: (devices: Device[], autoLink?: boolean) => void;
}

export const NetworkDiscoveryModal: React.FC<NetworkDiscoveryModalProps> = ({
  isOpen,
  onClose,
  existingDevices,
  onAddDiscoveredDevices,
}) => {
  const { t } = useTranslation();
  const [subnet, setSubnet] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<DiscoveredDeviceItem[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [silentMode, setSilentMode] = useState<boolean>(true);
  const [autoLink, setAutoLink] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const existingIps = new Set(existingDevices.map((d) => d.addresses?.ip).filter(Boolean));
  const existingDevIds = new Set(existingDevices.map((d) => d.id));

  const handleStartScan = async () => {
    setIsScanning(true);
    setErrorMsg(null);
    try {
      const res = await scanNetwork(subnet.trim() || undefined);
      if (res.subnet && !subnet) {
        setSubnet(res.subnet);
      }
      setScanResult(res.devices);
      // Pre-select new reachable devices not already in topology
      const newIds = new Set<string>();
      for (const d of res.devices) {
        if (!existingIps.has(d.ip) && !existingDevIds.has(d.id)) {
          newIds.add(d.id);
        }
      }
      setSelectedIds(newIds);
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante la scansione della rete.');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (!scanResult) return;
    const eligible = scanResult.filter(
      (d) => !existingIps.has(d.ip) && !existingDevIds.has(d.id)
    );
    if (selectedIds.size >= eligible.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map((d) => d.id)));
    }
  };

  const handleConfirmAdd = () => {
    if (!scanResult) return;
    const toAdd = scanResult.filter((d) => selectedIds.has(d.id));
    if (toAdd.length === 0) return;

    const newDevices: Device[] = toAdd.map((d) => {
      const defaultColor = getDefaultColorForKind(d.kind as DeviceKind);
      const roles = [...(d.roles || [])];

      // If silent mode is checked or device is IoT/client, ensure passive_tracking and no service role
      if (silentMode || ['smart_plug', 'sensor', 'client'].includes(d.kind)) {
        if (!roles.includes('passive_tracking') && !d.is_gateway && !d.is_vantage_point) {
          roles.push('passive_tracking');
        }
        // Remove active service role to prevent false alerts / Rule 13
        const serviceIdx = roles.indexOf('service');
        if (serviceIdx !== -1) {
          roles.splice(serviceIdx, 1);
        }
      }

      return {
        id: d.id,
        name: d.name,
        kind: (d.kind as DeviceKind) || 'client',
        status: d.reachable ? 'ok' : 'unknown',
        status_since: new Date().toISOString(),
        criticality: d.is_gateway ? 5 : d.is_vantage_point ? 4 : 2,
        location: d.location || 'LAN',
        roles,
        addresses: {
          ip: d.ip,
          mac: d.mac || undefined,
        },
        tags: [`color:${defaultColor}`],
        notes: d.is_gateway ? 'Gateway predefinito rilevato da scansione rete' : undefined,
        interfaces: [],
      };
    });

    onAddDiscoveredDevices(newDevices, autoLink);
    onClose();
  };

  const getDeviceIcon = (kind: string) => {
    switch (kind) {
      case 'router':
      case 'firewall':
        return <RouterIcon className="w-4 h-4 text-rose-500" />;
      case 'switch':
        return <Network className="w-4 h-4 text-emerald-500" />;
      case 'access_point':
        return <Wifi className="w-4 h-4 text-sky-500" />;
      case 'nas':
        return <HardDrive className="w-4 h-4 text-amber-500" />;
      case 'server':
        return <Server className="w-4 h-4 text-indigo-500" />;
      case 'smart_hub':
        return <Cpu className="w-4 h-4 text-cyan-500" />;
      case 'ups':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'wan_gateway':
        return <Globe className="w-4 h-4 text-blue-500" />;
      default:
        return <Smartphone className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/65 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] sm:max-h-[85vh] text-slate-800 dark:text-slate-100 relative overflow-hidden">
        {/* Header */}
        <div className="px-3.5 py-3 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="p-2 sm:p-2.5 bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 rounded-xl shrink-0">
              <Search className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold truncate">
                {t('discovery.modal_title') || 'Rilevamento Automatico Subnet & Dispositivi'}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden xs:block">
                {t('discovery.modal_desc') || 'Scansiona la rete locale, individua apparati attivi e importali con un click sulla plancia.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subnet Input & Action Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/30 flex flex-col sm:flex-row gap-3 items-center">
          <div className="flex-1 w-full flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {t('discovery.subnet_label') || 'Subnet:'}
            </label>
            <input
              type="text"
              placeholder="es. 192.168.1.0/24 (vuoto per auto-detect)"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-xl text-xs font-mono focus:outline-none focus:border-sky-500"
            />
          </div>
          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>{t('discovery.scanning') || 'Scansione in corso...'}</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>{scanResult ? (t('discovery.rescan') || 'Riesegui Scansione') : (t('discovery.start_scan') || 'Avvia Scansione')}</span>
              </>
            )}
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {errorMsg && (
            <div className="p-3 bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!scanResult && !isScanning && !errorMsg && (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Search className="w-10 h-10 mx-auto opacity-30 text-sky-500" />
              <p className="text-xs font-medium">
                {t('discovery.empty_hint') || 'Clicca "Avvia Scansione" per rilevare automaticamente tutti i dispositivi attivi nella tua LAN.'}
              </p>
            </div>
          )}

          {isScanning && (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <RefreshCw className="w-8 h-8 mx-auto animate-spin text-sky-500" />
              <p className="text-xs font-medium">
                {t('discovery.sweeping') || 'Sondaggio sweep ICMP/ARP e profilazione porte in corso sulla subnet...'}
              </p>
              <p className="text-[11px] text-slate-500">
                {t('discovery.sweep_note') || 'Analisi fingerprint dei router, server, NAS e dispositivi IoT in corso'}
              </p>
            </div>
          )}

          {scanResult && !isScanning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {t('discovery.found_count', { count: scanResult.length }) || `Rilevati ${scanResult.length} dispositivi`}
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-sky-600 dark:text-sky-400 hover:underline font-medium cursor-pointer"
                >
                  {selectedIds.size === 0
                    ? (t('discovery.select_all') || 'Seleziona tutti i nuovi')
                    : (t('discovery.deselect_all') || 'Deseleziona tutti')}
                </button>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden">
                {scanResult.map((d) => {
                  const alreadyExists = existingIps.has(d.ip) || existingDevIds.has(d.id);
                  const isSelected = selectedIds.has(d.id);

                  return (
                    <div
                      key={d.id}
                      onClick={() => !alreadyExists && toggleSelect(d.id)}
                      className={`p-3 flex items-center gap-3 transition ${
                        alreadyExists
                          ? 'opacity-50 bg-slate-50/50 dark:bg-slate-900/50 cursor-not-allowed'
                          : isSelected
                          ? 'bg-sky-500/10 dark:bg-sky-500/15 cursor-pointer'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={alreadyExists}
                        onChange={() => !alreadyExists && toggleSelect(d.id)}
                        className="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
                      />

                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
                        {getDeviceIcon(d.kind)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs truncate text-slate-800 dark:text-slate-200">
                            {d.name}
                          </span>
                          {d.is_gateway && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              Gateway
                            </span>
                          )}
                          {d.is_vantage_point && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                              Vantage Point
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                          <span>{d.ip}</span>
                          {d.mac && <span>• {d.mac}</span>}
                          {d.rtt_ms !== null && d.rtt_ms !== undefined && (
                            <span>• {d.rtt_ms.toFixed(1)} ms</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {alreadyExists ? (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                            {t('discovery.already_in_topology') || 'Già in plancia'}
                          </span>
                        ) : d.reachable ? (
                          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {t('common.online') || 'Online'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-400">
                            {t('common.unknown') || 'Sconosciuto'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="flex flex-col gap-1.5 w-full sm:w-auto">
            {/* Toggle 1: Silent Monitoring Mode */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white select-none">
              <input
                type="checkbox"
                checked={silentMode}
                onChange={(e) => setSilentMode(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
              <span className="flex items-center gap-1.5 font-medium">
                <Shield className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                {t('discovery.silent_mode_toggle') || 'Aggiungi in modalità silenziosa (nessuna notifica email finché non validati)'}
              </span>
            </label>

            {/* Toggle 2: Auto Link to Core/Switch/AP */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white select-none">
              <input
                type="checkbox"
                checked={autoLink}
                onChange={(e) => setAutoLink(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-sky-600 focus:ring-0 cursor-pointer"
              />
              <span className="flex items-center gap-1.5 font-medium">
                <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {t('discovery.auto_link_toggle') || 'Collega automaticamente agli apparati core/switch/AP esistenti'}
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 w-full sm:w-auto shrink-0">
            {selectedIds.size > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-2 hidden md:inline">
                {t('discovery.selected_count', { count: selectedIds.size }) || `${selectedIds.size} selezionati`}
              </span>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
            >
              {t('common.cancel') || 'Annulla'}
            </button>
            <button
              onClick={handleConfirmAdd}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>
                {t('discovery.add_selected', { count: selectedIds.size }) || `Aggiungi alla plancia (${selectedIds.size})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
