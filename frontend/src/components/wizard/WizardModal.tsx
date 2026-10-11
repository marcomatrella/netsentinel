import React, { useState } from 'react';
import {
  X,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Database,
  GitFork,
  Radio,
  Eye,
  Mail,
  Play,
  FileCheck,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { Dependency, Device, FullTopology, Link } from '../../types';
import { applyTopology, deduceDependencies, simulateFailure } from '../../api/client';

interface WizardModalProps {
  initialTopology: FullTopology;
  isOpen: boolean;
  onClose: () => void;
  onApplied: () => void;
}

const STEPS = [
  { id: 1, label: 'Fonti Dati', icon: Database },
  { id: 2, label: 'Tela di Rete', icon: GitFork },
  { id: 3, label: 'Revisione Deduzioni', icon: CheckCircle2 },
  { id: 4, label: 'Controlli', icon: Radio },
  { id: 5, label: 'Vantage Point', icon: Eye },
  { id: 6, label: 'Notifiche', icon: Mail },
  { id: 7, label: 'Simulazione Guasti', icon: Play },
  { id: 8, label: 'Riepilogo & Salva', icon: FileCheck },
];

export const WizardModal: React.FC<WizardModalProps> = ({
  initialTopology,
  isOpen,
  onClose,
  onApplied,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [vantagePointId, setVantagePointId] = useState(initialTopology.vantage_point_id || 'synology-nas');
  const [devices, setDevices] = useState<Device[]>(initialTopology.devices || []);
  const [links, setLinks] = useState<Link[]>(initialTopology.links || []);
  const [dependencies, setDependencies] = useState<Dependency[]>(initialTopology.dependencies || []);
  const [simulatedDevice, setSimulatedDevice] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  // Step 3 transition: auto-deduce
  const handleNextToStep3 = async () => {
    try {
      const deduced = await deduceDependencies({
        vantage_point_id: vantagePointId,
        devices: devices.map((d) => ({ id: d.id, name: d.name, kind: d.kind, roles: d.roles })),
        links: links.map((l) => ({ id: l.id, from: l.from_device_id, to: l.to_device_id, medium: l.medium, poe: l.poe })),
      });
      setDependencies(deduced);
    } catch (err) {
      console.error('Errore deduzione:', err);
    }
    setCurrentStep(3);
  };

  // Step 7: simulate
  const handleRunSimulation = async (devId: string) => {
    setSimulatedDevice(devId);
    try {
      const res = await simulateFailure({
        failed_device_ids: [devId],
        failed_link_ids: [],
      });
      setSimulationResult(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveAndApply = async () => {
    setSaving(true);
    try {
      await applyTopology({
        vantage_point_id: vantagePointId,
        description: 'Salvataggio da Wizard NetSentinel',
        devices,
        links,
        dependencies,
        layout: initialTopology.layout || { nodes: [], edges: [], groups: [] },
      });
      onApplied();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Errore durante il salvataggio della configurazione.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Wizard Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div>
            <h2 className="font-bold text-slate-100 text-lg flex items-center gap-2">
              🛡️ Configurazione Rete — Wizard Guidato
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Passo {currentStep} di {STEPS.length}: {STEPS[currentStep - 1].label}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper Bar */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-4 py-2 overflow-x-auto gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isDone = s.id < currentStep;
            const isCurrent = s.id === currentStep;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStep(s.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  isCurrent ? 'bg-sky-600 text-white shadow' :
                  isDone ? 'bg-slate-800 text-emerald-400' :
                  'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Step Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          {currentStep === 1 && (
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className="font-bold text-slate-200 text-base">Integrazioni e Fonti Dati Locali</h3>
              <p className="text-xs text-slate-400">
                Collega le tue fonti locali per scoprire automaticamente gli apparati e importare metriche hardware avanzate.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { name: 'UniFi Network', desc: 'Stato AP, switch, porte e client Wi-Fi', active: true },
                  { name: 'Synology DSM', desc: 'Salute volumi, temperature e dischi S.M.A.R.T.', active: true },
                  { name: 'AdGuard Home', desc: 'Risoluzione DNS e lease rinnovi DHCP', active: true },
                  { name: 'NUT UPS', desc: 'Stato batteria, autonomia e carico', active: true },
                  { name: 'Home Assistant', desc: 'Stato sensori e automazioni domotiche', active: false },
                  { name: 'SNMP v2c/v3', desc: 'Statistiche e contatori porte switch', active: false },
                ].map((src) => (
                  <div key={src.name} className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex flex-col justify-between">
                    <div>
                      <div className="font-semibold text-slate-200 text-xs">{src.name}</div>
                      <div className="text-[11px] text-slate-400 mt-1">{src.desc}</div>
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${src.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                        {src.active ? 'Configurato' : 'Disattivato'}
                      </span>
                      <button className="text-xs text-sky-400 hover:text-sky-300">Configura</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className="font-bold text-slate-200 text-base">Disegno della Rete (Tela Grafica)</h3>
              <p className="text-xs text-slate-400">
                La tela interattiva è attiva nella schermata principale. Puoi trascinare gli apparati dalla palette e collegarli tra loro indicando il tipo di cavo o alimentazione.
              </p>
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 space-y-2 text-xs">
                <div className="font-semibold text-sky-400">Attualmente configurati sulla tela:</div>
                <div>• {devices.length} apparati monitorati</div>
                <div>• {links.length} collegamenti fisici/logici</div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-200 text-base">Revisione delle Relazioni Dedotte (Sez. 4.6)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Il sistema ha analizzato il disegno e dedotto automaticamente queste dipendenze logiche e fisiche.
                  </p>
                </div>
                <span className="text-xs font-mono bg-sky-950 text-sky-300 px-2.5 py-1 rounded border border-sky-800">
                  {dependencies.length} relazioni
                </span>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                {dependencies.map((dep, idx) => (
                  <div key={idx} className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50 flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{dep.dependent_id}</span>
                        <span className="text-slate-500">dipende da</span>
                        <span className="font-semibold text-slate-200">{dep.provider_id}</span>
                        <span className="bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-[10px] text-sky-400 font-mono uppercase">
                          {dep.kind}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 italic">
                        {dep.reason || 'Dedotta automaticamente dalla topologia.'}
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">
                      Inferred
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="max-w-xl mx-auto space-y-4">
              <h3 className="font-bold text-slate-200 text-base">Vantage Point e Heartbeat Esterno</h3>
              <p className="text-xs text-slate-400">
                Seleziona quale apparato ospita NetSentinel e configura il controllo di morte sicura (dead-man's switch).
              </p>
              <div className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Vantage Point (Host Monitor):</label>
                  <select
                    value={vantagePointId}
                    onChange={(e) => setVantagePointId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">URL Heartbeat Esterno (Healthchecks.io):</label>
                  <input
                    type="text"
                    defaultValue="https://hc-ping.com/your-uuid-here"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                  <span className="text-[11px] text-slate-500 block mt-1">
                    Se NetSentinel muore o internet cade, il servizio esterno invierà l'avviso.
                  </span>
                </div>
              </div>
            </div>
          )}

          {currentStep === 7 && (
            <div className="max-w-2xl mx-auto space-y-4">
              <h3 className="font-bold text-slate-200 text-base">Simulazione Guasti (Dry-Run)</h3>
              <p className="text-xs text-slate-400">
                Simula la rottura di un apparato per verificare quale causa radice verrebbe diagnosticata e quali notifiche partirebbero, senza inviare email reali.
              </p>
              <div className="flex gap-2">
                <select
                  value={simulatedDevice}
                  onChange={(e) => setSimulatedDevice(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">-- Seleziona apparato da guastare --</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.kind})
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => simulatedDevice && handleRunSimulation(simulatedDevice)}
                  disabled={!simulatedDevice}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Play className="w-3.5 h-3.5" /> Simula Guasto
                </button>
              </div>

              {simulationResult && (
                <div className="bg-slate-800/80 p-4 rounded-xl border border-rose-500/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-rose-400 text-xs">DIAGNOSI SIMULATA</span>
                    <span className="text-xs font-mono text-slate-300">Confidenza: {Math.round(simulationResult.confidence * 100)}%</span>
                  </div>
                  <div className="font-semibold text-slate-100">{simulationResult.diagnosis_title}</div>
                  <div className="text-xs text-slate-300">{simulationResult.diagnosis_summary}</div>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Nodi che diventerebbero sintomo ({simulationResult.impacted_devices.length}):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {simulationResult.impacted_devices.map((id: string) => (
                        <span key={id} className="bg-rose-950 border border-rose-800 text-rose-300 px-2 py-0.5 rounded text-[10px]">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStep === 8 && (
            <div className="max-w-xl mx-auto space-y-4 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
              <h3 className="font-bold text-slate-100 text-lg">Configurazione Pronta per l'Applicazione</h3>
              <p className="text-xs text-slate-400">
                Tutti i parametri e le relazioni dedotte sono stati validati. Cliccando su "Salva e Applica", NetSentinel attiverà il monitoraggio continuo e registrerà uno snapshot di versione.
              </p>
              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-700/60 text-xs space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-400">Apparati totali:</span>
                  <span className="font-semibold text-slate-200">{devices.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Collegamenti fisici:</span>
                  <span className="font-semibold text-slate-200">{links.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Relazioni dedotte:</span>
                  <span className="font-semibold text-slate-200">{dependencies.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Vantage Point:</span>
                  <span className="font-semibold text-sky-400">{vantagePointId}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 text-xs font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" /> Indietro
          </button>

          {currentStep < 8 ? (
            <button
              onClick={() => {
                if (currentStep === 2) {
                  handleNextToStep3();
                } else {
                  setCurrentStep(currentStep + 1);
                }
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow transition"
            >
              Avanti <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSaveAndApply}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Salvataggio in corso...' : 'Salva e Avvia Monitoraggio'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

