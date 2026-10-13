/** Shared TypeScript definitions for NetSentinel */

export type DeviceKind =
  | 'wan_gateway'
  | 'router'
  | 'firewall'
  | 'switch'
  | 'access_point'
  | 'nas'
  | 'server'
  | 'ups'
  | 'smart_plug'
  | 'camera'
  | 'nvr'
  | 'printer'
  | 'modem'
  | 'sensor'
  | 'poe_injector'
  | 'smart_hub'
  | 'client'
  | 'service'
  | 'custom';

export type DeviceStatus =
  | 'ok'
  | 'degraded'
  | 'down'
  | 'unreachable'
  | 'affected'
  | 'flapping'
  | 'unknown'
  | 'maintenance';

export type LinkMedium =
  | 'ethernet'
  | 'poe'
  | 'wifi'
  | 'fiber'
  | 'wan'
  | 'power'
  | 'logical';

export type LinkStatus =
  | 'ok'
  | 'degraded'
  | 'down'
  | 'unverified'
  | 'unmonitored';

export interface DeviceInterface {
  id: string;
  name: string;
  type: string;
  expected_speed?: string;
  mac_address?: string;
  notes?: string;
}

export interface Device {
  id: string;
  name: string;
  kind: DeviceKind;
  location?: string;
  criticality: number;
  addresses: {
    ip?: string;
    mac?: string;
    hostname?: string;
  };
  tags: string[];
  roles: string[];
  notes?: string;
  status: DeviceStatus;
  status_since: string;
  last_seen?: string;
  rtt_ms?: number;
  interfaces: DeviceInterface[];
}

export interface Link {
  id: string;
  from_device_id: string;
  from_port?: string;
  to_device_id: string;
  to_port?: string;
  medium: LinkMedium;
  poe: boolean;
  cable_notes?: string;
  status: LinkStatus;
  status_source?: string;
  throughput_bps?: number;
  updated_at: string;
}

export interface Dependency {
  id: string;
  dependent_id: string;
  provider_id: string;
  kind: string;
  strength: 'hard' | 'soft';
  source: 'inferred' | 'manual';
  reason?: string;
}

export interface Check {
  id: string;
  device_id: string;
  type: string;
  name: string;
  params: Record<string, any>;
  interval_seconds: number;
  timeout_seconds: number;
  thresholds: Record<string, any>;
  current_status: string;
  status_since: string;
  last_run_at?: string;
  next_run_at?: string;
  enabled: boolean;
}

export interface IncidentEvidence {
  check_id?: string;
  device_id?: string;
  status: string;
  ts: string;
  message: string;
  positive: boolean;
}

export interface IncidentTimelineItem {
  ts: string;
  event_type: string;
  message: string;
  device_id?: string;
}

export interface IncidentHypothesis {
  category: string;
  description: string;
  confidence: number;
  missing_evidence: string[];
  suggested_checks: string[];
}

export interface Incident {
  id: string;
  status: 'open' | 'monitoring' | 'resolved';
  started_at: string;
  resolved_at?: string;
  root_cause_device_id?: string;
  root_cause_category: string;
  confidence: number;
  summary: string;
  evidence: IncidentEvidence[];
  impacted: string[];
  timeline: IncidentTimelineItem[];
  recommendations: string[];
  alternative_hypotheses: IncidentHypothesis[];
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export interface CanvasLayout {
  id: string;
  nodes: any[];
  edges: any[];
  groups: any[];
  updated_at: string;
}

export interface FullTopology {
  vantage_point_id?: string;
  devices: Device[];
  links: Link[];
  dependencies: Dependency[];
  layout?: CanvasLayout;
}

export interface EventItem {
  id: number;
  ts: string;
  device_id?: string;
  device_name?: string;
  device_ip?: string;
  device_kind?: DeviceKind;
  check_id?: string;
  event_type: string;
  severity: 'crit' | 'critical_managed' | 'warn' | 'info' | string;
  title: string;
  message: string;
  details: Record<string, any>;
}

export interface ScheduledMaintenanceWindow {
  id: string;
  title: string;
  device_id?: string | null;
  start_ts: string;
  end_ts: string;
  recurrence_type?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  start_time?: string | null;
  end_time?: string | null;
  days_of_week?: string | null;
  day_of_month?: number | null;
  recurrence_end_date?: string | null;
  enabled: boolean;
  notes: string;
  created_at?: string;
}

export interface SimulatedNotification {
  channel_name: string;
  channel_type: string;
  recipient: string;
  subject: string;
  body_preview: string;
}

export interface SimulationResponse {
  root_cause_device_id: string | null;
  root_cause_category: string;
  confidence: number;
  diagnosis_title: string;
  diagnosis_summary: string;
  recommendations: string[];
  impacted_devices: string[];
  symptoms: Record<string, string>;
  fault_path: string[];
  simulated_notifications: SimulatedNotification[];
}



