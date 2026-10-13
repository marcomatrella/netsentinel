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
  const [recurrenceType, setRecurrenceType] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('none');
  const [startDt, setStartDt] = useState<string>('');
  const [endDt, setEndDt] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('04:00');
  const [endTime, setEndTime] = useState<string>('04:30');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
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
      setStartTime('04:00');
      setEndTime('04:30');
      setRecurrenceType('none');
      setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
      setDayOfMonth(now.getDate());
      setRecurrenceEndDate('');
      setTitle('');
      setNotes('');
      setIsCreating(false);
    }
  }, [isOpen, preselectedDeviceId]);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let startIso = '';
    let endIso = '';
    let recEndIso: string | null = null;

    if (recurrenceType === 'none') {
      if (!startDt || !endDt) return;
      const startDate = new Date(startDt);
      const endDate = new Date(endDt);

      if (endDate <= startDate) {
        alert('La data di fine deve essere successiva alla data di inizio.');
        return;
      }

      // Check duration: if > 4 hours, warn user with confirmation
      const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      if (durationHours > 4) {
        const formattedHours = Math.round(durationHours * 10) / 10;
        const confirmLong = confirm(
          t('maintenance.long_duration_warning', { hours: formattedHours }) ||
          `Attenzione: questo intervento dura ${formattedHours} ore. Durante tutto questo periodo gli allarmi saranno soppressi. Sei sicuro di voler proseguire?`
        );
        if (!confirmLong) return;
      }
      startIso = startDate.toISOString();
      endIso = endDate.toISOString();
    } else {
      // Recurring window: startDt acts as effective start date, startTime and endTime define daily slot
      if (!startTime || !endTime) {
        alert('Specificare sia l\'ora di inizio che l\'ora di fine per la ricorrenza.');
        return;
      }
      // If startDt not set, start from today
      const baseDate = startDt ? new Date(startDt) : new Date();
      startIso = baseDate.toISOString();
      // endIso dummy or 1 year ahead
      const farFuture = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000);
      endIso = farFuture.toISOString();

      if (recurrenceEndDate) {
        const red = new Date(recurrenceEndDate);
        red.setHours(23, 59, 59, 999);
        recEndIso = red.toISOString();
      }
    }

    setSubmitting(true);
    try {
      await createScheduledMaintenance({
        title: title.trim(),
        device_id: targetDeviceId === 'global' ? null : targetDeviceId,
        start_ts: startIso,
        end_ts: endIso,
        recurrence_type: recurrenceType,
        start_time: recurrenceType !== 'none' ? startTime : null,
        end_time: recurrenceType !== 'none' ? endTime : null,
        days_of_week: recurrenceType === 'weekly' ? selectedDays.sort().join(',') : null,
        day_of_month: recurrenceType === 'monthly' ? dayOfMonth : null,
        recurrence_end_date: recEndIso,
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

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

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
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
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
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center gap-1.5 shadow-md shadow-purple-500/20 transition cursor-pointer"
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
                    placeholder={t('maintenance.title_placeholder') || 'es. Riavvio notturno o backup'}
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

              {/* Recurrence Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  {t('maintenance.field_recurrence') || 'Tipo di Intervento / Ricorrenza'}
                </label>
                <select
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value as any)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-medium"
                >
                  <option value="none">{t('maintenance.rec_none') || 'Puntuale (Data e ora fissa)'}</option>
                  <option value="daily">{t('maintenance.rec_daily') || 'Giornaliera (Ogni giorno)'}</option>
                  <option value="weekly">{t('maintenance.rec_weekly') || 'Settimanale (Giorni specifici)'}</option>
                  <option value="monthly">{t('maintenance.rec_monthly') || 'Mensile (Giorno del mese)'}</option>
                  <option value="yearly">{t('maintenance.rec_yearly') || 'Annuale (Ogni anno)'}</option>
                </select>
              </div>

              {/* One-off inputs */}
              {recurrenceType === 'none' ? (
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
              ) : (
                /* Recurring Inputs */
                <div className="space-y-3 p-3 bg-purple-100/50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/60">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-500" />
                        <span>{t('maintenance.field_start_time') || 'Ora Inizio'} *</span>
                      </label>
                      <input
                        type="time"
                        required
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-purple-500" />
                        <span>{t('maintenance.field_end_time') || 'Ora Fine'} *</span>
                      </label>
                      <input
                        type="time"
                        required
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Weekly Days selection */}
                  {recurrenceType === 'weekly' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('maintenance.field_days_of_week') || 'Giorni della settimana'}
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {dayLabels.map((label, idx) => {
                          const active = selectedDays.includes(idx);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() => {
                                if (active) {
                                  if (selectedDays.length > 1) {
                                    setSelectedDays(selectedDays.filter((d) => d !== idx));
                                  }
                                } else {
                                  setSelectedDays([...selectedDays, idx]);
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                active
                                  ? 'bg-purple-600 text-white shadow-sm'
                                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Monthly Day of month */}
                  {recurrenceType === 'monthly' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        {t('maintenance.field_day_of_month') || 'Giorno del mese (1-31)'}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        required
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, parseInt(e.target.value) || 1)))}
                        className="w-28 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                      />
                    </div>
                  )}

                  {/* Recurrence End Date (Optional) */}
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      {t('maintenance.field_recurrence_end') || 'Fine Ricorrenza (Opzionale - vuoto = perenne)'}
                    </label>
                    <input
                      type="date"
                      value={recurrenceEndDate}
                      onChange={(e) => setRecurrenceEndDate(e.target.value)}
                      className="w-full sm:w-64 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono"
                    />
                  </div>
                </div>
              )}

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
                  className="px-3 py-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                >
                  {t('edit_bar.cancel') || 'Annulla'}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow transition flex items-center gap-1.5 cursor-pointer"
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
                const isRec = win.recurrence_type && win.recurrence_type !== 'none';

                // Check active status
                let isCurrent = false;
                let isPast = false;

                if (!isRec) {
                  isCurrent = now >= sDate && now <= eDate;
                  isPast = now > eDate;
                } else {
                  // Recurring window
                  const recEnd = win.recurrence_end_date ? new Date(win.recurrence_end_date) : null;
                  if (now < sDate) {
                    isPast = false;
                  } else if (recEnd && now > recEnd) {
                    isPast = true;
                  } else if (win.start_time && win.end_time) {
                    const [sh, sm] = win.start_time.split(':').map(Number);
                    const [eh, em] = win.end_time.split(':').map(Number);
                    const curMin = now.getUTCHours() * 60 + now.getUTCMinutes();
                    const sMin = sh * 60 + sm;
                    const eMin = eh * 60 + em;
                    let timeMatch = false;
                    if (sMin <= eMin) {
                      timeMatch = curMin >= sMin && curMin <= eMin;
                    } else {
                      timeMatch = curMin >= sMin || curMin <= eMin;
                    }

                    if (timeMatch) {
                      if (win.recurrence_type === 'daily') {
                        isCurrent = true;
                      } else if (win.recurrence_type === 'weekly' && win.days_of_week) {
                        const days = win.days_of_week.split(',').map(Number);
                        const curDay = (now.getUTCDay() + 6) % 7; // Convert Sun=0 to Mon=0
                        isCurrent = days.includes(curDay);
                      } else if (win.recurrence_type === 'monthly') {
                        const dom = win.day_of_month || sDate.getUTCDate();
                        isCurrent = now.getUTCDate() === dom;
                      } else if (win.recurrence_type === 'yearly') {
                        isCurrent = now.getUTCMonth() === sDate.getUTCMonth() && now.getUTCDate() === sDate.getUTCDate();
                      }
                    }
                  }
                }

                // Recurrence human description
                const getRecurrenceText = () => {
                  if (!isRec) {
                    return `${formatDateTime(sDate, language)} → ${formatDateTime(eDate, language)}`;
                  }
                  const st = win.start_time || '00:00';
                  const et = win.end_time || '00:00';
                  const timeRange = `${st} - ${et} UTC`;
                  let desc = '';
                  if (win.recurrence_type === 'daily') {
                    desc = t('maintenance.rec_every_day', { start: st, end: et }) || `Tutti i giorni dalle ${timeRange}`;
                  } else if (win.recurrence_type === 'weekly') {
                    const days = (win.days_of_week || '')
                      .split(',')
                      .map((d) => dayLabels[parseInt(d)])
                      .filter(Boolean)
                      .join(', ');
                    desc = t('maintenance.rec_weekly_desc', { days, start: st, end: et }) || `Ogni settimana (${days}) ${timeRange}`;
                  } else if (win.recurrence_type === 'monthly') {
                    desc = t('maintenance.rec_monthly_desc', { day: win.day_of_month || sDate.getDate(), start: st, end: et }) || `Giorno ${win.day_of_month || sDate.getDate()} del mese ${timeRange}`;
                  } else if (win.recurrence_type === 'yearly') {
                    desc = t('maintenance.rec_yearly_desc', { date: `${sDate.getDate()}/${sDate.getMonth() + 1}`, start: st, end: et }) || `Annuale (${sDate.getDate()}/${sDate.getMonth() + 1}) ${timeRange}`;
                  }
                  if (win.recurrence_end_date) {
                    desc += ` (Fino al ${new Date(win.recurrence_end_date).toLocaleDateString()})`;
                  }
                  return desc;
                };

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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          {win.title}
                        </span>
                        {isRec && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">
                            {t('maintenance.rec_badge') || 'Ricorrente'} ({win.recurrence_type})
                          </span>
                        )}
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
                        <span className="font-mono text-slate-600 dark:text-slate-300">
                          {getRecurrenceText()}
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
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0 cursor-pointer"
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
