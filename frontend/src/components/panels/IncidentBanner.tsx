import React, { useState } from 'react';
import { AlertOctagon, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Sparkles, UserCheck } from 'lucide-react';
import { Incident } from '../../types';
import { acknowledgeIncident } from '../../api/client';

interface IncidentBannerProps {
  incident: Incident | null;
  onRefresh?: () => void;
}

export const IncidentBanner: React.FC<IncidentBannerProps> = ({ incident, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  if (!incident || incident.status === 'resolved') return null;

  const handleAcknowledge = async () => {
    setAcknowledging(true);
    try {
      await acknowledgeIncident(incident.id, 'utente_locale');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setAcknowledging(false);
    }
  };

  const confidencePct = Math.round(incident.confidence * 100);

  return (
    <div className="bg-rose-950/80 border-b border-rose-800/80 backdrop-blur-md px-4 py-3 text-rose-100 shadow-xl transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-600/30 border border-rose-500/40 text-rose-400">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                Incidente Aperto
              </span>
              <span className="text-xs font-bold text-rose-200">
                Causa: {incident.root_cause_device_id || 'Rete'}
              </span>
              <span className="text-xs bg-rose-900/80 border border-rose-700/60 px-2 py-0.5 rounded text-rose-300 font-mono">
                Confidenza {confidencePct}%
              </span>
            </div>
            <p className="text-xs text-rose-200/90 mt-0.5 line-clamp-1">
              {incident.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {incident.status !== 'monitoring' && !incident.acknowledged_by ? (
            <button
              onClick={handleAcknowledge}
              disabled={acknowledging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Prendi in carico
            </button>
          ) : (
            <span className="flex items-center gap-1 text-xs text-rose-300 bg-rose-900/60 px-2.5 py-1 rounded border border-rose-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Preso in carico
            </span>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded hover:bg-rose-900/60 text-rose-300 transition"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-rose-800/60 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <h4 className="font-bold text-rose-200 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Azioni Consigliate
            </h4>
            <ul className="space-y-1 list-disc list-inside text-rose-200/90">
              {incident.recommendations?.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-rose-200 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Apparati Impattati ({incident.impacted?.length || 0})
            </h4>
            <div className="flex flex-wrap gap-1">
              {incident.impacted?.map((id) => (
                <span key={id} className="bg-rose-900/80 border border-rose-700/60 px-2 py-0.5 rounded text-[10px]">
                  {id}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
