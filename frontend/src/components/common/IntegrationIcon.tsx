import React from 'react';
import { Layers } from 'lucide-react';

interface IntegrationIconProps {
  type: string;
  size?: number | string;
  className?: string;
  withBackground?: boolean;
}

export const IntegrationIcon: React.FC<IntegrationIconProps> = ({
  type,
  size = 20,
  className = '',
  withBackground = false,
}) => {
  const numSize = typeof size === 'number' ? size : parseInt(size, 10) || 20;

  switch (type) {
    case 'unifi':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#006FFF] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="Ubiquiti UniFi"
          >
            <svg
              width={numSize}
              height={numSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Ubiquiti iconic U curve */}
              <path d="M6 3v9a6 6 0 0 0 12 0V3" />
              <path d="M9 3v8a3 3 0 0 0 6 0V3" />
              <circle cx="12" cy="18" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
        );
      }
      return (
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#006FFF"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 ${className}`}
        >
          <title>Ubiquiti UniFi</title>
          <path d="M6 3v9a6 6 0 0 0 12 0V3" />
          <path d="M9 3v8a3 3 0 0 0 6 0V3" />
          <circle cx="12" cy="18" r="1.5" fill="#006FFF" stroke="none" />
        </svg>
      );

    case 'adguard_home':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#68BC71] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="AdGuard Home"
          >
            <svg
              width={numSize}
              height={numSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* AdGuard Shield */}
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
        );
      }
      return (
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#68BC71"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 ${className}`}
        >
          <title>AdGuard Home</title>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );

    case 'home_assistant':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#03A9F4] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="Home Assistant"
          >
            <svg
              width={numSize}
              height={numSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
              <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
        );
      }
      return (
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#03A9F4"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 ${className}`}
        >
          <title>Home Assistant</title>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
          <circle cx="12" cy="7" r="1.5" fill="#03A9F4" stroke="none" />
        </svg>
      );

    case 'synology_dsm':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#2B3E50] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="Synology DSM"
          >
            <svg
              width={numSize}
              height={numSize}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="8" x="2" y="3" rx="2" />
              <rect width="20" height="8" x="2" y="13" rx="2" />
              <line x1="6" x2="6.01" y1="7" y2="7" strokeWidth="2.5" />
              <line x1="6" x2="6.01" y1="17" y2="17" strokeWidth="2.5" />
              <line x1="10" x2="18" y1="7" y2="7" />
              <line x1="10" x2="18" y1="17" y2="17" />
            </svg>
          </div>
        );
      }
      return (
        <svg
          width={numSize}
          height={numSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#475569"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 dark:stroke-slate-300 ${className}`}
        >
          <title>Synology DSM</title>
          <rect width="20" height="8" x="2" y="3" rx="2" />
          <rect width="20" height="8" x="2" y="13" rx="2" />
          <line x1="6" x2="6.01" y1="7" y2="7" strokeWidth="2.5" />
          <line x1="6" x2="6.01" y1="17" y2="17" strokeWidth="2.5" />
          <line x1="10" x2="18" y1="7" y2="7" />
          <line x1="10" x2="18" y1="17" y2="17" />
        </svg>
      );

    default:
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-slate-700 text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
          >
            <Layers size={numSize} />
          </div>
        );
      }
      return <Layers size={numSize} className={`shrink-0 text-slate-500 ${className}`} />;
  }
};
