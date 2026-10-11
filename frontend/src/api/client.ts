/** NetSentinel REST API client */

import { Device, FullTopology, Incident, Check } from '../types';

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

export async function fetchObservations(deviceId?: string, limit: number = 50): Promise<any[]> {
  const url = deviceId ? `${API_BASE}/observations?device_id=${deviceId}&limit=${limit}` : `${API_BASE}/observations?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore caricamento osservazioni.');
  return res.json();
}

export async function fetchEvents(deviceId?: string, limit: number = 50): Promise<any[]> {
  const url = deviceId ? `${API_BASE}/events?device_id=${deviceId}&limit=${limit}` : `${API_BASE}/events?limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Errore caricamento eventi.');
  return res.json();
}

export async function fetchHistoricalSnapshot(targetIsoTime: string): Promise<any> {
  const res = await fetch(`${API_BASE}/timemachine/snapshot?target_time=${encodeURIComponent(targetIsoTime)}`);
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
