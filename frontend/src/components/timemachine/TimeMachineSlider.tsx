import React, { useState, useEffect, useRef } from 'react';
import { History, RotateCcw, ScrollText, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n/I18nContext';
import { formatDateTime } from '../../utils/date';

interface TimeMachineSliderProps {
  onTimeChange?: (timestamp: Date) => void;
  onLiveMode?: () => void;
  onOpenLogs?: () => void;
  isLive?: boolean;
  externalTargetTime?: Date | null;
  errorAtTime?: string | null;
}

const localeMap: Record<string, string> = {
  it: 'it-IT',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

export const TimeMachineSlider: React.FC<TimeMachineSliderProps> = ({
  onTimeChange,
  onLiveMode,
  onOpenLogs,
  isLive = true,
  externalTargetTime,
  errorAtTime,
}) => {
  const { t, language } = useTranslation();
  const [offsetHours, setOffsetHours] = useState<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLocale = localeMap[language] || 'en-US';

  // Sync with external target time (e.g., from Event Log jump)
  useEffect(() => {
    if (externalTargetTime) {
      const diffHours = Math.max(0, (Date.now() - externalTargetTime.getTime()) / (3600 * 1000));
      setOffsetHours(parseFloat(diffHours.toFixed(2)));
    } else if (isLive) {
      setOffsetHours(0);
    }
  }, [externalTargetTime, isLive]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOffsetHours(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (val === 0) {
      if (onLiveMode) onLiveMode();
      return;
    }
    debounceTimerRef.current = setTimeout(() => {
      const targetDate = new Date(Date.now() - val * 3600 * 1000);
      if (onTimeChange) onTimeChange(targetDate);
    }, 200);
  };

  const resetToLive = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setOffsetHours(0);
    if (onLiveMode) onLiveMode();
  };

  const currentDateDisplay =
    offsetHours === 0 && isLive
      ? t('timemachine.live_mode')
      : externalTargetTime
      ? formatDateTime(externalTargetTime, activeLocale)
      : formatDateTime(new Date(Date.now() - offsetHours * 3600 * 1000), activeLocale);

  return (
    <div className="bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl flex flex-wrap items-center gap-4 text-xs select-none max-w-4xl transition-all">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-sky-500 dark:text-sky-400" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">{t('timemachine.title')}:</span>
        <span
          className={`font-mono px-2 py-0.5 rounded text-[11px] ${
            offsetHours === 0 && isLive
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold'
              : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold animate-pulse'
          }`}
        >
          {currentDateDisplay}
        </span>
      </div>

      {/* Error indicator at historical timestamp if present */}
      {errorAtTime && !isLive && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          <span className="truncate max-w-[200px]" title={errorAtTime}>
            {errorAtTime}
          </span>
        </div>
      )}

      {/* Scrubbing slider */}
      <div className="flex items-center gap-2 flex-1 min-w-[180px] max-w-xs">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{t('timemachine.range_24h')}</span>
        <input
          type="range"
          min="0"
          max="24"
          step="0.25"
          value={offsetHours}
          onChange={handleSliderChange}
          className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
        />
        <span className="text-[10px] text-slate-400 dark:text-slate-500">{t('timemachine.now')}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {onOpenLogs && (
          <button
            onClick={onOpenLogs}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-sm transition"
            title={t('timemachine.logs_tooltip')}
          >
            <ScrollText className="w-3.5 h-3.5 text-sky-500" />
            <span>{t('header.event_logs')}</span>
          </button>
        )}

        {(!isLive || offsetHours > 0) && (
          <button
            onClick={resetToLive}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
          >
            <RotateCcw className="w-3 h-3" /> {t('timemachine.return_live')}
          </button>
        )}
      </div>
    </div>
  );
};
