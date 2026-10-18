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

    case 'fritzbox':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#004990] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="AVM FRITZ!Box"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="9" width="20" height="11" rx="2" />
              <path d="M5 9V5a2 2 0 0 1 2-2" />
              <path d="M12 9V3" />
              <circle cx="7" cy="14.5" r="1.5" fill="#E30613" stroke="none" />
              <circle cx="12" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="17" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#004990" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>AVM FRITZ!Box</title>
          <rect x="2" y="9" width="20" height="11" rx="2" />
          <path d="M5 9V5a2 2 0 0 1 2-2" />
          <path d="M12 9V3" />
          <circle cx="7" cy="14.5" r="1.5" fill="#E30613" stroke="none" />
          <circle cx="12" cy="14.5" r="1.5" fill="#004990" stroke="none" />
        </svg>
      );

    case 'omada':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#00A4A6] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="TP-Link Omada"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="9" r="5" />
              <circle cx="16" cy="15" r="5" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#00A4A6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>TP-Link Omada</title>
          <circle cx="8" cy="9" r="5" />
          <circle cx="16" cy="15" r="5" />
          <circle cx="12" cy="12" r="2" fill="#00A4A6" />
        </svg>
      );

    case 'mikrotik':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#002D62] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="MikroTik RouterOS"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19V5l8 7 8-7v14" />
              <line x1="4" y1="19" x2="20" y2="19" stroke="#E41F26" strokeWidth="2.5" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#E41F26" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>MikroTik RouterOS</title>
          <path d="M4 19V5l8 7 8-7v14" stroke="#002D62" />
          <line x1="4" y1="19" x2="20" y2="19" stroke="#E41F26" strokeWidth="2.5" />
        </svg>
      );

    case 'snmp_bridge':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#7C3AED] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="Switch Gestito SNMP"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="6" width="20" height="12" rx="2" />
              <rect x="5" y="10" width="3" height="4" rx="0.5" fill="currentColor" />
              <rect x="10.5" y="10" width="3" height="4" rx="0.5" fill="currentColor" />
              <rect x="16" y="10" width="3" height="4" rx="0.5" fill="currentColor" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>Switch Gestito SNMP</title>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <rect x="5" y="10" width="3" height="4" rx="0.5" fill="#7C3AED" />
          <rect x="10.5" y="10" width="3" height="4" rx="0.5" fill="#7C3AED" />
          <rect x="16" y="10" width="3" height="4" rx="0.5" fill="#7C3AED" />
        </svg>
      );

    case 'opnsense':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#D9534F] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="OPNsense"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <circle cx="12" cy="11" r="2.5" fill="currentColor" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#D9534F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>OPNsense</title>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <circle cx="12" cy="11" r="2.5" fill="#D9534F" />
        </svg>
      );

    case 'pfsense':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#1E395B] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="pfSense"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12h6M12 9v6" strokeWidth="2.2" stroke="#38BDF8" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#1E395B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>pfSense</title>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12h6M12 9v6" strokeWidth="2.2" stroke="#38BDF8" />
        </svg>
      );

    case 'asuswrt':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#00539B] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="ASUS Router"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="18" height="8" rx="2" />
              <line x1="6" y1="12" x2="4" y2="4" strokeWidth="2.2" />
              <line x1="18" y1="12" x2="20" y2="4" strokeWidth="2.2" />
              <circle cx="8" cy="16" r="1" fill="currentColor" />
              <circle cx="12" cy="16" r="1" fill="currentColor" />
              <circle cx="16" cy="16" r="1" fill="currentColor" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#00539B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>ASUS Router</title>
          <rect x="3" y="12" width="18" height="8" rx="2" />
          <line x1="6" y1="12" x2="4" y2="4" strokeWidth="2.2" />
          <line x1="18" y1="12" x2="20" y2="4" strokeWidth="2.2" />
        </svg>
      );

    case 'netgear':
      if (withBackground) {
        return (
          <div
            className={`flex items-center justify-center rounded-lg bg-[#27272A] text-white shadow-sm shrink-0 ${className}`}
            style={{ width: numSize + 8, height: numSize + 8 }}
            title="Netgear Router"
          >
            <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 19V5l14 14V5" />
            </svg>
          </div>
        );
      }
      return (
        <svg width={numSize} height={numSize} viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
          <title>Netgear Router</title>
          <path d="M5 19V5l14 14V5" />
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
