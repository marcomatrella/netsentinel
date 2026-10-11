import React, { useCallback, useMemo, useRef } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CustomNode } from './CustomNode';
import { CustomEdge } from './CustomEdge';
import { Device, Link, Incident, CanvasLayout } from '../../types';
import { getLayoutedElements } from '../../utils/elkLayout';
import { useTheme } from '../../theme/ThemeContext';

interface NetworkCanvasProps {
  devices: Device[];
  links: Link[];
  activeIncident: Incident | null;
  layout?: CanvasLayout | null;
  isEditMode?: boolean;
  onSelectDevice?: (device: Device | null) => void;
  onSelectLink?: (link: Link | null) => void;
  onLayoutChange?: (layout: CanvasLayout) => void;
  onConnectLink?: (newLink: Link) => void;
  onAddDeviceDrop?: (device: Device, position?: { x: number; y: number }) => void;
}

export const NetworkCanvas: React.FC<NetworkCanvasProps> = ({
  devices,
  links,
  activeIncident,
  layout,
  isEditMode = false,
  onSelectDevice,
  onSelectLink,
  onLayoutChange,
  onConnectLink,
  onAddDeviceDrop,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  const nodeTypes = useMemo(() => ({ customNode: CustomNode as any }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge as any }), []);

  // Helper to construct custom node data
  const buildNodeData = useCallback(
    (d: Device) => {
      const isRoot = activeIncident?.root_cause_device_id === d.id;
      const isImpacted = activeIncident?.impacted?.includes(d.id);
      return {
        id: d.id,
        name: d.name,
        kind: d.kind,
        ip: d.addresses?.ip,
        status: d.status,
        roles: d.roles,
        rtt_ms: d.rtt_ms,
        isRootCause: isRoot,
        isImpacted: isImpacted,
        isVantagePoint: d.roles?.includes('vantage_point'),
        isEditMode: isEditMode,
      };
    },
    [activeIncident, isEditMode]
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

  // Initial edges
  const initialEdges: Edge[] = useMemo(() => {
    return links.map((l) => {
      const isFault =
        activeIncident?.root_cause_device_id === l.from_device_id ||
        activeIncident?.root_cause_device_id === l.to_device_id;
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
        },
      };
    });
  }, [links, activeIncident]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Synchronize devices and live status updates WITHOUT losing node positions
  React.useEffect(() => {
    setNodes((prevNodes) => {
      const existingPosMap = new Map<string, { x: number; y: number }>();
      for (const pn of prevNodes) {
        existingPosMap.set(pn.id, pn.position);
      }

      return devices.map((d, index) => {
        // Priority:
        // 1. Current on-canvas position (so dragging or editing is never overwritten by SSE or state updates)
        // 2. Saved position from layout prop
        // 3. Fallback grid position
        const position =
          existingPosMap.get(d.id) ||
          layoutPosMap.get(d.id) || {
            x: 120 + (index % 3) * 260,
            y: 80 + Math.floor(index / 3) * 180,
          };

        return {
          id: d.id,
          type: 'customNode',
          position,
          data: buildNodeData(d),
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
      const newEdgeId = `lnk-${params.source}-${params.target}-${Math.floor(Math.random() * 1000)}`;
      const newEdge: Edge = {
        ...params,
        id: newEdgeId,
        type: 'customEdge',
        data: { medium: 'ethernet', status: 'ok' },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      if (onConnectLink) {
        onConnectLink({
          id: newEdgeId,
          from_device_id: params.source,
          to_device_id: params.target,
          medium: 'ethernet',
          poe: false,
          status: 'ok',
          updated_at: new Date().toISOString(),
        });
      }
    },
    [setEdges, onConnectLink]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    const dev = devices.find((d) => d.id === node.id);
    if (onSelectDevice && dev) onSelectDevice(dev);
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    const lnk = links.find((l) => l.id === edge.id);
    if (onSelectLink && lnk) onSelectLink(lnk);
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
        tags: [],
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

  return (
    <div
      ref={reactFlowWrapper}
      className="w-full h-full relative bg-slate-100 dark:bg-slate-950 transition-colors duration-150"
      onDragOver={isEditMode ? onDragOver : undefined}
      onDrop={isEditMode ? onDrop : undefined}
    >
      {/* Auto-layout overlay button (only visible in Edit Mode) */}
      {isEditMode && (
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          <button
            onClick={handleAutoLayout}
            className="px-3 py-1.5 bg-white/90 dark:bg-slate-800/90 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs font-medium shadow-lg backdrop-blur-sm transition flex items-center gap-1.5"
            title="Organizza automaticamente nodi e livelli"
          >
            <span>✨ Auto-Layout (ELK)</span>
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
        onConnect={isEditMode ? onConnect : undefined}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable={isEditMode}
        nodesConnectable={isEditMode}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color={theme === 'dark' ? '#334155' : '#cbd5e1'}
        />
        <Controls className="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-800 !text-slate-700 dark:!text-slate-300 [&>button]:!bg-slate-50 dark:[&>button]:!bg-slate-850 [&>button]:!border-slate-200 dark:[&>button]:!border-slate-700" />
        <MiniMap
          nodeColor={() => '#38bdf8'}
          maskColor={theme === 'dark' ? 'rgba(15, 23, 42, 0.7)' : 'rgba(241, 245, 249, 0.7)'}
          className="!bg-white dark:!bg-slate-900 !border-slate-200 dark:!border-slate-800 rounded-lg overflow-hidden shadow-xl"
        />
      </ReactFlow>
    </div>
  );
};
