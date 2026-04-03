import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
  WorkflowNodeCatalogItem,
  WorkflowVersionDetail,
} from '@platform/types';
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  NodeProps,
} from '@xyflow/react';

import { App, Button, Card, Empty, Input, InputNumber, List, Select, Switch, Tag, Typography } from 'antd';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  createDefaultParams,
  enrichWorkflowCatalog,
  getWorkflowDefinitionByType,
  resolveParameterOptions,
  type WorkflowEditorContext,
  type WorkflowNodeDefinition,
  type WorkflowParamDefinition,
  type WorkflowPortDefinition,
} from '@/features/workflows/node-registry';
import { useI18n } from '@/i18n/useI18n';
import {
  workflowCategoryKey,
  workflowNodeDescriptionKey,
  workflowNodeLabelKey,
} from '@/lib/i18n-helpers';

const { Paragraph, Text, Title } = Typography;

const categoryColor: Record<WorkflowNodeDefinition['category'], string> = {
  source: '#155e75',
  preprocess: '#0f766e',
  split: '#a16207',
  inference: '#1d4ed8',
  postprocess: '#7c3aed',
};

interface WorkflowFlowNodeData {
  [key: string]: unknown;
  type: string;
  title: string;
  description: string;
  category: WorkflowNodeDefinition['category'];
  categoryLabel: string;
  inputs: WorkflowPortDefinition[];
  outputs: WorkflowPortDefinition[];
  params: Record<string, unknown>;
  inputBindings: Record<string, string>;
  canManage: boolean;
  inputLabel: string;
  outputLabel: string;
  unboundLabel: string;
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, 'workflowNode'>;

function formatBindingSummary(binding: string | undefined): string {
  if (!binding) {
    return '';
  }

  const [sourceNodeId, sourcePort] = binding.split(':');
  return sourcePort ? `${sourceNodeId} -> ${sourcePort}` : sourceNodeId;
}

function summarizeParamValue(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'string') {
    return value.length > 22 ? `${value.slice(0, 19)}...` : value;
  }
  return '';
}

function WorkflowEditorNode({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const previewParams = Object.entries(data.params)
    .map(([key, value]) => ({
      key,
      value: summarizeParamValue(value),
    }))
    .filter((item) => item.value)
    .slice(0, 2);

  return (
    <div className={`workflow-node-card${selected ? ' is-selected' : ''}`}>
      <div className="workflow-node-card-head">
        <div>
          <div className="workflow-node-card-kicker">{data.type}</div>
          <strong>{data.title}</strong>
        </div>
        <Tag color={categoryColor[data.category]}>{data.categoryLabel}</Tag>
      </div>
      <Paragraph className="workflow-node-card-copy">{data.description}</Paragraph>

      {previewParams.length ? (
        <div className="workflow-node-parameter-preview">
          {previewParams.map((item) => (
            <Tag key={item.key} bordered={false} color="default">
              {item.key}: {item.value}
            </Tag>
          ))}
        </div>
      ) : null}

      <div className="workflow-node-port-section">
        <div className="workflow-node-port-title">{data.inputLabel}</div>
        {data.inputs.length ? (
          data.inputs.map((port) => (
            <div key={port.key} className="workflow-node-port-row">
              <Handle
                type="target"
                position={Position.Left}
                id={port.key}
                isConnectable={data.canManage}
                className="workflow-handle workflow-handle-target"
                style={{ top: '50%' }}
              />
              <div>
                <div className="workflow-node-port-label">{port.label}</div>
                <div className="workflow-node-port-binding">
                  {formatBindingSummary(data.inputBindings[port.key]) || data.unboundLabel}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="workflow-node-port-empty">{data.unboundLabel}</div>
        )}
      </div>

      <div className="workflow-node-port-section">
        <div className="workflow-node-port-title">{data.outputLabel}</div>
        {data.outputs.length ? (
          data.outputs.map((port) => (
            <div key={port.key} className="workflow-node-port-row workflow-node-port-row-output">
              <div className="workflow-node-port-label">{port.label}</div>
              <Handle
                type="source"
                position={Position.Right}
                id={port.key}
                isConnectable={data.canManage}
                className="workflow-handle workflow-handle-source"
                style={{ top: '50%' }}
              />
            </div>
          ))
        ) : (
          <div className="workflow-node-port-empty">{data.unboundLabel}</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  workflowNode: WorkflowEditorNode,
};

function inferEdgeHandles(
  edge: Edge,
  workflowVersion: WorkflowVersionDetail,
  definitions: WorkflowNodeDefinition[],
): Pick<Edge, 'sourceHandle' | 'targetHandle'> {
  const targetNode = workflowVersion.graph.nodes.find((item) => item.id === edge.target);
  const sourceNode = workflowVersion.graph.nodes.find((item) => item.id === edge.source);

  if (edge.sourceHandle && edge.targetHandle) {
    return {
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    };
  }

  const inferredBinding = Object.entries(targetNode?.inputBindings ?? {}).find(([, value]) => {
    const [sourceId] = value.split(':');
    return sourceId === edge.source;
  });

  if (inferredBinding) {
    const [targetHandle, value] = inferredBinding;
    const [, sourceHandle] = value.split(':');
    return {
      sourceHandle: edge.sourceHandle ?? sourceHandle,
      targetHandle: edge.targetHandle ?? targetHandle,
    };
  }

  const sourceDefinition = getWorkflowDefinitionByType(definitions, sourceNode?.type ?? '');
  const targetDefinition = getWorkflowDefinitionByType(definitions, targetNode?.type ?? '');

  return {
    sourceHandle:
      edge.sourceHandle ?? sourceNode?.outputDefs[0]?.key ?? sourceDefinition?.outputs[0]?.key,
    targetHandle: edge.targetHandle ?? targetDefinition?.inputs[0]?.key,
  };
}

function buildInputBindings(edges: Edge[], nodeId: string): Record<string, string> {
  const bindings: Record<string, string> = {};

  for (const edge of edges) {
    if (
      edge.target === nodeId &&
      typeof edge.targetHandle === 'string' &&
      typeof edge.sourceHandle === 'string'
    ) {
      bindings[edge.targetHandle] = `${edge.source}:${edge.sourceHandle}`;
    }
  }

  return bindings;
}

function applyBindingsToNodes(
  nodes: WorkflowFlowNode[],
  edges: Edge[],
): WorkflowFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      inputBindings: buildInputBindings(edges, node.id),
    },
  }));
}

function resolveNodeCollisions(nodes: WorkflowFlowNode[]): WorkflowFlowNode[] {
  const cardWidth = 272;
  const cardHeight = 312;
  const gapX = 56;
  const gapY = 72;
  const positioned: WorkflowFlowNode[] = [];

  for (const node of [...nodes].sort((left, right) => left.position.x - right.position.x)) {
    let nextPosition = { ...node.position };
    let hasCollision = true;

    while (hasCollision) {
      const collision = positioned.find((existing) => {
        const horizontalOverlap =
          nextPosition.x < existing.position.x + cardWidth + gapX &&
          nextPosition.x + cardWidth + gapX > existing.position.x;
        const verticalOverlap =
          nextPosition.y < existing.position.y + cardHeight + gapY &&
          nextPosition.y + cardHeight + gapY > existing.position.y;

        return horizontalOverlap && verticalOverlap;
      });

      if (!collision) {
        hasCollision = false;
        break;
      }

      nextPosition = {
        x: collision.position.x + cardWidth + gapX,
        y: collision.position.y,
      };
    }

    positioned.push({
      ...node,
      position: nextPosition,
    });
  }

  return positioned;
}

function buildFlowNodes(
  definitions: WorkflowNodeDefinition[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  canManage: boolean,
  t: ReturnType<typeof useI18n>['t'],
): WorkflowFlowNode[] {
  return resolveNodeCollisions(
    workflowVersion.graph.nodes.map((node) => {
      const definition = getWorkflowDefinitionByType(definitions, node.type);
      const outputs = definition?.outputs ?? node.outputDefs;

      return {
        id: node.id,
        type: 'workflowNode',
        position: node.position,
        draggable: canManage,
        selectable: true,
        data: {
          type: node.type,
          title: t(workflowNodeLabelKey(node.type)),
          description: t(workflowNodeDescriptionKey(node.type)),
          category: definition?.category ?? 'source',
          categoryLabel: t(
            workflowCategoryKey(definition?.category ?? 'source'),
          ),
          inputs: definition?.inputs ?? [],
          outputs,
          params: {
            ...(definition ? createDefaultParams(definition, context) : {}),
            ...node.params,
          },
          inputBindings: node.inputBindings,
          canManage,
          inputLabel: t('workflows.inputsLabel'),
          outputLabel: t('workflows.outputsLabel'),
          unboundLabel: t('workflows.unbound'),
        },
      } satisfies WorkflowFlowNode;
    }),
  );
}

function buildFlowEdges(
  definitions: WorkflowNodeDefinition[],
  workflowVersion: WorkflowVersionDetail,
): Edge[] {
  return workflowVersion.graph.edges.map((edge) => {
    const handles = inferEdgeHandles(edge, workflowVersion, definitions);

    return {
      ...edge,
      ...handles,
      type: 'smoothstep',
      animated: true,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#475569',
      },
      style: {
        stroke: '#475569',
        strokeWidth: 2,
      },
    };
  });
}

function toWorkflowVersion(
  nodes: WorkflowFlowNode[],
  edges: Edge[],
  workflowVersion: WorkflowVersionDetail,
): WorkflowVersionDetail {
  return {
    ...workflowVersion,
    graph: {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        position: {
          x: node.position.x,
          y: node.position.y,
        },
        params: node.data.params,
        inputBindings: buildInputBindings(edges, node.id),
        outputDefs: node.data.outputs.map((port) => ({
          key: port.key,
          label: port.label,
        })),
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
      })),
    },
  };
}

function ParameterField({
  definition,
  value,
  context,
  onChange,
}: {
  definition: WorkflowParamDefinition;
  value: unknown;
  context: WorkflowEditorContext;
  onChange: (value: unknown) => void;
}) {
  const options = resolveParameterOptions(definition, context);

  switch (definition.fieldType) {
    case 'boolean':
      return (
        <Switch
          checked={Boolean(value)}
          onChange={onChange}
        />
      );
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          value={typeof value === 'number' ? value : Number(value ?? definition.defaultValue ?? 0)}
          min={definition.min}
          max={definition.max}
          step={definition.step}
          onChange={(nextValue) => onChange(nextValue ?? definition.defaultValue ?? 0)}
        />
      );
    case 'select':
    case 'datasetVersion':
    case 'modelVersion':
      return (
        <Select
          value={typeof value === 'string' ? value : undefined}
          options={options}
          onChange={onChange}
        />
      );
    default:
      return (
        <Input
          value={typeof value === 'string' ? value : String(value ?? '')}
          placeholder={definition.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

function CanvasInner({
  catalog,
  workflowVersion,
  canManage,
  datasets,
  datasetVersions,
  modelVersions,
  onWorkflowChange,
}: {
  catalog: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const workflowVersionRef = useRef(workflowVersion);
  const editorContext = useMemo<WorkflowEditorContext>(
    () => ({
      datasets,
      datasetVersions,
      modelVersions,
    }),
    [datasetVersions, datasets, modelVersions],
  );
  const definitions = useMemo(() => enrichWorkflowCatalog(catalog), [catalog]);
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const nodesRef = useRef<WorkflowFlowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  const commitGraphState = useCallback(
    (
      nextNodes: WorkflowFlowNode[],
      nextEdges: Edge[],
      sync = false,
    ) => {
      const boundNodes = applyBindingsToNodes(nextNodes, nextEdges);
      nodesRef.current = boundNodes;
      edgesRef.current = nextEdges;
      setNodes(boundNodes);
      setEdges(nextEdges);

      if (sync && onWorkflowChange) {
        onWorkflowChange(
          toWorkflowVersion(boundNodes, nextEdges, workflowVersionRef.current),
        );
      }
    },
    [onWorkflowChange],
  );

  useEffect(() => {
    workflowVersionRef.current = workflowVersion;
    const nextNodes = buildFlowNodes(
      definitions,
      workflowVersion,
      editorContext,
      canManage,
      t,
    );
    const nextEdges = buildFlowEdges(definitions, workflowVersion);

    commitGraphState(nextNodes, nextEdges);
    setSelectedNodeId((currentSelectedNodeId) =>
      nextNodes.some((node) => node.id === currentSelectedNodeId) ? currentSelectedNodeId : undefined,
    );
  }, [canManage, commitGraphState, definitions, editorContext, t, workflowVersion]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (nodesRef.current.length > 0) {
        void fitView({ padding: 0.12, duration: 180, maxZoom: 0.88 });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [edges.length, fitView, nodes.length]);

  const selectedNode = useMemo(
    () => nodes.find((item) => item.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const selectedDefinition = useMemo(
    () =>
      selectedNode ? getWorkflowDefinitionByType(definitions, selectedNode.data.type) : undefined,
    [definitions, selectedNode],
  );

  const onNodesChange = (changes: NodeChange<WorkflowFlowNode>[]) => {
    const nextNodes = applyNodeChanges(changes, nodesRef.current);
    const shouldSync = changes.some((change) => {
      if (change.type === 'remove') {
        return true;
      }

      if (change.type === 'position') {
        return change.dragging === false;
      }

      return false;
    });

    commitGraphState(nextNodes, edgesRef.current, shouldSync);
  };

  const onEdgesChange = (changes: EdgeChange<Edge>[]) => {
    const nextEdges = applyEdgeChanges(changes, edgesRef.current);
    const shouldSync = changes.some((change) => change.type !== 'select');

    commitGraphState(nodesRef.current, nextEdges, shouldSync);
  };

  const onConnect = (connection: Connection) => {
    if (!canManage) {
      return;
    }

    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) {
      message.warning(t('workflows.invalidConnection'));
      return;
    }

    const filteredEdges = edgesRef.current.filter(
      (edge) =>
        !(
          edge.target === connection.target &&
          edge.targetHandle === connection.targetHandle
        ),
    );

    const nextEdges = addEdge(
      {
        ...connection,
        id: `edge-${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}`,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#475569',
        },
        style: {
          stroke: '#475569',
          strokeWidth: 2,
        },
      },
      filteredEdges,
    );

    commitGraphState(nodesRef.current, nextEdges, true);
  };

  const addNode = (definition: WorkflowNodeDefinition) => {
    if (!canManage) {
      return;
    }

    const newId = `${definition.type}-${Date.now().toString(36)}`;
    const wrapper = canvasWrapperRef.current;
    const centeredPosition = wrapper
      ? screenToFlowPosition({
          x: wrapper.clientWidth / 2 - 120,
          y: wrapper.clientHeight / 2 - 80,
        })
      : {
          x: 160 + nodesRef.current.length * 48,
          y: 120 + nodesRef.current.length * 36,
        };

    const nextNode: WorkflowFlowNode = {
      id: newId,
      type: 'workflowNode',
      position: centeredPosition,
      draggable: true,
      selectable: true,
      data: {
        type: definition.type,
        title: t(workflowNodeLabelKey(definition.type)),
        description: t(workflowNodeDescriptionKey(definition.type)),
        category: definition.category,
        categoryLabel: t(workflowCategoryKey(definition.category)),
        inputs: definition.inputs,
        outputs: definition.outputs,
        params: createDefaultParams(definition, editorContext),
        inputBindings: {},
        canManage,
        inputLabel: t('workflows.inputsLabel'),
        outputLabel: t('workflows.outputsLabel'),
        unboundLabel: t('workflows.unbound'),
      },
    };

    commitGraphState([...nodesRef.current, nextNode], edgesRef.current, true);
    setSelectedNodeId(newId);
  };

  const updateSelectedNodeParams = (paramKey: string, value: unknown) => {
    if (!selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== selectedNodeId) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          params: {
            ...node.data.params,
            [paramKey]: value,
          },
        },
      };
    });

    commitGraphState(nextNodes, edgesRef.current, true);
  };

  const removeSelectedNode = () => {
    if (!canManage || !selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.filter((node) => node.id !== selectedNodeId);
    const nextEdges = edgesRef.current.filter(
      (edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId,
    );

    setSelectedNodeId(undefined);
    commitGraphState(nextNodes, nextEdges, true);
    message.success(t('workflows.nodeRemoved'));
  };

  return (
    <div className="workflow-grid">
      <Card className="workflow-palette" variant="borderless">
        <Text className="panel-kicker">{t('workflows.nodeLibrary')}</Text>
        <Paragraph className="panel-title">{t('workflows.nodeLibraryCopy')}</Paragraph>
        {!canManage ? (
          <Paragraph className="catalog-readonly-hint">{t('workflows.readOnlyHint')}</Paragraph>
        ) : null}
        <List
          dataSource={definitions}
          renderItem={(item) => (
            <List.Item
              className={`catalog-item${canManage ? '' : ' catalog-item-disabled'}`}
              onClick={() => addNode(item)}
            >
              <div>
                <strong>{t(workflowNodeLabelKey(item.type))}</strong>
                <Paragraph className="catalog-copy">
                  {t(workflowNodeDescriptionKey(item.type))}
                </Paragraph>
              </div>
              <Tag color={categoryColor[item.category]}>{t(workflowCategoryKey(item.category))}</Tag>
            </List.Item>
          )}
        />
      </Card>

      <Card className="workflow-canvas-card" variant="borderless">
        <div className="workflow-canvas-toolbar">
          <Text className="panel-kicker">
            {t('workflows.nodesLabel')}: {nodes.length}
          </Text>
          <Button onClick={() => void fitView({ padding: 0.12, duration: 180, maxZoom: 0.88 })}>
            {t('workflows.centerView')}
          </Button>
        </div>
        <div ref={canvasWrapperRef} className="workflow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            nodesDraggable={canManage}
            nodesConnectable={canManage}
            elementsSelectable
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 0.88 }}
            minZoom={0.4}
            maxZoom={1.2}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(undefined)}
          >
            <Background gap={20} color="#d6d3d1" />
            <MiniMap zoomable pannable />
            <Controls />
          </ReactFlow>
        </div>
      </Card>

      <Card className="workflow-inspector" variant="borderless">
        <Text className="panel-kicker">{t('workflows.inspector')}</Text>
        <Paragraph className="panel-title">{t('workflows.inspectorCopy')}</Paragraph>

        {!selectedNode || !selectedDefinition ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('workflows.selectNode')}
          />
        ) : (
          <div className="workflow-inspector-body">
            <div className="workflow-inspector-head">
              <div>
                <Title level={4} className="workflow-inspector-title">
                  {selectedNode.data.title}
                </Title>
                <Paragraph className="workflow-inspector-copy">
                  {selectedNode.data.description}
                </Paragraph>
              </div>
              <Tag color={categoryColor[selectedNode.data.category]}>
                {selectedNode.data.categoryLabel}
              </Tag>
            </div>

            <div className="workflow-inspector-meta">
              <div>
                <Text type="secondary">{t('workflows.nodeId')}</Text>
                <div>{selectedNode.id}</div>
              </div>
              <div>
                <Text type="secondary">{t('workflows.nodeType')}</Text>
                <div>{selectedNode.data.type}</div>
              </div>
            </div>

            <div className="workflow-inspector-section">
              <Text className="workflow-inspector-section-title">{t('workflows.inputsLabel')}</Text>
              {selectedNode.data.inputs.length ? (
                selectedNode.data.inputs.map((port) => (
                  <div key={port.key} className="workflow-binding-row">
                    <strong>{port.label}</strong>
                    <span>
                      {formatBindingSummary(selectedNode.data.inputBindings[port.key]) ||
                        t('workflows.unbound')}
                    </span>
                  </div>
                ))
              ) : (
                <Text type="secondary">{t('workflows.unbound')}</Text>
              )}
            </div>

            <div className="workflow-inspector-section">
              <Text className="workflow-inspector-section-title">{t('workflows.outputsLabel')}</Text>
              {selectedNode.data.outputs.map((port) => (
                <div key={port.key} className="workflow-binding-row">
                  <strong>{port.label}</strong>
                  <span>{port.key}</span>
                </div>
              ))}
            </div>

            <div className="workflow-inspector-section">
              <Text className="workflow-inspector-section-title">{t('workflows.parametersLabel')}</Text>
              {selectedDefinition.params.length ? (
                selectedDefinition.params.map((field) => (
                  <div key={field.key} className="workflow-parameter-field">
                    <div className="workflow-parameter-head">
                      <strong>{field.label}</strong>
                      {field.description ? (
                        <Text type="secondary">{field.description}</Text>
                      ) : null}
                    </div>
                    <ParameterField
                      definition={field}
                      value={selectedNode.data.params[field.key]}
                      context={editorContext}
                      onChange={(value) => updateSelectedNodeParams(field.key, value)}
                    />
                  </div>
                ))
              ) : (
                <Text type="secondary">{t('workflows.noParameters')}</Text>
              )}
            </div>

            {canManage ? (
              <Button danger onClick={removeSelectedNode}>
                {t('workflows.deleteNode')}
              </Button>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}

export function WorkflowCanvas(props: {
  catalog: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
