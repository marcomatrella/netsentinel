/** NetSentinel REST API client */

import { Device, FullTopology, Incident, Check, EventItem } from '../types';

const API_BASE = '/api/v1';

export async function fetchTopology(): Promise<FullTopology> {
  const res = await fetch(`${API_BASE}/topology`);
  if (!res.ok) throw new Error('Impossibile caricare la topologia di rete.');
  return res.json();
}

export async function fetchTopologyTemplates(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/topology/templates`);
  if (!res.ok) throw new Error('Impossibile caricare i template di topologia.');
  return res.json();
}


export async function deduceDependencies(payload: {
  vantage_point_id: string;
  devices: any[];
  links: any[];
}): Promise<any[]> {
  const res = await fetch(`${API_BASE}/topology/deduce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante la deduzione delle dipendenze.');
  return res.json();
}

export async function applyTopology(payload: {
  vantage_point_id: string;
  description: string;
  devices: any[];
  links: any[];
  dependencies: any[];
  layout: any;
}): Promise<{ status: string; version_id: number }> {
  const res = await fetch(`${API_BASE}/topology/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante il salvataggio della topologia.');
  return res.json();
}

export async function fetchIncidents(statusFilter?: string): Promise<Incident[]> {
  const url = statusFilter ? `${API_BASE}/incidents?status_filter=${statusFilter}` : `${API_BASE}/incidents`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossibile caricare gli incidenti.');
  return res.json();
}

export async function acknowledgeIncident(incidentId: string, by: string = 'utente'): Promise<Incident> {
  const res = await fetch(`${API_BASE}/incidents/${incidentId}/acknowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledged_by: by }),
  });
  if (!res.ok) throw new Error('Errore durante la presa in carico.');
  return res.json();
}

export async function simulateFailure(payload: {
  failed_device_ids: string[];
  failed_link_ids: string[];
}): Promise<any> {
  const res = await fetch(`${API_BASE}/simulate/failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante la simulazione del guasto.');
  return res.json();
}

export async function executeCheckNow(checkId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/checks/${checkId}/execute`, { method: 'POST' });
  if (!res.ok) throw new Error('Errore esecuzione controllo immediato.');
  return res.json();
}

export async function fetchDeviceChecks(deviceId: string): Promise<Check[]> {
  const res = await fetch(`${API_BASE}/checks?device_id=${deviceId}`);
  if (!res.ok) throw new Error('Errore caricamento controlli.');
  return res.json();
}

export async function createCheck(payload: {
  id: string;
  device_id: string;
  type: string;
  name: string;
  params?: Record<string, any>;
  interval_seconds?: number;
  timeout_seconds?: number;
  thresholds?: Record<string, any>;
  enabled?: boolean;
}): Promise<Check> {
  const res = await fetch(`${API_BASE}/checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      params: {},
      thresholds: {},
      failure_policy: { consecutive_failures: 3 },
      recovery_policy: { consecutive_successes: 2 },
      interval_seconds: 30,
      timeout_seconds: 5.0,
      enabled: true,
      ...payload,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Errore creazione controllo.');
  }
  return res.json();
}

export async function deleteCheck(checkId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/checks/${checkId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Errore eliminazione controllo.');
}

export async function fetchObservations(deviceId?: string, limit: number = 50): Promise<any[]> {
  const url = deviceId ? `${API_BASE}/observations?device_id=${deviceId}&limit=${limit}` : `${API_BASE}/observations?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore caricamento osservazioni.');
  return res.json();
}

export async function fetchEvents(
  filterOrDeviceId?: string | { deviceId?: string; eventType?: string; severity?: string; search?: string; limit?: number },
  limit: number = 100
): Promise<EventItem[]> {
  let url = `${API_BASE}/events`;
  if (typeof filterOrDeviceId === 'string') {
    url += `?device_id=${encodeURIComponent(filterOrDeviceId)}&limit=${limit}`;
  } else if (filterOrDeviceId && typeof filterOrDeviceId === 'object') {
    const params = new URLSearchParams();
    if (filterOrDeviceId.deviceId) params.append('device_id', filterOrDeviceId.deviceId);
    if (filterOrDeviceId.eventType) params.append('event_type', filterOrDeviceId.eventType);
    if (filterOrDeviceId.severity) params.append('severity', filterOrDeviceId.severity);
    if (filterOrDeviceId.search) params.append('search', filterOrDeviceId.search);
    params.append('limit', String(filterOrDeviceId.limit || limit));
    url += `?${params.toString()}`;
  } else {
    url += `?limit=${limit}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore caricamento eventi.');
  return res.json();
}

export async function fetchHistoricalSnapshot(targetIsoTime: string, deviceId?: string): Promise<any> {
  let url = `${API_BASE}/timemachine/snapshot?target_time=${encodeURIComponent(targetIsoTime)}`;
  if (deviceId) {
    url += `&device_id=${encodeURIComponent(deviceId)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore caricamento snapshot storico.');
  return res.json();
}

export function setupSSEStream(onDiff: (data: any) => void): () => void {
  const eventSource = new EventSource(`${API_BASE}/stream`);
  eventSource.addEventListener('status_diff', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      onDiff(data);
    } catch (err) {
      console.error('Errore parsing frame SSE:', err);
    }
  });
  return () => {
    eventSource.close();
  };
}

export async function updateDevice(deviceId: string, payload: any): Promise<Device> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante l\'aggiornamento dell\'apparato.');
  return res.json();
}

export async function createDevice(payload: any): Promise<Device> {
  const res = await fetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante la creazione dell\'apparato.');
  return res.json();
}

export async function deleteDevice(deviceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/devices/${deviceId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Errore durante l\'eliminazione dell\'apparato.');
}

export async function batchDeleteDevices(deviceIds: string[]): Promise<{ deleted_count: number; deleted_ids: string[] }> {
  const res = await fetch(`${API_BASE}/devices/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_ids: deviceIds }),
  });
  if (!res.ok) throw new Error('Errore durante l\'eliminazione multipla degli apparati.');
  return res.json();
}

export async function assignNetworkRoles(payload: {
  dns_server_id?: string;
  dhcp_server_id?: string;
  gateway_id?: string;
  vantage_point_id?: string;
}): Promise<FullTopology> {
  const res = await fetch(`${API_BASE}/topology/assign-roles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante l\'assegnazione dei ruoli di rete.');
  return res.json();
}

export async function fetchNotificationChannels(): Promise<any[]> {
  const res = await fetch(`${API_BASE}/notifications/channels`);
  if (!res.ok) throw new Error('Errore durante il recupero dei canali di notifica.');
  return res.json();
}

export async function getNotificationChannel(channelId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/channels/${channelId}`);
  if (!res.ok) throw new Error('Errore durante il recupero del canale di notifica.');
  return res.json();
}

export async function saveNotificationChannel(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Errore durante il salvataggio del canale di notifica.');
  return res.json();
}

export async function deleteNotificationChannel(channelId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/channels/${channelId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Errore durante l\'eliminazione del canale di notifica.');
  return res.json();
}

export async function testNotificationChannel(channelId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/channels/${channelId}/test`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Errore invio notifica di prova.');
  }
  return res.json();
}

export async function testNotificationConfig(payload: {
  channel_id?: string;
  type: string;
  config: Record<string, any>;
  quiet_hours?: Record<string, any>;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Errore invio email di prova.');
  }
  return res.json();
}

export async function fetchNotificationLogs(limit: number = 20): Promise<any[]> {
  const res = await fetch(`${API_BASE}/notifications/logs?limit=${limit}`);
  if (!res.ok) throw new Error('Errore durante il recupero dei log delle notifiche.');
  return res.json();
}

export interface DiscoveredDeviceItem {
  id: string;
  name: string;
  kind: string;
  ip: string;
  mac?: string;
  roles: string[];
  location: string;
  reachable: boolean;
  rtt_ms?: number | null;
  is_gateway: boolean;
  is_vantage_point: boolean;
}

export interface NetworkScanResult {
  subnet?: string;
  gateway_ip?: string;
  local_ip?: string;
  devices: DiscoveredDeviceItem[];
}

export async function scanNetwork(subnet?: string): Promise<NetworkScanResult> {
  const url = subnet ? `${API_BASE}/discovery/scan?subnet=${encodeURIComponent(subnet)}` : `${API_BASE}/discovery/scan`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore durante la scansione della rete.');
  return res.json();
}

export async function quickPing(target: string, timeoutSeconds: number = 1.5): Promise<{
  target: string;
  reachable: boolean;
  rtt_ms?: number | null;
  message?: string;
}> {
  const res = await fetch(`${API_BASE}/discovery/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, timeout_seconds: timeoutSeconds }),
  });
  if (!res.ok) throw new Error('Errore durante il test di raggiungibilità ping.');
  return res.json();
}

export async function fetchSettings(): Promise<{ retention_period: string; settings: Record<string, any> }> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error('Impossibile caricare le impostazioni.');
  return res.json();
}

export async function updateRetentionSetting(retention_period: string): Promise<{ retention_period: string; status: string }> {
  const res = await fetch(`${API_BASE}/settings/retention`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retention_period }),
  });
  if (!res.ok) throw new Error('Impossibile aggiornare la retention.');
  return res.json();
}

export async function fetchScheduledMaintenance(deviceId?: string): Promise<any[]> {
  const url = deviceId
    ? `${API_BASE}/maintenance/scheduled?device_id=${encodeURIComponent(deviceId)}`
    : `${API_BASE}/maintenance/scheduled`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossibile caricare le finestre di manutenzione programmata.');
  return res.json();
}

export async function createScheduledMaintenance(payload: {
  title: string;
  device_id?: string | null;
  start_ts: string;
  end_ts: string;
  recurrence_type?: string;
  start_time?: string | null;
  end_time?: string | null;
  days_of_week?: string | null;
  day_of_month?: number | null;
  recurrence_end_date?: string | null;
  notes?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/maintenance/scheduled`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Errore creazione manutenzione programmata.');
  }
  return res.json();
}

export async function deleteScheduledMaintenance(windowId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/maintenance/scheduled/${windowId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Errore eliminazione manutenzione programmata.');
  return res.json();
}

export async function fetchActiveScheduledMaintenance(atTs?: string): Promise<{
  is_global_active: boolean;
  global_window: any | null;
  active_device_windows: any[];
}> {
  const url = atTs
    ? `${API_BASE}/maintenance/scheduled/active?at_ts=${encodeURIComponent(atTs)}`
    : `${API_BASE}/maintenance/scheduled/active`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Impossibile verificare lo stato attivo delle manutenzioni.');
  return res.json();
}

export async function exportTopologyJson(): Promise<any> {
  const res = await fetch(`${API_BASE}/topology/export/json`);
  if (!res.ok) throw new Error('Errore durante l\'esportazione del backup della plancia.');
  return res.json();
}

export async function importTopologyJson(backupData: any): Promise<any> {
  const res = await fetch(`${API_BASE}/topology/import/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Errore durante il ripristino del backup della plancia.');
  }
  return res.json();
}

export interface SpeedtestEvent {
  stage: 'init' | 'ping' | 'ping_done' | 'download' | 'download_done' | 'upload' | 'complete' | 'error';
  progress?: number;
  message?: string;
  current_ping_ms?: number;
  ping_ms?: number;
  jitter_ms?: number;
  download_mbps?: number;
  upload_mbps?: number;
  server?: {
    name: string;
    location: string;
    isp: string;
    colo: string;
  };
  timestamp?: number;
}

export interface SpeedtestServer {
  id: string;
  name: string;
  sponsor: string;
  city: string;
  country: string;
}

export async function fetchSpeedtestServers(): Promise<SpeedtestServer[]> {
  const res = await fetch(`${API_BASE}/speedtest/servers`);
  if (!res.ok) throw new Error('Errore caricamento lista server speedtest.');
  return res.json();
}

export function runSpeedtestStream(
  onEvent: (ev: SpeedtestEvent) => void,
  onError?: (err: any) => void,
  serverId: string = 'auto'
): () => void {
  const es = new EventSource(`${API_BASE}/speedtest/run?server_id=${encodeURIComponent(serverId)}`);

  es.onmessage = (e) => {
    try {
      const data: SpeedtestEvent = JSON.parse(e.data);
      onEvent(data);
      if (data.stage === 'complete' || data.stage === 'error') {
        es.close();
      }
    } catch (parseErr) {
      console.error('Failed to parse speedtest event', parseErr);
    }
  };

  es.onerror = (err) => {
    if (onError) onError(err);
    es.close();
  };

  return () => {
    es.close();
  };
}


