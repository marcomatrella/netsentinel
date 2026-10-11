import React, { useState } from 'react';
import { X, Shield, Check } from 'lucide-react';
import { Device } from '../../types';
import { assignNetworkRoles } from '../../api/client';
import { useTranslation } from '../../i18n/I18nContext';

interface NetworkRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: Device[];
  vantagePointId?: string | null;
  onRolesAssigned: (updatedTopology: any) => void;
}

export const NetworkRolesModal: React.FC<NetworkRolesModalProps> = ({
  isOpen,
  onClose,
  devices,
  vantagePointId,
  onRolesAssigned,
}) => {
  const { t } = useTranslation();

  // Find current role holders
  const currentDns = devices.find((d) => d.roles?.includes('dns_resolver'))?.id || '';
  const currentDhcp = devices.find((d) => d.roles?.includes('dhcp_server'))?.id || '';
  const currentGateway = devices.find((d) => d.roles?.includes('gateway') || d.kind === 'router')?.id || '';
  const currentVp = vantagePointId || devices.find((d) => d.roles?.includes('vantage_point'))?.id || '';

  const [selectedDns, setSelectedDns] = useState<string>(currentDns);
  const [selectedDhcp, setSelectedDhcp] = useState<string>(currentDhcp);
  const [selectedGateway, setSelectedGateway] = useState<string>(currentGateway);
  const [selectedVp, setSelectedVp] = useState<string>(currentVp);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  React.useEffect(() => {
    setSelectedDns(currentDns);
    setSelectedDhcp(currentDhcp);
    setSelectedGateway(currentGateway);
    setSelectedVp(currentVp);
  }, [currentDns, currentDhcp, currentGateway, currentVp]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const updated = await assignNetworkRoles({
        dns_server_id: selectedDns || undefined,
        dhcp_server_id: selectedDhcp || undefined,
        gateway_id: selectedGateway || undefined,
        vantage_point_id: selectedVp || undefined,
      });
      onRolesAssigned(updated);
      onClose();
    } catch (err: any) {
      console.error('Errore assegnazione ruoli:', err);
      alert('Errore assegnazione ruoli: ' + (err.message || 'Verifica il backend.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-slate-100 text-sm">{t('network_roles.modal_title')}</h2>
              <p className="text-[11px] text-slate-400">
                {t('network_roles.modal_desc')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* DNS Server Selector */}
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                {t('network_roles.dns_label')}
              </label>
              <span className="text-[10px] text-cyan-400 font-mono">{t('network_roles.port_53')}</span>
            </div>
            <select
              value={selectedDns}
              onChange={(e) => setSelectedDns(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="">{t('network_roles.no_dns')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.addresses?.ip || 'no IP'}) — {d.kind.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* DHCP Server Selector */}
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-700/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {t('network_roles.dhcp_label')}
              </label>
              <span className="text-[10px] text-amber-400 font-mono">{t('network_roles.port_67')}</span>
            </div>
            <select
              value={selectedDhcp}
              onChange={(e) => setSelectedDhcp(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-amber-500 font-medium"
            >
              <option value="">{t('network_roles.no_dhcp')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.addresses?.ip || 'no IP'}) — {d.kind.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Gateway WAN Selector */}
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-700/60 space-y-1.5">
            <label className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              {t('network_roles.gateway_label')}
            </label>
            <select
              value={selectedGateway}
              onChange={(e) => setSelectedGateway(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="">{t('network_roles.no_gateway')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.addresses?.ip || 'no IP'}) — {d.kind.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Vantage Point Selector */}
          <div className="bg-slate-850 p-3 rounded-xl border border-slate-700/60 space-y-1.5">
            <label className="font-bold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              {t('network_roles.vp_label')}
            </label>
            <select
              value={selectedVp}
              onChange={(e) => setSelectedVp(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">{t('network_roles.no_vp')}</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.addresses?.ip || 'no IP'})
                </option>
              ))}
            </select>
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-md shadow-sky-500/20 transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? t('network_roles.btn_saving') : t('network_roles.btn_save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
