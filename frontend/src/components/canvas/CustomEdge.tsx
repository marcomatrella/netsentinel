import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { Zap, Wifi, ShieldAlert } from 'lucide-react';
import { LinkMedium, LinkStatus } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface CustomEdgeData {
  medium?: LinkMedium;
  poe?: boolean;
  status?: LinkStatus;
  statusSource?: string;
  fromPort?: string;
  toPort?: string;
  isFaultPath?: boolean;
  fromDeviceStatus?: string;
  toDeviceStatus?: string;
}

const statusStrokeColors: Record<LinkStatus, string> = {
  ok: '#10b981',       // emerald-500
  degraded: '#f59e0b', // amber-500
  down: '#f43f5e',     // rose-500
  unverified: '#64748b', // slate-500
  unmonitored: '#475569',// slate-600
};

const pulseColors: Record<string, string> = {
  ethernet: '#10b981', // emerald
  poe: '#f59e0b',      // amber/gold
  wifi: '#06b6d4',     // cyan
  power: '#eab308',    // yellow
  wan: '#38bdf8',      // sky
  virtual: '#a855f7',  // purple
  logical: '#a855f7',
  usb: '#8b5cf6',
};

export const CustomEdge = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<any>) => {
  const { t } = useTranslation();
  const edgeData = (data || {}) as CustomEdgeData;
  const rawStatus = edgeData.status || 'ok';
  const medium = edgeData.medium || 'ethernet';

  // Connected nodes statuses (live or historical replay)
  const fromDevStatus = edgeData.fromDeviceStatus || 'ok';
  const toDevStatus = edgeData.toDeviceStatus || 'ok';

  const hasDownNode = fromDevStatus === 'down' || fromDevStatus === 'unreachable' || fromDevStatus === 'flapping' ||
                      toDevStatus === 'down' || toDevStatus === 'unreachable' || toDevStatus === 'flapping';
  const hasDegradedNode = fromDevStatus === 'degraded' || toDevStatus === 'degraded';

  // Effective status of link: if either connected node is down, link is considered down/KO; if degraded, degraded.
  const effectiveStatus: LinkStatus = (edgeData.isFaultPath || hasDownNode || rawStatus === 'down')
    ? 'down'
    : (hasDegradedNode || rawStatus === 'degraded')
    ? 'degraded'
    : rawStatus;

  const isFault = effectiveStatus === 'down';
  const isDegraded = effectiveStatus === 'degraded';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const strokeColor = isFault
    ? '#f43f5e'
    : isDegraded
    ? '#f59e0b'
    : statusStrokeColors[effectiveStatus] || '#10b981';

  const isDashed = medium === 'logical' || effectiveStatus === 'unverified';
  const strokeWidth = selected ? 3.5 : (isFault ? 3 : isDegraded ? 2.5 : 2);
  const particleColor = isFault ? '#f43f5e' : isDegraded ? '#f59e0b' : (pulseColors[medium] || strokeColor);

  return (
    <>
      {/* Base Cable Path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: isDashed ? '5 5' : undefined,
          opacity: effectiveStatus === 'unmonitored' ? 0.35 : isFault ? 0.75 : 0.6,
        }}
      />

      {/* Live Interconnection Flow Progression (OK normal) */}
      {effectiveStatus === 'ok' && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke={particleColor}
            strokeWidth={Math.max(strokeWidth - 0.5, 1.5)}
            className="flow-active"
            style={{ opacity: 0.9 }}
          />
          <circle r="3" fill={particleColor}>
            <animateMotion
              dur={medium === 'wifi' ? '2.8s' : '1.8s'}
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}

      {/* Offline/Down Broken Flow (Red animated dashed flow in motion + blinking particle) */}
      {isFault && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke="#f43f5e"
            strokeWidth={strokeWidth + 0.5}
            className="flow-down"
            style={{ opacity: 0.95 }}
          />
          <circle r="3.5" fill="#f43f5e" className="animate-ping">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}

      {/* Degraded Connection Flow (Amber/Yellow animated flow in motion) */}
      {isDegraded && (
        <>
          <path
            d={edgePath}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={strokeWidth}
            className="flow-degraded"
            style={{ opacity: 0.95 }}
          />
          <circle r="3" fill="#f59e0b">
            <animateMotion
              dur="2.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/90 border px-2 py-0.5 rounded-full text-[10px] text-slate-700 dark:text-slate-300 shadow cursor-pointer transition ${
            isFault
              ? 'border-rose-500/90 text-rose-600 dark:text-rose-300 shadow-rose-950/40 ring-1 ring-rose-500/40'
              : isDegraded
              ? 'border-amber-500/90 text-amber-600 dark:text-amber-300 shadow-amber-950/40 ring-1 ring-amber-500/40'
              : 'border-emerald-500/60 dark:border-emerald-600/60 hover:border-emerald-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          title={t('custom_edge.tooltip_link', {
            medium: medium.toUpperCase(),
            status: effectiveStatus.toUpperCase(),
            source: edgeData.statusSource || t('custom_edge.source_deduced'),
          })}
        >
          {medium === 'poe' && <Zap className="w-3 h-3 text-amber-500 dark:text-amber-400 fill-amber-500 dark:fill-amber-400" />}
          {medium === 'power' && <Zap className="w-3 h-3 text-yellow-500 dark:text-yellow-400" />}
          {medium === 'wifi' && <Wifi className="w-3 h-3 text-cyan-500 dark:text-cyan-400" />}
          {isFault && <ShieldAlert className="w-3 h-3 text-rose-500 dark:text-rose-400 animate-bounce" />}
          {isDegraded && <ShieldAlert className="w-3 h-3 text-amber-500 dark:text-amber-400 animate-pulse" />}
          
          <span className="font-mono text-[9px] uppercase font-bold">{medium}</span>

          {effectiveStatus === 'ok' && (
            <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t('custom_edge.status_active')}
            </span>
          )}
          {effectiveStatus === 'unverified' && (
            <span className="text-[8px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
              {t('custom_edge.status_waiting')}
            </span>
          )}
          {isDegraded && (
            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {t('custom_edge.status_degraded')}
            </span>
          )}
          {isFault && (
            <span className="text-[8px] text-rose-600 dark:text-rose-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              {t('custom_edge.status_down')}
            </span>
          )}

          {(edgeData.fromPort || edgeData.toPort) && (
            <span className="text-slate-500 dark:text-slate-400 text-[8px] border-l border-slate-300 dark:border-slate-700 pl-1">
              {edgeData.fromPort ? `p${edgeData.fromPort}` : ''}
              {edgeData.fromPort && edgeData.toPort ? '→' : ''}
              {edgeData.toPort ? `p${edgeData.toPort}` : ''}
            </span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});


