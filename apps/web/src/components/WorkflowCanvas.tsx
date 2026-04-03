import type { WorkflowNodeCatalogItem, WorkflowVersionDetail } from '@platform/types';
import type { Connection, Edge, Node } from '@xyflow/react';

import { Card, List, Tag, Typography } from 'antd';
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import { useMemo } from 'react';

import { buildWorkflowStats } from '@/features/workflows/workflow-utils';

const { Paragraph, Text } = Typography;

const categoryColor: Record<WorkflowNodeCatalogItem['category'], string> = {
  source: '#155e75',
  preprocess: '#0f766e',
  split: '#a16207',
  inference: '#1d4ed8',
  postprocess: '#7c3aed',
};

function toFlowNodes(
  catalog: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
): Node[] {
  return workflowVersion.graph.nodes.map((node) => {
    const category = catalog.find((item) => item.type === node.type)?.category ?? 'source';
    return {
      id: node.id,
      position: node.position,
      data: {
        label: (
          <div className="flow-node">
            <div className="flow-node-type">{node.type}</div>
            <strong>{catalog.find((item) => item.type === node.type)?.label ?? node.type}</strong>
          </div>
        ),
      },
      style: {
        borderRadius: 18,
        padding: 12,
        border: `1px solid ${categoryColor[category]}`,
        background: 'rgba(255,255,255,0.94)',
        width: 220,
        boxShadow: '0 14px 30px rgba(15, 23, 42, 0.12)',
      },
    };
  });
}

function toFlowEdges(workflowVersion: WorkflowVersionDetail): Edge[] {
  return workflowVersion.graph.edges.map((edge) => ({
    ...edge,
    animated: edge.target.includes('inference'),
  }));
}

function CanvasInner({
  catalog,
  workflowVersion,
}: {
  catalog: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(catalog, workflowVersion));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toFlowEdges(workflowVersion));
  const stats = useMemo(() => buildWorkflowStats(catalog, workflowVersion), [catalog, workflowVersion]);

  const onConnect = (connection: Connection) => {
    setEdges((current) => addEdge({ ...connection, animated: true }, current));
  };

  const addNode = (item: WorkflowNodeCatalogItem) => {
    setNodes((current) => [
      ...current,
      {
        id: `${item.type}-${current.length + 1}`,
        position: { x: 120 + current.length * 50, y: 260 },
        data: {
          label: (
            <div className="flow-node">
              <div className="flow-node-type">{item.type}</div>
              <strong>{item.label}</strong>
            </div>
          ),
        },
        style: {
          borderRadius: 18,
          padding: 12,
          border: `1px solid ${categoryColor[item.category]}`,
          background: 'rgba(255,255,255,0.94)',
          width: 220,
        },
      },
    ]);
  };

  return (
    <div className="workflow-grid">
      <Card className="workflow-palette" bordered={false}>
        <Text className="panel-kicker">Node Library</Text>
        <Paragraph className="panel-title">Compose preprocessing, split, inference, and export jobs.</Paragraph>
        <List
          dataSource={catalog}
          renderItem={(item) => (
            <List.Item className="catalog-item" onClick={() => addNode(item)}>
              <div>
                <strong>{item.label}</strong>
                <Paragraph className="catalog-copy">{item.description}</Paragraph>
              </div>
              <Tag color={categoryColor[item.category]}>{item.category}</Tag>
            </List.Item>
          )}
        />
        <div className="workflow-stats">
          <div>{stats.nodeCount} nodes</div>
          <div>{stats.edgeCount} edges</div>
          <div>{stats.categoryCount} categories</div>
        </div>
      </Card>

      <Card className="workflow-canvas-card" bordered={false}>
        <div className="workflow-canvas">
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} fitView>
            <Background gap={20} color="#d6d3d1" />
            <MiniMap zoomable pannable />
            <Controls />
          </ReactFlow>
        </div>
      </Card>
    </div>
  );
}

export function WorkflowCanvas(props: {
  catalog: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
