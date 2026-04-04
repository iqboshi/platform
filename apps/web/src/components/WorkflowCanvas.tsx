import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
  WorkflowNodeCatalogItem,
  WorkflowParamDefinition,
  WorkflowPortDataType,
  WorkflowPortDefinition,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
} from '@platform/types';
import type {
  Connection,
  Edge,
  EdgeChange,
  IsValidConnection,
  Node,
  NodeChange,
  NodeProps,
} from '@xyflow/react';

import { App, Button, Card, Empty, Input, InputNumber, Select, Switch, Tag, Typography } from 'antd';
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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import {
  canConnectPorts,
  catalogMatchesFilters,
  createDefaultParams,
  getDataTypeLabels,
  getWorkflowDefinitionByType,
  instantiateTemplateGraph,
  resolveParameterOptions,
  type WorkflowEditorContext,
  type WorkflowNodeDefinition,
} from '@/features/workflows/node-registry';
import { useI18n } from '@/i18n/useI18n';
import { downloadDatasetVersion } from '@/lib/api';
import { workflowCategoryKey } from '@/lib/i18n-helpers';

const { Paragraph, Text, Title } = Typography;

const categoryColor: Record<WorkflowNodeDefinition['category'], string> = {
  source: '#155e75',
  preprocess: '#0f766e',
  split: '#a16207',
  inference: '#1d4ed8',
  postprocess: '#7c3aed',
};

const categoryOrder: WorkflowNodeDefinition['category'][] = [
  'source',
  'preprocess',
  'split',
  'inference',
  'postprocess',
];

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

interface TemplateSampleItem {
  key: string;
  kind: 'dataset' | 'model';
  label: string;
  value: string;
  datasetVersionId?: string;
}

function formatBindingSummary(binding: string | undefined): string {
  if (!binding) {
    return '';
  }

  const [sourceNodeId, sourcePort] = binding.split(':');
  return sourcePort ? `${sourceNodeId} -> ${sourcePort}` : sourceNodeId;
}

function summarizeParamValue(value: unknown): string {
  if (Array.isArray(value)) {
    const rendered = value
      .filter((item): item is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof item))
      .map((item) => String(item))
      .join(', ');
    return rendered.length > 22 ? `${rendered.slice(0, 19)}...` : rendered;
  }
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

function triggerOnEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  callback: () => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    callback();
  }
}

function describeTemplateSampleInputs(
  template: WorkflowTemplateDefinition,
  datasets: DatasetSummary[],
  datasetVersions: DatasetVersionSummary[],
  modelVersions: ModelVersionSummary[],
): TemplateSampleItem[] {
  const datasetNames = new Map(datasets.map((item) => [item.id, item.name]));
  const items: TemplateSampleItem[] = [];

  for (const binding of template.sampleBindings ?? []) {
    const datasetVersionId =
      typeof binding.params.datasetVersionId === 'string' ? binding.params.datasetVersionId : undefined;
    const modelVersionId =
      typeof binding.params.modelVersionId === 'string' ? binding.params.modelVersionId : undefined;

    if (datasetVersionId) {
      const datasetVersion = datasetVersions.find((item) => item.id === datasetVersionId);
      if (datasetVersion) {
        items.push({
          key: `${binding.nodeId}:${datasetVersionId}`,
          kind: 'dataset',
          label: binding.nodeId,
          value: `${datasetNames.get(datasetVersion.datasetId) ?? datasetVersion.datasetId} / v${datasetVersion.version}`,
          datasetVersionId: datasetVersion.id,
        });
      }
    }

    if (modelVersionId) {
      const modelVersion = modelVersions.find((item) => item.id === modelVersionId);
      if (modelVersion) {
        items.push({
          key: `${binding.nodeId}:${modelVersionId}`,
          kind: 'model',
          label: binding.nodeId,
          value: `${modelVersion.modelName ?? modelVersion.modelId} / ${modelVersion.version}`,
        });
      }
    }
  }

  return items;
}

function WorkflowEditorNode({
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const inputRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const outputRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [handleOffsets, setHandleOffsets] = useState<Record<string, number>>({});
  const previewParams = Object.entries(data.params)
    .map(([key, value]) => ({
      key,
      value: summarizeParamValue(value),
    }))
    .filter((item) => item.value)
    .slice(0, 2);

  useLayoutEffect(() => {
    const nextOffsets: Record<string, number> = {};

    for (const [portKey, element] of Object.entries(inputRowRefs.current)) {
      if (element) {
        nextOffsets[`input:${portKey}`] = element.offsetTop + element.offsetHeight / 2;
      }
    }

    for (const [portKey, element] of Object.entries(outputRowRefs.current)) {
      if (element) {
        nextOffsets[`output:${portKey}`] = element.offsetTop + element.offsetHeight / 2;
      }
    }

    setHandleOffsets((current) => {
      const currentEntries = Object.entries(current);
      const nextEntries = Object.entries(nextOffsets);
      if (
        currentEntries.length === nextEntries.length &&
        nextEntries.every(([key, value]) => current[key] === value)
      ) {
        return current;
      }
      return nextOffsets;
    });
  }, [data.inputBindings, data.inputs, data.outputs, data.params]);

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
            <div
              key={port.key}
              className="workflow-node-port-row"
              ref={(element) => {
                inputRowRefs.current[port.key] = element;
              }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={port.key}
                isConnectable={data.canManage}
                className="workflow-handle workflow-handle-target"
                style={{ top: handleOffsets[`input:${port.key}`] }}
              />
              <div className="workflow-node-port-copy">
                <div className="workflow-node-port-label">{port.label}</div>
                <div className="workflow-node-port-binding">
                  {formatBindingSummary(data.inputBindings[port.key]) || data.unboundLabel}
                </div>
                <div className="workflow-node-port-types">
                  {getDataTypeLabels(port).map((label) => (
                    <Tag key={label} bordered={false} className="workflow-type-tag">
                      {label}
                    </Tag>
                  ))}
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
            <div
              key={port.key}
              className="workflow-node-port-row workflow-node-port-row-output"
              ref={(element) => {
                outputRowRefs.current[port.key] = element;
              }}
            >
              <div className="workflow-node-port-copy">
                <div className="workflow-node-port-label">{port.label}</div>
                <div className="workflow-node-port-types">
                  {getDataTypeLabels(port).map((label) => (
                    <Tag key={label} bordered={false} className="workflow-type-tag">
                      {label}
                    </Tag>
                  ))}
                </div>
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={port.key}
                isConnectable={data.canManage}
                className="workflow-handle workflow-handle-source"
                style={{ top: handleOffsets[`output:${port.key}`] }}
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
          title: definition?.label ?? node.type,
          description: definition?.description ?? node.type,
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
          description: port.description,
          dataTypes: port.dataTypes,
          required: port.required,
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
  nodeType,
  value,
  context,
  onChange,
}: {
  definition: WorkflowParamDefinition;
  nodeType: string;
  value: unknown;
  context: WorkflowEditorContext;
  onChange: (value: unknown) => void;
}) {
  const options = resolveParameterOptions(definition, context, nodeType);

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
          showSearch
          value={typeof value === 'string' ? value : undefined}
          options={options}
          onChange={onChange}
        />
      );
    case 'multiselect':
      return (
        <Select
          mode="multiple"
          value={Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []}
          options={options}
          onChange={(nextValue) => onChange(nextValue)}
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
  templates,
  workflowVersion,
  canManage,
  datasets,
  datasetVersions,
  modelVersions,
  downloadToken,
  onWorkflowChange,
}: {
  catalog: WorkflowNodeCatalogItem[];
  templates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
  downloadToken?: string | null;
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
  const definitions = useMemo(() => catalog as WorkflowNodeDefinition[], [catalog]);
  const availableTemplates = useMemo(() => templates, [templates]);
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [selectedDataType, setSelectedDataType] = useState<WorkflowPortDataType | undefined>();
  const [selectedTask, setSelectedTask] = useState<string | undefined>();
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
  const availableDataTypes = useMemo(
    () =>
      [
        ...new Set(
          definitions.flatMap((definition) =>
            [...definition.inputs, ...definition.outputs].flatMap((port) => port.dataTypes),
          ),
        ),
      ],
    [definitions],
  );
  const availableTasks = useMemo(
    () => [...new Set(definitions.flatMap((definition) => definition.supportedTasks))],
    [definitions],
  );
  const filteredDefinitions = useMemo(
    () =>
      definitions.filter((definition) =>
        !definition.tags.includes('legacy') &&
        catalogMatchesFilters(definition, {
          keyword,
          dataType: selectedDataType,
          task: selectedTask,
        }),
      ),
    [definitions, keyword, selectedDataType, selectedTask],
  );
  const groupedDefinitions = useMemo(
    () =>
      categoryOrder
        .map((category) => ({
          category,
          label: t(workflowCategoryKey(category)),
          items: filteredDefinitions.filter((definition) => definition.category === category),
        }))
        .filter((group) => group.items.length > 0),
    [filteredDefinitions, t],
  );
  const templateSampleMap = useMemo(
    () =>
      new Map(
        availableTemplates.map((template) => [
          template.id,
          describeTemplateSampleInputs(template, datasets, datasetVersions, modelVersions),
        ]),
      ),
    [availableTemplates, datasetVersions, datasets, modelVersions],
  );
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) =>
      canConnectPorts(
        definitions,
        nodesRef.current.map((node) => ({
          id: node.id,
          type: node.data.type,
          position: node.position,
          params: node.data.params,
          inputBindings: node.data.inputBindings,
          outputDefs: node.data.outputs,
        })),
        {
          source: connection.source,
          sourceHandle: connection.sourceHandle ?? null,
          target: connection.target,
          targetHandle: connection.targetHandle ?? null,
        },
      ),
    [definitions],
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

    if (!isValidConnection(connection)) {
      message.warning(t('workflows.connectionTypeMismatch'));
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
        title: definition.label,
        description: definition.description,
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

  const insertTemplate = (
    template: WorkflowTemplateDefinition,
    options?: { useSampleBindings?: boolean },
  ) => {
    if (!canManage) {
      return;
    }

    const wrapper = canvasWrapperRef.current;
    const anchorPosition = wrapper
      ? screenToFlowPosition({
          x: wrapper.clientWidth / 2 - 280,
          y: wrapper.clientHeight / 2 - 180,
        })
      : {
          x: 120,
          y: 120,
        };

    const graph = instantiateTemplateGraph(
      template,
      definitions,
      editorContext,
      anchorPosition,
      options,
    );
    const flowNodes = buildFlowNodes(
      definitions,
      {
        ...workflowVersionRef.current,
        graph,
      },
      editorContext,
      canManage,
      t,
    );
    const flowEdges = buildFlowEdges(definitions, {
      ...workflowVersionRef.current,
      graph,
    });

    commitGraphState(
      [...nodesRef.current, ...flowNodes],
      [...edgesRef.current, ...flowEdges],
      true,
    );
    message.success(
      `${t('workflows.insertTemplateSuccess')}: ${template.label}${
        options?.useSampleBindings ? ` (${t('workflows.useSampleInputs')})` : ''
      }`,
    );
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

  const clearCanvas = () => {
    if (!canManage || (nodesRef.current.length === 0 && edgesRef.current.length === 0)) {
      return;
    }

    setSelectedNodeId(undefined);
    commitGraphState([], [], true);
    message.success(t('workflows.canvasCleared'));
  };

  const onDownloadTemplateSample = async (datasetVersionId: string) => {
    if (!downloadToken) {
      message.error(t('error.request_failed'));
      return;
    }

    try {
      await downloadDatasetVersion(downloadToken, datasetVersionId);
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('error.request_failed'));
    }
  };

  return (
    <div className="workflow-grid">
      <Card className="workflow-palette" variant="borderless">
        <Text className="panel-kicker">{t('workflows.nodeLibrary')}</Text>
        <Paragraph className="panel-title">{t('workflows.nodeLibraryCopy')}</Paragraph>
        <div className="workflow-library-filters">
          <Input
            allowClear
            placeholder={t('workflows.searchNodes')}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Select
            allowClear
            placeholder={t('workflows.filterByDataType')}
            value={selectedDataType}
            onChange={setSelectedDataType}
            options={availableDataTypes.map((dataType) => ({
              value: dataType,
              label: dataType.replace(/_/g, ' '),
            }))}
          />
          <Select
            allowClear
            placeholder={t('workflows.filterByTask')}
            value={selectedTask}
            onChange={setSelectedTask}
            options={availableTasks.map((task) => ({
              value: task,
              label: task.replace(/_/g, ' '),
            }))}
          />
        </div>
        {!canManage ? (
          <Paragraph className="catalog-readonly-hint">{t('workflows.readOnlyHint')}</Paragraph>
        ) : null}
        <div className="workflow-library-scroll">
          {groupedDefinitions.length ? (
            groupedDefinitions.map((group) => (
              <section key={group.category} className="workflow-library-group">
                <div className="workflow-library-group-head">
                  <div className="workflow-library-group-title">
                    <Tag color={categoryColor[group.category]}>{group.label}</Tag>
                  </div>
                  <Text type="secondary">{group.items.length}</Text>
                </div>
                <div className="workflow-library-grid">
                  {group.items.map((item) => (
                    <div
                      key={item.type}
                      role="button"
                      tabIndex={canManage ? 0 : -1}
                      aria-disabled={!canManage}
                      className={`workflow-library-item${
                        canManage ? '' : ' workflow-library-item-disabled'
                      }`}
                      onClick={() => addNode(item)}
                      onKeyDown={(event) => triggerOnEnterOrSpace(event, () => addNode(item))}
                    >
                      <div className="workflow-library-item-head">
                        <div className="workflow-library-item-type">{item.type}</div>
                        <strong className="workflow-library-item-title">{item.label}</strong>
                      </div>
                      <Paragraph className="workflow-library-item-copy">
                        {item.description}
                      </Paragraph>
                      <div className="workflow-node-parameter-preview">
                        {[...item.tags.slice(0, 2), ...item.supportedTasks.slice(0, 1)].map((tag) => (
                          <Tag key={tag} bordered={false} className="workflow-type-tag">
                            {tag}
                          </Tag>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('workflows.searchNodes')}
            />
          )}
        </div>
      </Card>

      <div className="workflow-canvas-stack">
        <Card className="workflow-canvas-card" variant="borderless">
          <div className="workflow-canvas-toolbar">
            <Text className="panel-kicker">
              {t('workflows.nodesLabel')}: {nodes.length}
            </Text>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                danger
                disabled={!canManage || (nodes.length === 0 && edges.length === 0)}
                onClick={clearCanvas}
              >
                {t('workflows.clearCanvas')}
              </Button>
              <Button onClick={() => void fitView({ padding: 0.12, duration: 180, maxZoom: 0.88 })}>
                {t('workflows.centerView')}
              </Button>
            </div>
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
              isValidConnection={isValidConnection}
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

        <Card className="workflow-template-panel" variant="borderless">
          <div className="workflow-library-group-head">
            <div>
              <Text className="panel-kicker">{t('workflows.templates')}</Text>
              <Paragraph className="panel-title">{t('workflows.templatePanelCopy')}</Paragraph>
            </div>
            <Text type="secondary">{availableTemplates.length}</Text>
          </div>
          <div className="workflow-template-grid">
            {availableTemplates.map((item) => {
              const sampleItems = templateSampleMap.get(item.id) ?? [];
              return (
                <div key={item.id} className="workflow-library-item workflow-library-template-item">
                  <div className="workflow-library-item-head">
                    <div className="workflow-library-item-type">{item.id}</div>
                    <strong className="workflow-library-item-title">{item.label}</strong>
                  </div>
                  <Paragraph className="workflow-library-item-copy">{item.description}</Paragraph>
                  <div className="workflow-node-parameter-preview">
                    {item.tags.map((tag) => (
                      <Tag key={tag} bordered={false} className="workflow-type-tag">
                        {tag}
                      </Tag>
                    ))}
                  </div>
                  {sampleItems.length ? (
                    <div className="workflow-template-samples">
                      <Text className="workflow-inspector-section-title">
                        {t('workflows.sampleInputs')}
                      </Text>
                      {sampleItems.map((sample) => (
                        <div key={sample.key} className="workflow-template-sample-row">
                          <div>
                            <strong>{sample.kind === 'dataset' ? t('workflows.sampleDataset') : t('workflows.sampleModel')}</strong>
                            <div className="workflow-library-item-copy">{sample.value}</div>
                          </div>
                          {sample.datasetVersionId ? (
                            <Button
                              type="link"
                              onClick={() => void onDownloadTemplateSample(sample.datasetVersionId!)}
                            >
                              {t('workflows.downloadSampleInput')}
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="workflow-template-actions">
                    <Button
                      type="primary"
                      disabled={!canManage}
                      onClick={() => insertTemplate(item, { useSampleBindings: true })}
                    >
                      {t('workflows.useSampleInputs')}
                    </Button>
                    <Button disabled={!canManage} onClick={() => insertTemplate(item)}>
                      {t('workflows.insertBlankTemplate')}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

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
                  <div key={port.key} className="workflow-binding-row workflow-binding-row-detail">
                    <div>
                      <strong>{port.label}</strong>
                      <div className="workflow-node-port-types">
                        {getDataTypeLabels(port).map((label) => (
                          <Tag key={label} bordered={false} className="workflow-type-tag">
                            {label}
                          </Tag>
                        ))}
                      </div>
                    </div>
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
                <div key={port.key} className="workflow-binding-row workflow-binding-row-detail">
                  <div>
                    <strong>{port.label}</strong>
                    <div className="workflow-node-port-types">
                      {getDataTypeLabels(port).map((label) => (
                        <Tag key={label} bordered={false} className="workflow-type-tag">
                          {label}
                        </Tag>
                      ))}
                    </div>
                  </div>
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
                      nodeType={selectedNode.data.type}
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
  templates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
  downloadToken?: string | null;
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
