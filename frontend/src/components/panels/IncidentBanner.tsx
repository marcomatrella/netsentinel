import React, { useState } from 'react';
import { AlertOctagon, ChevronDown, ChevronUp, ShieldAlert, Sparkles } from 'lucide-react';
import { Incident } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface IncidentBannerProps {
  incident: Incident | null;
  onRefresh?: () => void;
}

export const IncidentBanner: React.FC<IncidentBannerProps> = ({ incident }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!incident || incident.status === 'resolved') return null;

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
                {t('incident_banner.incident_open')}
              </span>
              <span className="text-xs font-bold text-rose-200">
                {t('incident_banner.cause', { name: incident.root_cause_device_id || 'Rete' })}
              </span>
              <span className="text-xs bg-rose-900/80 border border-rose-700/60 px-2 py-0.5 rounded text-rose-300 font-mono">
                {t('incident_banner.confidence', { pct: confidencePct })}
              </span>
            </div>
            <p className="text-xs text-rose-200/90 mt-0.5 line-clamp-1">
              {incident.summary}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded hover:bg-rose-900/60 text-rose-300 transition cursor-pointer"
            title={expanded ? 'Riduci dettagli' : 'Espandi dettagli'}
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
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> {t('incident_banner.recommended_actions')}
            </h4>
            <ul className="space-y-1 list-disc list-inside text-rose-200/90">
              {incident.recommendations?.map((r, idx) => (
                <li key={idx}>{r}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-rose-200 uppercase tracking-wider text-[11px] mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> {t('incident_banner.impacted_devices', { count: incident.impacted?.length || 0 })}
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
