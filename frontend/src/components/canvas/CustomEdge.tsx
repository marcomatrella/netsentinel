import React, { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getSmoothStepPath } from '@xyflow/react';
import { Zap, Wifi, ShieldAlert } from 'lucide-react';
import { LinkMedium, LinkStatus } from '../../types';

interface CustomEdgeData {
  medium?: LinkMedium;
  poe?: boolean;
  status?: LinkStatus;
  statusSource?: string;
  fromPort?: string;
  toPort?: string;
  isFaultPath?: boolean;
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
  const edgeData = (data || {}) as CustomEdgeData;
  const status = edgeData.status || 'ok';
  const medium = edgeData.medium || 'ethernet';

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const strokeColor = edgeData.isFaultPath
    ? '#f43f5e'
    : statusStrokeColors[status] || '#10b981';

  const isDashed = medium === 'logical' || status === 'unverified';
  const strokeWidth = selected ? 3.5 : (edgeData.isFaultPath ? 3 : 2);
  const particleColor = pulseColors[medium] || strokeColor;

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
          opacity: status === 'unmonitored' ? 0.35 : 0.6,
        }}
      />

      {/* Live Interconnection Flow Progression */}
      {status === 'ok' && !edgeData.isFaultPath && (
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

      {/* Broken Fault Path Indicator */}
      {edgeData.isFaultPath && (
        <path
          d={edgePath}
          fill="none"
          stroke="#f43f5e"
          strokeWidth={strokeWidth + 1}
          strokeDasharray="4 4"
          className="animate-pulse"
        />
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={`flex items-center gap-1.5 bg-slate-900/90 border px-2 py-0.5 rounded-full text-[10px] text-slate-300 shadow cursor-pointer transition ${
            edgeData.isFaultPath || status === 'down'
              ? 'border-rose-500/80 text-rose-300 shadow-rose-950/40'
              : status === 'ok'
              ? 'border-emerald-600/60 hover:border-emerald-400 hover:text-white'
              : 'border-slate-700/80 text-slate-400'
          }`}
          title={`Link ${medium.toUpperCase()} — Stato: ${status.toUpperCase()} (${edgeData.statusSource || 'dedotto'})`}
        >
          {medium === 'poe' && <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />}
          {medium === 'power' && <Zap className="w-3 h-3 text-yellow-400" />}
          {medium === 'wifi' && <Wifi className="w-3 h-3 text-cyan-400" />}
          {(edgeData.isFaultPath || status === 'down') && <ShieldAlert className="w-3 h-3 text-rose-400 animate-bounce" />}
          
          <span className="font-mono text-[9px] uppercase font-bold">{medium}</span>

          {status === 'ok' && !edgeData.isFaultPath && (
            <span className="text-[8px] text-emerald-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Attivo
            </span>
          )}
          {status === 'unverified' && (
            <span className="text-[8px] text-slate-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              Attesa check
            </span>
          )}
          {(status === 'down' || edgeData.isFaultPath) && (
            <span className="text-[8px] text-rose-400 font-medium flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              KO
            </span>
          )}

          {(edgeData.fromPort || edgeData.toPort) && (
            <span className="text-slate-400 text-[8px] border-l border-slate-700 pl-1">
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


