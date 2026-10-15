import React, { useState, useEffect } from 'react';
import {
  X,
  Palette,
  Check,
  Globe,
  Router as RouterIcon,
  Flame,
  Network,
  Wifi,
  HardDrive,
  Server,
  Zap,
  Plug,
  Camera,
  Video,
  Printer,
  Rss,
  Gauge,
  Radio,
  Cpu,
  Smartphone,
  Layers,
} from 'lucide-react';
import { Device, DeviceKind } from '../../types';
import { PRESET_COLORS, getColorConfig, getDeviceColorId } from '../../constants/colors';
import { useTranslation } from '../../i18n/I18nContext';

interface DeviceColorModalProps {
  isOpen: boolean;
  device: Device;
  onClose: () => void;
  onSave: (colorId: string) => Promise<void>;
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

const statusBorderColors: Record<string, string> = {
  ok: 'border-emerald-500/70 shadow-emerald-500/20',
  degraded: 'border-amber-500/80 shadow-amber-500/20',
  down: 'border-rose-500 shadow-rose-500/40',
  unreachable: 'border-slate-600 border-dashed opacity-60',
  affected: 'border-amber-600 border-dashed opacity-75',
  flapping: 'border-orange-500 animate-pulse',
  unknown: 'border-slate-700 opacity-60',
  maintenance: 'border-blue-500 shadow-blue-500/20',
};

const statusBadgeBg: Record<string, string> = {
  ok: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  degraded: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  down: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  unreachable: 'bg-slate-800 text-slate-400 border-slate-700',
  affected: 'bg-amber-900/30 text-amber-300 border-amber-800',
  flapping: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  unknown: 'bg-slate-800 text-slate-500 border-slate-700',
  maintenance: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export const DeviceColorModal: React.FC<DeviceColorModalProps> = ({
  isOpen,
  device,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [selectedColor, setSelectedColor] = useState<string>('slate');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (device && isOpen) {
      setSelectedColor(getDeviceColorId(device.tags));
    }
  }, [device, isOpen]);

  if (!isOpen) return null;

  const IconComponent = kindIcons[device.kind] || Layers;
  const activeColorConfig = getColorConfig(selectedColor);
  const status = device.status || 'ok';
  const borderClass = statusBorderColors[status] || statusBorderColors.ok;
  const badgeClass = statusBadgeBg[status] || statusBadgeBg.ok;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(selectedColor);
      onClose();
    } catch (err: any) {
      console.error('Errore salvataggio colore:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transition-colors">
        
        {/* Modal Header */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/40 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 border border-amber-500/20 shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 truncate">
                {t('device_color.title')}
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate hidden xs:block">
                {device.name} • {device.addresses?.ip || device.kind}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          
          {/* Live Preview Box */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
              {t('device_color.preview_heading')}
            </span>
            <div className="bg-slate-100 dark:bg-slate-950/80 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center">
              
              {/* Box replica of CustomNode */}
              <div
                className={`relative min-w-[210px] max-w-[260px] rounded-xl bg-white/95 dark:bg-slate-900/90 backdrop-blur-md px-3.5 py-3 border shadow-md transition-all duration-300 ${borderClass}`}
              >
                {/* Category Accent Stripe on Top */}
                {selectedColor !== 'slate' && (
                  <div
                    className={`absolute top-0 left-0 right-0 h-1.5 rounded-t-xl ${activeColorConfig.bgClass}`}
                  />
                )}

                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg border transition-all ${badgeClass}`}>
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="overflow-hidden flex-1">
                    <div className="font-semibold text-xs text-slate-800 dark:text-slate-100 truncate flex items-center gap-1.5">
                      {selectedColor !== 'slate' && (
                        <span className={`w-2 h-2 rounded-full shrink-0 ${activeColorConfig.dotClass}`} />
                      )}
                      <span className="truncate">{device.name}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {device.addresses?.ip || device.kind}
                    </div>
                  </div>
                </div>

                {/* Footer with status and color badge */}
                <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border uppercase ${badgeClass}`}>
                    {status}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 font-medium text-[10px]">
                    {activeColorConfig.name}
                  </span>
                </div>
              </div>

              <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-3 text-center">
                {t('device_color.preview_desc')}
              </span>
            </div>
          </div>

          {/* Color Palettes Grid */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
              {t('device_color.choose_color')}
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_COLORS.map((c) => {
                const isSelected = selectedColor === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition text-left ${
                      isSelected
                        ? 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/40 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${c.dotClass} shrink-0 ring-1 ring-black/10`} />
                    <span className="truncate flex-1">{c.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 bg-slate-50/70 dark:bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 rounded-xl transition"
          >
            {t('device_color.btn_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white rounded-xl shadow-lg shadow-sky-600/20 flex items-center gap-2 transition disabled:opacity-50"
          >
            {isSaving ? (
              <span>{t('device_color.btn_saving')}</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{t('device_color.btn_save')}</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
