import React, { useEffect } from 'react';
import { Trash2, X } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device } from '../../types';

interface ConfirmDeleteDeviceModalProps {
  isOpen: boolean;
  device: Device | null;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export const ConfirmDeleteDeviceModal: React.FC<ConfirmDeleteDeviceModalProps> = ({
  isOpen,
  device,
  onClose,
  onConfirm,
  isDeleting = false,
}) => {
  const { t } = useTranslation();

  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || !device) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 text-slate-800 dark:text-slate-100 relative animate-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          disabled={isDeleting}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          title={t('common.cancel')}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl shrink-0">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {t('device_detail.confirm_delete_title') || 'Conferma eliminazione apparato'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('device_detail.confirm_delete_hint') || 'I controlli associati verranno arrestati e i collegamenti rimossi.'}
            </p>
          </div>
        </div>

        {/* Device summary box */}
        <div className="p-3 bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 rounded-xl mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                {device.name}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200/60 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                {device.kind}
              </span>
            </div>
            {device.addresses?.ip && (
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400 shrink-0">
                {device.addresses.ip}
              </span>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
          {t('device_detail.delete_confirm', { name: device.name }) ||
            `Sei sicuro di voler eliminare '${device.name}'? Verranno rimossi anche tutti i collegamenti associati.`}
        </p>

        <div className="flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            {t('common.cancel') || 'Annulla'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-rose-600/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>
              {isDeleting
                ? (t('common.loading') || 'Eliminazione...')
                : (t('canvas.btn_confirm_delete') || 'Elimina definitivamente')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
