import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Search,
  Filter,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  RotateCw,
  History,
  Activity,
  ArrowRight,
  Server,
  HardDrive,
  Wifi,
  Globe,
  Network,
  Radio,
  Layers,
  Smartphone,
  Download,
  Calendar,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { EventItem, Device, DeviceKind } from '../../types';
import { fetchEvents } from '../../api/client';
import { parseUtcDate } from '../../utils/date';

interface EventLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[];
  onTimeTravelToEvent?: (targetTime: Date, deviceId?: string) => void;
  currentHistoricalTime?: Date | null;
}

const kindIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  wan_gateway: Globe,
  router: Globe,
  switch: Network,
  access_point: Wifi,
  nas: HardDrive,
  server: Server,
  ups: Radio,
  poe_injector: Radio,
  smart_hub: Activity,
  client: Smartphone,
  service: Layers,
  custom: Layers,
};

const localeMap: Record<string, string> = {
  it: 'it-IT',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

function translateBackendMessage(rawMsg: string | undefined, lang: string): string {
  if (!rawMsg) return '';
  if (lang === 'it') return rawMsg;

  // 1. Overall device status
  const devStateMatch = rawMsg.match(/Lo stato complessivo di '(.+?)' è ora ([A-Z]+)\./i);
  if (devStateMatch) {
    const dev = devStateMatch[1];
    const st = devStateMatch[2].toUpperCase();
    if (lang === 'en') return `The overall status of '${dev}' is now ${st}.`;
    if (lang === 'fr') return `L'état global de '${dev}' est maintenant ${st}.`;
    if (lang === 'de') return `Der Gesamtstatus von '${dev}' ist jetzt ${st}.`;
    if (lang === 'es') return `El estado general de '${dev}' es ahora ${st}.`;
  }

  // 2. Check state change
  const chkStateMatch = rawMsg.match(/Il controllo '(.+?)' su '(.+?)' è passato allo stato ([A-Z]+)\./i);
  if (chkStateMatch) {
    const chk = chkStateMatch[1];
    const dev = chkStateMatch[2];
    const st = chkStateMatch[3].toUpperCase();
    if (lang === 'en') return `Health check '${chk}' on '${dev}' transitioned to ${st}.`;
    if (lang === 'fr') return `Le contrôle '${chk}' sur '${dev}' est passé à l'état ${st}.`;
    if (lang === 'de') return `Prüfung '${chk}' auf '${dev}' wechselte zum Status ${st}.`;
    if (lang === 'es') return `El control '${chk}' en '${dev}' pasó al estado ${st}.`;
  }

  // 3. Monitor daemon start
  const startMatch = rawMsg.match(/NetSentinel (v.+?) è stato avviato correttamente\./i);
  if (startMatch) {
    const ver = startMatch[1];
    if (lang === 'en') return `NetSentinel ${ver} started successfully.`;
    if (lang === 'fr') return `NetSentinel ${ver} a démarré avec succès.`;
    if (lang === 'de') return `NetSentinel ${ver} wurde erfolgreich gestartet.`;
    if (lang === 'es') return `NetSentinel ${ver} se inició correctamente.`;
  }

  // 4. Incident resolution
  const resMatch = rawMsg.match(/Tutti gli apparati e servizi sono rientrati\. Durata totale incidente:\s*(\d+)\s*secondi\./i);
  if (resMatch) {
    const sec = resMatch[1];
    if (lang === 'en') return `All devices and services have recovered. Total incident duration: ${sec}s.`;
    if (lang === 'fr') return `Tous les appareils et services sont rétablis. Durée totale de l'incident: ${sec}s.`;
    if (lang === 'de') return `Alle Geräte und Dienste wurden wiederhergestellt. Gesamtdauer des Vorfalls: ${sec}s.`;
    if (lang === 'es') return `Todos los dispositivos y servicios se han recuperado. Duración total del incidente: ${sec}s.`;
  }

  // 5. Flapping
  if (rawMsg.includes('Rilevati frequenti cambi di stato nella finestra temporale')) {
    if (lang === 'en') return 'Frequent state transitions detected within the observation window.';
    if (lang === 'fr') return 'Changements d\'état fréquents détectés dans la fenêtre temporelle.';
    if (lang === 'de') return 'Häufige Statuswechsel im Zeitfenster erkannt.';
    if (lang === 'es') return 'Se detectaron frecuentes cambios de estado en la ventana de observación.';
  }

  // 6. Root cause shift
  const shiftMatch = rawMsg.match(/La causa radice dell'incidente è passata a '(.+?)'\./i);
  if (shiftMatch) {
    const dev = shiftMatch[1];
    if (lang === 'en') return `The incident root cause shifted to '${dev}'.`;
    if (lang === 'fr') return `La cause racine de l'incident est passée à '${dev}'.`;
    if (lang === 'de') return `Die Grundursache des Vorfalls wurde auf '${dev}' verschoben.`;
    if (lang === 'es') return `La causa raíz del incidente cambió a '${dev}'.`;
  }

  return rawMsg;
}

function translateBackendTitle(rawTitle: string | undefined, lang: string): string {
  if (!rawTitle) return '';
  if (lang === 'it') return rawTitle;

  if (rawTitle.startsWith('Avvio servizio NetSentinel')) {
    if (lang === 'en') return 'NetSentinel Service Startup';
    if (lang === 'fr') return 'Démarrage du service NetSentinel';
    if (lang === 'de') return 'NetSentinel Dienststart';
    if (lang === 'es') return 'Inicio del servicio NetSentinel';
  }
  if (rawTitle.startsWith('Incidente Risolto')) {
    if (lang === 'en') return 'Incident Resolved';
    if (lang === 'fr') return 'Incident Résolu';
    if (lang === 'de') return 'Vorfall behoben';
    if (lang === 'es') return 'Incidente Resuelto';
  }
  const incApertoMatch = rawTitle.match(/Incidente Aperto:\s*(.+)/i);
  if (incApertoMatch) {
    const dev = incApertoMatch[1];
    if (lang === 'en') return `Incident Opened: ${dev}`;
    if (lang === 'fr') return `Incident Ouvert: ${dev}`;
    if (lang === 'de') return `Vorfall eröffnet: ${dev}`;
    if (lang === 'es') return `Incidente Abierto: ${dev}`;
  }
  const riavvioMatch = rawTitle.match(/Riavvio rilevato:\s*(.+)/i);
  if (riavvioMatch) {
    const dev = riavvioMatch[1];
    if (lang === 'en') return `Reboot detected: ${dev}`;
    if (lang === 'fr') return `Redémarrage détecté: ${dev}`;
    if (lang === 'de') return `Neustart erkannt: ${dev}`;
    if (lang === 'es') return `Reinicio detectado: ${dev}`;
  }
  const flapMatch = rawTitle.match(/Flapping instabile rilevato:\s*(.+)/i);
  if (flapMatch) {
    const dev = flapMatch[1];
    if (lang === 'en') return `Unstable flapping detected: ${dev}`;
    if (lang === 'fr') return `Flapping instable détecté: ${dev}`;
    if (lang === 'de') return `Instabiles Flapping erkannt: ${dev}`;
    if (lang === 'es') return `Flapping inestable detectado: ${dev}`;
  }
  const appStateMatch = rawTitle.match(/Apparato (.+?):\s*([A-Z]+)\s*->\s*([A-Z]+)/i);
  if (appStateMatch) {
    const dev = appStateMatch[1];
    const from = appStateMatch[2];
    const to = appStateMatch[3];
    if (lang === 'en') return `Device ${dev}: ${from} -> ${to}`;
    if (lang === 'fr') return `Équipement ${dev}: ${from} -> ${to}`;
    if (lang === 'de') return `Gerät ${dev}: ${from} -> ${to}`;
    if (lang === 'es') return `Dispositivo ${dev}: ${from} -> ${to}`;
  }
  return rawTitle;
}

export const EventLogsModal: React.FC<EventLogsModalProps> = ({
  isOpen,
  onClose,
  devices,
  onTimeTravelToEvent,
  currentHistoricalTime,
}) => {
  const { t, language } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLocale = localeMap[language] || 'en-US';

  // Filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'crit' | 'warn' | 'info'>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEventId, setExpandedEventId] = useState<number | null>(null);

  // Load events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents({
        limit: 150,
        severity: severityFilter === 'all' ? undefined : severityFilter,
        deviceId: selectedDeviceId === 'all' ? undefined : selectedDeviceId,
        search: searchQuery.trim() || undefined,
      });
      setEvents(data);
    } catch (err: any) {
      console.error('Errore caricamento log eventi:', err);
      setError(err.message || 'Impossibile recuperare il registro eventi.');
    } finally {
      setLoading(false);
    }
  }, [severityFilter, selectedDeviceId, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, loadEvents]);

  // Devices lookup
  const devicesMap = useMemo(() => {
    const map = new Map<string, Device>();
    for (const d of devices) {
      map.set(d.id, d);
    }
    return map;
  }, [devices]);

  // Narrative generator for human-friendly explanation ("in maniera parlante")
  const getNarrative = (ev: EventItem) => {
    const dev = ev.device_id ? devicesMap.get(ev.device_id) : undefined;
    const devName = ev.device_name || dev?.name || ev.device_id || t('events.network');
    const devIp = ev.device_ip || dev?.addresses?.ip;
    const ipStr = devIp ? ` (${devIp})` : '';

    switch (ev.event_type) {
      case 'device_state_change': {
        const oldSt = (ev.details?.old_status || '').toUpperCase();
        const newSt = (ev.details?.new_status || '').toUpperCase();
        if (newSt === 'DOWN') {
          return {
            headline: t('events.narratives.device_down_headline', { name: devName, ip: ipStr }),
            explanation: t('events.narratives.device_down_explanation'),
            actionable: t('events.narratives.device_down_actionable'),
          };
        }
        if (newSt === 'DEGRADED') {
          return {
            headline: t('events.narratives.device_degraded_headline', { name: devName, ip: ipStr }),
            explanation: t('events.narratives.device_degraded_explanation'),
            actionable: t('events.narratives.device_degraded_actionable'),
          };
        }
        if (newSt === 'FLAPPING') {
          return {
            headline: t('events.narratives.device_flapping_headline', { name: devName, ip: ipStr }),
            explanation: t('events.narratives.device_flapping_explanation'),
            actionable: t('events.narratives.device_flapping_actionable'),
          };
        }
        if (newSt === 'OK') {
          return {
            headline: t('events.narratives.device_ok_headline', { name: devName, ip: ipStr }),
            explanation: t('events.narratives.device_ok_explanation'),
            actionable: null,
          };
        }
        return {
          headline: t('events.narratives.device_state_change_headline', { name: devName, ip: ipStr, from: oldSt, to: newSt }),
          explanation: translateBackendMessage(ev.message, language),
          actionable: null,
        };
      }
      case 'check_state_change': {
        const target = ev.details?.target || ev.details?.server || devIp || '';
        const targetStr = target ? t('events.narratives.check_target_to', { target }) : '';
        const rtt = ev.details?.avg_rtt_ms || ev.details?.rtt_ms;
        const rttStr = rtt !== undefined ? ` (RTT: ${rtt}ms)` : '';
        const loss = ev.details?.packet_loss_percent;
        const lossStr = loss !== undefined && loss > 0 ? ` (${t('events.narratives.packet_loss')}: ${loss}%)` : '';
        const errMsg = ev.details?.error;
        const translatedTitle = translateBackendTitle(ev.title, language);
        const translatedMsg = translateBackendMessage(ev.message, language);

        return {
          headline: `${translatedTitle}${targetStr}`,
          explanation: errMsg
            ? t('events.narratives.check_error_explanation', { error: errMsg, msg: translatedMsg })
            : `${translatedMsg}${rttStr}${lossStr}.`,
          actionable: t('events.narratives.check_actionable'),
        };
      }
      case 'incident_opened': {
        const conf = ev.details?.confidence ? `${Math.round(ev.details.confidence * 100)}%` : '';
        const impacted = ev.details?.impacted || [];
        const impactedStr = impacted.length > 0 ? t('events.narratives.impacted_devices', { count: impacted.length }) : '';
        return {
          headline: t('events.narratives.incident_opened_headline', { name: devName }),
          explanation: t('events.narratives.incident_opened_explanation', {
            msg: translateBackendMessage(ev.message, language),
            conf,
            impacted: impactedStr,
          }),
          actionable: t('events.narratives.incident_opened_actionable', { name: devName }),
        };
      }
      case 'root_cause_shift': {
        return {
          headline: t('events.narratives.root_cause_shift_headline', { name: devName }),
          explanation: t('events.narratives.root_cause_shift_explanation', { msg: translateBackendMessage(ev.message, language) }),
          actionable: t('events.narratives.root_cause_shift_actionable', { name: devName }),
        };
      }
      case 'incident_resolved': {
        return {
          headline: t('events.narratives.incident_resolved_headline'),
          explanation: t('events.narratives.incident_resolved_explanation'),
          actionable: null,
        };
      }
      case 'reboot_detected': {
        return {
          headline: t('events.narratives.reboot_headline', { name: devName, ip: ipStr }),
          explanation: t('events.narratives.reboot_explanation', { msg: translateBackendMessage(ev.message, language) }),
          actionable: t('events.narratives.reboot_actionable'),
        };
      }
      case 'link_flap': {
        return {
          headline: t('events.narratives.link_flap_headline', { name: devName }),
          explanation: t('events.narratives.link_flap_explanation', { msg: translateBackendMessage(ev.message, language) }),
          actionable: t('events.narratives.link_flap_actionable'),
        };
      }
      case 'monitor_restart': {
        return {
          headline: t('events.narratives.monitor_restart_headline'),
          explanation: t('events.narratives.monitor_restart_explanation'),
          actionable: null,
        };
      }
      case 'ups_on_battery': {
        return {
          headline: t('events.narratives.ups_on_battery_headline', { name: devName }),
          explanation: t('events.narratives.ups_on_battery_explanation'),
          actionable: t('events.narratives.ups_on_battery_actionable'),
        };
      }
      case 'storage_degraded': {
        return {
          headline: t('events.narratives.storage_degraded_headline', { name: devName }),
          explanation: t('events.narratives.storage_degraded_explanation'),
          actionable: t('events.narratives.storage_degraded_actionable'),
        };
      }
      case 'firmware_update_detected': {
        return {
          headline: t('events.narratives.firmware_update_headline', { name: devName }),
          explanation: t('events.narratives.firmware_update_explanation'),
          actionable: null,
        };
      }
      default:
        return {
          headline: translateBackendTitle(ev.title, language) || t('events.narratives.system_event'),
          explanation: translateBackendMessage(ev.message, language),
          actionable: null,
        };
    }
  };

  // Format relative time in current language/locale
  const formatTime = (ts: string) => {
    try {
      const d = parseUtcDate(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);

      let relative = '';
      if (diffSec < 60) relative = t('events.time_just_now');
      else if (diffMin < 60) relative = t('events.time_min_ago', { count: diffMin });
      else if (diffHours < 24) relative = t('events.time_hours_ago', { count: diffHours });
      else relative = t('events.time_days_ago', { count: Math.floor(diffHours / 24) });

      const exact = d.toLocaleTimeString(activeLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = d.toLocaleDateString(activeLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });

      return { relative, exact: `${dateStr} ${exact}`, iso: ts, dateObj: d };
    } catch {
      return { relative: ts, exact: ts, iso: ts, dateObj: new Date() };
    }
  };

  // Export logs to JSON
  const handleExportLogs = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `netsentinel-events-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl h-[88vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  {t('events.modal_title')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-mono">
                  {events.length} {t('events.events_count')}
                </span>
                {currentHistoricalTime && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-700 flex items-center gap-1">
                    <History className="w-3 h-3" />
                    {t('events.historical_active')}: {parseUtcDate(currentHistoricalTime).toLocaleTimeString(activeLocale)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t('events.modal_desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportLogs}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
              title={t('events.export_tooltip')}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={loadEvents}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
              title={t('events.refresh_tooltip')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Severity Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                severityFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('events.filter_all')}
            </button>
            <button
              onClick={() => setSeverityFilter('crit')}
              className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                severityFilter === 'crit'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              {t('events.filter_crit')}
            </button>
            <button
              onClick={() => setSeverityFilter('warn')}
              className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                severityFilter === 'warn'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('events.filter_warn')}
            </button>
            <button
              onClick={() => setSeverityFilter('info')}
              className={`px-3 py-1 rounded-lg font-medium transition flex items-center gap-1.5 ${
                severityFilter === 'info'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t('events.filter_info')}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            {/* Device Filter */}
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="all">{t('events.all_devices')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.addresses?.ip ? `(${d.addresses.ip})` : ''}
                </option>
              ))}
            </select>

            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('events.search_placeholder')}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Events Narrative List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {loading && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              <p className="text-xs">{t('events.loading')}</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs text-center">
              {error}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3 text-center">
              <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{t('events.no_events')}</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  {t('events.no_events_desc')}
                </p>
              </div>
            </div>
          ) : (
            events.map((ev) => {
              const narrative = getNarrative(ev);
              const timeMeta = formatTime(ev.ts);
              const isCrit = ev.severity === 'crit';
              const isWarn = ev.severity === 'warn';
              const isInfo = !isCrit && !isWarn;

              const dev = ev.device_id ? devicesMap.get(ev.device_id) : undefined;
              const DeviceIcon = dev?.kind && kindIcons[dev.kind] ? kindIcons[dev.kind] : (ev.device_kind && kindIcons[ev.device_kind] ? kindIcons[ev.device_kind] : Server);
              const isExpanded = expandedEventId === ev.id;

              return (
                <div
                  key={ev.id}
                  className={`rounded-xl border p-4 transition-all duration-150 shadow-sm ${
                    isCrit
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 hover:border-rose-300 dark:hover:border-rose-700'
                      : isWarn
                      ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-700'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {/* Event Severity Icon */}
                      <div
                        className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                          isCrit
                            ? 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400 border border-rose-300 dark:border-rose-700'
                            : isWarn
                            ? 'bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
                            : 'bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400 border border-sky-300 dark:border-sky-700'
                        }`}
                      >
                        {isCrit ? (
                          <AlertOctagon className="w-5 h-5 animate-pulse" />
                        ) : isWarn ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : (
                          <CheckCircle2 className="w-5 h-5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        {/* Event Title and Badges */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isCrit
                                ? 'bg-rose-600 text-white'
                                : isWarn
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {ev.severity.toUpperCase()}
                          </span>

                          <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                            {narrative.headline}
                          </h3>

                          {/* Device badge */}
                          {ev.device_id && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-medium">
                              <DeviceIcon className="w-3 h-3 text-sky-500 dark:text-sky-400" />
                              <span className="font-semibold">{ev.device_name || dev?.name || ev.device_id}</span>
                              {(ev.device_ip || dev?.addresses?.ip) && (
                                <span className="font-mono text-slate-500 dark:text-slate-400">
                                  · {ev.device_ip || dev?.addresses?.ip}
                                </span>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Narrative parlante explanation */}
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed pt-0.5">
                          {narrative.explanation}
                        </p>

                        {/* Actionable advice if present */}
                        {narrative.actionable && (
                          <div className="mt-1.5 text-[11px] text-amber-900 dark:text-amber-200 bg-amber-100/70 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-lg px-2.5 py-1 inline-flex items-center gap-1.5">
                            <span className="font-semibold">💡 {t('events.actionable_prefix')}</span>
                            <span>{narrative.actionable}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Time & Action Button */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-800">
                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 sm:justify-end">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{timeMeta.relative}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          {timeMeta.exact}
                        </div>
                      </div>

                      {/* Time Machine Jump Button */}
                      {onTimeTravelToEvent && (
                        <button
                          onClick={() => {
                            onTimeTravelToEvent(timeMeta.dateObj, ev.device_id || undefined);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
                          title={t('events.jump_to_canvas_tooltip')}
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>{t('events.jump_to_canvas')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Toggle details if extra technical details are available */}
                  {ev.details && Object.keys(ev.details).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
                      <button
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium flex items-center gap-1"
                      >
                        <span>{isExpanded ? t('events.hide_tech_details') : t('events.show_tech_details')}</span>
                        <ArrowRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>

                      {isExpanded && (
                        <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 text-slate-300 font-mono text-[10px] overflow-x-auto border border-slate-800">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer with quick stats */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('events.footer_monitoring')}</span>
            <span>·</span>
            <span>{t('events.footer_tracking')}</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition"
          >
            {t('common.close')}
          </button>
        </div>

      </div>
    </div>
  );
};
