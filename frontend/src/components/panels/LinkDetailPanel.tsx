import React from 'react';
import { X, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import { Link, Device } from '../../types';

interface LinkDetailPanelProps {
  link: Link | null;
  devices: Device[];
  onClose: () => void;
  onDeleteLink?: (linkId: string) => void;
}

export const LinkDetailPanel: React.FC<LinkDetailPanelProps> = ({ link, devices, onClose, onDeleteLink }) => {

  if (!link) return null;

  const devMap = new Map(devices.map((d) => [d.id, d]));
  const src = devMap.get(link.from_device_id);
  const dst = devMap.get(link.to_device_id);

  return (
    <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col h-full shadow-2xl z-20">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-100 text-sm">Dettaglio Collegamento</h3>
          <span className="text-[11px] text-slate-400 font-mono">{link.id}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60 flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="font-semibold text-slate-200">{src?.name || link.from_device_id}</div>
            <div className="text-[10px] text-slate-400">{link.from_port ? `Porta ${link.from_port}` : 'Porta auto'}</div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 mx-2" />
          <div className="text-center flex-1">
            <div className="font-semibold text-slate-200">{dst?.name || link.to_device_id}</div>
            <div className="text-[10px] text-slate-400">{link.to_port ? `Porta ${link.to_port}` : 'Porta auto'}</div>
          </div>
        </div>

        <div className="space-y-2 bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
          <div className="flex justify-between">
            <span className="text-slate-400">Tipologia (Medium):</span>
            <span className="font-mono text-slate-200 uppercase font-semibold">{link.medium}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Alimentazione PoE:</span>
            <span className={link.poe ? 'text-amber-400 font-bold flex items-center gap-1' : 'text-slate-400'}>
              {link.poe ? <><Zap className="w-3 h-3 fill-amber-400" /> Attiva</> : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Stato del Link:</span>
            <span className="text-emerald-400 font-bold uppercase">{link.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Fonte dello Stato:</span>
            <span className="text-slate-300 italic">{link.status_source || 'Dedotto da raggiungibilità capi'}</span>
          </div>
        </div>

        {link.cable_notes && (
          <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700/50">
            <span className="text-[11px] font-bold text-slate-400 block mb-1">Note Cablaggio</span>
            <p className="text-slate-300">{link.cable_notes}</p>
          </div>
        )}

        {onDeleteLink && (
          <div className="pt-2">
            <button
              onClick={() => {
                onDeleteLink(link.id);
                onClose();
              }}
              className="w-full py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl font-medium transition text-xs flex items-center justify-center gap-1.5"
            >
              Elimina Questo Collegamento
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


