import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  retentionPeriod?: string; // e.g. "24h", "48h", "5d", "10d", "30d"
}

const localeMap: Record<string, string> = {
  it: 'it-IT',
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

const RETENTION_HOURS_MAP: Record<string, number> = {
  '24h': 24,
  '48h': 48,
  '5d': 120,
  '10d': 240,
  '30d': 720,
};

export const TimeMachineSlider: React.FC<TimeMachineSliderProps> = ({
  onTimeChange,
  onLiveMode,
  onOpenLogs,
  isLive = true,
  externalTargetTime,
  errorAtTime,
  retentionPeriod = '24h',
}) => {
  const { t, language } = useTranslation();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLocale = localeMap[language] || 'en-US';

  const maxHours = useMemo(() => {
    return RETENTION_HOURS_MAP[retentionPeriod] || 24;
  }, [retentionPeriod]);

  // Step granularity based on range: 0.25h for 24h/48h, 0.5h for 5d, 1h for 10d, 2h for 30d
  const stepValue = useMemo(() => {
    if (maxHours <= 48) return 0.25;
    if (maxHours <= 120) return 0.5;
    if (maxHours <= 240) return 1;
    return 2;
  }, [maxHours]);

  // Track if user is actively dragging / scrubbing the slider
  const isScrubbingRef = useRef<boolean>(false);

  // sliderPosition goes from 0 (max past) to maxHours (Now / Live).
  // Default is maxHours (Now / Live on the RIGHT)
  const [sliderPosition, setSliderPosition] = useState<number>(maxHours);

  // Keep sliderPosition clamped to maxHours if maxHours changes, unless user is scrubbing
  useEffect(() => {
    if (isLive && !isScrubbingRef.current) {
      setSliderPosition(maxHours);
    }
  }, [maxHours, isLive]);

  // Sync with external target time (e.g. from Event Log jump)
  useEffect(() => {
    if (isScrubbingRef.current) return;

    if (externalTargetTime) {
      const diffHours = Math.max(0, (Date.now() - externalTargetTime.getTime()) / (3600 * 1000));
      const pos = Math.max(0, Math.min(maxHours, maxHours - diffHours));
      setSliderPosition(parseFloat(pos.toFixed(2)));
    } else if (isLive) {
      setSliderPosition(maxHours);
    }
  }, [externalTargetTime, isLive, maxHours]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const offsetHours = Math.max(0, maxHours - sliderPosition);
  // Stable threshold for historical mode: at least half a step away from "Now"
  const isHistoricalActive = !isLive || offsetHours >= stepValue * 0.5;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    setSliderPosition(pos);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If within half a step of the rightmost edge, treat as Live immediately
    if (pos >= maxHours - stepValue * 0.5) {
      if (onLiveMode) onLiveMode();
      return;
    }

    const calculatedOffset = maxHours - pos;
    debounceTimerRef.current = setTimeout(() => {
      const targetDate = new Date(Date.now() - calculatedOffset * 3600 * 1000);
      if (onTimeChange) onTimeChange(targetDate);
    }, 200);
  };

  const handlePointerDown = () => {
    isScrubbingRef.current = true;
  };

  const handlePointerUp = () => {
    // Keep flag true momentarily until debounce settles
    setTimeout(() => {
      isScrubbingRef.current = false;
    }, 250);
  };

  const resetToLive = () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    isScrubbingRef.current = false;
    setSliderPosition(maxHours);
    if (onLiveMode) onLiveMode();
  };

  // Real-time date display: when scrubbing or in historical mode, compute instantly from sliderPosition
  const computedDate = useMemo(() => {
    return new Date(Date.now() - offsetHours * 3600 * 1000);
  }, [offsetHours]);

  const currentDateDisplay =
    !isHistoricalActive && isLive
      ? t('timemachine.live_mode')
      : isScrubbingRef.current
      ? formatDateTime(computedDate, activeLocale)
      : externalTargetTime && Math.abs((Date.now() - externalTargetTime.getTime()) / 3600000 - offsetHours) < stepValue
      ? formatDateTime(externalTargetTime, activeLocale)
      : formatDateTime(computedDate, activeLocale);

  const rangeLabelKey = `timemachine.range_${retentionPeriod}`;
  const rangeLabel = t(rangeLabelKey) || `-${retentionPeriod}`;

  return (
    <div className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl flex flex-wrap md:flex-nowrap items-center gap-4 text-xs select-none transition-all">
      {/* Title & Live/Historical Badge */}
      <div className="flex items-center gap-2 shrink-0">
        <History className="w-4 h-4 text-sky-500 dark:text-sky-400" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">{t('timemachine.title')}:</span>
        <span
          className={`font-mono px-2 py-0.5 rounded text-[11px] whitespace-nowrap tabular-nums ${
            !isHistoricalActive && isLive
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold'
              : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold animate-pulse'
          }`}
        >
          {currentDateDisplay}
        </span>
      </div>

      {/* Error indicator at historical timestamp if present */}
      {errorAtTime && !isLive && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[11px] font-semibold shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          <span className="truncate max-w-[180px]" title={errorAtTime}>
            {errorAtTime}
          </span>
        </div>
      )}

      {/* Scrubbing slider - expands across all available space for high precision */}
      <div className="flex items-center gap-2 flex-1 min-w-[200px] w-full">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium shrink-0">
          {rangeLabel}
        </span>
        <input
          type="range"
          min="0"
          max={maxHours}
          step={stepValue}
          value={sliderPosition}
          onChange={handleSliderChange}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
          className="w-full accent-sky-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg transition-all"
        />
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium shrink-0">
          {t('timemachine.now')}
        </span>
      </div>

      {/* Action buttons with stable width to completely avoid layout reflow/glitches */}
      <div className="flex items-center gap-2 shrink-0">
        {onOpenLogs && (
          <button
            onClick={onOpenLogs}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold shadow-sm transition"
            title={t('timemachine.logs_tooltip')}
          >
            <ScrollText className="w-3.5 h-3.5 text-sky-500" />
            <span className="hidden sm:inline">{t('header.event_logs')}</span>
          </button>
        )}

        {/* Stable Return to Live button: kept in layout with opacity/pointer-events toggle to eliminate any slider width shifting */}
        <div className="w-[110px] flex justify-end">
          <button
            onClick={resetToLive}
            tabIndex={isHistoricalActive ? 0 : -1}
            className={`flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow whitespace-nowrap transition-all duration-200 ${
              isHistoricalActive
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none'
            }`}
          >
            <RotateCcw className="w-3 h-3" /> {t('timemachine.return_live')}
          </button>
        </div>
      </div>
    </div>
  );
};
