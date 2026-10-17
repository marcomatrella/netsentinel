import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Users,
  Zap,
  Network,
  Shield,
  ShieldAlert,
  Globe,
  Sliders,
  Radio,
  Clock,
  HardDrive,
  Cpu,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceIntegration } from '../../types';
import { fetchObservations, executeCheckNow } from '../../api/client';
import { IntegrationIcon } from '../common/IntegrationIcon';
import { formatTimeOnly } from '../../utils/date';

interface IntegrationDetailModalProps {
  isOpen: boolean;
  device: Device;
  integration: DeviceIntegration;
  onClose: () => void;
  onEditConfig?: () => void;
  onIntegrationUpdated?: () => void;
}

export const IntegrationDetailModal: React.FC<IntegrationDetailModalProps> = ({
  isOpen,
  device,
  integration,
  onClose,
  onEditConfig,
  onIntegrationUpdated,
}) => {
  const { t } = useTranslation();
  const [observation, setObservation] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const loadLatestObservation = async () => {
    try {
      setIsLoading(true);
      const obsList = await fetchObservations(device.id, 20);
      const matched = obsList.find((o) => o.check_id === integration.id);
      if (matched) {
        setObservation(matched);
      }
    } catch {
      // Ignored
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLatestObservation();
    }
  }, [isOpen, device.id, integration.id]);

  if (!isOpen) return null;

  const handleRefreshNow = async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const res = await executeCheckNow(integration.id);
      if (res) {
        setObservation(res);
      }
      if (onIntegrationUpdated) {
        onIntegrationUpdated();
      }
    } catch (err: any) {
      setRefreshError(err.message || 'Errore sincronizzazione.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const details = observation?.details || {};
  const status = observation?.status || integration.status || 'unknown';
  const isOk = status === 'ok';

  // Determine Web UI link if available in params
  const webUrl =
    integration.params?.controller_url ||
    integration.params?.adguard_url ||
    integration.params?.ha_url ||
    (integration.type === 'synology_dsm' && device.addresses?.ip
      ? `${integration.params?.https ? 'https' : 'http'}://${device.addresses.ip}:${integration.params?.port || (integration.params?.https ? 5001 : 5000)}`
      : null);

  const getIntegrationTitle = () => {
    switch (integration.type) {
      case 'unifi':
        return 'Ubiquiti UniFi Controller';
      case 'adguard_home':
        return 'AdGuard Home DNS';
      case 'home_assistant':
        return 'Home Assistant';
      case 'synology_dsm':
        return 'Synology DiskStation';
      default:
        return integration.name;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <IntegrationIcon type={integration.type} size={24} withBackground />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {getIntegrationTitle()}
                </h3>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isOk
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : status === 'warning'
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      : status === 'error'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      : 'bg-slate-500/10 text-slate-500 border-slate-500/30'
                  }`}
                >
                  {status}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {device.name} {device.addresses?.ip ? `(${device.addresses.ip})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title={t('device_detail.btn_cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {refreshError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{refreshError}</span>
            </div>
          )}

          {/* UniFi Specific Telemetry Cards */}
          {integration.type === 'unifi' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.unifi_stat_clients')}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                      {details.clients_count ?? details.num_sta ?? details.active_clients ?? '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.unifi_stat_poe')}
                    </span>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono">
                      {details.total_poe_power !== undefined
                        ? `${details.total_poe_power} W`
                        : details.poe_power !== undefined
                        ? `${details.poe_power} W`
                        : '0 W'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Network className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.unifi_stat_model')}
                    </span>
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate block">
                      {details.model || 'UniFi Device'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.unifi_stat_total_devices')}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                      {details.devices_found ?? details.total_devices ?? '—'}
                    </span>
                  </div>
                </div>
              </div>

              {details.message && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-slate-700 dark:text-slate-300 text-xs">
                  {details.message}
                </div>
              )}
            </div>
          )}

          {/* AdGuard Home Specific Telemetry Cards */}
          {integration.type === 'adguard_home' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.adguard_stat_protection')}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                      {details.protection_enabled !== false ? 'Attiva' : 'Disattivata'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.adguard_stat_queries')}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                      {details.num_dns_queries !== undefined ? Number(details.num_dns_queries).toLocaleString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10 text-rose-500">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.adguard_stat_blocked')}
                    </span>
                    <span className="text-sm font-bold text-rose-600 dark:text-rose-400 font-mono">
                      {details.num_blocked_filtering !== undefined ? Number(details.num_blocked_filtering).toLocaleString() : '—'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">
                      {t('device_detail.adguard_stat_avg_time')}
                    </span>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                      {details.avg_processing_time ? `${(details.avg_processing_time * 1000).toFixed(1)} ms` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Home Assistant Specific Telemetry Cards */}
          {integration.type === 'home_assistant' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Entità:</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {details.entity_id || integration.params?.entity_id || 'Tutte'}
                  </span>
                </div>
                {details.friendly_name && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Nome:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {details.friendly_name}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Stato Rilevato:</span>
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-400 font-mono">
                    {details.state ?? '—'}{details.unit_of_measurement ? ` ${details.unit_of_measurement}` : ''}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Synology Specific Telemetry Cards */}
          {integration.type === 'synology_dsm' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-500/10 text-slate-500">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Modello DSM</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {details.model || 'Synology NAS'}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Temperatura</span>
                    <span className="text-sm font-bold text-amber-500 font-mono">
                      {details.temperature ? `${details.temperature}°C` : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Metadata info */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1.5 text-[11px]">
            <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
              <span>{t('device_detail.field_status_since')}:</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {observation?.ts ? formatTimeOnly(observation.ts) : '—'}
              </span>
            </div>
            {webUrl && (
              <div className="flex justify-between items-center text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                <span>URL Servizio:</span>
                <a
                  href={webUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-500 hover:text-sky-600 dark:hover:text-sky-400 flex items-center gap-1 font-mono transition"
                >
                  <span className="truncate max-w-[200px]">{webUrl}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshNow}
              disabled={isRefreshing}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? t('device_detail.btn_refreshing') : t('device_detail.btn_refresh_now')}</span>
            </button>

            {onEditConfig && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditConfig();
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>{t('device_detail.btn_edit_config')}</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            {t('device_detail.btn_close')}
          </button>
        </div>
      </div>
    </div>
  );
};
