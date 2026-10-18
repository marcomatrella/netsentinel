import React, { useState } from 'react';
import {
  X,
  Radio,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Save,
  Sliders,
  Shield,
} from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Device, DeviceIntegration } from '../../types';
import { createCheck, updateCheck, testCheckParams, executeCheckNow } from '../../api/client';
import { IntegrationIcon } from '../common/IntegrationIcon';

interface ConfigureIntegrationModalProps {
  isOpen: boolean;
  device: Device;
  existingIntegration?: DeviceIntegration | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ConfigureIntegrationModal: React.FC<ConfigureIntegrationModalProps> = ({
  isOpen,
  device,
  existingIntegration,
  onClose,
  onSaved,
}) => {
  const { t } = useTranslation();
  const ip = device.addresses?.ip || '127.0.0.1';

  const [integrationType, setIntegrationType] = useState<string>(
    existingIntegration?.type || 'unifi'
  );
  const [unifiMode, setUnifiMode] = useState<'os' | 'legacy'>(
    existingIntegration?.params?.mode === 'legacy' ? 'legacy' : 'os'
  );

  const [url, setUrl] = useState<string>(
    existingIntegration?.params?.controller_url ||
      existingIntegration?.params?.adguard_url ||
      existingIntegration?.params?.ha_url ||
      ''
  );
  const [apiKey, setApiKey] = useState<string>(
    existingIntegration?.params?.api_key ||
      existingIntegration?.params?.access_token ||
      ''
  );
  const [username, setUsername] = useState<string>(
    existingIntegration?.params?.username || ''
  );
  const [password, setPassword] = useState<string>(
    existingIntegration?.params?.password || ''
  );
  const [site, setSite] = useState<string>(
    existingIntegration?.params?.site || 'default'
  );
  const [entityId, setEntityId] = useState<string>(
    existingIntegration?.params?.entity_id || ''
  );
  const [port, setPort] = useState<string>(
    String(existingIntegration?.params?.port || '5000')
  );
  const [useHttps, setUseHttps] = useState<boolean>(
    Boolean(existingIntegration?.params?.verify_ssl || existingIntegration?.params?.https)
  );

  const [mfaToken, setMfaToken] = useState<string>(
    existingIntegration?.params?.mfa_token || ''
  );
  const [isMfaRequired, setIsMfaRequired] = useState<boolean>(false);

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const buildCurrentParams = (): Record<string, any> => {
    switch (integrationType) {
      case 'unifi':
        return {
          mode: unifiMode,
          controller_url:
            url.trim() ||
            (unifiMode === 'os' ? `https://${ip}` : `https://${ip}:8443`),
          api_key: apiKey.trim() || undefined,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
          mfa_token: mfaToken.trim() || undefined,
          site: site.trim() || 'default',
          verify_ssl: useHttps,
        };
      case 'adguard_home':
        return {
          adguard_url: url.trim() || `http://${ip}:3000`,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
        };
      case 'home_assistant':
        return {
          ha_url: url.trim() || `http://${ip}:8123`,
          access_token: apiKey.trim() || undefined,
          entity_id: entityId.trim() || undefined,
        };
      case 'synology_dsm':
        return {
          host: ip,
          port: Number(port) || (useHttps ? 5001 : 5000),
          https: useHttps,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
        };
      default:
        return {};
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSaveError(null);
    try {
      const payloadParams = buildCurrentParams();
      const res = await testCheckParams({
        type: integrationType,
        target_address: ip,
        params: payloadParams,
        timeout_seconds: 6.0,
      });

      if (res.status === 'ok') {
        const msg = res.details?.name
          ? t('device_detail.test_success_matched', { name: res.details.name })
          : res.details?.total_devices !== undefined
          ? t('device_detail.test_success_controller', { count: res.details.total_devices })
          : t('device_detail.test_success');
        setTestResult({ ok: true, message: msg, details: res.details });
        setIsMfaRequired(false);
      } else {
        if (res.details?.mfa_required) {
          setIsMfaRequired(true);
        }
        const errMsg =
          res.details?.error || res.details?.warning || t('device_detail.test_failed_generic');
        setTestResult({ ok: false, message: errMsg, details: res.details });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || t('device_detail.test_failed_generic'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);

    try {
      const params = buildCurrentParams();
      let autoName = '';
      if (integrationType === 'unifi') autoName = 'UniFi Controller';
      else if (integrationType === 'adguard_home') autoName = 'AdGuard Home';
      else if (integrationType === 'home_assistant') autoName = 'Home Assistant';
      else if (integrationType === 'synology_dsm') autoName = 'Synology DSM';

      let checkId = existingIntegration?.id;
      if (checkId) {
        await updateCheck(checkId, {
          params,
          name: autoName,
          enabled: true,
        });
      } else {
        checkId = `chk-${device.id}-${integrationType}-${Date.now().toString(36)}`;
        await createCheck({
          id: checkId,
          device_id: device.id,
          type: integrationType,
          name: autoName,
          params,
          interval_seconds: 30,
          timeout_seconds: 6.0,
        });
      }

      // Trigger initial collection
      executeCheckNow(checkId).catch(() => {});

      onSaved();
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Errore salvataggio integrazione.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {existingIntegration
                  ? t('device_detail.edit_integration_title')
                  : t('device_detail.add_integration_title')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {device.name} ({ip})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSaving || isTesting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {saveError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Integration Type Picker (if not editing) */}
          {!existingIntegration && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                {t('device_detail.integration_type_label')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'unifi', name: 'Ubiquiti UniFi', desc: 'Controller / OS' },
                  { id: 'adguard_home', name: 'AdGuard Home', desc: 'DNS & Blocker' },
                  { id: 'home_assistant', name: 'Home Assistant', desc: 'Smart Home Hub' },
                  { id: 'synology_dsm', name: 'Synology DSM', desc: 'Storage NAS' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setIntegrationType(item.id);
                      setTestResult(null);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center gap-2.5 ${
                      integrationType === item.id
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                    }`}
                  >
                    <IntegrationIcon type={item.id} size={22} withBackground />
                    <div className="overflow-hidden">
                      <div className="font-bold text-xs truncate">{item.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{item.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Configuration Fields */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
            {integrationType === 'unifi' && (
              <div className="space-y-3">
                {/* Mode Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('device_detail.unifi_server_type_label')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUnifiMode('os');
                        setTestResult(null);
                      }}
                      className={`p-2.5 text-left rounded-xl border text-xs transition cursor-pointer ${
                        unifiMode === 'os'
                          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between text-[11px]">
                        <span>{t('device_detail.unifi_mode_os_title')}</span>
                        {unifiMode === 'os' && (
                          <span className="text-[9px] bg-sky-500 text-white px-1.5 py-0.2 rounded font-mono uppercase">
                            Attivo
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        {t('device_detail.unifi_mode_os_desc')}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setUnifiMode('legacy');
                        setTestResult(null);
                      }}
                      className={`p-2.5 text-left rounded-xl border text-xs transition cursor-pointer ${
                        unifiMode === 'legacy'
                          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between text-[11px]">
                        <span>{t('device_detail.unifi_mode_legacy_title')}</span>
                        {unifiMode === 'legacy' && (
                          <span className="text-[9px] bg-sky-500 text-white px-1.5 py-0.2 rounded font-mono uppercase">
                            Attivo
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        {t('device_detail.unifi_mode_legacy_desc')}
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_url_label')}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={
                      unifiMode === 'os'
                        ? 'https://192.168.1.1 o https://unifi.tuodominio.org'
                        : `https://${ip}:8443`
                    }
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t('device_detail.check_unifi_url_hint')}
                  </p>
                </div>

                {/* 1. API Key Box (Prominent & Recommended) */}
                <div className="p-3 bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {t('device_detail.check_unifi_api_key_label')}
                    </label>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                      {t('device_detail.unifi_api_key_recommended')}
                    </span>
                  </div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="UniFi API Key"
                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    {t('device_detail.unifi_api_key_hint')}
                  </p>
                </div>

                {/* Divider between API Key and Credentials */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                  <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    {t('device_detail.or_credentials')}
                  </span>
                  <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                </div>

                {/* 2. Username & Password Fields */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_username_label')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="Local Admin / Email"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_password_label')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {(isMfaRequired || Boolean(mfaToken) || testResult?.details?.mfa_required) && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2 animate-fade-in">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                      <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{t('device_detail.unifi_mfa_title')}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                      {t('device_detail.unifi_mfa_desc')}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={mfaToken}
                        onChange={(e) => {
                          setMfaToken(e.target.value);
                          setTestResult(null);
                        }}
                        placeholder={t('device_detail.unifi_mfa_placeholder')}
                        maxLength={8}
                        className="flex-1 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/60 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono tracking-widest text-center focus:outline-none focus:border-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !mfaToken.trim()}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-sm"
                      >
                        {isTesting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>{t('device_detail.unifi_mfa_verify_btn')}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-700 dark:text-amber-300/80 leading-normal bg-amber-500/10 p-2 rounded-lg">
                      💡 {t('device_detail.unifi_mfa_tip')}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_unifi_site_label')}
                  </label>
                  <input
                    type="text"
                    value={site}
                    onChange={(e) => {
                      setSite(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="default"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t('device_detail.unifi_site_hint')}
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={useHttps}
                    onChange={(e) => setUseHttps(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-0"
                  />
                  <span>{t('device_detail.check_ssl_verify_label')}</span>
                </label>
              </div>
            )}

            {integrationType === 'adguard_home' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_url_label')}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={`http://${ip}:3000`}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_username_label')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="adguard"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_password_label')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {integrationType === 'home_assistant' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_url_label')}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder={`http://${ip}:8123`}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Token di Accesso a Lungo Termine
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="eyJhbGciOi..."
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Entity ID Monitorata (opzionale)
                  </label>
                  <input
                    type="text"
                    value={entityId}
                    onChange={(e) => {
                      setEntityId(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="sensor.temperatura_router"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {integrationType === 'synology_dsm' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_port_label')}
                    </label>
                    <input
                      type="text"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="5000"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={useHttps}
                        onChange={(e) => {
                          setUseHttps(e.target.checked);
                          if (e.target.checked && port === '5000') setPort('5001');
                          if (!e.target.checked && port === '5001') setPort('5000');
                        }}
                        className="rounded text-sky-500 focus:ring-0"
                      />
                      <span>HTTPS (SSL)</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_username_label')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="admin"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_password_label')}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Test Connection Button & Result Box */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
            <div>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isTesting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                ) : (
                  <Radio className="w-3.5 h-3.5 text-sky-500" />
                )}
                <span>
                  {isTesting ? t('device_detail.btn_testing_conn') : t('device_detail.btn_test_conn')}
                </span>
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                  testResult.ok
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div className="font-semibold text-xs leading-tight">{testResult.message}</div>
                  {testResult.details && (
                    <div className="text-[10px] opacity-80 mt-1 font-mono">
                      {testResult.details.endpoint && (
                        <div>Endpoint: {testResult.details.endpoint}</div>
                      )}
                      {testResult.details.devices_found !== undefined && (
                        <div>Dispositivi nel controller: {testResult.details.devices_found}</div>
                      )}
                      {testResult.details.model && (
                        <div>Modello: {testResult.details.model} ({testResult.details.status || 'OK'})</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving || isTesting}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              {t('device_detail.btn_cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || isTesting}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-sky-500/20"
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{isSaving ? t('device_detail.btn_saving') : t('device_detail.btn_save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
