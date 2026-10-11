import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Globe,
  Router as RouterIcon,
  Network,
  Wifi,
  HardDrive,
  Server,
  Zap,
  Cpu,
  Smartphone,
  Layers,
  AlertTriangle,
  Radio,
  Eye,
  Flame,
  Camera,
  Video,
  Printer,
  Plug,
  Rss,
  Gauge,
} from 'lucide-react';
import { DeviceKind, DeviceStatus } from '../../types';
import { getColorConfig } from '../../constants/colors';

interface CustomNodeData {
  id: string;
  name: string;
  kind: DeviceKind;
  ip?: string;
  status: DeviceStatus;
  roles: string[];
  isRootCause?: boolean;
  isImpacted?: boolean;
  isVantagePoint?: boolean;
  metricsBadge?: string;
  rtt_ms?: number;
  isEditMode?: boolean;
  color?: string;
}

const kindIcons: Record<DeviceKind, React.ComponentType<{ className?: string }>> = {
  wan_gateway: Globe,
  router: RouterIcon,
  firewall: Flame,
  switch: Network,
  access_point: Wifi,
  nas: HardDrive,
  server: Server,
  ups: Zap,
  smart_plug: Plug,
  camera: Camera,
  nvr: Video,
  printer: Printer,
  modem: Rss,
  sensor: Gauge,
  poe_injector: Radio,
  smart_hub: Cpu,
  client: Smartphone,
  service: Layers,
  custom: Layers,
};

const statusBorderColors: Record<DeviceStatus, string> = {
  ok: 'border-emerald-500/70 shadow-emerald-500/20',
  degraded: 'border-amber-500/80 shadow-amber-500/20',
  down: 'border-rose-500 shadow-rose-500/40',
  unreachable: 'border-slate-600 border-dashed opacity-60',
  affected: 'border-amber-600 border-dashed opacity-75',
  flapping: 'border-orange-500 animate-pulse',
  unknown: 'border-slate-700 opacity-60',
  maintenance: 'border-blue-500 shadow-blue-500/20',
};

const statusBadgeBg: Record<DeviceStatus, string> = {
  ok: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  down: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  unreachable: 'bg-slate-800 text-slate-400 border-slate-700',
  affected: 'bg-amber-900/30 text-amber-300 border-amber-800',
  flapping: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  unknown: 'bg-slate-800 text-slate-500 border-slate-700',
  maintenance: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export const CustomNode = memo(({ data, selected }: NodeProps<any>) => {
  const nodeData = data as CustomNodeData;
  const IconComponent = kindIcons[nodeData.kind] || Layers;

  const isRoot = Boolean(nodeData.isRootCause);
  const status = nodeData.status || 'unknown';
  const isEdit = Boolean(nodeData.isEditMode);

  const nodeColor = getColorConfig(nodeData.color || 'slate');

  return (
    <div
      className={`relative min-w-[190px] rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md px-3.5 py-3 border transition-all duration-200 ${
        statusBorderColors[status]
      } ${selected ? 'ring-2 ring-sky-400 shadow-lg' : 'shadow-md'} ${
        isRoot ? 'root-cause-ring border-rose-500 ring-2 ring-rose-500' : ''
      }`}
    >
      {/* Grouping Color Accent Stripe */}
      {nodeData.color && nodeData.color !== 'slate' && (
        <div
          className={`absolute top-0 left-3 right-3 h-1 rounded-b-full shadow-sm ${nodeColor.bgClass}`}
        />
      )}

      {/* Handles: visibili e collegabili solo in modalità modifica */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isEdit}
        className={`!bg-sky-400 !w-2.5 !h-2.5 transition-all duration-150 ${
          isEdit ? '!opacity-100 hover:scale-125' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isEdit}
        className={`!bg-sky-400 !w-2.5 !h-2.5 transition-all duration-150 ${
          isEdit ? '!opacity-100 hover:scale-125' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        isConnectable={isEdit}
        className={`!bg-sky-400 !w-2.5 !h-2.5 transition-all duration-150 ${
          isEdit ? '!opacity-100 hover:scale-125' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={isEdit}
        className={`!bg-sky-400 !w-2.5 !h-2.5 transition-all duration-150 ${
          isEdit ? '!opacity-100 hover:scale-125' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />

      {/* Root Cause Banner */}
      {isRoot && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1 z-10">
          <AlertTriangle className="w-3 h-3" /> Causa Radice
        </div>
      )}

      {/* Vantage Point Icon */}
      {nodeData.isVantagePoint && (
        <div className="absolute -top-2.5 -right-2 bg-sky-600 text-white p-1 rounded-full shadow" title="Vantage Point (Monitor)">
          <Eye className="w-3 h-3" />
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-lg ${statusBadgeBg[status]} border`}>
          <IconComponent className="w-5 h-5" />
        </div>
        <div className="overflow-hidden flex-1">
          <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5" title={nodeData.name}>
            {nodeData.color && nodeData.color !== 'slate' && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${nodeColor.dotClass}`} title={`Gruppo: ${nodeColor.name}`} />
            )}
            <span className="truncate">{nodeData.name}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {nodeData.ip || nodeData.kind}
          </div>
        </div>
      </div>

      {/* Roles & Status Footer */}
      <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase ${statusBadgeBg[status]}`}>
            {status}
          </span>
          {nodeData.rtt_ms !== undefined && status === 'ok' ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] flex items-center gap-0.5" title="Latenza ping RTT media">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {nodeData.rtt_ms}ms
            </span>
          ) : status === 'unknown' ? (
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] flex items-center gap-0.5" title="Controllo in corso">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              attesa ping...
            </span>
          ) : status === 'down' ? (
            <span className="text-rose-600 dark:text-rose-400 font-mono text-[9px] flex items-center gap-0.5" title="Nessuna risposta al ping">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              no ping
            </span>
          ) : nodeData.metricsBadge ? (
            <span className="text-slate-600 dark:text-slate-400 font-mono text-[9px]">
              {nodeData.metricsBadge}
            </span>
          ) : null}
        </div>
        <div className="flex gap-1">
          {nodeData.roles?.includes('dns_resolver') && (
            <span className="bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 px-1 rounded text-[8px] font-bold" title="Server DNS / AdGuard Home">
              DNS
            </span>
          )}
          {nodeData.roles?.includes('dhcp_server') && (
            <span className="bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1 rounded text-[8px] font-bold" title="Server DHCP">
              DHCP
            </span>
          )}
          {nodeData.roles?.includes('gateway') && (
            <span className="bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-800 px-1 rounded text-[8px] font-bold" title="Default Gateway WAN">
              GW
            </span>
          )}
          {nodeData.roles?.includes('power_provider') && (
            <span className="bg-yellow-100 dark:bg-yellow-950 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-800 px-1 rounded text-[8px] font-bold" title="Alimentazione / UPS">
              UPS
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

