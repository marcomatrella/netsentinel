import React, { useCallback, useMemo } from 'react';
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
import { Device, Link, Incident } from '../../types';
import { getLayoutedElements } from '../../utils/elkLayout';

interface NetworkCanvasProps {
  devices: Device[];
  links: Link[];
  activeIncident: Incident | null;
  isEditMode?: boolean;
  onSelectDevice?: (device: Device | null) => void;
  onSelectLink?: (link: Link | null) => void;
  onNodesChangeParent?: (nodes: Node[]) => void;
  onEdgesChangeParent?: (edges: Edge[]) => void;
}

export const NetworkCanvas: React.FC<NetworkCanvasProps> = ({
  devices,
  links,
  activeIncident,
  isEditMode = false,
  onSelectDevice,
  onSelectLink,
}) => {
  const nodeTypes = useMemo(() => ({ customNode: CustomNode as any }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge as any }), []);

  // Map devices to React Flow nodes
  const initialNodes: Node[] = useMemo(() => {
    return devices.map((d, index) => {
      const isRoot = activeIncident?.root_cause_device_id === d.id;
      const isImpacted = activeIncident?.impacted?.includes(d.id);
      return {
        id: d.id,
        type: 'customNode',
        position: { x: 150 + (index % 4) * 240, y: 100 + Math.floor(index / 4) * 160 },
        data: {
          id: d.id,
          name: d.name,
          kind: d.kind,
          ip: d.addresses?.ip,
          status: d.status,
          roles: d.roles,
          isRootCause: isRoot,
          isImpacted: isImpacted,
          isVantagePoint: d.roles?.includes('vantage_point'),
        },
      };
    });
  }, [devices, activeIncident]);

  // Map links to React Flow edges
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

  // Sync when devices or links change
  React.useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  React.useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, type: 'customEdge', data: { medium: 'ethernet', status: 'ok' } }, eds)),
    [setEdges]
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    const dev = devices.find((d) => d.id === node.id);
    if (onSelectDevice && dev) onSelectDevice(dev);
  };

  const onEdgeClick = (_: React.MouseEvent, edge: Edge) => {
    const lnk = links.find((l) => l.id === edge.id);
    if (onSelectLink && lnk) onSelectLink(lnk);
  };

  const handleAutoLayout = async () => {
    const layouted = await getLayoutedElements(nodes, edges);
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
  };

  return (
    <div className="w-full h-full relative bg-slate-950">
      {/* Auto-layout overlay button */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={handleAutoLayout}
          className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium shadow-lg backdrop-blur-sm transition flex items-center gap-1.5"
          title="Organizza automaticamente nodi e livelli"
        >
          <span>✨ Auto-Layout (ELK)</span>
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={isEditMode ? onConnect : undefined}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        nodesDraggable={isEditMode || true}
        nodesConnectable={isEditMode}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334155" />
        <Controls className="!bg-slate-900 !border-slate-800 !text-slate-300 [&>button]:!bg-slate-850 [&>button]:!border-slate-700" />
        <MiniMap
          nodeColor={() => '#38bdf8'}
          maskColor="rgba(15, 23, 42, 0.7)"
          className="!bg-slate-900 !border-slate-800 rounded-lg overflow-hidden shadow-xl"
        />
      </ReactFlow>
    </div>
  );
};
