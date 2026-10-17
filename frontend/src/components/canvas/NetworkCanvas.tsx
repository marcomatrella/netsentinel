import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  FitViewOptions,
  SelectionMode,
  OnSelectionChangeFunc,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Hand, BoxSelect, Trash2 } from 'lucide-react';

import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { Device, Link, Incident, CanvasLayout, SimulationResponse, LinkMedium } from '../../types';
import { getLayoutedElements } from '../../utils/elkLayout';
import { useTheme } from '../../theme/ThemeContext';
import { getDeviceColorId, getDefaultColorForKind } from '../../constants/colors';
import { useTranslation } from '../../i18n/I18nContext';

interface NetworkCanvasProps {
  devices: Device[];
  links: Link[];
  activeIncident: Incident | null;
  simulatedIncident?: SimulationResponse | null;
  activeMaintenanceWindows?: any[];
  layout?: CanvasLayout | null;
  isEditMode?: boolean;
  isKioskMode?: boolean;
  onSelectDevice?: (device: Device | null) => void;
  onSelectLink?: (link: Link | null) => void;
  onLayoutChange?: (layout: CanvasLayout) => void;
  onConnectLink?: (newLink: Link) => void;
  onAddDeviceDrop?: (device: Device, position?: { x: number; y: number }) => void;
  onDeleteDevice?: (deviceId: string) => void;
  onDeleteDevicesBatch?: (devices: Device[]) => void;
}

export const NetworkCanvas: React.FC<NetworkCanvasProps> = ({
  devices,
  links,
  activeIncident,
  simulatedIncident,
  activeMaintenanceWindows = [],
  layout,
  isEditMode = false,
  isKioskMode = false,
  onSelectDevice,
  onSelectLink,
  onLayoutChange,
  onConnectLink,
  onAddDeviceDrop,
  onDeleteDevice,
  onDeleteDevicesBatch,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const { t } = useTranslation();

  // Canvas interaction mode: 'pan' (default hand drag) or 'select' (rectangular box selection)
  const [interactionMode, setInteractionMode] = useState<'pan' | 'select'>('pan');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);

  // Automatically prune deselected/deleted devices from selection state
  useEffect(() => {
    const validIds = new Set(devices.map((d) => d.id));
    setSelectedDeviceIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [devices]);

  const nodeTypes = useMemo(() => ({ customNode: CustomNode as any }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge as any }), []);

  // Ensure fitView leaves sufficient padding at the bottom for the floating TimeMachine bar
  const fitViewOptions = useMemo<FitViewOptions>(
    () => ({
      padding: { top: '50px', bottom: '140px', left: '50px', right: '50px' },
      duration: 300,
    }),
    []
  );

  // Map active maintenance windows by deviceId
  const deviceMaintMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const w of activeMaintenanceWindows) {
      if (w.device_id) {
        map.set(w.device_id, w);
      }
    }
    return map;
  }, [activeMaintenanceWindows]);

  // Helper to construct custom node data
  const buildNodeData = useCallback(
    (d: Device) => {
      const isSimulatedRoot = simulatedIncident?.root_cause_device_id === d.id;
      // In simulation, symptoms are explicitly in symptoms dictionary or impacted_devices excluding root_cause
      const isSimulatedDownstream = Boolean(
        (simulatedIncident?.symptoms && simulatedIncident.symptoms[d.id]) ||
        (simulatedIncident?.impacted_devices?.includes(d.id) && !isSimulatedRoot)
      );

      const isRoot = isSimulatedRoot || activeIncident?.root_cause_device_id === d.id;
      const isImpacted = isSimulatedDownstream || Boolean(activeIncident?.impacted?.includes(d.id) && activeIncident?.root_cause_device_id !== d.id);
      const maintWin = deviceMaintMap.get(d.id);

      // In simulation mode, dynamically reflect simulated status
      let effectiveStatus = d.status;
      if (isSimulatedRoot) {
        effectiveStatus = 'down';
      } else if (isSimulatedDownstream) {
        effectiveStatus = (simulatedIncident?.symptoms?.[d.id] as any) || 'unreachable';
      }

      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        ip: d.addresses?.ip,
        status: effectiveStatus,
        roles: d.roles,
        rtt_ms: isSimulatedRoot ? null : d.rtt_ms,
        isRootCause: isRoot,
        isImpacted: isImpacted,
        isVantagePoint: d.roles?.includes('vantage_point'),
        isMaintenance: Boolean(maintWin || (d as any).is_maintenance),
        maintenanceTitle: maintWin?.title || (d as any).maintenance_title,
        maintenanceWindow: maintWin || ((d as any).is_maintenance ? {
          title: (d as any).maintenance_title || 'Intervento Programmato',
          start_ts: '',
          end_ts: '',
        } : undefined),
        isEditMode: isEditMode,
        color: getDeviceColorId(d.tags),
      };
    },
    [activeIncident, simulatedIncident, isEditMode, deviceMaintMap]
  );

  // Lookup map of saved node positions from backend layout
  const layoutPosMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    if (layout?.nodes && Array.isArray(layout.nodes)) {
      for (const ln of layout.nodes) {
        if (ln && ln.id && typeof ln.x === 'number' && typeof ln.y === 'number') {
          map.set(ln.id, { x: ln.x, y: ln.y });
        }
      }
    }
    return map;
  }, [layout?.nodes]);

  // Initial nodes computed only on initial load or layout reset
  const initialNodes: Node[] = useMemo(() => {
    return devices.map((d, index) => {
      const pos = layoutPosMap.get(d.id) || {
        x: 120 + (index % 3) * 260,
        y: 80 + Math.floor(index / 3) * 180,
      };
      return {
        id: d.id,
        type: 'customNode',
        position: pos,
        data: buildNodeData(d),
      };
    });
  }, [devices, layoutPosMap, buildNodeData]);

  // Map of device status by ID for instantaneous lookup
  const deviceStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) {
      if (simulatedIncident?.root_cause_device_id === d.id) {
        map.set(d.id, 'down');
      } else if (
        simulatedIncident?.symptoms?.[d.id] ||
        (simulatedIncident?.impacted_devices?.includes(d.id) && simulatedIncident.root_cause_device_id !== d.id)
      ) {
        map.set(d.id, (simulatedIncident?.symptoms?.[d.id] as any) || 'unreachable');
      } else {
        map.set(d.id, d.status);
      }
    }
    return map;
  }, [devices, simulatedIncident]);

  // Initial edges
  const initialEdges: Edge[] = useMemo(() => {
    return links.map((l) => {
      const fromStatus = deviceStatusMap.get(l.from_device_id) || 'ok';
      const toStatus = deviceStatusMap.get(l.to_device_id) || 'ok';

      // A link is a fault link ONLY if it connects directly to a down or unreachable node!
      const isFault =
        activeIncident?.root_cause_device_id === l.from_device_id ||
        activeIncident?.root_cause_device_id === l.to_device_id ||
        simulatedIncident?.root_cause_device_id === l.from_device_id ||
        simulatedIncident?.root_cause_device_id === l.to_device_id ||
        fromStatus === 'down' ||
        fromStatus === 'unreachable' ||
        fromStatus === 'isolated' ||
        toStatus === 'down' ||
        toStatus === 'unreachable' ||
        toStatus === 'isolated';

      return {
        id: l.id,
        source: l.from_device_id,
        target: l.to_device_id,
        type: 'customEdge',
        data: {
          medium: l.medium,
          poe: l.poe,
          status: l.status,
          statusSource: l.status_source,
          fromPort: l.from_port,
          toPort: l.to_port,
          isFaultPath: isFault,
          fromDeviceStatus: fromStatus,
          toDeviceStatus: toStatus,
        },
      };
    });
  }, [links, activeIncident, simulatedIncident, deviceStatusMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Synchronize devices and live status updates WITHOUT losing node positions or selection state
  React.useEffect(() => {
    setNodes((prevNodes) => {
      const existingMap = new Map<string, Node>();
      for (const pn of prevNodes) {
        existingMap.set(pn.id, pn);
      }

      return devices.map((d, index) => {
        const prev = existingMap.get(d.id);
        const position =
          prev?.position ||
          layoutPosMap.get(d.id) || {
            x: 120 + (index % 3) * 260,
            y: 80 + Math.floor(index / 3) * 180,
          };

        return {
          id: d.id,
          type: 'customNode',
          position,
          data: buildNodeData(d),
          selected: prev?.selected ?? false,
        };
      });
    });
  }, [devices, layoutPosMap, buildNodeData, setNodes]);

  // Synchronize edges when links or incident changes
  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Handle user dragging a node and releasing it (persist exact coordinates)
  const handleNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, _node: Node) => {
      setNodes((currentNodes) => {
        const updatedLayoutNodes = currentNodes.map((n) => ({
          id: n.id,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        }));

        if (onLayoutChange) {
          onLayoutChange({
            id: layout?.id || 'default',
            nodes: updatedLayoutNodes,
            edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
            groups: layout?.groups || [],
            updated_at: new Date().toISOString(),
          });
        }
        return currentNodes;
      });
    },
    [edges, layout, onLayoutChange, setNodes]
  );

  const handleSelectionDragStop = useCallback(
    (_event: React.MouseEvent, _nodes: Node[]) => {
      setNodes((currentNodes) => {
        const updatedLayoutNodes = currentNodes.map((n) => ({
          id: n.id,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        }));

        if (onLayoutChange) {
          onLayoutChange({
            id: layout?.id || 'default',
            nodes: updatedLayoutNodes,
            edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
            groups: layout?.groups || [],
            updated_at: new Date().toISOString(),
          });
        }
        return currentNodes;
      });
    },
    [edges, layout, onLayoutChange, setNodes]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      const srcDev = devices.find((d) => d.id === params.source);
      const dstDev = devices.find((d) => d.id === params.target);

      // Intelligent default medium deduction
      let inferredMedium: LinkMedium = 'ethernet';
      let inferredPoe = false;

      const isWanSrc = srcDev?.kind === 'wan_gateway' || srcDev?.kind === 'modem';
      const isWanDst = dstDev?.kind === 'wan_gateway' || dstDev?.kind === 'modem';
      const isApOrClientSrc = srcDev?.kind === 'access_point' || srcDev?.kind === 'client';
      const isApOrClientDst = dstDev?.kind === 'access_point' || dstDev?.kind === 'client';

      if (isWanSrc || isWanDst) {
        inferredMedium = 'fiber';
      } else if (
        (srcDev?.kind === 'access_point' && dstDev?.kind === 'client') ||
        (dstDev?.kind === 'access_point' && srcDev?.kind === 'client')
      ) {
        inferredMedium = 'wifi';
      } else if (
        (srcDev?.kind === 'switch' || srcDev?.kind === 'poe_injector') &&
        (dstDev?.kind === 'access_point' || dstDev?.kind === 'camera')
      ) {
        inferredMedium = 'poe';
        inferredPoe = true;
      }

      const newEdgeId = `lnk-${params.source}-${params.target}-${Math.floor(Math.random() * 1000)}`;
      const newEdge: Edge = {
        ...params,
        id: newEdgeId,
        type: 'customEdge',
        data: { medium: inferredMedium, poe: inferredPoe, status: 'ok' },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      if (onConnectLink) {
        onConnectLink({
          id: newEdgeId,
          from_device_id: params.source,
          to_device_id: params.target,
          medium: inferredMedium,
          poe: inferredPoe,
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      }
    },
    [devices, setEdges, onConnectLink]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    // In pan mode, selecting a single node opens the detail panel
    if (interactionMode === 'pan') {
      const dev = devices.find((d) => d.id === node.id);
      if (onSelectDevice && dev) onSelectDevice(dev);
    }
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    if (interactionMode === 'pan') {
      const lnk = links.find((l) => l.id === edge.id);
      if (onSelectLink && lnk) onSelectLink(lnk);
    }
  };

  // Sync multi-selection box changes from ReactFlow
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      const ids = selectedNodes.map((n) => n.id);
      setSelectedDeviceIds(ids);
    },
    []
  );

  const [devicesPendingBatchDelete, setDevicesPendingBatchDelete] = useState<Device[]>([]);

  const selectedDevicesList = useMemo(() => {
    const idSet = new Set(selectedDeviceIds);
    return devices.filter((d) => idSet.has(d.id));
  }, [devices, selectedDeviceIds]);

  const handleTriggerBatchDelete = () => {
    if (selectedDevicesList.length === 0) return;
    if (selectedDevicesList.length === 1 && onDeleteDevice) {
      onDeleteDevice(selectedDevicesList[0].id);
      return;
    }
    setDevicesPendingBatchDelete(selectedDevicesList);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmBatchDelete = () => {
    const toDelete = devicesPendingBatchDelete.length > 0 ? devicesPendingBatchDelete : selectedDevicesList;
    if (onDeleteDevicesBatch && toDelete.length > 0) {
      onDeleteDevicesBatch(toDelete);
    }
    setIsConfirmModalOpen(false);
    setDevicesPendingBatchDelete([]);
    setSelectedDeviceIds([]);
  };

  // Explicit user trigger for ELK Auto-Layout
  const handleAutoLayout = async () => {
    const layouted = await getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);

    const updatedLayoutNodes = layouted.nodes.map((n) => ({
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
    }));

    if (onLayoutChange) {
      onLayoutChange({
        id: layout?.id || 'default',
        nodes: updatedLayoutNodes,
        edges: layouted.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
        groups: layout?.groups || [],
        updated_at: new Date().toISOString(),
      });
    }
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData('application/reactflow/kind');
      const label = event.dataTransfer.getData('application/reactflow/label');
      const rolesJson = event.dataTransfer.getData('application/reactflow/roles');

      if (!kind) return;

      const roles = rolesJson ? JSON.parse(rolesJson) : [];
      const newDevId = `${kind}-${Math.floor(100 + Math.random() * 900)}`;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      const dropPosition = reactFlowBounds
        ? {
            x: Math.round(event.clientX - reactFlowBounds.left - 100),
            y: Math.round(event.clientY - reactFlowBounds.top - 40),
          }
        : undefined;

      const newDev: Device = {
        id: newDevId,
        name: label || `${kind.toUpperCase()}`,
        kind: kind as any,
        location: 'Casa',
        criticality: 3,
        addresses: { ip: `192.168.1.${Math.floor(10 + Math.random() * 200)}` },
        tags: [`color:${getDefaultColorForKind(kind)}`],
        roles,
        status: 'ok',
        status_since: new Date().toISOString(),
        interfaces: [],
      };

      if (onAddDeviceDrop) {
        onAddDeviceDrop(newDev, dropPosition);
      }
    },
    [onAddDeviceDrop]
  );

  // Configure OS-native tooltips on ReactFlow controls and strip browser default title attributes
  React.useEffect(() => {
    if (!reactFlowWrapper.current) return;
    const container = reactFlowWrapper.current;

    const setupTooltips = () => {
      const zoomIn = container.querySelector<HTMLElement>('.react-flow__controls-zoomin');
      const zoomOut = container.querySelector<HTMLElement>('.react-flow__controls-zoomout');
      const fitView = container.querySelector<HTMLElement>('.react-flow__controls-fitview');
      const interactive = container.querySelector<HTMLElement>('.react-flow__controls-interactive');

      if (zoomIn) {
        zoomIn.setAttribute('data-tooltip', t('canvas.zoom_in'));
        zoomIn.removeAttribute('title');
      }
      if (zoomOut) {
        zoomOut.setAttribute('data-tooltip', t('canvas.zoom_out'));
        zoomOut.removeAttribute('title');
      }
      if (fitView) {
        fitView.setAttribute('data-tooltip', t('canvas.fit_view'));
        fitView.removeAttribute('title');
      }
      if (interactive) {
        interactive.setAttribute('data-tooltip', t('canvas.lock'));
        interactive.removeAttribute('title');
      }
    };

    setupTooltips();
    const timer = setTimeout(setupTooltips, 100);
    return () => clearTimeout(timer);
  }, [t]);

  // Support Delete / Backspace key to remove selected device(s)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input, textarea or contenteditable element
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedDeviceIds.length > 1) {
          e.preventDefault();
          setIsConfirmModalOpen(true);
        } else if (selectedDeviceIds.length === 1) {
          e.preventDefault();
          const targetId = selectedDeviceIds[0];
          if (onDeleteDevice) {
            onDeleteDevice(targetId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedDeviceIds, onDeleteDevice]);

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full relative bg-slate-100 dark:bg-slate-950 transition-colors duration-150"
      onDragOver={isEditMode ? onDragOver : undefined}
      onDrop={isEditMode ? onDrop : undefined}
    >
      {/* Top-Left Tool Selector: Hand (Pan) & Dotted Box (Selection) */}
      <div className={`absolute ${isKioskMode ? 'top-16' : 'top-4'} left-4 z-20 flex items-center gap-2 transition-all duration-200`}>
        <div className="flex items-center p-1 bg-white/95 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg backdrop-blur-md">
          {/* Tool 1: Pan / Drag (Hand) */}
          <button
            type="button"
            onClick={() => setInteractionMode('pan')}
            className={`p-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              interactionMode === 'pan'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t('canvas.tool_pan')}
          >
            <Hand className="w-4 h-4" />
          </button>

          {/* Tool 2: Selection / Box (Dotted Rectangle) */}
          <button
            type="button"
            onClick={() => setInteractionMode('select')}
            className={`p-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer ${
              interactionMode === 'select'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={t('canvas.tool_select')}
          >
            <BoxSelect className="w-4 h-4" />
          </button>
        </div>

        {/* Selected devices action pill (visible when 1 or more devices are selected) */}
        {selectedDeviceIds.length > 0 && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
            <span className="px-3 py-1.5 bg-slate-900/90 dark:bg-slate-800/90 text-white border border-slate-700/60 rounded-xl text-xs font-medium shadow-lg backdrop-blur-md">
              {t('canvas.selected_badge', { count: selectedDeviceIds.length })}
            </span>
            <button
              type="button"
              onClick={handleTriggerBatchDelete}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition flex items-center gap-1.5 cursor-pointer"
              title={t('canvas.delete_selected', { count: selectedDeviceIds.length })}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('canvas.delete_selected', { count: selectedDeviceIds.length })}</span>
            </button>
          </div>
        )}
      </div>

      {/* Auto-layout overlay button (only visible in Edit Mode) */}
      {isEditMode && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={handleAutoLayout}
            className="px-3 py-1.5 bg-white/90 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-medium shadow-lg backdrop-blur-sm transition flex items-center gap-1.5"
            title={t('canvas.auto_layout')}
          >
            <span>✨ {t('canvas.auto_layout')}</span>
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onSelectionDragStop={handleSelectionDragStop}
        onSelectionChange={handleSelectionChange}
        onConnect={isEditMode ? onConnect : undefined}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={fitViewOptions}
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable={isEditMode}
        nodesConnectable={isEditMode}
        elementsSelectable={true}
        panOnDrag={interactionMode === 'pan'}
        selectionOnDrag={interactionMode === 'select'}
        selectionMode={SelectionMode.Partial}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color={theme === 'dark' ? '#334155' : '#cbd5e1'}
        />
        <Controls
          fitViewOptions={fitViewOptions}
          className="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-800 !text-slate-700 dark:!text-slate-300 [&>button]:!w-8 [&>button]:!h-8 [&>button]:!bg-slate-50 dark:[&>button]:!bg-slate-850 [&>button]:!border-slate-200 dark:[&>button]:!border-slate-700 hover:[&>button]:!bg-slate-200 dark:hover:[&>button]:!bg-slate-750 [&>button]:transition-all [&>button]:shadow-sm"
          aria-label={t('canvas.fit_view')}
          position="bottom-left"
        />
        <MiniMap
          nodeColor={() => '#38bdf8'}
          maskColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(241, 245, 249, 0.7)'}
          className="!hidden sm:!block !bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-800 rounded-lg overflow-hidden shadow-xl"
        />
      </ReactFlow>

      {/* Confirmation Modal for Multiple Devices Deletion */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 text-slate-800 dark:text-slate-100 relative">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {t('canvas.confirm_batch_delete_title')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('canvas.confirm_batch_delete_hint')}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
              {t('canvas.confirm_batch_delete_msg', { count: devicesPendingBatchDelete.length })}
            </p>

            {/* List of devices to be deleted */}
            <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/80 mb-5">
              {devicesPendingBatchDelete.map((dev) => (
                <div key={dev.id} className="p-2.5 flex items-center justify-between text-xs bg-slate-50/50 dark:bg-slate-950/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {dev.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {dev.addresses?.ip || dev.id}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200/60 dark:bg-slate-800 text-slate-500 shrink-0">
                    {dev.kind}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
              >
                {t('canvas.btn_cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('canvas.btn_confirm_delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
