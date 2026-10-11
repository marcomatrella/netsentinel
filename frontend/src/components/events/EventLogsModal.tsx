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

export const EventLogsModal: React.FC<EventLogsModalProps> = ({
  isOpen,
  onClose,
  devices,
  onTimeTravelToEvent,
  currentHistoricalTime,
}) => {
  const { t } = useTranslation();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const devName = ev.device_name || dev?.name || ev.device_id || 'Rete';
    const devIp = ev.device_ip || dev?.addresses?.ip;
    const ipStr = devIp ? ` (${devIp})` : '';

    switch (ev.event_type) {
      case 'device_state_change': {
        const oldSt = (ev.details?.old_status || '').toUpperCase();
        const newSt = (ev.details?.new_status || '').toUpperCase();
        if (newSt === 'DOWN') {
          return {
            headline: `Dispositivo ${devName}${ipStr} è andato OFFLINE`,
            explanation: `L'apparato ha interrotto le risposte ai controlli di integrità ed è stato contrassegnato come irraggiungibile. Se ha apparati a valle dipendenti, questi risulteranno isolati.`,
            actionable: `Controllare alimentazione, cavo ethernet o la porta di connessione sullo switch.`,
          };
        }
        if (newSt === 'DEGRADED') {
          return {
            headline: `Dispositivo ${devName}${ipStr} è in stato DEGRADATO`,
            explanation: `Uno o più controlli specifici hanno fallito o mostrano anomalie (es. latenza elevata, timeout DNS o pacchetti persi), mentre il ping di base risponde.`,
            actionable: `Verificare i log del servizio specifico (es. server DNS, container AdGuard o porta HTTP).`,
          };
        }
        if (newSt === 'FLAPPING') {
          return {
            headline: `Dispositivo ${devName}${ipStr} è INSTABILE (Flapping)`,
            explanation: `L'apparato alterna ripetutamente stati di disponibilità e disconnessione in una breve finestra temporale.`,
            actionable: `Possibile cavo deteriorato, interferenza radio WiFi, loop di rete o alimentatore difettoso.`,
          };
        }
        if (newSt === 'OK') {
          return {
            headline: `Dispositivo ${devName}${ipStr} tornato ONLINE`,
            explanation: `Tutti i controlli configurati sono tornati a dare esito positivo. La continuità di servizio è stata ripristinata.`,
            actionable: null,
          };
        }
        return {
          headline: `Cambiamento di stato: ${devName}${ipStr} da ${oldSt} a ${newSt}`,
          explanation: ev.message,
          actionable: null,
        };
      }
      case 'check_state_change': {
        const target = ev.details?.target || ev.details?.server || devIp || '';
        const targetStr = target ? ` verso ${target}` : '';
        const rtt = ev.details?.avg_rtt_ms || ev.details?.rtt_ms;
        const rttStr = rtt !== undefined ? ` (RTT: ${rtt}ms)` : '';
        const loss = ev.details?.packet_loss_percent;
        const lossStr = loss !== undefined && loss > 0 ? ` (Perdita pacchetti: ${loss}%)` : '';
        const errMsg = ev.details?.error;

        return {
          headline: `${ev.title}${targetStr}`,
          explanation: errMsg
            ? `Errore rilevato: ${errMsg}. ${ev.message}`
            : `${ev.message}${rttStr}${lossStr}.`,
          actionable: `Ispezionare i parametri di soglia o la configurazione del servizio target.`,
        };
      }
      case 'incident_opened': {
        const conf = ev.details?.confidence ? `${Math.round(ev.details.confidence * 100)}%` : '';
        const impacted = ev.details?.impacted || [];
        return {
          headline: `🚨 INCIDENTE APERTO: Causa radice ${devName}`,
          explanation: `${ev.message}. L'algoritmo di correlazione topologica ha stimato una confidenza del ${conf}. ${
            impacted.length > 0 ? `Apparati a valle impattati: ${impacted.length}.` : ''
          }`,
          actionable: `Intervenire prioritariamente su '${devName}' per ripristinare a cascata tutti i dispositivi collegati.`,
        };
      }
      case 'root_cause_shift': {
        return {
          headline: `Aggiornamento Incidente: Nuova causa radice su ${devName}`,
          explanation: ev.message,
          actionable: `L'origine del guasto è stata ricollocata su un nodo strutturalmente a monte.`,
        };
      }
      case 'incident_resolved': {
        return {
          headline: `🎉 Incidente Risolto`,
          explanation: ev.message,
          actionable: `Tutti i nodi sono rientrati nei parametri ottimali. Nessuna azione richiesta.`,
        };
      }
      case 'reboot_detected': {
        return {
          headline: `Riavvio rilevato su ${devName}${ipStr}`,
          explanation: `${ev.message}. Il contatore di uptime o il boot ID del dispositivo è stato azzerato.`,
          actionable: `Se il riavvio non era programmato, controllare sbalzi di tensione o log di sistema del dispositivo.`,
        };
      }
      case 'link_flap': {
        return {
          headline: `Instabilità collegamento rilevata su ${devName}`,
          explanation: ev.message,
          actionable: `Verificare la negoziazione della porta e l'integrità del cavo di rete.`,
        };
      }
      case 'monitor_restart': {
        return {
          headline: `Avvio o riavvio del demone NetSentinel`,
          explanation: ev.message,
          actionable: null,
        };
      }
      default:
        return {
          headline: ev.title || 'Evento di sistema',
          explanation: ev.message,
          actionable: null,
        };
    }
  };

  // Format relative time in Italian/local
  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHours = Math.floor(diffMin / 60);

      let relative = '';
      if (diffSec < 60) relative = 'pochi secondi fa';
      else if (diffMin < 60) relative = `${diffMin} min fa`;
      else if (diffHours < 24) relative = `${diffHours} ore fa`;
      else relative = `${Math.floor(diffHours / 24)} gg fa`;

      const exact = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = d.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

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
                    Storico attivo: {currentHistoricalTime.toLocaleTimeString()}
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
              title="Esporta registro eventi in JSON"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={loadEvents}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50"
              title="Aggiorna registro eventi"
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
              Tutti
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
              Critici & Offline
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
              Avvisi & Flap
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
              Ripristini & Info
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            {/* Device Filter */}
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
            >
              <option value="all">Tutti gli apparati</option>
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
                placeholder="Cerca per testo, IP, codice errore..."
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
              <p className="text-xs">Caricamento registro eventi in corso...</p>
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
                <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Nessun evento corrispondente</h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1">
                  Non sono stati trovati eventi per i filtri selezionati. Tutti i controlli sono operativi o non ci sono anomalie registrate.
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
                            <span className="font-semibold">💡 Azione consigliata:</span>
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
                          title="Torna indietro nel tempo a questo esatto momento e visualizza la rete sulla plancia"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Esamina sulla plancia</span>
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
                        <span>{isExpanded ? 'Nascondi telemetria tecnica' : 'Mostra telemetria tecnica'}</span>
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
            <span>Monitoraggio continuo attivo</span>
            <span>·</span>
            <span>Tracciamento automatico cambi di stato ed evidenze</span>
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
