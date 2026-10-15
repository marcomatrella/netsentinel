import React, { useState } from 'react';
import { X, Database, Clock, Check, Save } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { updateRetentionSetting } from '../../api/client';

interface SystemSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRetention: string;
  onRetentionChanged: (newRetention: string) => void;
}

const RETENTION_OPTIONS = [
  { value: '24h', labelKey: 'settings.retention_24h', hours: 24 },
  { value: '48h', labelKey: 'settings.retention_48h', hours: 48 },
  { value: '5d', labelKey: 'settings.retention_5d', hours: 120 },
  { value: '10d', labelKey: 'settings.retention_10d', hours: 240 },
  { value: '30d', labelKey: 'settings.retention_30d', hours: 720 },
];

export const SystemSettingsModal: React.FC<SystemSettingsModalProps> = ({
  isOpen,
  onClose,
  currentRetention,
  onRetentionChanged,
}) => {
  const { t } = useTranslation();
  const [selectedRetention, setSelectedRetention] = useState<string>(currentRetention);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedRetention(currentRetention);
      setSavedSuccess(false);
    }
  }, [isOpen, currentRetention]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRetentionSetting(selectedRetention);
      onRetentionChanged(selectedRetention);
      setSavedSuccess(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('Errore salvataggio impostazioni retention:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-3.5 py-3 sm:px-5 sm:py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-850 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-500 dark:text-sky-400 shrink-0">
              <Database className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">
                {t('settings.modal_title')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden xs:block">
                {t('settings.modal_desc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
            title={t('common.close')}
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-500" />
              <span>{t('settings.retention_label')}</span>
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
              {t('settings.retention_desc')}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {RETENTION_OPTIONS.map((opt) => {
                const isSelected = selectedRetention === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedRetention(opt.value)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-2 ring-sky-500/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <span>{t(opt.labelKey)}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-sky-500" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-md flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {saving ? (
              <span>{t('common.saving')}</span>
            ) : savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>{t('common.saved')}</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{t('settings.save_btn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

