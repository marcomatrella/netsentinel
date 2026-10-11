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
} from 'lucide-react';
import { DeviceKind, DeviceStatus } from '../../types';

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
}

const kindIcons: Record<DeviceKind, React.ComponentType<{ className?: string }>> = {
  wan_gateway: Globe,
  router: RouterIcon,
  switch: Network,
  access_point: Wifi,
  nas: HardDrive,
  server: Server,
  ups: Zap,
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

  return (
    <div
      className={`relative min-w-[190px] rounded-xl bg-slate-900/90 backdrop-blur-md px-3.5 py-3 border transition-all duration-200 ${
        statusBorderColors[status]
      } ${selected ? 'ring-2 ring-sky-400 shadow-lg' : 'shadow-md'} ${
        isRoot ? 'root-cause-ring border-rose-500 ring-2 ring-rose-500' : ''
      }`}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Top} className="!bg-sky-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} className="!bg-sky-400 !w-2.5 !h-2.5" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-sky-400 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-sky-400 !w-2.5 !h-2.5" />

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
          <div className="font-semibold text-xs text-slate-100 truncate" title={nodeData.name}>
            {nodeData.name}
          </div>
          <div className="text-[11px] text-slate-400 truncate">
            {nodeData.ip || nodeData.kind}
          </div>
        </div>
      </div>

      {/* Roles & Status Footer */}
      <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase ${statusBadgeBg[status]}`}>
            {status}
          </span>
          {nodeData.metricsBadge && (
            <span className="text-slate-400 font-mono text-[9px]">
              {nodeData.metricsBadge}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {nodeData.roles?.includes('gateway') && (
            <span className="bg-purple-950 text-purple-300 border border-purple-800 px-1 rounded text-[8px]">GW</span>
          )}
          {nodeData.roles?.includes('dns_resolver') && (
            <span className="bg-cyan-950 text-cyan-300 border border-cyan-800 px-1 rounded text-[8px]">DNS</span>
          )}
          {nodeData.roles?.includes('dhcp_server') && (
            <span className="bg-amber-950 text-amber-300 border border-amber-800 px-1 rounded text-[8px]">DHCP</span>
          )}
        </div>
      </div>
    </div>
  );
});
