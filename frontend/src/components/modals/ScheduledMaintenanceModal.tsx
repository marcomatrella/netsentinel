import React, { useState, useEffect } from 'react';
import { X, Calendar, Plus, Trash2, Clock, Check, AlertCircle, Wrench, Shield, Globe } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, ScheduledMaintenanceWindow } from '../../types';
import { fetchScheduledMaintenance, createScheduledMaintenance, deleteScheduledMaintenance } from '../../api/client';
import { formatDateTime } from '../../utils/date';

interface ScheduledMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[];
  preselectedDeviceId?: string | null;
}

export const ScheduledMaintenanceModal: React.FC<ScheduledMaintenanceModalProps> = ({
  isOpen,
  onClose,
  devices,
  preselectedDeviceId = null,
}) => {
  const { t, language } = useTranslation();
  const [windows, setWindows] = useState<ScheduledMaintenanceWindow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // New slot form state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [targetDeviceId, setTargetDeviceId] = useState<string>(preselectedDeviceId || 'global');
  const [startDt, setStartDt] = useState<string>('');
  const [endDt, setEndDt] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const loadWindows = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchScheduledMaintenance();
      setWindows(data);
    } catch (err: any) {
      setError(err.message || 'Errore durante il caricamento delle finestre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadWindows();
      if (preselectedDeviceId) {
        setTargetDeviceId(preselectedDeviceId);
      } else {
        setTargetDeviceId('global');
      }
      // Default dates: now + 5 min, duration 30 min
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const toLocalInput = (d: Date) => {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      const s = new Date(now.getTime() + 5 * 60 * 1000);
      const e = new Date(s.getTime() + 30 * 60 * 1000);
      setStartDt(toLocalInput(s));
      setEndDt(toLocalInput(e));
      setTitle('');
      setNotes('');
      setIsCreating(false);
    }
  }, [isOpen, preselectedDeviceId]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !startDt || !endDt) return;

    setSubmitting(true);
    try {
      const startIso = new Date(startDt).toISOString();
      const endIso = new Date(endDt).toISOString();
      await createScheduledMaintenance({
        title: title.trim(),
        device_id: targetDeviceId === 'global' ? null : targetDeviceId,
        start_ts: startIso,
        end_ts: endIso,
        notes: notes.trim(),
      });
      await loadWindows();
      setIsCreating(false);
      setTitle('');
      setNotes('');
    } catch (err: any) {
      alert(err.message || 'Errore durante la creazione.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('maintenance.confirm_delete') || 'Rimuovere questo slot di manutenzione programmata?')) return;
    try {
      await deleteScheduledMaintenance(id);
      setWindows((prev) => prev.filter((w) => w.id !== id));
    } catch (err: any) {
      alert(err.message || 'Errore durante l\'eliminazione.');
    }
  };

  const devMap = new Map(devices.map((d) => [d.id, d]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden transition-colors">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>{t('maintenance.modal_title') || 'Manutenzioni Programmate & Riavvii'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 font-mono font-bold">
                  {windows.length}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('maintenance.modal_desc') || 'Pianifica slot in cui i dispositivi possono andare offline senza generare allarmi.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <div className="text-slate-600 dark:text-slate-400 font-medium">
              {t('maintenance.active_slots_title') || 'Slot temporali registrati'}
            </div>
            {!isCreating && (
              <button
                type="button"
                onClick={() => setIsCreating(true)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-md shadow-purple-500/20 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('maintenance.btn_add_slot') || 'Nuovo Intervento'}</span>
              </button>
            )}
          </div>

          {/* New Slot Inline Form */}
          {isCreating && (
            <form onSubmit={handleCreate} className="p-4 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20 space-y-3 animate-in fade-in zoom-in-95">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 pb-2 border-b border-purple-100 dark:border-purple-900/50">
                <Wrench className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>{t('maintenance.form_title') || 'Definisci Nuovo Slot Programmato'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('maintenance.field_title') || 'Titolo / Motivo'} *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('maintenance.title_placeholder') || 'es. Aggiornamento firmware switch core'}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('maintenance.field_target') || 'Destinatario Intervento'}
                  </label>
                  <select
                    value={targetDeviceId}
                    onChange={(e) => setTargetDeviceId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                  >
                    <option value="global">{t('maintenance.target_global') || '🌐 Globale (Tutta la Rete)'}</option>
                    <optgroup label={t('maintenance.devices_group') || 'Apparati Specifici'}>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} {d.addresses?.ip ? `(${d.addresses.ip})` : ''} [{d.kind}]
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('maintenance.field_start') || 'Data e Ora Inizio'} *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startDt}
                    onChange={(e) => setStartDt(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    {t('maintenance.field_end') || 'Data e Ora Fine'} *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endDt}
                    onChange={(e) => setEndDt(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('maintenance.field_notes') || 'Note Aggiuntive'}
                </label>
                <input
                  type="text"
                  placeholder={t('maintenance.notes_placeholder') || 'Eventuali dettagli tecnici o annotazioni'}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition"
                >
                  {t('edit_bar.cancel') || 'Annulla'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow transition flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Salvataggio...' : (t('maintenance.btn_confirm_slot') || 'Conferma Intervento')}</span>
                </button>
              </div>
            </form>
          )}

          {/* Slots List */}
          {loading ? (
            <div className="py-12 text-center text-slate-400">Caricamento interventi...</div>
          ) : windows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl space-y-2">
              <Calendar className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="font-medium">{t('maintenance.no_slots') || 'Nessun intervento programmato presente.'}</p>
              <p className="text-[11px] text-slate-500">
                {t('maintenance.no_slots_desc') || 'Gli apparati genereranno normali notifiche e allarmi in caso di disconnessione.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {windows.map((win) => {
                const targetDev = win.device_id ? devMap.get(win.device_id) : null;
                const isGlobal = !win.device_id;
                const now = new Date();
                const sDate = new Date(win.start_ts);
                const eDate = new Date(win.end_ts);
                const isCurrent = now >= sDate && now <= eDate;
                const isPast = now > eDate;

                return (
                  <div
                    key={win.id}
                    className={`p-3.5 rounded-xl border transition flex items-start justify-between gap-3 shadow-sm ${
                      isCurrent
                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800 ring-1 ring-purple-400/50'
                        : isPast
                        ? 'bg-slate-50 dark:bg-slate-850 border-slate-200 dark:border-slate-800 opacity-70'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {win.title}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-600 text-white animate-pulse">
                            {t('maintenance.status_in_progress') || 'IN CORSO ORA'}
                          </span>
                        )}
                        {isPast && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {t('maintenance.status_concluded') || 'Concluso'}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          {isGlobal ? (
                            <>
                              <Globe className="w-3.5 h-3.5 text-sky-500" />
                              <span>{t('maintenance.target_global') || 'Tutta la Rete'}</span>
                            </>
                          ) : (
                            <>
                              <Shield className="w-3.5 h-3.5 text-purple-500" />
                              <span>{targetDev ? `${targetDev.name} (${targetDev.addresses?.ip || targetDev.kind})` : win.device_id}</span>
                            </>
                          )}
                        </span>
                        <span>•</span>
                        <span className="font-mono">
                          {formatDateTime(sDate, language)} → {formatDateTime(eDate, language)}
                        </span>
                      </div>

                      {win.notes && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                          {win.notes}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDelete(win.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
                      title={t('maintenance.btn_delete_slot') || 'Elimina slot'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-purple-500" />
            <span>{t('maintenance.footer_hint') || 'Gli eventi durante questi intervalli vengono classificati come Critical Managed.'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold transition text-xs"
          >
            {t('edit_bar.cancel') || 'Chiudi'}
          </button>
        </div>

      </div>
    </div>
  );
};
