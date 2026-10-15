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
  Siren,
  Clock,
} from 'lucide-react';
import { DeviceKind, DeviceStatus } from '../../types';
import { getColorConfig } from '../../constants/colors';
import { useTranslation } from '../../i18n/I18nContext';

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
  isMaintenance?: boolean;
  maintenanceTitle?: string;
  maintenanceWindow?: {
    title: string;
    start_ts: string;
    end_ts: string;
    notes?: string;
  };
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
  const { t } = useTranslation();
  const nodeData = data as CustomNodeData;
  const IconComponent = kindIcons[nodeData.kind] || Layers;

  const isRoot = Boolean(nodeData.isRootCause);
  const status = nodeData.status || 'unknown';
  const isEdit = Boolean(nodeData.isEditMode);
  const isOffline = status === 'down' || status === 'unreachable';

  const nodeColor = getColorConfig(nodeData.color || 'slate');
  const isColored = Boolean(nodeData.color && nodeData.color !== 'slate');
  const isPassive = Boolean(
    nodeData.roles?.includes('passive_tracking') ||
    nodeData.kind === 'client'
  );

  return (
    <div
      className={`relative min-w-[190px] rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md px-3.5 py-3 border transition-all duration-300 ${
        isOffline
          ? 'node-offline-glow scale-[1.05] z-20 border-rose-500 ring-2 ring-rose-500/70 bg-rose-50/90 dark:bg-rose-950/40'
          : statusBorderColors[status]
      } ${selected ? 'ring-2 ring-sky-400 shadow-lg' : 'shadow-md'} ${
        isRoot ? 'root-cause-ring border-rose-500 ring-2 ring-rose-500' : ''
      }`}
    >
      {/* Category / Group Color Accent Stripe along top border */}
      {isColored && (
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-xl ${nodeColor.bgClass}`}
          title={t('custom_node.category_title', { name: nodeColor.name })}
        />
      )}

      {/* Handles: visibili e collegabili solo in modalità modifica */}
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isEdit}
        className={`!bg-sky-500 !border-2 !border-white dark:!border-slate-900 !w-3 !h-3 cursor-crosshair transition-colors duration-100 ${
          isEdit ? '!opacity-100 hover:!bg-sky-300 hover:ring-4 hover:ring-sky-400/50' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isEdit}
        className={`!bg-sky-500 !border-2 !border-white dark:!border-slate-900 !w-3 !h-3 cursor-crosshair transition-colors duration-100 ${
          isEdit ? '!opacity-100 hover:!bg-sky-300 hover:ring-4 hover:ring-sky-400/50' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        isConnectable={isEdit}
        className={`!bg-sky-500 !border-2 !border-white dark:!border-slate-900 !w-3 !h-3 cursor-crosshair transition-colors duration-100 ${
          isEdit ? '!opacity-100 hover:!bg-sky-300 hover:ring-4 hover:ring-sky-400/50' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        isConnectable={isEdit}
        className={`!bg-sky-500 !border-2 !border-white dark:!border-slate-900 !w-3 !h-3 cursor-crosshair transition-colors duration-100 ${
          isEdit ? '!opacity-100 hover:!bg-sky-300 hover:ring-4 hover:ring-sky-400/50' : '!opacity-0 !pointer-events-none !border-none'
        }`}
      />

      {/* Offline Alarm Floating Badge */}
      {isOffline && (
        <div
          className="absolute -top-3 -right-2.5 z-30 flex items-center gap-1 bg-gradient-to-r from-rose-600 to-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg shadow-rose-600/50 ring-2 ring-rose-300 dark:ring-rose-400 animate-pulse"
          title={status === 'unreachable' ? t('custom_node.unreachable_tooltip') : t('custom_node.offline_alert_tooltip')}
        >
          <Siren className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>OFFLINE</span>
        </div>
      )}

      {/* Root Cause Banner */}
      {isRoot && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1 z-20">
          <AlertTriangle className="w-3 h-3" /> {t('custom_node.root_cause')}
        </div>
      )}

      {/* Active Scheduled Maintenance Clock Badge with Neon Violet Glow */}
      {nodeData.isMaintenance && (
        <div
          className={`absolute -top-3.5 ${
            isOffline ? '-left-8' : nodeData.isVantagePoint ? '-left-3' : '-right-3'
          } bg-purple-600 text-white p-1.5 rounded-full z-30 ring-2 ring-purple-300 dark:ring-purple-400 maintenance-point-glow flex items-center justify-center cursor-help`}
          title={
            nodeData.maintenanceWindow
              ? `${nodeData.maintenanceWindow.title} (${new Date(nodeData.maintenanceWindow.start_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(nodeData.maintenanceWindow.end_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`
              : (nodeData.maintenanceTitle || t('maintenance.active_badge_tooltip') || 'Intervento di manutenzione programmata in corso')
          }
        >
          <Clock className="w-4 h-4 stroke-[2.5] animate-spin-slow text-purple-100" />
        </div>
      )}

      {/* Vantage Point Icon */}
      {nodeData.isVantagePoint && (
        <div
          className={`absolute -top-3.5 ${
            isOffline ? '-left-3' : '-right-3'
          } bg-sky-500 text-white p-1.5 rounded-full z-30 ring-2 ring-sky-300 dark:ring-sky-400 vantage-point-glow flex items-center justify-center`}
          title="Vantage Point (Monitor)"
        >
          <Eye className="w-4 h-4 stroke-[2.5]" />
        </div>
      )}

      <div className="flex items-center gap-2.5">
        <div
          className={`p-2 rounded-lg border transition-all ${
            isOffline
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/50 shadow-md shadow-rose-500/30 animate-pulse'
              : statusBadgeBg[status]
          }`}
        >
          <IconComponent className="w-5 h-5" />
        </div>
        <div className="overflow-hidden flex-1">
          <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5" title={nodeData.name}>
            {isOffline && (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
              </span>
            )}
            {isColored && !isOffline && (
              <span className={`w-2 h-2 rounded-full shrink-0 ${nodeColor.dotClass}`} title={t('custom_node.category_title', { name: nodeColor.name })} />
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
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase flex items-center gap-1 ${
            isOffline
              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/50 font-bold'
              : statusBadgeBg[status]
          }`}>
            {isOffline && <AlertTriangle className="w-2.5 h-2.5 text-rose-500 shrink-0" />}
            {status}
          </span>
          {nodeData.rtt_ms !== undefined && status === 'ok' ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[9px] flex items-center gap-0.5" title={t('custom_node.avg_ping_rtt')}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {nodeData.rtt_ms}ms
            </span>
          ) : status === 'unknown' ? (
            <span className="text-slate-400 dark:text-slate-500 font-mono text-[9px] flex items-center gap-0.5" title={t('custom_node.checking_progress')}>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              {t('custom_node.waiting_ping')}
            </span>
          ) : status === 'down' ? (
            <span className="text-rose-600 dark:text-rose-400 font-mono text-[9px] flex items-center gap-0.5" title={t('custom_node.no_ping_response')}>
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              {t('custom_node.no_ping')}
            </span>
          ) : nodeData.metricsBadge ? (
            <span className="text-slate-600 dark:text-slate-400 font-mono text-[9px]">
              {nodeData.metricsBadge}
            </span>
          ) : null}
        </div>
        <div className="flex gap-1">
          {isPassive && (
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 px-1 rounded text-[8px] font-medium" title={t('custom_node.passive_tooltip')}>
              {t('custom_node.passive_badge')}
            </span>
          )}
          {nodeData.roles?.includes('dns_resolver') && (
            <span className="inline-flex items-center gap-0.5 bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 px-1 py-0.2 rounded text-[8px] font-bold" title="Server DNS / AdGuard Home">
              <Globe className="w-2.5 h-2.5 stroke-[2.5]" />
              <span>DNS</span>
            </span>
          )}
          {nodeData.roles?.includes('dhcp_server') && (
            <span className="inline-flex items-center gap-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 px-1 py-0.2 rounded text-[8px] font-bold" title="Server DHCP">
              <Radio className="w-2.5 h-2.5 stroke-[2.5]" />
              <span>DHCP</span>
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

