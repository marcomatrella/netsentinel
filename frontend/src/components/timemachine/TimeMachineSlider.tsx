import React, { useState, useEffect, useRef, useMemo } from 'react';
import { History, RotateCcw, ScrollText, Calendar, Check, X, ChevronLeft, ChevronRight, ChevronDown, Settings2 } from 'lucide-react';
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

// Formats a Date object to "YYYY-MM-DDTHH:mm:ss" for datetime-local input
function formatForDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

export const TimeMachineSlider: React.FC<TimeMachineSliderProps> = ({
  onTimeChange,
  onLiveMode,
  onOpenLogs,
  isLive = true,
  externalTargetTime,
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

  // Custom datetime picker state
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [pickerInputValue, setPickerInputValue] = useState<string>('');
  const pickerRef = useRef<HTMLDivElement>(null);

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

  // Close calendar popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    if (isPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const offsetHours = Math.max(0, maxHours - sliderPosition);
  // Historical mode is active whenever isLive is false OR slider has moved left from maxHours
  const isHistoricalActive = !isLive || sliderPosition < maxHours;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = parseFloat(e.target.value);
    setSliderPosition(pos);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only return to live mode if dragged completely to the right edge (Now)
    if (pos >= maxHours) {
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

  // Custom step configuration (value + unit: seconds, minutes, hours, days)
  type StepUnit = 's' | 'm' | 'h' | 'd';
  const [stepAmount, setStepAmount] = useState<number>(() => {
    const saved = localStorage.getItem('netsentinel_tm_step_amount');
    return saved ? Math.max(1, parseInt(saved, 10) || 10) : 10;
  });
  const [stepUnit, setStepUnit] = useState<StepUnit>(() => {
    const saved = localStorage.getItem('netsentinel_tm_step_unit') as StepUnit;
    return ['s', 'm', 'h', 'd'].includes(saved) ? saved : 's';
  });
  const [isStepMenuOpen, setIsStepMenuOpen] = useState<boolean>(false);
  const stepMenuRef = useRef<HTMLDivElement>(null);

  // Close step menu popover on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (stepMenuRef.current && !stepMenuRef.current.contains(e.target as Node)) {
        setIsStepMenuOpen(false);
      }
    };
    if (isStepMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isStepMenuOpen]);

  const stepTotalSeconds = useMemo(() => {
    const mult = stepUnit === 's' ? 1 : stepUnit === 'm' ? 60 : stepUnit === 'h' ? 3600 : 86400;
    return Math.max(1, stepAmount * mult);
  }, [stepAmount, stepUnit]);

  const handleUpdateStep = (amount: number, unit: StepUnit) => {
    const safeAmount = Math.max(1, Math.min(999, amount));
    setStepAmount(safeAmount);
    setStepUnit(unit);
    localStorage.setItem('netsentinel_tm_step_amount', String(safeAmount));
    localStorage.setItem('netsentinel_tm_step_unit', unit);
  };

  // Step backward and forward by user-configured duration
  const stepByDelta = (direction: -1 | 1) => {
    const deltaSeconds = direction * stepTotalSeconds;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    // Current effective historical timestamp
    const currentBase = !isHistoricalActive && isLive
      ? new Date()
      : externalTargetTime && Math.abs((Date.now() - externalTargetTime.getTime()) / 3600000 - offsetHours) < stepValue
      ? externalTargetTime
      : new Date(Date.now() - offsetHours * 3600 * 1000);

    const newTarget = new Date(currentBase.getTime() + deltaSeconds * 1000);
    const now = Date.now();

    // Max allowed past based on retention
    const minAllowedTime = now - maxHours * 3600 * 1000;
    if (newTarget.getTime() < minAllowedTime) {
      newTarget.setTime(minAllowedTime);
    }

    // If step reaches or exceeds current time, return to live
    if (newTarget.getTime() >= now) {
      resetToLive();
      return;
    }

    const diffHours = Math.max(0, (now - newTarget.getTime()) / (3600 * 1000));
    const newPos = Math.max(0, Math.min(maxHours - 0.001, maxHours - diffHours));
    setSliderPosition(parseFloat(newPos.toFixed(3)));

    if (onTimeChange) {
      onTimeChange(newTarget);
    }
  };

  // Real-time date display: when scrubbing or in historical mode, compute instantly from sliderPosition
  const computedDate = useMemo(() => {
    return new Date(Date.now() - offsetHours * 3600 * 1000);
  }, [offsetHours]);

  const activeDate = useMemo(() => {
    if (!isHistoricalActive && isLive) return new Date();
    if (isScrubbingRef.current) return computedDate;
    if (externalTargetTime && Math.abs((Date.now() - externalTargetTime.getTime()) / 3600000 - offsetHours) < stepValue) {
      return externalTargetTime;
    }
    return computedDate;
  }, [isHistoricalActive, isLive, computedDate, externalTargetTime, offsetHours, stepValue]);

  const currentDateDisplay =
    !isHistoricalActive && isLive
      ? t('timemachine.live_mode')
      : formatDateTime(activeDate, activeLocale);

  const rangeLabelKey = `timemachine.range_${retentionPeriod}`;
  const rangeLabel = t(rangeLabelKey) || `-${retentionPeriod}`;

  // Min and Max dates for date picker
  const minAllowedDate = useMemo(() => {
    return new Date(Date.now() - maxHours * 3600 * 1000);
  }, [maxHours]);

  const maxAllowedDate = useMemo(() => {
    return new Date();
  }, []);

  const handleOpenPicker = () => {
    setPickerInputValue(formatForDateTimeInput(activeDate));
    setIsPickerOpen(true);
  };

  const handleApplyCustomTime = () => {
    if (!pickerInputValue) return;
    const pickedDate = new Date(pickerInputValue);
    if (isNaN(pickedDate.getTime())) return;

    // Clamping to retention and now
    let clampedTime = pickedDate.getTime();
    if (clampedTime < minAllowedDate.getTime()) clampedTime = minAllowedDate.getTime();
    if (clampedTime > maxAllowedDate.getTime()) clampedTime = maxAllowedDate.getTime();

    const finalDate = new Date(clampedTime);
    const diffHours = Math.max(0, (Date.now() - finalDate.getTime()) / (3600 * 1000));
    const pos = Math.max(0, Math.min(maxHours, maxHours - diffHours));

    setSliderPosition(parseFloat(pos.toFixed(3)));
    setIsPickerOpen(false);

    if (finalDate.getTime() >= Date.now()) {
      resetToLive();
    } else if (onTimeChange) {
      onTimeChange(finalDate);
    }
  };

  return (
    <div className="w-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 backdrop-blur-md px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl shadow-2xl flex flex-wrap md:flex-nowrap items-center gap-2 sm:gap-3 text-xs select-none transition-all relative">
      {/* Title & Clickable Live/Historical Badge for manual datetime selection */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative" ref={pickerRef}>
        <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-500 dark:text-sky-400" />
        <span className="font-semibold text-slate-700 dark:text-slate-200 hidden xs:inline">{t('timemachine.title')}:</span>
        <button
          type="button"
          onClick={handleOpenPicker}
          title={t('timemachine.pick_datetime_tooltip')}
          className={`font-mono px-2 py-0.5 rounded text-[11px] whitespace-nowrap tabular-nums cursor-pointer transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 ${
            !isHistoricalActive && isLive
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold hover:bg-emerald-500/30'
              : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold animate-pulse hover:bg-amber-500/30'
          }`}
        >
          <Calendar className="w-3 h-3 text-sky-500 dark:text-sky-400" />
          <span>{currentDateDisplay}</span>
        </button>

        {/* Modal / Popover Calendar for manual date-time picking */}
        {isPickerOpen && (
          <div className="absolute left-0 bottom-full mb-3 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 w-[280px] animate-in fade-in zoom-in-95 backdrop-blur-xl">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-sky-500" />
                {t('timemachine.select_datetime_title')}
              </span>
              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  {t('timemachine.select_datetime_title')}
                </label>
                <input
                  type="datetime-local"
                  step="1"
                  min={formatForDateTimeInput(minAllowedDate)}
                  max={formatForDateTimeInput(maxAllowedDate)}
                  value={pickerInputValue}
                  onChange={(e) => setPickerInputValue(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                {t('timemachine.retention_min_hint', { date: formatDateTime(minAllowedDate, activeLocale) })}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="px-2.5 py-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-medium transition"
                >
                  {t('timemachine.cancel_custom_time')}
                </button>
                <button
                  type="button"
                  onClick={handleApplyCustomTime}
                  className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  {t('timemachine.apply_custom_time')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scrubbing slider with configurable backward/forward step buttons */}
      <div className="flex items-center gap-2 flex-1 min-w-[200px] w-full">
        {/* Step Backward + Configuration Group */}
        <div className="relative flex items-center shrink-0" ref={stepMenuRef}>
          <div className="flex items-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => stepByDelta(-1)}
              className="px-1.5 py-1 text-slate-700 dark:text-slate-300 font-mono text-[10px] font-bold flex items-center gap-0.5 hover:text-sky-500 transition"
              title={`${t('timemachine.step_back_tooltip')}: -${stepAmount}${stepUnit}`}
            >
              <ChevronLeft className="w-3 h-3 text-sky-500" />
              <span>-{stepAmount}{stepUnit}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsStepMenuOpen(!isStepMenuOpen)}
              className="px-1 py-1 text-slate-400 hover:text-sky-500 dark:text-slate-500 dark:hover:text-sky-400 border-l border-slate-200 dark:border-slate-700 transition"
              title={t('timemachine.step_config_tooltip') || 'Configura intervallo di navigazione'}
            >
              <ChevronDown className="w-2.5 h-2.5" />
            </button>
          </div>

          {/* Contextual Popover to configure step amount & unit */}
          {isStepMenuOpen && (
            <div className="absolute left-0 bottom-full mb-2 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 w-[240px] animate-in fade-in zoom-in-95 backdrop-blur-xl">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-[11px] text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Settings2 className="w-3 h-3 text-sky-500" />
                  {t('timemachine.step_config_title') || 'Intervallo Avanzamento'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsStepMenuOpen(false)}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {t('timemachine.step_amount_label') || 'Valore e Unità:'}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="999"
                      value={stepAmount}
                      onChange={(e) => handleUpdateStep(parseInt(e.target.value, 10) || 1, stepUnit)}
                      className="w-20 px-2 py-1 text-xs font-mono font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <select
                      value={stepUnit}
                      onChange={(e) => handleUpdateStep(stepAmount, e.target.value as StepUnit)}
                      className="flex-1 px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                    >
                      <option value="s">{t('timemachine.unit_seconds') || 'Secondi'}</option>
                      <option value="m">{t('timemachine.unit_minutes') || 'Minuti'}</option>
                      <option value="h">{t('timemachine.unit_hours') || 'Ore'}</option>
                      <option value="d">{t('timemachine.unit_days') || 'Giorni'}</option>
                    </select>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                  {[
                    { a: 10, u: 's' as StepUnit, label: '10s' },
                    { a: 30, u: 's' as StepUnit, label: '30s' },
                    { a: 1, u: 'm' as StepUnit, label: '1m' },
                    { a: 5, u: 'm' as StepUnit, label: '5m' },
                    { a: 1, u: 'h' as StepUnit, label: '1h' },
                  ].map((preset) => (
                    <button
                      key={`${preset.a}${preset.u}`}
                      type="button"
                      onClick={() => handleUpdateStep(preset.a, preset.u)}
                      className={`px-1.5 py-0.5 text-[10px] rounded font-mono font-medium transition ${
                        stepAmount === preset.a && stepUnit === preset.u
                          ? 'bg-sky-500 text-white font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsStepMenuOpen(false)}
                  className="w-full mt-1 py-1 bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold rounded-lg shadow-sm transition flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  {t('timemachine.confirm_step') || 'Fatto'}
                </button>
              </div>
            </div>
          )}
        </div>

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

        {/* Step Forward button with configured delta */}
        <button
          type="button"
          onClick={() => stepByDelta(1)}
          className="px-1.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono text-[10px] font-bold shrink-0 transition flex items-center gap-0.5 hover:text-sky-500 shadow-sm"
          title={`${t('timemachine.step_forward_tooltip')}: +${stepAmount}${stepUnit}`}
        >
          <span>+{stepAmount}{stepUnit}</span>
          <ChevronRight className="w-3 h-3 text-sky-500" />
        </button>
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

