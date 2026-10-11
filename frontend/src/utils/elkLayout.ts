import ELK, { ElkNode } from 'elkjs/lib/elk.bundled.js';
import { Node, Edge } from '@xyflow/react';

const elk = new ELK();

const defaultLayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.spacing.nodeNode': '80',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
};

export async function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options = defaultLayoutOptions
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: options,
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width || 210,
      height: node.measured?.height || 95,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  try {
    const layoutedGraph = await elk.layout(graph);

    const layoutedNodes = nodes.map((node) => {
      const layoutNode = layoutedGraph.children?.find((n) => n.id === node.id);
      return {
        ...node,
        position: {
          x: layoutNode?.x ?? node.position.x,
          y: layoutNode?.y ?? node.position.y,
        },
      };
    });

    return { nodes: layoutedNodes, edges };
  } catch (error) {
    console.error('ELK layout failed, retaining existing coordinates:', error);
    return { nodes, edges };
  }
}
