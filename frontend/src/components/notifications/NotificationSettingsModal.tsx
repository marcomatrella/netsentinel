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
  Bell,
  Smartphone,
  Check,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import {
  fetchNotificationChannels,
  saveNotificationChannel,
  deleteNotificationChannel,
  testNotificationConfig,
  fetchNotificationLogs,
} from '../../api/client';
import { useTranslation } from '../../i18n/I18nContext';
import { formatDateTime } from '../../utils/date';
import {
  isWebPushSupported,
  getPushPermission,
  getWebPushSettings,
  saveWebPushSettings,
  requestPushPermission,
  sendTestWebPush,
  WebPushSettings,
} from '../../utils/webPush';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'email' | 'push' | 'logs'>('email');

  // Channel configuration state (SMTP)
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

  // Web Push Settings state
  const [pushSupported, setPushSupported] = useState<boolean>(true);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
  const [pushSettings, setPushSettings] = useState<WebPushSettings>(getWebPushSettings());
  const [pushTesting, setPushTesting] = useState<boolean>(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);

  // Check push state
  const refreshPushState = useCallback(() => {
    const supported = isWebPushSupported();
    setPushSupported(supported);
    if (supported) {
      setPushPermission(getPushPermission());
      setPushSettings(getWebPushSettings());
    }
  }, []);

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
      refreshPushState();
      setTestResult(null);
      setSaveSuccessMsg(null);
      setErrorMsg(null);
      setPushMessage(null);
    }
  }, [isOpen, loadChannelData, refreshPushState]);

  if (!isOpen) return null;

  // Add recipient handler
  const handleAddRecipient = () => {
    const trimmed = newRecipientInput.trim();
    if (!trimmed) return;

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

  // Push notification handlers
  const handleRequestPushPermission = async () => {
    try {
      const perm = await requestPushPermission();
      setPushPermission(perm);
      if (perm === 'granted') {
        setPushSettings(getWebPushSettings());
        setPushMessage('Notifiche push autorizzate con successo!');
      } else if (perm === 'denied') {
        setPushMessage('Permesso negato nel browser. Sbloccalo nelle impostazioni del sito.');
      }
    } catch (err: any) {
      setPushMessage(err.message || 'Errore nella richiesta di autorizzazione.');
    }
  };

  const handleTogglePushSetting = (key: keyof WebPushSettings) => {
    const updated = saveWebPushSettings({ [key]: !pushSettings[key] });
    setPushSettings(updated);
  };

  const handleTestPush = async () => {
    setPushTesting(true);
    setPushMessage(null);
    try {
      const success = await sendTestWebPush();
      if (success) {
        setPushMessage('Notifica push di prova inviata al tuo browser!');
      } else {
        setPushMessage('Impossibile inviare la notifica: verifica che le notifiche siano consentite.');
      }
    } catch (err: any) {
      setPushMessage(err.message || 'Errore durante l\'invio della notifica di prova.');
    } finally {
      setPushTesting(false);
    }
  };

  // Save current SMTP configuration to backend
  const handleSave = async () => {
    setErrorMsg(null);
    setSaveSuccessMsg(null);
    setTestResult(null);

    const finalRecipients = [...recipients];
    if (newRecipientInput.trim()) {
      const parts = newRecipientInput.trim().split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (p.includes('@') && !finalRecipients.includes(p)) {
          finalRecipients.push(p);
        }
      }
    }

    if (enabled && finalRecipients.length === 0) {
      setErrorMsg('Aggiungi almeno un indirizzo email di destinazione prima di salvare.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        id: channelId,
        name: channelName,
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="px-3.5 py-3 sm:px-6 sm:py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-700/80 shrink-0">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 truncate">
                  <span className="truncate">Notifiche di Rete</span>
                  <span className="text-[10px] sm:text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/30 font-semibold shrink-0">
                    Email & PWA Push
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 hidden xs:block truncate">
                  Configura gli alert automatici via e-mail o notifiche istantanee del browser
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Desktop Tab switch */}
              <div className="hidden sm:flex bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-700/60 text-xs">
                <button
                  onClick={() => setActiveTab('email')}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                    activeTab === 'email'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>{t('notifications.tab_email')}</span>
                </button>
                <button
                  onClick={() => setActiveTab('push')}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                    activeTab === 'push'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{t('notifications.tab_push')}</span>
                </button>
                <button
                  onClick={() => {
                    setActiveTab('logs');
                    loadLogs();
                  }}
                  className={`px-3 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                    activeTab === 'logs'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>{t('notifications.tab_logs')}</span>
                </button>
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-200/60 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition shrink-0 ml-1 cursor-pointer"
                title={t('common.close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Mobile Tabs */}
          <div className="flex sm:hidden mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg text-xs overflow-x-auto">
            <button
              onClick={() => setActiveTab('email')}
              className={`flex-1 min-w-[90px] py-1 rounded font-medium text-center transition flex items-center justify-center gap-1 ${
                activeTab === 'email'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Mail className="w-3 h-3" />
              <span>Email</span>
            </button>
            <button
              onClick={() => setActiveTab('push')}
              className={`flex-1 min-w-[90px] py-1 rounded font-medium text-center transition flex items-center justify-center gap-1 ${
                activeTab === 'push'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Push PWA</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('logs');
                loadLogs();
              }}
              className={`flex-1 min-w-[90px] py-1 rounded font-medium text-center transition flex items-center justify-center gap-1 ${
                activeTab === 'logs'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>Log</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm">
          
          {/* Messages & Alerts */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {saveSuccessMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {pushMessage && (
            <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-600 dark:text-sky-300 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0" />
              <span>{pushMessage}</span>
            </div>
          )}

          {/* TAB 1: EMAIL (SMTP) */}
          {activeTab === 'email' && (
            <div className="space-y-6">
              {/* Enable / Disable Switch */}
              <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-500" />
                    <span>Abilita Canale Notifiche Email</span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Invia un'email automatica al verificarsi di disconnessioni o incidenti
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Preset Rapidi Provider
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('gmail')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Google Gmail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('outlook')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Microsoft 365 / Outlook</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('brevo')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Brevo (Sendinblue)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('mailgun')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Mailgun</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('relay')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition flex items-center gap-1.5"
                  >
                    <span>Relay Locale Anonimo (Porta 25)</span>
                  </button>
                </div>
              </div>

              {/* Server Host & Port */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-400" />
                    <span>Host Server SMTP</span>
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="smtp.gmail.com o 192.168.1.1"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Porta
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Security & Authentication */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Crittografia
                  </label>
                  <select
                    value={security}
                    onChange={(e) => setSecurity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  >
                    <option value="starttls">STARTTLS (Porta 587 - Consigliato)</option>
                    <option value="ssl">SSL / TLS (Porta 465)</option>
                    <option value="none">Nessuna Crittografia (Porta 25)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <AtSign className="w-3.5 h-3.5 text-slate-400" />
                    <span>Username / Email</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="utente@gmail.com"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" />
                      <span>Password / App Token</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-slate-400 hover:text-slate-200 text-[11px]"
                    >
                      {showPassword ? 'Nascondi' : 'Mostra'}
                    </button>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Sender & Recipients */}
              <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Mittente (From Address)
                  </label>
                  <input
                    type="email"
                    value={fromAddr}
                    onChange={(e) => setFromAddr(e.target.value)}
                    placeholder="netsentinel@tuodominio.it"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Destinatari Email
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={newRecipientInput}
                      onChange={(e) => setNewRecipientInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecipient();
                        }
                      }}
                      placeholder="amministratore@rete.it"
                      className="flex-1 px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddRecipient}
                      className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl flex items-center gap-1.5 font-medium transition cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Aggiungi</span>
                    </button>
                  </div>

                  {/* List of recipients */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {recipients.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecipient(email)}
                          className="text-slate-400 hover:text-rose-500 transition"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                    {recipients.length === 0 && (
                      <p className="text-xs text-amber-500 italic">
                        Nessun destinatario configurato. Aggiungi almeno un'email.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Severity & Quiet Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                    Soglia Minima di Severità
                  </label>
                  <select
                    value={minSeverity}
                    onChange={(e) => setMinSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none text-xs"
                  >
                    <option value="crit">Solo Critici (Dispositivi o Gateway Down)</option>
                    <option value="warn">Warning e Critici (Latenza, Link flap, Degrado)</option>
                    <option value="all">Tutti gli eventi (Inclusi ripristini e reboot)</option>
                  </select>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Ore di Silenzio (Quiet Hours)
                    </label>
                    <input
                      type="checkbox"
                      checked={quietHoursEnabled}
                      onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                      className="rounded border-slate-700 text-sky-600 focus:ring-sky-500"
                    />
                  </div>
                  {quietHoursEnabled && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="time"
                        value={quietStart}
                        onChange={(e) => setQuietStart(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      />
                      <span className="text-slate-400 text-xs">fino a</span>
                      <input
                        type="time"
                        value={quietEnd}
                        onChange={(e) => setQuietEnd(e.target.value)}
                        className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PUSH NOTIFICATIONS (PWA / BROWSER) */}
          {activeTab === 'push' && (
            <div className="space-y-6">
              {/* Push Status Banner */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-50 to-sky-50/40 dark:from-slate-850 dark:to-slate-800 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-500 flex items-center justify-center shrink-0">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        {t('notifications.push_title')}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('notifications.push_desc')}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="shrink-0">
                    {!pushSupported ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {t('notifications.push_status_unsupported')}
                      </span>
                    ) : pushPermission === 'granted' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        {t('notifications.push_status_granted')}
                      </span>
                    ) : pushPermission === 'denied' ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {t('notifications.push_status_denied')}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                        {t('notifications.push_status_default')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Explicit Permission Request Button if not granted */}
                {pushSupported && pushPermission !== 'granted' && (
                  <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-sky-200 dark:border-sky-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      {pushPermission === 'denied' ? (
                        <span>
                          Le notifiche sono bloccate nelle autorizzazioni del browser. Clicca sull'icona delle impostazioni sito o del lucchetto accanto all'URL per consentirle.
                        </span>
                      ) : (
                        <span>
                          Per ricevere gli alert sul tuo dispositivo, devi consentire a NetSentinel l'invio delle notifiche di sistema.
                        </span>
                      )}
                    </div>

                    {pushPermission !== 'denied' && (
                      <button
                        type="button"
                        onClick={handleRequestPushPermission}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 shadow-md shadow-sky-500/20 cursor-pointer"
                      >
                        <Bell className="w-4 h-4" />
                        <span>{t('notifications.push_enable_btn')}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Push Preferences & Rules */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-sky-500" />
                  <span>Preferenze di Ricezione Push</span>
                </h4>

                <div className="space-y-2.5">
                  {/* Master Push Toggle */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        Attiva Notifiche Push su questo dispositivo
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Consente la visualizzazione degli avvisi locali
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={pushPermission !== 'granted'}
                        checked={pushSettings.enabled && pushPermission === 'granted'}
                        onChange={() => handleTogglePushSetting('enabled')}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600 peer-disabled:opacity-40"></div>
                    </label>
                  </div>

                  {/* Filter: Critical */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        Allarmi Critici (Dispositivi Down & Gateway Offline)
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Notifica immediata con massima priorità
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.notifyCritical}
                      onChange={() => handleTogglePushSetting('notifyCritical')}
                      className="rounded border-slate-700 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                    />
                  </div>

                  {/* Filter: Warning */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        Degrado e Warning (Latenza alta, Link flap)
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Avvisa in caso di instabilità senza caduta totale
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.notifyWarning}
                      onChange={() => handleTogglePushSetting('notifyWarning')}
                      className="rounded border-slate-700 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                    />
                  </div>

                  {/* Filter: Recovery */}
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        Ritorno Online e Risoluzione Incidenti
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Conferma quando la rete o un dispositivo torna pienamente operativo
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={pushSettings.notifyRecovery}
                      onChange={() => handleTogglePushSetting('notifyRecovery')}
                      className="rounded border-slate-700 text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* PWA Tips */}
              <div className="p-3.5 bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Suggerimento PWA:</strong> Puoi installare NetSentinel come applicazione autonoma sul tuo desktop o dispositivo mobile ("Aggiungi a schermata Home" su Chrome o Safari iOS 16.4+) per ricevere notifiche push native affidabili.
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                    Registro Invii Notifiche
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Ultime 30 notifiche elaborate o accodate dal server
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadLogs}
                  disabled={loadingLogs}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium transition flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
                  <span>Aggiorna</span>
                </button>
              </div>

              {loadingLogs ? (
                <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-sky-500" />
                  <span>Caricamento registro notifiche...</span>
                </div>
              ) : logs.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">Data e Ora</th>
                        <th className="p-3">Stato</th>
                        <th className="p-3">Oggetto / Notifica</th>
                        <th className="p-3">Dettagli / Errore</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900/60">
                      {logs.map((log) => {
                        const isSent = log.status === 'sent';
                        const isFailed = log.status === 'failed';
                        const isSuppressed = log.status?.startsWith('suppressed');
                        const isPending = log.status === 'pending_wan';

                        let badgeColor = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                        let label = log.status;
                        if (isSent) {
                          badgeColor = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
                          label = 'Inviata';
                        } else if (isFailed) {
                          badgeColor = 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/30';
                          label = 'Fallita';
                        } else if (isSuppressed) {
                          badgeColor = 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30';
                          label = 'Silenziata';
                        } else if (isPending) {
                          badgeColor = 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border-sky-500/30';
                          label = 'In Coda WAN';
                        }

                        return (
                          <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="p-3 font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                              {formatDateTime(log.ts, 'it-IT')}
                            </td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeColor}`}
                              >
                                {label}
                              </span>
                            </td>
                            <td className="p-3 font-medium text-slate-900 dark:text-slate-200">
                              {log.payload_summary || 'Notifica'}
                            </td>
                            <td className="p-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                              {log.error_message || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-300 dark:border-slate-800 rounded-xl">
                  Nessuna notifica registrata finora.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Info className="w-4 h-4 text-sky-500 shrink-0" />
            <span className="hidden sm:inline">
              {activeTab === 'email'
                ? t('notifications.footer_hint')
                : activeTab === 'push'
                ? 'Le preferenze push vengono memorizzate localmente su questo dispositivo.'
                : 'Registro sincronizzato con il database NetSentinel.'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {activeTab === 'email' && (
              <>
                <button
                  type="button"
                  onClick={handleTestNotification}
                  disabled={testing || saving || !host}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Send className={`w-3.5 h-3.5 ${testing ? 'animate-bounce' : ''}`} />
                  <span>{testing ? 'Invio in corso...' : 'Invia Email di Test'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || testing}
                  className="px-4 sm:px-5 py-2 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{saving ? t('common.saving') : t('notifications.save_btn')}</span>
                </button>
              </>
            )}

            {activeTab === 'push' && (
              <>
                <button
                  type="button"
                  onClick={handleTestPush}
                  disabled={pushTesting || pushPermission !== 'granted'}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-600 dark:text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>{pushTesting ? t('common.testing') : t('notifications.push_test_btn')}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 sm:px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-500/20 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Fatto</span>
                </button>
              </>
            )}

            {activeTab === 'logs' && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 sm:px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                {t('common.close')}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
