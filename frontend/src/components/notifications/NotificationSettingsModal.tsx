import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Clock,
  ShieldAlert,
  Server,
  Key,
  AtSign,
  Settings,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  fetchNotificationChannels,
  saveNotificationChannel,
  deleteNotificationChannel,
  testNotificationConfig,
  fetchNotificationLogs,
} from '../../api/client';
import { useTranslation } from '../../i18n/I18nContext';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

  // Channel configuration state
  const [channelId, setChannelId] = useState<string>('smtp-primary');
  const [channelName, setChannelName] = useState<string>('Server Notifiche SMTP');
  const [enabled, setEnabled] = useState<boolean>(true);

  // SMTP Settings
  const [host, setHost] = useState<string>('');
  const [port, setPort] = useState<number>(587);
  const [security, setSecurity] = useState<'starttls' | 'ssl' | 'none'>('starttls');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [fromAddr, setFromAddr] = useState<string>('netsentinel@local');

  // Recipients
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipientInput, setNewRecipientInput] = useState<string>('');

  // Rules & Quiet Hours
  const [minSeverity, setMinSeverity] = useState<'all' | 'warn' | 'crit'>('warn');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const [quietStart, setQuietStart] = useState<string>('23:00');
  const [quietEnd, setQuietEnd] = useState<string>('07:00');
  const [allowCriticalInQuiet, setAllowCriticalInQuiet] = useState<boolean>(true);

  // Status & feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Load existing channel if available
  const loadChannelData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const channels = await fetchNotificationChannels();
      const smtpCh = channels.find((c: any) => c.type === 'smtp') || channels[0];
      if (smtpCh) {
        setChannelId(smtpCh.id);
        setChannelName(smtpCh.name || 'Server Notifiche SMTP');
        setEnabled(smtpCh.enabled ?? true);
        setMinSeverity(smtpCh.min_severity || 'warn');

        const cfg = smtpCh.config || {};
        setHost(cfg.host || '');
        setPort(cfg.port || 587);
        if (cfg.use_tls) {
          setSecurity('ssl');
        } else if (cfg.start_tls !== false) {
          setSecurity('starttls');
        } else {
          setSecurity('none');
        }
        setUsername(cfg.username || '');
        setPassword(cfg.password || '');
        setFromAddr(cfg.from_addr || 'netsentinel@local');

        let rawAddrs = cfg.to_addrs;
        if (typeof rawAddrs === 'string') {
          rawAddrs = rawAddrs.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
        setRecipients(Array.isArray(rawAddrs) ? rawAddrs : []);

        const qh = smtpCh.quiet_hours || {};
        setQuietHoursEnabled(qh.enabled ?? false);
        setQuietStart(qh.start || '23:00');
        setQuietEnd(qh.end || '07:00');
        setAllowCriticalInQuiet(qh.allow_critical ?? true);
      }
    } catch (err: any) {
      console.warn('Impossibile caricare configurazione esistente:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const logsData = await fetchNotificationLogs(30);
      setLogs(logsData);
    } catch (err) {
      console.warn('Impossibile caricare i log:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadChannelData();
      setTestResult(null);
      setSaveSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen, loadChannelData]);

  if (!isOpen) return null;

  // Add recipient handler
  const handleAddRecipient = () => {
    const trimmed = newRecipientInput.trim();
    if (!trimmed) return;

    // Check multiple emails separated by commas or spaces
    const parts = trimmed.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const validEmails = parts.filter((email) => email.includes('@') && email.includes('.'));

    if (validEmails.length === 0) {
      setErrorMsg('Inserisci un indirizzo email valido (es. nome@dominio.it)');
      return;
    }

    setRecipients((prev) => {
      const set = new Set([...prev, ...validEmails]);
      return Array.from(set);
    });
    setNewRecipientInput('');
    setErrorMsg(null);
  };

  const handleRemoveRecipient = (email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email));
  };

  // Quick preset selector
  const applyPreset = (preset: 'gmail' | 'outlook' | 'brevo' | 'mailgun' | 'relay') => {
    setErrorMsg(null);
    setTestResult(null);
    switch (preset) {
      case 'gmail':
        setHost('smtp.gmail.com');
        setPort(587);
        setSecurity('starttls');
        if (!fromAddr || fromAddr === 'netsentinel@local') setFromAddr('tuonome@gmail.com');
        break;
      case 'outlook':
        setHost('smtp.office365.com');
        setPort(587);
        setSecurity('starttls');
        break;
      case 'brevo':
        setHost('smtp-relay.brevo.com');
        setPort(587);
        setSecurity('starttls');
        break;
      case 'mailgun':
        setHost('smtp.mailgun.org');
        setPort(587);
        setSecurity('starttls');
        break;
      case 'relay':
        setHost('192.168.1.1');
        setPort(25);
        setSecurity('none');
        setUsername('');
        setPassword('');
        break;
    }
  };

  // Test current SMTP configuration
  const handleTestNotification = async () => {
    setErrorMsg(null);
    setTestResult(null);
    setSaveSuccessMsg(null);

    if (!host) {
      setErrorMsg('Specificare l\'host del server SMTP prima di eseguire il test.');
      return;
    }

    const testAddrs = recipients.length > 0 
      ? recipients 
      : (newRecipientInput.trim() ? [newRecipientInput.trim()] : []);

    if (testAddrs.length === 0) {
      setErrorMsg('Specificare almeno un indirizzo email di destinazione nei destinatari.');
      return;
    }

    setTesting(true);
    try {
      const payload = {
        channel_id: channelId,
        type: 'smtp',
        config: {
          host,
          port: Number(port),
          use_tls: security === 'ssl',
          start_tls: security === 'starttls',
          username: username.trim() || null,
          password: password || undefined,
          from_addr: fromAddr.trim() || 'netsentinel@local',
          to_addrs: testAddrs,
        },
      };

      const res = await testNotificationConfig(payload);
      setTestResult({
        success: true,
        message: res.message || `Mail di prova inviata con successo a ${testAddrs.join(', ')}!`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Errore durante la connessione o l\'invio SMTP.',
      });
    } finally {
      setTesting(false);
    }
  };

  // Save channel configuration
  const handleSave = async () => {
    setErrorMsg(null);
    setSaveSuccessMsg(null);
    setTestResult(null);

    if (!host) {
      setErrorMsg('Specificare l\'host del server SMTP.');
      return;
    }

    const finalRecipients = [...recipients];
    if (newRecipientInput.trim() && newRecipientInput.includes('@')) {
      finalRecipients.push(newRecipientInput.trim());
      setRecipients(finalRecipients);
      setNewRecipientInput('');
    }

    if (finalRecipients.length === 0) {
      setErrorMsg('Inserisci almeno un destinatario per ricevere le notifiche.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: channelId || 'smtp-primary',
        name: channelName || 'Server Notifiche SMTP',
        type: 'smtp',
        enabled,
        min_severity: minSeverity,
        config: {
          host: host.trim(),
          port: Number(port),
          use_tls: security === 'ssl',
          start_tls: security === 'starttls',
          username: username.trim() || null,
          password: password || undefined,
          from_addr: fromAddr.trim() || 'netsentinel@local',
          to_addrs: finalRecipients,
        },
        quiet_hours: {
          enabled: quietHoursEnabled,
          start: quietStart,
          end: quietEnd,
          allow_critical: allowCriticalInQuiet,
        },
      };

      await saveNotificationChannel(payload);
      setSaveSuccessMsg('Configurazione salvata con successo nel database.');
      setTimeout(() => {
        setSaveSuccessMsg(null);
      }, 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Errore durante il salvataggio della configurazione.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                {t('notifications.modal_title')}
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 font-semibold">
                  {t('notifications.modal_badge')}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('notifications.modal_desc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-700/60 flex text-xs">
              <button
                onClick={() => setActiveTab('config')}
                className={`px-3 py-1 rounded-md font-medium transition ${
                  activeTab === 'config'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t('notifications.tab_config')}
              </button>
              <button
                onClick={() => {
                  setActiveTab('logs');
                  loadLogs();
                }}
                className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                  activeTab === 'logs'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t('notifications.tab_logs')}</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Top Feedback Messages */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-950/50 border border-rose-800 text-rose-200 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <strong>Attenzione:</strong> {errorMsg}
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="p-3.5 bg-emerald-950/50 border border-emerald-800 text-emerald-200 rounded-xl text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-in fade-in ${
                testResult.success
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-100'
                  : 'bg-rose-950/60 border-rose-700 text-rose-100'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div className="font-bold text-sm mb-1">
                  {testResult.success ? 'Invio Email Riuscito!' : 'Invio Email Fallito'}
                </div>
                <div>{testResult.message}</div>
                {testResult.success && (
                  <div className="mt-2 text-[11px] text-emerald-300/80">
                    Controlla la tua casella di posta elettronica (anche nella cartella spam/posta indesiderata se è il primo invio) per visualizzare il report HTML completo.
                  </div>
                )}
              </div>
              <button
                onClick={() => setTestResult(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'config' ? (
            <div className="space-y-6">
              {/* Presets banner */}
              <div className="p-4 bg-slate-850/80 border border-slate-700/70 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Preimpostazioni rapide provider:
                  </span>
                  <span className="text-[11px] text-slate-500">Compila automaticamente host, porta e sicurezza</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => applyPreset('gmail')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition"
                  >
                    Gmail (smtp.gmail.com)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('outlook')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition"
                  >
                    Outlook / 365
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('mailgun')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition"
                  >
                    Mailgun
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('brevo')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition"
                  >
                    Brevo (Sendinblue)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('relay')}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium transition"
                  >
                    Relay Locale (Porta 25)
                  </button>
                </div>
              </div>

              {/* Section 1: Server SMTP */}
              <div className="p-5 bg-slate-850/50 border border-slate-700/60 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-bold text-slate-200">1. Parametri Connessione Server SMTP</h3>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => setEnabled(e.target.checked)}
                      className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500"
                    />
                    <span>Canale Abilitato</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Host Server SMTP *
                    </label>
                    <input
                      type="text"
                      placeholder="es. smtp.gmail.com o mail.tuodominio.it"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Porta *
                    </label>
                    <input
                      type="number"
                      placeholder="587"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Crittografia / Sicurezza
                    </label>
                    <select
                      value={security}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setSecurity(val);
                        if (val === 'ssl' && port === 587) setPort(465);
                        if (val === 'starttls' && port === 465) setPort(587);
                        if (val === 'none' && (port === 587 || port === 465)) setPort(25);
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="starttls">STARTTLS (Consigliata, Porta 587)</option>
                      <option value="ssl">SSL / TLS Implicito (Porta 465)</option>
                      <option value="none">Nessuna (In chiaro, Porta 25)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Nome Utente / Username
                    </label>
                    <input
                      type="text"
                      placeholder="es. noreply@dominio.it"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Password / App Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder={password === '******' ? '•••••••• (salvata)' : 'Password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3 py-2 pr-9 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-slate-200"
                        title={showPassword ? 'Nascondi password' : 'Mostra password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Indirizzo Mittente (From) *
                  </label>
                  <input
                    type="text"
                    placeholder="NetSentinel Monitor <netsentinel@tuodominio.it>"
                    value={fromAddr}
                    onChange={(e) => setFromAddr(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Alcuni provider (come Gmail o Microsoft 365) richiedono che il mittente coincida con l'utente autenticato.
                  </span>
                </div>
              </div>

              {/* Section 2: Destinatari Notifiche */}
              <div className="p-5 bg-slate-850/50 border border-slate-700/60 rounded-xl space-y-4">
                <div className="border-b border-slate-700/60 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AtSign className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-slate-200">2. Destinatari delle Notifiche</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">
                    {recipients.length} destinatari configurati
                  </span>
                </div>

                {/* Add recipient input */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Aggiungi Indirizzo Email Destinatario
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="es. admin@tuodominio.it (premi Invio per aggiungere)"
                      value={newRecipientInput}
                      onChange={(e) => setNewRecipientInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecipient();
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddRecipient}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Aggiungi</span>
                    </button>
                  </div>
                </div>

                {/* Recipient tags list */}
                {recipients.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {recipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/60 border border-emerald-700/80 text-emerald-200 text-xs font-mono font-medium shadow-sm"
                      >
                        <Mail className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipient(email)}
                          className="hover:text-rose-400 transition"
                          title="Rimuovi destinatario"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-900/60 border border-dashed border-slate-700 rounded-lg text-center text-xs text-slate-400">
                    Nessun destinatario configurato. Inserisci almeno un indirizzo email sopra.
                  </div>
                )}

                {/* Severity & Quiet Hours */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Severità Minima per Invio Email
                    </label>
                    <select
                      value={minSeverity}
                      onChange={(e: any) => setMinSeverity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
                    >
                      <option value="all">Tutti gli eventi (Inclusi avvisi informativi)</option>
                      <option value="warn">Avvisi e Critici (Consigliato per Home Lab)</option>
                      <option value="crit">Solo Allarmi Critici (Es. Gateway o Switch down)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 pt-1">
                      <input
                        type="checkbox"
                        checked={quietHoursEnabled}
                        onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-sky-500 focus:ring-sky-500"
                      />
                      <span className="font-semibold">Attiva Orario di Silenzio (Quiet Hours)</span>
                    </label>

                    {quietHoursEnabled && (
                      <div className="pl-6 space-y-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-400">Dalle</span>
                          <input
                            type="time"
                            value={quietStart}
                            onChange={(e) => setQuietStart(e.target.value)}
                            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                          />
                          <span className="text-slate-400">alle</span>
                          <input
                            type="time"
                            value={quietEnd}
                            onChange={(e) => setQuietEnd(e.target.value)}
                            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200"
                          />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={allowCriticalInQuiet}
                            onChange={(e) => setAllowCriticalInQuiet(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-amber-500 focus:ring-amber-500"
                          />
                          <span>Consenti comunque allarmi se l'incidente è CRITICO</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Logs Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">
                  Ultimi 30 eventi di notifica inviati o tentati
                </span>
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={loadingLogs}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>Aggiorna</span>
                </button>
              </div>

              {logs.length > 0 ? (
                <div className="border border-slate-700/80 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-850 text-slate-400 border-b border-slate-700/80">
                      <tr>
                        <th className="p-3">Data / Ora</th>
                        <th className="p-3">Stato</th>
                        <th className="p-3">Oggetto / Notifica</th>
                        <th className="p-3">Dettagli / Errore</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                      {logs.map((log) => {
                        const isSent = log.status === 'sent';
                        const isFailed = log.status === 'failed';
                        const isSuppressed = log.status.startsWith('suppressed');
                        const isPending = log.status === 'pending_wan';

                        let badgeColor = 'bg-slate-700 text-slate-300';
                        let label = log.status;
                        if (isSent) {
                          badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
                          label = 'Inviata';
                        } else if (isFailed) {
                          badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/30';
                          label = 'Fallita';
                        } else if (isSuppressed) {
                          badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                          label = 'Silenziata';
                        } else if (isPending) {
                          badgeColor = 'bg-sky-500/20 text-sky-300 border-sky-500/30';
                          label = 'In Coda WAN';
                        }

                        return (
                          <tr key={log.id} className="hover:bg-slate-800/40">
                            <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                              {new Date(log.ts).toLocaleString('it-IT')}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
                              >
                                {label}
                              </span>
                            </td>
                            <td className="p-3 font-medium text-slate-200">
                              {log.payload_summary || 'Notifica'}
                            </td>
                            <td className="p-3 text-slate-400 font-mono text-[11px]">
                              {log.error_message || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                  Nessuna notifica registrata finora.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-850 border-t border-slate-700/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Info className="w-4 h-4 text-sky-400 shrink-0" />
            <span>{t('notifications.footer_hint')}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Test button */}
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={testing || saving || !host}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-sky-500/30 hover:border-sky-500/60 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <Send className={`w-3.5 h-3.5 text-sky-400 ${testing ? 'animate-bounce' : ''}`} />
              <span>{testing ? t('notifications.testing_btn') : t('notifications.test_btn')}</span>
            </button>

            {/* Save button */}
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || testing}
              className="px-5 py-2 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? t('common.saving') : t('notifications.save_btn')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

