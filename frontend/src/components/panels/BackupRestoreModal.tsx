import React, { useState, useRef } from 'react';
import { Download, Upload, AlertCircle, CheckCircle2, FileJson, X, RefreshCw } from 'lucide-react';
import { exportTopologyJson, importTopologyJson } from '../../api/client';
import { useTranslation } from '../../i18n/I18nContext';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setMessage(null);
    try {
      const data = await exportTopologyJson();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `netsentinel-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: t('backup.export_success') || 'Backup scaricato con successo!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Errore durante il download del backup.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        if (!parsed.devices || !Array.isArray(parsed.devices)) {
          throw new Error(t('backup.invalid_format') || 'File JSON non valido: array "devices" mancante.');
        }

        await importTopologyJson(parsed);
        setMessage({
          type: 'success',
          text: t('backup.import_success') || 'Plancia ripristinata con successo! Ricaricamento in corso...',
        });
        setTimeout(() => {
          onRestoreSuccess();
          onClose();
        }, 1200);
      } catch (err: any) {
        setMessage({
          type: 'error',
          text: err.message || 'Errore durante l\'importazione del file JSON.',
        });
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setMessage({ type: 'error', text: 'Impossibile leggere il file selezionato.' });
      setIsImporting(false);
    };

    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 text-slate-800 dark:text-slate-100 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 bg-sky-500/10 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 rounded-xl">
            <FileJson className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {t('backup.modal_title') || 'Backup & Ripristino Plancia'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('backup.modal_desc') || 'Esporta o ripristina con 1 click la topologia, le coordinate e le dipendenze in formato JSON.'}
            </p>
          </div>
        </div>

        {message && (
          <div
            className={`p-3.5 mb-5 rounded-xl border flex items-center gap-3 text-xs font-medium animate-in fade-in ${
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            )}
            <span className="flex-1">{message.text}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Download Backup */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Download className="w-4 h-4 text-sky-500" />
                {t('backup.export_title') || 'Esporta Backup JSON'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('backup.export_hint') || 'Scarica un file contenente tutti i dispositivi, link e layout correnti.'}
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-sm transition flex items-center gap-2 shrink-0 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('common.loading') || 'Esportazione...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>{t('backup.btn_export') || 'Scarica JSON'}</span>
                </>
              )}
            </button>
          </div>

          {/* Upload Restore */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-500" />
                {t('backup.import_title') || 'Ripristina da File JSON'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('backup.import_hint') || 'Carica un file di backup precedente per sovrascrivere o ripristinare la plancia.'}
              </div>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-sm transition flex items-center gap-2 shrink-0 cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{t('common.loading') || 'Ripristino...'}</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t('backup.btn_import') || 'Carica JSON'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            {t('common.close') || 'Chiudi'}
          </button>
        </div>
      </div>
    </div>
  );
};
