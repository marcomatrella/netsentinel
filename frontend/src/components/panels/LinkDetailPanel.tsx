import React from 'react';
import { X, ArrowRight, Zap, Wifi, Sparkles, Globe, Network, Cpu } from 'lucide-react';
import { Link, Device, LinkMedium } from '../../types';
import { useTranslation } from '../../i18n/I18nContext';

interface LinkDetailPanelProps {
  link: Link | null;
  devices: Device[];
  onClose: () => void;
  onUpdateLink?: (linkId: string, updated: Partial<Link>) => void;
  onDeleteLink?: (linkId: string) => void;
}

const MEDIUM_OPTIONS: { id: LinkMedium; labelKey: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'ethernet', labelKey: 'link_detail.medium_ethernet', icon: Network },
  { id: 'wifi', labelKey: 'link_detail.medium_wifi', icon: Wifi },
  { id: 'fiber', labelKey: 'link_detail.medium_fiber', icon: Sparkles },
  { id: 'wan', labelKey: 'link_detail.medium_wan', icon: Globe },
  { id: 'poe', labelKey: 'link_detail.medium_poe', icon: Zap },
  { id: 'power', labelKey: 'link_detail.medium_power', icon: Zap },
  { id: 'logical', labelKey: 'link_detail.medium_logical', icon: Cpu },
];

export const LinkDetailPanel: React.FC<LinkDetailPanelProps> = ({
  link,
  devices,
  onClose,
  onUpdateLink,
  onDeleteLink,
}) => {
  const { t } = useTranslation();

  if (!link) return null;

  const devMap = new Map(devices.map((d) => [d.id, d]));
  const src = devMap.get(link.from_device_id);
  const dst = devMap.get(link.to_device_id);

  const handleMediumChange = (newMedium: LinkMedium) => {
    if (!onUpdateLink) return;
    const isPoe = newMedium === 'poe' ? true : link.poe;
    onUpdateLink(link.id, {
      medium: newMedium,
      poe: isPoe,
    });
  };

  const handleTogglePoe = () => {
    if (!onUpdateLink) return;
    const nextPoe = !link.poe;
    onUpdateLink(link.id, {
      poe: nextPoe,
      medium: nextPoe && link.medium === 'ethernet' ? 'poe' : link.medium,
    });
  };

  return (
    <div className="w-full sm:w-80 max-w-full absolute sm:relative inset-y-0 right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full shadow-2xl z-30 text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{t('link_detail.title')}</h3>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{link.id}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1">
        {/* Endpoints representation */}
        <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
          <div className="text-center flex-1 min-w-0">
            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={src?.name || link.from_device_id}>
              {src?.name || link.from_device_id}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              {link.from_port ? t('link_detail.port_num', { port: link.from_port }) : t('link_detail.port_auto')}
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-500 mx-2 shrink-0" />
          <div className="text-center flex-1 min-w-0">
            <div className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={dst?.name || link.to_device_id}>
              {dst?.name || link.to_device_id}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              {link.to_port ? t('link_detail.port_num', { port: link.to_port }) : t('link_detail.port_auto')}
            </div>
          </div>
        </div>

        {/* Medium Selector */}
        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
          <label className="text-slate-600 dark:text-slate-300 font-semibold block mb-1.5">
            {t('link_detail.medium_label')}
          </label>
          <div className="grid grid-cols-1 gap-1.5">
            {MEDIUM_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const isSelected = link.medium === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleMediumChange(opt.id)}
                  disabled={!onUpdateLink}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition font-medium border ${
                    isSelected
                      ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-300 shadow-sm ring-1 ring-sky-500/30'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-750 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-650'
                  }`}
                >
                  <div
                    className={`p-1 rounded-md ${
                      isSelected
                        ? 'bg-sky-500/20 text-sky-500'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <span className="flex-1 text-[11px] truncate">
                    {t(opt.labelKey, { defaultValue: opt.id })}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* PoE Power and Metadata */}
        <div className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400 font-medium">{t('link_detail.poe_label')}</span>
            <button
              type="button"
              onClick={handleTogglePoe}
              disabled={!onUpdateLink}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition ${
                link.poe
                  ? 'bg-amber-500/20 text-amber-500 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              <Zap className={`w-3 h-3 ${link.poe ? 'fill-current' : ''}`} />
              <span>{link.poe ? t('link_detail.poe_active') : t('link_detail.poe_none')}</span>
            </button>
          </div>

          <div className="flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.status_label')}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase">{link.status}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">{t('link_detail.source_label')}</span>
            <span className="text-slate-600 dark:text-slate-300 italic">{link.status_source || t('link_detail.source_deduced')}</span>
          </div>
        </div>

        {link.cable_notes && (
          <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50">
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
