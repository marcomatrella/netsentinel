import { Device } from '../types';

export const NETWORK_INTEGRATION_TYPES = [
  'unifi',
  'fritzbox',
  'omada',
  'mikrotik',
  'snmp_bridge',
  'opnsense',
  'pfsense',
  'asuswrt',
  'netgear',
] as const;

export type NetworkIntegrationType = (typeof NETWORK_INTEGRATION_TYPES)[number];

export interface IntegrationClientMatch {
  parentDevice: Device;
  integrationType: string;
  matchedClient: {
    mac: string;
    ip: string;
    name?: string;
    hostname?: string;
    is_wired: boolean;
    port?: string | number;
    ap_mac?: string;
    sw_mac?: string;
    uplink_mac?: string;
    essid?: string;
    signal?: number;
    interface?: string;
  };
}

export type UniFiClientMatch = IntegrationClientMatch;

/**
 * Normalizes MAC address string to lower-case colon-separated format.
 */
export function normalizeMac(mac?: string | null): string {
  if (!mac) return '';
  return mac.trim().toLowerCase().replace(/[:-]/g, '');
}

/**
 * Checks if a given device (e.g. client) is present in the connected clients list
 * of ANY network integration (UniFi, FRITZ!Box, Omada, MikroTik, Switch SNMP, OPNsense, etc.)
 * configured across topology devices.
 */
export function findIntegrationParentForDevice(
  device: Partial<Device>,
  topologyDevices: Device[]
): IntegrationClientMatch | null {
  const targetIp = (device.addresses?.ip || '').trim();
  const targetMacNorm = normalizeMac(device.addresses?.mac);

  if (!targetIp && !targetMacNorm) {
    return null;
  }

  for (const parent of topologyDevices) {
    if (!parent.integrations || parent.integrations.length === 0) continue;

    for (const integ of parent.integrations) {
      if (!integ.details) continue;
      // Check if it's one of the network integrations
      const isNetworkInteg = NETWORK_INTEGRATION_TYPES.includes(integ.type as any);
      if (!isNetworkInteg && !integ.details.connected_clients) continue;

      const clients: any[] =
        integ.details.connected_clients ||
        integ.details.all_clients ||
        [];

      for (const cli of clients) {
        const cliMacNorm = normalizeMac(cli.mac || cli.macAddress);
        const cliIp = (cli.ip || cli.ipAddress || '').trim();

        const macMatch = targetMacNorm && cliMacNorm && targetMacNorm === cliMacNorm;
        const ipMatch = targetIp && cliIp && targetIp === cliIp;

        if (macMatch || ipMatch) {
          return {
            parentDevice: parent,
            integrationType: integ.type,
            matchedClient: {
              mac: cli.mac || cli.macAddress || '',
              ip: cli.ip || cli.ipAddress || '',
              name: cli.name || cli.hostname,
              hostname: cli.hostname,
              is_wired: Boolean(
                cli.is_wired !== undefined
                  ? cli.is_wired
                  : String(cli.type).toUpperCase() === 'WIRED' ||
                    String(cli.interface).toLowerCase().includes('lan') ||
                    String(cli.interface).toLowerCase().includes('ether')
              ),
              port: cli.port,
              ap_mac: cli.ap_mac || cli.apMac || cli.uplinkDeviceMac,
              sw_mac: cli.sw_mac || cli.swMac,
              uplink_mac: cli.uplink_mac || cli.uplinkDeviceMac,
              essid: cli.essid || cli.network,
              signal: cli.signal || cli.rssi,
              interface: cli.interface,
            },
          };
        }
      }
    }
  }

  return null;
}

/**
 * Backward compatibility alias for findIntegrationParentForDevice.
 */
export function findUniFiParentForDevice(
  device: Partial<Device>,
  topologyDevices: Device[]
): IntegrationClientMatch | null {
  return findIntegrationParentForDevice(device, topologyDevices);
}
