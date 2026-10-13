import React, { useState, useEffect } from 'react';
import { Gauge, ArrowDown, ArrowUp, Activity, Globe, Play, AlertTriangle, RefreshCw, Server } from 'lucide-react';
import { runSpeedtestStream, fetchSpeedtestServers, SpeedtestEvent, SpeedtestServer } from '../../api/client';
import { useTranslation } from '../../i18n/I18nContext';

interface SpeedtestWidgetProps {
  deviceName: string;
}

export const SpeedtestWidget: React.FC<SpeedtestWidgetProps> = ({ deviceName }) => {
  const { t } = useTranslation();
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [stage, setStage] = useState<string>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [message, setMessage] = useState<string>('');
  
  // Available test servers and selection
  const [servers, setServers] = useState<SpeedtestServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('auto');

  const [pingMs, setPingMs] = useState<number | null>(null);
  const [jitterMs, setJitterMs] = useState<number | null>(null);
  const [downloadMbps, setDownloadMbps] = useState<number | null>(null);
  const [uploadMbps, setUploadMbps] = useState<number | null>(null);
  const [currentGaugeVal, setCurrentGaugeVal] = useState<number>(0);
  const [activeServer, setActiveServer] = useState<{ name: string; location: string; isp: string; colo: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load available servers on mount
  useEffect(() => {
    fetchSpeedtestServers()
      .then((data) => {
        setServers(data);
      })
      .catch((err) => {
        console.warn('Impossibile caricare la lista server speedtest:', err);
      });
  }, []);

  const handleStartSpeedtest = () => {
    setIsRunning(true);
    setStage('init');
    setProgress(5);
    setMessage(t('device_detail.speedtest_searching_server', { defaultValue: 'Connessione al server...' }));
    setPingMs(null);
    setJitterMs(null);
    setDownloadMbps(null);
    setUploadMbps(null);
    setCurrentGaugeVal(0);
    setErrorMsg(null);

    const cleanup = runSpeedtestStream(
      (ev: SpeedtestEvent) => {
        if (ev.progress !== undefined) setProgress(ev.progress);
        if (ev.message) setMessage(ev.message);

        if (ev.stage === 'ping') {
          setStage('ping');
          if (ev.current_ping_ms !== undefined) {
            setPingMs(ev.current_ping_ms);
          }
        } else if (ev.stage === 'ping_done') {
          if (ev.ping_ms !== undefined) setPingMs(ev.ping_ms);
          if (ev.jitter_ms !== undefined) setJitterMs(ev.jitter_ms);
          if (ev.server) setActiveServer(ev.server);
        } else if (ev.stage === 'download') {
          setStage('download');
          if (ev.download_mbps !== undefined) {
            setDownloadMbps(ev.download_mbps);
            setCurrentGaugeVal(ev.download_mbps);
          }
        } else if (ev.stage === 'download_done') {
          if (ev.download_mbps !== undefined) {
            setDownloadMbps(ev.download_mbps);
            setCurrentGaugeVal(ev.download_mbps);
          }
        } else if (ev.stage === 'upload') {
          setStage('upload');
          if (ev.upload_mbps !== undefined) {
            setUploadMbps(ev.upload_mbps);
            setCurrentGaugeVal(ev.upload_mbps);
          }
        } else if (ev.stage === 'complete') {
          setStage('complete');
          setIsRunning(false);
          setProgress(100);
          if (ev.ping_ms !== undefined) setPingMs(ev.ping_ms);
          if (ev.jitter_ms !== undefined) setJitterMs(ev.jitter_ms);
          if (ev.download_mbps !== undefined) setDownloadMbps(ev.download_mbps);
          if (ev.upload_mbps !== undefined) setUploadMbps(ev.upload_mbps);
          if (ev.server) setActiveServer(ev.server);
          setCurrentGaugeVal(ev.download_mbps || 0);
          setMessage(t('device_detail.speedtest_done', { defaultValue: 'Test completato con successo!' }));
        } else if (ev.stage === 'error') {
          setStage('error');
          setIsRunning(false);
          setErrorMsg(ev.message || 'Errore durante lo speedtest.');
        }
      },
      (err) => {
        setIsRunning(false);
        setStage('error');
        setErrorMsg('Connessione interrotta durante il test.');
        console.error('Speedtest stream error', err);
      },
      selectedServerId
    );
  };

  // Speedometer calculation
  // Dynamic scale up to 1000 Mbps
  const maxScale = Math.max(300, Math.ceil(((currentGaugeVal || 0) + 50) / 100) * 100);
  const gaugePercent = Math.min(1, Math.max(0, currentGaugeVal / maxScale));

  // Semi-circle circumference for r=46 is PI * 46 = 144.51
  const arcRadius = 46;
  const arcCircumference = Math.PI * arcRadius;
  const strokeDashoffset = arcCircumference * (1 - gaugePercent);

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-xl text-slate-100 overflow-hidden relative">
      {/* Background radial glow */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-36 h-36 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs text-white">
              {t('device_detail.speedtest_title', { defaultValue: 'Speedtest Connessione Internet' })}
            </h4>
            <span className="text-[10px] text-slate-400 font-mono">
              WAN Gateway: {deviceName}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStartSpeedtest}
          disabled={isRunning}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 shadow-md ${
            isRunning
              ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
              : 'bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-white shadow-sky-500/20 active:scale-95 cursor-pointer'
          }`}
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
              <span>{t('device_detail.speedtest_running', { defaultValue: 'Test in corso...' })}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{stage === 'complete' ? t('device_detail.speedtest_rerun', { defaultValue: 'Ripeti Test' }) : t('device_detail.speedtest_start', { defaultValue: 'Esegui Speedtest' })}</span>
            </>
          )}
        </button>
      </div>

      {/* Server Selection Dropdown */}
      <div className="mb-3 flex items-center gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80 text-[11px]">
        <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span className="text-slate-400 font-medium shrink-0">
          {t('device_detail.speedtest_server_label', { defaultValue: 'Server di Test:' })}
        </span>
        <select
          value={selectedServerId}
          onChange={(e) => setSelectedServerId(e.target.value)}
          disabled={isRunning}
          className="flex-1 bg-slate-850 hover:bg-slate-800 border border-slate-700/80 rounded-lg px-2 py-1 text-slate-200 text-[11px] font-medium focus:outline-none focus:border-sky-500 disabled:opacity-50 cursor-pointer"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id} className="bg-slate-900 text-slate-100">
              {s.name} ({s.city})
            </option>
          ))}
        </select>
      </div>

      {/* Speedometer Gauge Arc (Properly bounded in viewBox 0 0 120 70) */}
      <div className="flex flex-col items-center justify-center my-0 relative">
        <div className="relative w-44 h-[88px] flex items-center justify-center">
          <svg className="w-44 h-[88px] overflow-hidden" viewBox="0 0 120 70">
            {/* Background Arc: path from (14, 60) to (106, 60) */}
            <path
              d="M 14 60 A 46 46 0 0 1 106 60"
              fill="none"
              stroke="#1e293b"
              strokeWidth="9"
              strokeLinecap="round"
            />
            {/* Active Colored Arc */}
            <path
              d="M 14 60 A 46 46 0 0 1 106 60"
              fill="none"
              stroke={stage === 'upload' ? '#10b981' : '#0284c7'}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${arcCircumference}`}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-300 ease-out"
            />
          </svg>

          {/* Central Speed Value positioned neatly inside the arc */}
          <div className="absolute bottom-1 flex flex-col items-center text-center pointer-events-none">
            <span className="text-2xl font-extrabold tracking-tight text-white font-mono drop-shadow">
              {currentGaugeVal > 0 ? currentGaugeVal.toFixed(1) : (stage === 'complete' && downloadMbps !== null ? downloadMbps.toFixed(1) : '—')}
            </span>
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider -mt-0.5">
              Mbps {stage === 'upload' ? '(Upload)' : stage === 'download' ? '(Download)' : ''}
            </span>
          </div>
        </div>

        {/* Progress bar and status pill */}
        {isRunning && (
          <div className="w-full max-w-xs space-y-1 mt-1">
            <div className="flex justify-between text-[10px] text-slate-400 font-medium">
              <span>{message}</span>
              <span className="font-mono text-sky-400">{progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-2 bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px] rounded-xl flex items-center gap-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Speed Metrics Quad (Ping, Jitter, Download, Upload) */}
      <div className="grid grid-cols-4 gap-2 mt-2 pt-2.5 border-t border-slate-800/80 text-center">
        {/* Metric 1: Ping */}
        <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
            <Activity className="w-3 h-3 text-cyan-400" />
            <span>Ping</span>
          </div>
          <div className="text-xs font-extrabold text-cyan-300 font-mono mt-0.5">
            {pingMs !== null ? `${pingMs} ms` : '—'}
          </div>
        </div>

        {/* Metric 2: Jitter */}
        <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
            <Activity className="w-3 h-3 text-purple-400" />
            <span>Jitter</span>
          </div>
          <div className="text-xs font-extrabold text-purple-300 font-mono mt-0.5">
            {jitterMs !== null ? `${jitterMs} ms` : '—'}
          </div>
        </div>

        {/* Metric 3: Download */}
        <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
            <ArrowDown className="w-3 h-3 text-sky-400 stroke-[2.5]" />
            <span>Down</span>
          </div>
          <div className="text-xs font-extrabold text-sky-300 font-mono mt-0.5">
            {downloadMbps !== null ? `${downloadMbps} M` : '—'}
          </div>
        </div>

        {/* Metric 4: Upload */}
        <div className="bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase">
            <ArrowUp className="w-3 h-3 text-emerald-400 stroke-[2.5]" />
            <span>Up</span>
          </div>
          <div className="text-xs font-extrabold text-emerald-300 font-mono mt-0.5">
            {uploadMbps !== null ? `${uploadMbps} M` : '—'}
          </div>
        </div>
      </div>

      {/* Server location footer info */}
      {activeServer && (
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <Globe className="w-3 h-3 text-sky-400 shrink-0" />
            <span className="truncate text-slate-300 font-medium">
              {activeServer.name} • {activeServer.location}
            </span>
          </div>
          <span className="font-mono text-slate-500 shrink-0">
            {activeServer.isp}
          </span>
        </div>
      )}
    </div>
  );
};
