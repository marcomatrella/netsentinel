/** Shared TypeScript definitions for NetSentinel */

export type DeviceKind =
  | 'wan_gateway'
  | 'router'
  | 'switch'
  | 'access_point'
  | 'nas'
  | 'server'
  | 'ups'
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
