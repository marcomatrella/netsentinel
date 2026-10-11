import React, { useState } from 'react';
import { History, Play, Pause, RotateCcw } from 'lucide-react';

interface TimeMachineSliderProps {
  onTimeChange?: (timestamp: Date) => void;
  onLiveMode?: () => void;
  isLive?: boolean;
}

export const TimeMachineSlider: React.FC<TimeMachineSliderProps> = ({
  onTimeChange,
  onLiveMode,
  isLive = true,
}) => {
  const [offsetHours, setOffsetHours] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
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
    setIsPlaying(false);
    if (onLiveMode) onLiveMode();
  };


  const currentDateDisplay = offsetHours === 0
    ? 'Tempo Reale (LIVE)'
    : new Date(Date.now() - offsetHours * 3600 * 1000).toLocaleString('it-IT');

  return (
    <div className="bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 text-xs select-none">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-sky-500 dark:text-sky-400" />
        <span className="font-semibold text-slate-700 dark:text-slate-200">Macchina del Tempo:</span>
        <span className={`font-mono px-2 py-0.5 rounded text-[11px] ${
          offsetHours === 0
            ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold'
            : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
        }`}>
          {currentDateDisplay}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-1 max-w-xs">
        <span className="text-[10px] text-slate-400 dark:text-slate-500">-24h</span>
        <input
          type="range"
          min="0"
          max="24"
          step="0.5"
          value={offsetHours}
          onChange={handleSliderChange}
          className="w-full accent-sky-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
        />
        <span className="text-[10px] text-slate-400 dark:text-slate-500">Ora</span>
      </div>

      <div className="flex items-center gap-2">
        {offsetHours > 0 && (
          <button
            onClick={resetToLive}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition"
          >
            <RotateCcw className="w-3 h-3" /> Torna al Live
          </button>
        )}
      </div>
    </div>
  );
};

