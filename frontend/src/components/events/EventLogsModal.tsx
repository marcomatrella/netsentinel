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
  Wrench,
  ChevronDown,
  ChevronRight,
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

const RULE_SUMMARIES_TRANSLATIONS: Record<string, Record<string, string>> = {
  "Il gateway locale è perfettamente operativo e raggiungibile, ma la connettività verso l'esterno (DNS pubblico o ping WAN) è interrotta. La LAN interna è sana.": {
    en: "The local gateway is operational and reachable, but outbound connectivity (public DNS or WAN ping) is broken. The local LAN is healthy.",
    fr: "La passerelle locale est opérationnelle et joignable, mais la connectivité vers l'extérieur (DNS public ou ping WAN) est interrompue. Le LAN local est sain.",
    de: "Das lokale Gateway ist betriebsbereit und erreichbar, aber die ausgehende Konnektivität (öffentliches DNS oder WAN-Ping) ist unterbrochen. Das lokale LAN ist intakt.",
    es: "La puerta de enlace local está operativa y accesible, pero la conectividad exterior (DNS público o ping WAN) está interrumpida. La LAN local está sana.",
  },
  "Il router/gateway principale della rete non risponde ai controlli. Tutte le destinazioni esterne e le rotte inter-VLAN sono isolate.": {
    en: "The primary router/gateway is not responding to health checks. All outbound destinations and inter-VLAN routes are isolated.",
    fr: "Le routeur/passerelle principal ne répond pas aux contrôles. Toutes les destinations externes et routes inter-VLAN sont isolées.",
    de: "Der Hauptrouter/das Hauptgateway antwortet nicht auf Prüfungen. Alle externen Ziele und Inter-VLAN-Routen sind isoliert.",
    es: "El router/puerta de enlace principal no responde a las comprobaciones. Todos los destinos externos y rutas inter-VLAN están aislados.",
  },
  "L'uptime dell'access point si è azzerato mentre il link sullo switch è rimasto costantemente attivo. Indica un reboot per crash, watchdog o aggiornamento.": {
    en: "The access point uptime reset to zero while the switch port link remained continuously active. Indicates a reboot due to crash, watchdog, or update.",
    fr: "La durée de fonctionnement du point d'accès s'est réinitialisée alors que le lien du switch est resté actif en continu. Indique un redémarrage dû à un crash, un watchdog ou une mise à jour.",
    de: "Die Betriebszeit des APs wurde zurückgesetzt, während der Switch-Port-Link kontinuierlich aktiv blieb. Weist auf einen Neustart durch Absturz, Watchdog oder Update hin.",
    es: "El tiempo de actividad del punto de acceso se reinició mientras el enlace del conmutador permaneció activo continuamente. Indica un reinicio por fallo, watchdog o actualización.",
  },
  "L'access point non risponde e il link fisico risulta assente. L'iniettore o la porta PoE dello switch non erogano corrente o il cavo è disconnesso.": {
    en: "The access point does not respond and the physical link is down. The switch PoE port or injector is not delivering power or the cable is disconnected.",
    fr: "Le point d'accès ne répond pas et le lien physique est absent. Le port PoE du switch ou l'injecteur ne fournit pas d'alimentation ou le câble est déconnecté.",
    de: "Der AP antwortet nicht und der physische Link ist getrennt. Der PoE-Port oder Injektor liefert keinen Strom oder das Kabel ist getrennt.",
    es: "El punto de acceso no responde y el enlace físico está ausente. El puerto PoE del conmutador o el inyector no suministra energía o el cable está desconectado.",
  },
  "Rilevati frequenti cambi di stato up/down (link flapping) o errori di trasmissione. Tipico sintomo di crimpatura difettosa o interferenze.": {
    en: "Frequent up/down state transitions (link flapping) or transmission errors detected. Typical symptom of faulty crimping or interference.",
    fr: "Fréquents changements d'état up/down (link flapping) ou erreurs de transmission détectés. Symptôme typique d'un sertissage défectueux ou d'interférences.",
    de: "Häufige Up/Down-Statuswechsel (Link Flapping) oder Übertragungsfehler erkannt. Typisches Symptom fehlerhafter Crimpung oder Interferenzen.",
    es: "Se detectaron frecuentes cambios de estado up/down (link flapping) o errores de transmisión. Síntoma típico de crimpado defectuoso o interferencias.",
  },
  "Lo switch non risponde ai controlli e tutti gli apparati a valle sono contemporaneamente irraggiungibili dal monitor. Lo switch è la causa radice.": {
    en: "The switch is not responding to health checks and all downstream devices are simultaneously unreachable from the monitor. The switch is the root cause.",
    fr: "Le switch ne répond pas aux contrôles et tous les appareils en aval sont simultanément inaccessibles depuis le moniteur. Le switch est la cause racine.",
    de: "Der Switch antwortet nicht auf Prüfungen und alle nachgeschalteten Geräte sind gleichzeitig vom Monitor aus nicht erreichbar. Der Switch ist die Grundursache.",
    es: "El conmutador no responde a las comprobaciones y todos los dispositivos aguas abajo son simultáneamente inaccesibles desde el monitor. El conmutador es la causa raíz.",
  },
  "Il NAS è completamente offline. Di conseguenza, i client perdono la risoluzione dei nomi e i rinnovi DHCP, ma l'infrastruttura di commutazione (switch/router) è sana.": {
    en: "The NAS is completely offline. Consequently, clients lose name resolution and DHCP renewals, but switching infrastructure (switch/router) is healthy.",
    fr: "Le NAS est complètement hors ligne. Par conséquent, les clients perdent la résolution de noms et les renouvellements DHCP, mais l'infrastructure réseau est saine.",
    de: "Das NAS ist vollständig offline. Folglich verlieren Clients die Namensauflösung und DHCP-Verlängerungen, aber die Netzwerkinfrastruktur ist intakt.",
    es: "El NAS está completamente sin conexión. En consecuencia, los clientes pierden la resolución de nombres y renovaciones DHCP, pero la infraestructura de red está sana.",
  },
  "La rete a livello IP funziona regolarmente, ma le query DNS verso il server locale falliscono o restituiscono errori di inoltro agli upstream.": {
    en: "IP connectivity is normal, but DNS queries to the local resolver fail or return upstream forwarding errors.",
    fr: "La connectivité IP est normale, mais les requêtes DNS vers le serveur local échouent ou renvoient des erreurs de transfert vers les upstreams.",
    de: "Die IP-Konnektivität ist normal, aber DNS-Abfragen an den lokalen Resolver schlagen fehl oder melden Upstream-Weiterleitungsfehler.",
    es: "La conectividad IP funciona con normalidad, pero las consultas DNS al servidor local fallan o devuelven errores de reenvío hacia los upstreams.",
  },
  "I nuovi client non riescono a ottenere un indirizzo IP, sebbene il server host sia raggiungibile a livello di rete.": {
    en: "New clients cannot obtain an IP address, although the host server is reachable at network level.",
    fr: "Les nouveaux clients ne peuvent pas obtenir d'adresse IP, bien que le serveur hôte soit accessible au niveau du réseau.",
    de: "Neue Clients können keine IP-Adresse beziehen, obwohl der Host-Server auf Netzwerkebene erreichbar ist.",
    es: "Los nuevos clientes no pueden obtener una dirección IP, aunque el servidor host sea accesible a nivel de red.",
  },
  "Il gruppo di continuità è passato allo stato On Battery (OB). I dispositivi privi di protezione UPS risultano spenti.": {
    en: "The uninterruptible power supply entered On Battery (OB) mode. Devices without UPS backup may be powered off.",
    fr: "L'onduleur est passé en mode batterie (OB). Les appareils sans protection d'onduleur peuvent être éteints.",
    de: "Die USV ist in den Batteriebetrieb (OB) gewechselt. Geräte ohne USV-Schutz sind möglicherweise ausgeschaltet.",
    es: "El sistema de alimentación ininterrumpida pasó a modo batería (OB). Los dispositivos sin protección SAI pueden estar apagados.",
  },
  "NetSentinel non riesce a comunicare con nessun apparato, nemmeno con il proprio switch o gateway immediato. Il problema è locale all'host del monitor.": {
    en: "NetSentinel cannot reach any device, not even its immediate switch or gateway. The issue is local to the monitoring host.",
    fr: "NetSentinel ne parvient à joindre aucun appareil, pas même son switch ou sa passerelle directe. Le problème est local à l'hôte de surveillance.",
    de: "NetSentinel kann kein Gerät erreichen, nicht einmal seinen direkten Switch oder sein Gateway. Das Problem liegt lokal beim Überwachungs-Host.",
    es: "NetSentinel no puede comunicarse con ningún dispositivo, ni siquiera con su conmutador o puerta de enlace inmediata. El problema es local al host del monitor.",
  },
  "Parametri S.M.A.R.T. peggiorati (settori rilocati) o volume RAID in stato degraded. Nessun blocco immediato ma rischio di perdita dati.": {
    en: "S.M.A.R.T. parameters worsened (reallocated sectors) or RAID volume is in degraded status. No immediate outage, but risk of data loss.",
    fr: "Paramètres S.M.A.R.T. détériorés (secteurs réalloués) ou volume RAID dégradé. Pas de blocage immédiat mais risque de perte de données.",
    de: "S.M.A.R.T.-Werte verschlechtert (neu zugewiesene Sektoren) oder RAID-Volume degradiert. Kein sofortiger Ausfall, aber Datenverlustrisiko.",
    es: "Parámetros S.M.A.R.T. empeorados (sectores reasignados) o volumen RAID en estado degradado. Sin bloqueo inmediato pero con riesgo de pérdida de datos.",
  },
  "L'host risponde al ping di rete, ma l'API o l'interfaccia web del servizio è bloccata o in timeout.": {
    en: "The host responds to network ping, but the service API or web interface is frozen or timing out.",
    fr: "L'hôte répond au ping réseau, mais l'API ou l'interface web du service est bloquée ou en timeout.",
    de: "Der Host antwortet auf Ping, aber die Dienst-API oder Weboberfläche ist blockiert oder im Timeout.",
    es: "El host responde al ping de red, pero la API o la interfaz web del servicio está bloqueada o en tiempo de espera.",
  },
  "Disconnessione temporanea con ritorno alla normalità e incremento della versione firmware registrata.": {
    en: "Temporary disconnection followed by recovery and recorded increment in firmware version.",
    fr: "Déconnexion temporaire suivie d'un retour à la normale et incrémentation de version du micrologiciel.",
    de: "Vorübergehende Trennung mit normaler Wiederherstellung und höherer Firmware-Version.",
    es: "Desconexión temporal seguida de recuperación e incremento de versión de firmware.",
  },
};

const TITLE_TRANSLATIONS: Record<string, Record<string, string>> = {
  'Dispositivo Offline': {
    en: 'Device Offline',
    fr: 'Appareil Hors Ligne',
    de: 'Gerät Offline',
    es: 'Dispositivo Fuera de Línea',
  },
  'Dispositivo Ripristinato': {
    en: 'Device Restored',
    fr: 'Appareil Rétabli',
    de: 'Gerät Wiederhergestellt',
    es: 'Dispositivo Restablecido',
  },
  'Ping Fallito': {
    en: 'Ping Failed',
    fr: 'Échec du Ping',
    de: 'Ping Fehlgeschlagen',
    es: 'Ping Fallido',
  },
  'Ping Ripristinato': {
    en: 'Ping Restored',
    fr: 'Ping Rétabli',
    de: 'Ping Wiederhergestellt',
    es: 'Ping Restablecido',
  },
  'Risoluzione DNS Fallita': {
    en: 'DNS Resolution Failed',
    fr: 'Échec Résolution DNS',
    de: 'DNS-Auflösung Fehlgeschlagen',
    es: 'Resolución DNS Fallida',
  },
  'DNS Ripristinato': {
    en: 'DNS Restored',
    fr: 'DNS Rétabli',
    de: 'DNS Wiederhergestellt',
    es: 'DNS Restablecido',
  },
  'Porta TCP Chiusa': {
    en: 'TCP Port Closed',
    fr: 'Port TCP Fermé',
    de: 'TCP-Port Geschlossen',
    es: 'Puerto TCP Cerrado',
  },
  'Porta TCP Aperta': {
    en: 'TCP Port Open',
    fr: 'Port TCP Ouvert',
    de: 'TCP-Port Geöffnet',
    es: 'Puerto TCP Abierto',
  },
  'Rilevato Link Flap': {
    en: 'Link Flap Detected',
    fr: 'Battement de Lien Détecté',
    de: 'Link Flap Erkannt',
    es: 'Link Flap Detectado',
  },
  'Riavvio Rilevato': {
    en: 'Reboot Detected',
    fr: 'Redémarrage Détecté',
    de: 'Neustart Erkannt',
    es: 'Reinicio Detectado',
  },
  'Incidente di Rete Aperto': {
    en: 'Network Incident Opened',
    fr: 'Incident Réseau Ouvert',
    de: 'Netzwerkvorfall Eröffnet',
    es: 'Incidente de Red Abierto',
  },
  'Incidente Risolto': {
    en: 'Incident Resolved',
    fr: 'Incident Résolu',
    de: 'Vorfall Gelöst',
    es: 'Incidente Resuelto',
  },
  'Spostamento Causa Radice': {
    en: 'Root Cause Shift',
    fr: 'Changement Cause Racine',
    de: 'Verschiebung der Grundursache',
    es: 'Cambio de Causa Raíz',
  },
  'Riavvio NetSentinel': {
    en: 'NetSentinel Restart',
    fr: 'Redémarrage NetSentinel',
    de: 'NetSentinel Neustart',
    es: 'Reinicio NetSentinel',
  },
  'UPS su Batteria': {
    en: 'UPS on Battery',
    fr: 'Onduleur sur Batterie',
    de: 'USV auf Batterie',
    es: 'SAI en Batería',
  },
  'Storage Degradato': {
    en: 'Storage Degraded',
    fr: 'Stockage Dégradé',
    de: 'Speicher Degradiert',
    es: 'Almacenamiento Degradado',
  },
  'Aggiornamento Firmware': {
    en: 'Firmware Update',
    fr: 'Mise à Jour Firmware',
    de: 'Firmware-Update',
    es: 'Actualización Firmware',
  },
};

function translateBackendTitle(rawTitle: string, lang: string): string {
  if (!rawTitle || lang === 'it') return rawTitle;
  const match = TITLE_TRANSLATIONS[rawTitle.trim()];
  if (match && match[lang]) return match[lang];
  return rawTitle;
}

function translateBackendMessage(rawMsg: string, lang: string): string {
  if (!rawMsg || lang === 'it') return rawMsg;
  const match = RULE_SUMMARIES_TRANSLATIONS[rawMsg.trim()];
  if (match && match[lang]) return match[lang];
  return rawMsg;
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
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<'all' | 'crit' | 'critical_managed' | 'warn' | 'info'>('all');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedEventId, setExpandedEventId] = useState<number | string | null>(null);

  const activeLocale = localeMap[language] || 'it-IT';

  // Map devices by ID for fast lookup
  const devicesMap = useMemo(() => {
    const map = new Map<string, Device>();
    devices.forEach((d) => map.set(d.id, d));
    return map;
  }, [devices]);

  // Load events from backend
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEvents({
        limit: 200,
        severity: severityFilter === 'all' ? undefined : severityFilter,
        deviceId: selectedDeviceId === 'all' ? undefined : selectedDeviceId,
        search: searchQuery.trim() || undefined,
      });
      setEvents(data);
    } catch (err: any) {
      console.error('Errore nel caricamento eventi:', err);
      setError(err.message || 'Impossibile recuperare i log eventi dal server.');
    } finally {
      setLoading(false);
    }
  }, [severityFilter, selectedDeviceId, searchQuery]);

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, loadEvents]);

  if (!isOpen) return null;

  // Narrative generation
  const getNarrative = (ev: EventItem) => {
    const dev = ev.device_id ? devicesMap.get(ev.device_id) : undefined;
    const devName = ev.device_name || dev?.name || ev.device_id || t('events.narratives.unknown_device');
    const devIp = ev.device_ip || dev?.addresses?.ip || '';
    const ipStr = devIp ? ` (${devIp})` : '';

    switch (ev.event_type) {
      case 'device_state_change': {
        const from = ev.details?.from_status || 'ok';
        const to = ev.details?.to_status || 'unreachable';
        const reason = ev.details?.reason || '';
        const isOffline = to === 'unreachable' || to === 'offline';
        const isManaged = ev.severity === 'critical_managed';

        if (isManaged) {
          const impactedCount = ev.details?.impacted_count || ev.details?.impacted?.length || 0;
          return {
            headline: t('events.narratives.device_managed_headline', { name: devName }),
            explanation: t('events.narratives.device_managed_explanation', {
              count: impactedCount,
              reason: reason ? ` (${reason})` : '',
            }),
            actionable: t('events.narratives.device_managed_actionable'),
          };
        }

        if (isOffline) {
          return {
            headline: t('events.narratives.device_offline_headline', { name: devName }),
            explanation: t('events.narratives.device_offline_explanation', {
              name: devName,
              ip: ipStr,
              from,
              reason: reason ? ` (${reason})` : '',
            }),
            actionable: t('events.narratives.device_offline_actionable', { name: devName }),
          };
        }

        return {
          headline: t('events.narratives.device_restored_headline', { name: devName }),
          explanation: t('events.narratives.device_restored_explanation', { name: devName, ip: ipStr, to }),
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

  // Format relative time
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

  // Export logs to JSON / CSV
  const handleExportLogs = () => {
    const localizedEvents = events.map((ev) => {
      const narrative = getNarrative(ev);
      return {
        id: ev.id,
        ts: ev.ts,
        device_id: ev.device_id,
        device_name: ev.device_name,
        severity: ev.severity,
        headline: narrative.headline,
        explanation: narrative.explanation,
      };
    });

    const blob = new Blob([JSON.stringify(localizedEvents, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netsentinel-events-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col h-[92vh] max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20 shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                  <span>{t('events.modal_title')}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono font-normal">
                    {t('events.events_count', { count: events.length }) || `${events.length} eventi`}
                  </span>
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden xs:block truncate">
                  {t('events.modal_desc')}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleExportLogs}
                className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-750 cursor-pointer"
                title={t('events.export_tooltip')}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[11px]">{t('events.export_json')}</span>
              </button>

              <button
                onClick={loadEvents}
                disabled={loading}
                className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-50 cursor-pointer"
                title={t('events.refresh_tooltip')}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-sky-500' : ''}`} />
              </button>

              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
                title={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-4 py-2.5 sm:px-6 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2.5 text-xs shrink-0">
          
          {/* Severity Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg overflow-x-auto max-w-full shrink-0">
            <button
              onClick={() => setSeverityFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition cursor-pointer ${
                severityFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t('events.filter_all')}
            </button>
            <button
              onClick={() => setSeverityFilter('crit')}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition flex items-center gap-1 cursor-pointer ${
                severityFilter === 'crit'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400'
              }`}
            >
              <AlertOctagon className="w-3 h-3" />
              <span>{t('events.filter_crit')}</span>
            </button>
            <button
              onClick={() => setSeverityFilter('warn')}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition flex items-center gap-1 cursor-pointer ${
                severityFilter === 'warn'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>{t('events.filter_warn')}</span>
            </button>
            <button
              onClick={() => setSeverityFilter('critical_managed')}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition flex items-center gap-1 cursor-pointer ${
                severityFilter === 'critical_managed'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400'
              }`}
            >
              <Wrench className="w-3 h-3" />
              <span>{t('events.filter_managed') || 'Gestiti'}</span>
            </button>
            <button
              onClick={() => setSeverityFilter('info')}
              className={`px-2.5 py-1 rounded-md font-medium text-[11px] transition flex items-center gap-1 cursor-pointer ${
                severityFilter === 'info'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'
              }`}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>{t('events.filter_info')}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-md">
            {/* Device Filter */}
            <select
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
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
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Content Body: Minimal NOC Table with Sticky Headers */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900">
          {loading && events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
              <p className="text-xs">{t('events.loading')}</p>
            </div>
          ) : error ? (
            <div className="p-4 m-4 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl text-xs text-center">
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
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-100/95 dark:bg-slate-850/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3 sm:px-4 w-[130px] sm:w-[155px]">{t('events.col_datetime')}</th>
                  <th className="py-2.5 px-2 w-[70px] sm:w-[85px]">{t('events.col_level')}</th>
                  <th className="py-2.5 px-2.5 sm:px-3 w-[140px] sm:w-[190px]">{t('events.col_device')}</th>
                  <th className="py-2.5 px-3">{t('events.col_description')}</th>
                  <th className="py-2.5 px-3 sm:px-4 w-[60px] sm:w-[85px] text-right">{t('events.col_actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-800/80 font-sans">
                {events.map((ev) => {
                  const narrative = getNarrative(ev);
                  const timeMeta = formatTime(ev.ts);
                  const isCrit = ev.severity === 'crit';
                  const isManaged = ev.severity === 'critical_managed';
                  const isWarn = ev.severity === 'warn';
                  const isInfo = !isCrit && !isManaged && !isWarn;

                  const dev = ev.device_id ? devicesMap.get(ev.device_id) : undefined;
                  const DeviceIcon = dev?.kind && kindIcons[dev.kind]
                    ? kindIcons[dev.kind]
                    : ev.device_kind && kindIcons[ev.device_kind]
                    ? kindIcons[ev.device_kind]
                    : Server;

                  const isExpanded = expandedEventId === ev.id;
                  const hasDetails = ev.details && Object.keys(ev.details).length > 0;

                  return (
                    <React.Fragment key={ev.id}>
                      <tr
                        className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-850/70 ${
                          isCrit
                            ? 'bg-rose-500/[0.03] dark:bg-rose-500/[0.04]'
                            : isManaged
                            ? 'bg-purple-500/[0.03] dark:bg-purple-500/[0.04]'
                            : isWarn
                            ? 'bg-amber-500/[0.03] dark:bg-amber-500/[0.04]'
                            : ''
                        }`}
                      >
                        {/* 1. Timestamp */}
                        <td className="py-2 px-3 sm:px-4 align-top whitespace-nowrap">
                          <div className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                            {timeMeta.exact}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500">
                            {timeMeta.relative}
                          </div>
                        </td>

                        {/* 2. Severity Badge */}
                        <td className="py-2 px-2 align-top whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                              isCrit
                                ? 'bg-rose-600 text-white'
                                : isManaged
                                ? 'bg-purple-600 text-white shadow-xs'
                                : isWarn
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {isCrit ? (
                              <AlertOctagon className="w-2.5 h-2.5 shrink-0" />
                            ) : isManaged ? (
                              <Wrench className="w-2.5 h-2.5 shrink-0" />
                            ) : isWarn ? (
                              <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                            )}
                            <span>{isManaged ? 'MGD' : ev.severity.toUpperCase().slice(0, 4)}</span>
                          </span>
                        </td>

                        {/* 3. Device */}
                        <td className="py-2 px-2.5 sm:px-3 align-top">
                          {ev.device_id ? (
                            <div className="min-w-0 max-w-[170px]">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                                <DeviceIcon className="w-3 h-3 text-sky-500 shrink-0" />
                                <span className="truncate">{ev.device_name || dev?.name || ev.device_id}</span>
                              </div>
                              {(ev.device_ip || dev?.addresses?.ip) && (
                                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate pl-4.5">
                                  {ev.device_ip || dev?.addresses?.ip}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">{t('events.network_system')}</span>
                          )}
                        </td>

                        {/* 4. Event Title & Narrative */}
                        <td className="py-2 px-3 align-top">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                {narrative.headline}
                              </span>
                              {hasDetails && (
                                <button
                                  onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                  className="text-[10px] text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5 cursor-pointer ml-1"
                                >
                                  <span>{isExpanded ? 'meno' : 'payload'}</span>
                                  <ChevronDown className={`w-2.5 h-2.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </button>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                              {narrative.explanation}
                            </p>

                            {narrative.actionable && (
                              <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] text-amber-800 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800">
                                <span className="font-semibold">💡 {t('events.actionable_prefix')}</span>
                                <span>{narrative.actionable}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* 5. Actions */}
                        <td className="py-2 px-3 sm:px-4 align-top text-right whitespace-nowrap">
                          {onTimeTravelToEvent && (
                            <button
                              onClick={() => {
                                onTimeTravelToEvent(timeMeta.dateObj, ev.device_id || undefined);
                                onClose();
                              }}
                              className="p-1 sm:px-2 sm:py-1 rounded-md text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/60 transition inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                              title={t('events.jump_to_canvas_tooltip')}
                            >
                              <History className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Time Travel</span>
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable row for payload */}
                      {isExpanded && hasDetails && (
                        <tr className="bg-slate-50 dark:bg-slate-950/60">
                          <td colSpan={5} className="p-3 border-b border-slate-200 dark:border-slate-800">
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                Dati Tecnici / Payload Evento:
                              </span>
                              <pre className="p-2 rounded bg-slate-900 text-slate-300 font-mono text-[10px] overflow-x-auto border border-slate-800">
                                {JSON.stringify(ev.details, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="px-4 py-2.5 sm:px-6 sm:py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{t('events.footer_monitoring')}</span>
            <span>·</span>
            <span className="hidden sm:inline">{t('events.footer_tracking')}</span>
          </div>

          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
          >
            {t('common.close')}
          </button>
        </div>

      </div>
    </div>
  );
};
