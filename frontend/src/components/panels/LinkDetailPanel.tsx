import React from 'react';
import { X, ArrowRight, Zap } from 'lucide-react';
import { Link, Device } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface LinkDetailPanelProps {
  link: Link | null;
  devices: Device[];
  onClose: () => void;
  onDeleteLink?: (linkId: string) => void;
}

export const LinkDetailPanel: React.FC<LinkDetailPanelProps> = ({ link, devices, onClose, onDeleteLink }) => {
  const { t } = useTranslation();

  if (!link) return null;

  const devMap = new Map(devices.map((d) => [d.id, d]));
  const src = devMap.get(link.from_device_id);
  const dst = devMap.get(link.to_device_id);

  return (
    <div className="w-full sm:w-80 max-w-full absolute sm:relative inset-y-0 right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-30 text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{t('link_detail.title')}</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{link.id}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <div className="text-center flex-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">{src?.name || link.from_device_id}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {link.from_port ? t('link_detail.port_num', { port: link.from_port }) : t('link_detail.port_auto')}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 mx-2" />
          <div className="text-center flex-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">{dst?.name || link.to_device_id}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">
              {link.to_port ? t('link_detail.port_num', { port: link.to_port }) : t('link_detail.port_auto')}
            </div>
          </div>
        </div>

        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.medium_label')}</span>
            <span className="font-mono text-slate-800 dark:text-slate-200 uppercase font-semibold">{link.medium}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.poe_label')}</span>
            <span className={link.poe ? 'text-amber-500 dark:text-amber-400 font-bold flex items-center gap-1' : 'text-slate-400'}>
              {link.poe ? <><Zap className="w-3 h-3 fill-amber-500 dark:fill-amber-400" /> {t('link_detail.poe_active')}</> : t('link_detail.poe_none')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.status_label')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">{link.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.source_label')}</span>
            <span className="text-slate-600 dark:text-slate-300 italic">{link.status_source || t('link_detail.source_deduced')}</span>
          </div>
        </div>

        {link.cable_notes && (
          <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1">{t('link_detail.cable_notes')}</span>
            <p className="text-slate-700 dark:text-slate-300">{link.cable_notes}</p>
          </div>
        )}

        {onDeleteLink && (
          <div className="pt-2">
            <button
              onClick={() => {
                onDeleteLink(link.id);
                onClose();
              }}
              className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-300 dark:bg-rose-600/20 dark:hover:bg-rose-600/30 dark:text-rose-300 dark:border-rose-500/30 rounded-xl font-medium transition text-xs flex items-center justify-center gap-1.5"
            >
              {t('link_detail.btn_delete_link')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
