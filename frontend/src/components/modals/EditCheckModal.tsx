import React, { useEffect, useState } from 'react';
import { X, Save, Sliders, CheckCircle2, AlertTriangle, Radio, RefreshCw, Shield, Check } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { Check as CheckType, Device } from '../../types';
import { updateCheck, testCheckParams } from '../../api/client';

interface EditCheckModalProps {
  isOpen: boolean;
  check: CheckType | null;
  device: Device | null;
  onClose: () => void;
  onCheckUpdated: (updatedCheck: CheckType) => void;
}

export const EditCheckModal: React.FC<EditCheckModalProps> = ({
  isOpen,
  check,
  device,
  onClose,
  onCheckUpdated,
}) => {
  const { t } = useTranslation();

  // General fields
  const [name, setName] = useState('');
  const [interval, setInterval] = useState(30);
  const [enabled, setEnabled] = useState(true);

  // Type-specific parameter states
  const [url, setUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [site, setSite] = useState('default');
  const [verifySsl, setVerifySsl] = useState(false);
  const [port, setPort] = useState('');
  const [host, setHost] = useState('');
  const [upsName, setUpsName] = useState('ups');
  const [entityId, setEntityId] = useState('');
  const [community, setCommunity] = useState('public');
  const [oid, setOid] = useState('');
  const [dnsServer, setDnsServer] = useState('');
  const [dnsQuery, setDnsQuery] = useState('');
  const [pingCount, setPingCount] = useState('3');
  const [mfaToken, setMfaToken] = useState('');
  const [isMfaRequired, setIsMfaRequired] = useState(false);

  // UniFi Mode selector ('os' = UniFi OS Server/UDM with API key; 'legacy' = v1 controller with user/pass)
  const [unifiMode, setUnifiMode] = useState<'os' | 'legacy'>('os');

  // Connectivity test states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; details?: any } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when check changes
  useEffect(() => {
    if (!check) return;
    setName(check.name || '');
    setInterval(check.interval_seconds || 30);
    setEnabled(check.enabled !== false);
    setErrorMessage(null);
    setSaveSuccess(false);
    setTestResult(null);

    const p = check.params || {};

    if (p.mode) {
      setUnifiMode(p.mode === 'legacy' ? 'legacy' : 'os');
    } else if (p.username && !p.api_key) {
      setUnifiMode('legacy');
    } else {
      setUnifiMode('os');
    }

    setUrl(p.controller_url || p.adguard_url || p.ha_url || p.url || '');
    setApiKey(p.api_key || p.access_token || '');
    setUsername(p.username || '');
    setPassword(p.password || '');
    setSite(p.site || 'default');
    setVerifySsl(Boolean(p.verify_ssl ?? p.https));
    setMfaToken(p.mfa_token || '');
    setIsMfaRequired(Boolean(p.mfa_required));
    setPort(p.port !== undefined ? String(p.port) : '');
    setHost(p.host || p.target || (device?.addresses?.ip || ''));
    setUpsName(p.ups_name || 'ups');
    setEntityId(p.entity_id || '');
    setCommunity(p.community || 'public');
    setOid((p.oids && p.oids[0]) || p.oid || '');
    setDnsServer(p.server || '');
    setDnsQuery(p.query_name || '');
    setPingCount(p.count !== undefined ? String(p.count) : '3');
  }, [check, device]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving && !isTesting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, isTesting, onClose]);

  if (!isOpen || !check) return null;

  const buildCurrentParams = (): Record<string, any> => {
    const existingParams = { ...(check.params || {}) };
    const updatedParams: Record<string, any> = { ...existingParams };

    if (check.type === 'unifi') {
      updatedParams.controller_url = url.trim();
      updatedParams.mode = unifiMode;
      updatedParams.api_key = apiKey.trim() || undefined;
      updatedParams.username = username.trim() || undefined;
      updatedParams.password = password.trim() || undefined;
      updatedParams.site = site.trim() || 'default';
      updatedParams.verify_ssl = verifySsl;
      if (mfaToken.trim()) {
        updatedParams.mfa_token = mfaToken.trim();
      }
    } else if (check.type === 'adguard_home') {
      updatedParams.adguard_url = url.trim();
      updatedParams.username = username.trim() || undefined;
      updatedParams.password = password.trim() || undefined;
    } else if (check.type === 'home_assistant') {
      updatedParams.ha_url = url.trim();
      updatedParams.access_token = apiKey.trim() || undefined;
      updatedParams.entity_id = entityId.trim() || undefined;
    } else if (check.type === 'http') {
      updatedParams.url = url.trim();
    } else if (check.type === 'tcp_port') {
      if (host.trim()) updatedParams.target = host.trim();
      const pNum = Number(port);
      if (!isNaN(pNum) && pNum > 0) updatedParams.port = pNum;
    } else if (check.type === 'dns') {
      updatedParams.server = dnsServer.trim() || undefined;
      updatedParams.query_name = dnsQuery.trim() || undefined;
    } else if (check.type === 'synology_dsm') {
      if (host.trim()) updatedParams.host = host.trim();
      const pNum = Number(port);
      if (!isNaN(pNum) && pNum > 0) updatedParams.port = pNum;
      updatedParams.https = verifySsl;
      updatedParams.username = username.trim() || undefined;
      updatedParams.password = password.trim() || undefined;
    } else if (check.type === 'nut') {
      if (host.trim()) updatedParams.host = host.trim();
      const pNum = Number(port);
      if (!isNaN(pNum) && pNum > 0) updatedParams.port = pNum;
      updatedParams.ups_name = upsName.trim() || 'ups';
    } else if (check.type === 'snmp') {
      if (host.trim()) updatedParams.host = host.trim();
      const pNum = Number(port);
      if (!isNaN(pNum) && pNum > 0) updatedParams.port = pNum;
      updatedParams.community = community.trim() || 'public';
      if (oid.trim()) updatedParams.oids = [oid.trim()];
    } else if (check.type === 'ping') {
      if (host.trim()) updatedParams.target = host.trim();
      const cNum = Number(pingCount);
      if (!isNaN(cNum) && cNum > 0) updatedParams.count = cNum;
    }

    return updatedParams;
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setErrorMessage(null);

    try {
      const paramsToTest = buildCurrentParams();
      const targetAddr = host.trim() || device?.addresses?.ip;

      const res = await testCheckParams({
        type: check.type,
        target_address: targetAddr,
        params: paramsToTest,
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
        const errMsg = res.details?.error || res.details?.warning || t('device_detail.test_failed_generic');
        setTestResult({ ok: false, message: errMsg, details: res.details });
      }
    } catch (err: any) {
      setTestResult({ ok: false, message: err.message || t('device_detail.test_failed_generic') });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const updatedParams = buildCurrentParams();

      const updatedCheck = await updateCheck(check.id, {
        name: name.trim() || check.name,
        interval_seconds: Number(interval) || 30,
        enabled,
        params: updatedParams,
      });

      setSaveSuccess(true);
      onCheckUpdated(updatedCheck);
      setTimeout(() => {
        onClose();
      }, 400);
    } catch (err: any) {
      console.error('Failed to update check:', err);
      setErrorMessage(err.message || 'Errore durante il salvataggio dei parametri.');
    } finally {
      setIsSaving(false);
    }
  };

  const getCheckTypeBadge = (type: string) => {
    switch (type) {
      case 'unifi':
        return { label: 'UniFi Controller', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20' };
      case 'adguard_home':
        return { label: 'AdGuard Home', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
      case 'home_assistant':
        return { label: 'Home Assistant', color: 'bg-sky-500/10 text-sky-500 border-sky-500/20' };
      case 'synology_dsm':
        return { label: 'Synology DSM', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' };
      case 'nut':
        return { label: 'UPS NUT', color: 'bg-amber-500/10 text-amber-500 border-amber-500/20' };
      case 'http':
        return { label: 'HTTP / Web', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20' };
      case 'dns':
        return { label: 'DNS Query', color: 'bg-teal-500/10 text-teal-500 border-teal-500/20' };
      case 'tcp_port':
        return { label: 'Porta TCP', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20' };
      case 'snmp':
        return { label: 'SNMP', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' };
      default:
        return { label: type.toUpperCase(), color: 'bg-slate-500/10 text-slate-500 border-slate-500/20' };
    }
  };

  const typeBadge = getCheckTypeBadge(check.type);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving && !isTesting) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 text-slate-800 dark:text-slate-100 relative animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {t('device_detail.edit_check_title')}
                </h3>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeBadge.color}`}
                >
                  {typeBadge.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {device?.name ? `${device.name} (${device.addresses?.ip || ''})` : t('device_detail.edit_check_desc')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSaving || isTesting}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 cursor-pointer"
            title={t('device_detail.btn_cancel')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
          {errorMessage && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* General info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('device_detail.check_name_label')}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('device_detail.check_name_placeholder')}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                {t('device_detail.check_interval_label')}
              </label>
              <input
                type="number"
                min={5}
                max={3600}
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value) || 30)}
                className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-3">
              {t('device_detail.edit_check_params_header')}
            </span>

            {/* UniFi Form */}
            {check.type === 'unifi' && (
              <div className="space-y-3">
                {/* Mode Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('device_detail.unifi_server_type_label')}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUnifiMode('os')}
                      className={`p-2.5 text-left rounded-xl border text-xs transition cursor-pointer ${
                        unifiMode === 'os'
                          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>{t('device_detail.unifi_mode_os_title')}</span>
                        {unifiMode === 'os' && <span className="text-[9px] bg-sky-500 text-white px-1.5 py-0.5 rounded font-mono uppercase">Attivo</span>}
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                        {t('device_detail.unifi_mode_os_desc')}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setUnifiMode('legacy')}
                      className={`p-2.5 text-left rounded-xl border text-xs transition cursor-pointer ${
                        unifiMode === 'legacy'
                          ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-800 dark:text-sky-200 ring-1 ring-sky-500'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>{t('device_detail.unifi_mode_legacy_title')}</span>
                        {unifiMode === 'legacy' && <span className="text-[9px] bg-sky-500 text-white px-1.5 py-0.5 rounded font-mono uppercase">Attivo</span>}
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
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={unifiMode === 'os' ? "https://192.168.1.1 o https://unifi.tuodominio.org" : `https://${device?.addresses?.ip || '192.168.1.1'}:8443`}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        onChange={(e) => setMfaToken(e.target.value)}
                        placeholder="123456"
                        maxLength={8}
                        className="w-40 bg-white dark:bg-slate-800 border border-amber-400 dark:border-amber-600 rounded-lg px-3 py-1.5 text-sm font-mono tracking-widest text-center text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting || !mfaToken.trim()}
                        className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs transition cursor-pointer flex items-center gap-1.5 shadow"
                      >
                        {isTesting ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        <span>{t('device_detail.unifi_mfa_verify_btn')}</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_unifi_site_label')}
                  </label>
                  <input
                    type="text"
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="default"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {t('device_detail.unifi_site_hint')}
                  </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={verifySsl}
                    onChange={(e) => setVerifySsl(e.target.checked)}
                    className="rounded text-sky-500 focus:ring-0"
                  />
                  <span>{t('device_detail.check_ssl_verify_label')}</span>
                </label>

                {/* Test Connection Button & Result Box */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting || !url.trim()}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isTesting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                      ) : (
                        <Radio className="w-3.5 h-3.5 text-sky-500" />
                      )}
                      <span>{isTesting ? t('device_detail.btn_testing_conn') : t('device_detail.btn_test_conn')}</span>
                    </button>
                  </div>

                  {testResult && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                      testResult.ok
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                    }`}>
                      {testResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <span className="font-semibold block">{testResult.message}</span>
                        {testResult.details?.sample_devices && (
                          <div className="mt-1 text-[11px] opacity-90">
                            Apparati nel controller: {testResult.details.sample_devices.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AdGuard Home Form */}
            {check.type === 'adguard_home' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_url_label')}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={`http://${device?.addresses?.ip || '192.168.1.1'}:3000`}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_username_label')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Admin"
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

                {/* Test Connection Button */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !url.trim()}
                    className="w-fit px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-sky-500" />
                    )}
                    <span>{isTesting ? t('device_detail.btn_testing_conn') : t('device_detail.btn_test_conn')}</span>
                  </button>

                  {testResult && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                      testResult.ok
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                    }`}>
                      {testResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <span className="font-semibold">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Home Assistant Form */}
            {check.type === 'home_assistant' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_url_label')}
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder={`http://${device?.addresses?.ip || '192.168.1.1'}:8123`}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_ha_token_label')}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_ha_entity_label')}
                  </label>
                  <input
                    type="text"
                    value={entityId}
                    onChange={(e) => setEntityId(e.target.value)}
                    placeholder="sensor.presa_pc_power"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Test Connection Button */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || !url.trim()}
                    className="w-fit px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isTesting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-500" />
                    ) : (
                      <Radio className="w-3.5 h-3.5 text-sky-500" />
                    )}
                    <span>{isTesting ? t('device_detail.btn_testing_conn') : t('device_detail.btn_test_conn')}</span>
                  </button>

                  {testResult && (
                    <div className={`p-2.5 rounded-xl text-xs flex items-start gap-2 border ${
                      testResult.ok
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                    }`}>
                      {testResult.ok ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      )}
                      <span className="font-semibold">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* HTTP / HTTPS Form */}
            {check.type === 'http' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('device_detail.check_url_label')}
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/healthz"
                  className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            )}

            {/* TCP Port Form */}
            {check.type === 'tcp_port' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.field_ip')}
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_port_label')}
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="80"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {/* DNS Query Form */}
            {check.type === 'dns' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_dns_server_label')}
                  </label>
                  <input
                    type="text"
                    value={dnsServer}
                    onChange={(e) => setDnsServer(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_dns_domain_label')}
                  </label>
                  <input
                    type="text"
                    value={dnsQuery}
                    onChange={(e) => setDnsQuery(e.target.value)}
                    placeholder="google.com"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {/* Synology DSM Form */}
            {check.type === 'synology_dsm' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.field_ip')}
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_port_label')}
                    </label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder={verifySsl ? '5001' : '5000'}
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_username_label')}
                    </label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Admin DSM"
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
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300 pt-1">
                  <input
                    type="checkbox"
                    checked={verifySsl}
                    onChange={(e) => {
                      setVerifySsl(e.target.checked);
                      if (port === '5000' && e.target.checked) setPort('5001');
                      else if (port === '5001' && !e.target.checked) setPort('5000');
                    }}
                    className="rounded text-sky-500 focus:ring-0"
                  />
                  <span>{t('device_detail.check_use_https_label')}</span>
                </label>
              </div>
            )}

            {/* NUT UPS Form */}
            {check.type === 'nut' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.field_ip')}
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_port_label')}
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="3493"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_ups_name_label')}
                  </label>
                  <input
                    type="text"
                    value={upsName}
                    onChange={(e) => setUpsName(e.target.value)}
                    placeholder="ups"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            {/* SNMP Form */}
            {check.type === 'snmp' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.field_ip')}
                    </label>
                    <input
                      type="text"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="192.168.1.1"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_port_label')}
                    </label>
                    <input
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      placeholder="161"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_snmp_community_label')}
                    </label>
                    <input
                      type="text"
                      value={community}
                      onChange={(e) => setCommunity(e.target.value)}
                      placeholder="public"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      {t('device_detail.check_snmp_oid_label')}
                    </label>
                    <input
                      type="text"
                      value={oid}
                      onChange={(e) => setOid(e.target.value)}
                      placeholder="1.3.6.1.2.1.1.1.0"
                      className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Ping Form */}
            {check.type === 'ping' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.field_ip')}
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('device_detail.check_ping_count_label')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={pingCount}
                    onChange={(e) => setPingCount(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800/80 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Enabled switch */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="rounded text-sky-500 focus:ring-0"
              />
              <span>{t('device_detail.check_enabled_label')}</span>
            </label>
          </div>
        </form>

        {/* Footer buttons */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving || isTesting}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer"
          >
            {t('device_detail.btn_cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isTesting}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-500 text-white shadow transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-300 animate-in zoom-in" />
                <span>{t('device_detail.btn_saved')}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{isSaving ? t('device_detail.btn_saving_check') : t('device_detail.btn_save_check')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
