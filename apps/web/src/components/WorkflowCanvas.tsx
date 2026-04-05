import type {
  DatasetSummary,
  DatasetVersionSummary,
  GeeCredentialSummary,
  ModelVersionSummary,
  WorkflowNodeCatalogItem,
  WorkflowNodeExample,
  WorkflowNodePreviewValue,
  WorkflowParamDefinition,
  WorkflowPortDataType,
  WorkflowPortDefinition,
  WorkflowTemplateDefinition,
  WorkflowNodeTestResult,
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

import {
  App,
  Button,
  Card,
  Collapse,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Select,
  Switch,
  Tag,
  Typography,
} from 'antd';
import type { CollapseProps } from 'antd';
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
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { isApiError } from '@/auth/errors';
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
import {
  analyzeWorkflowGraph,
  downloadExampleTableTemplate,
  getTemplateContractHints,
  type WorkflowNodeAnalysis,
} from '@/features/workflows/workflow-contracts';
import { useI18n } from '@/i18n/useI18n';
import { downloadDatasetVersion, testWorkflowNode } from '@/lib/api';
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
  inputContracts: WorkflowNodeDefinition['inputContracts'];
  outputContracts: WorkflowNodeDefinition['outputContracts'];
  exampleInputs: WorkflowNodeDefinition['exampleInputs'];
  exampleOutputs: WorkflowNodeDefinition['exampleOutputs'];
  commonErrors: string[];
  analysis: WorkflowNodeAnalysis;
  statusLabel: string;
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

interface NodeTestResultState extends WorkflowNodeTestResult {
  graphSignature: string;
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

function getPreviewString(
  preview: WorkflowNodePreviewValue,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = preview[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return undefined;
}

function getPreviewNumber(
  preview: WorkflowNodePreviewValue,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = preview[key];
    if (typeof value === 'number') {
      return value;
    }
  }
  return undefined;
}

function summarizeNodePreview(preview: WorkflowNodePreviewValue): string {
  if (typeof preview.summary === 'string' && preview.summary.trim()) {
    return preview.summary;
  }

  if (preview.kind === 'table') {
    const rowCount = getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0;
    const columns = Array.isArray(preview.columns) ? preview.columns.length : 0;
    return `${rowCount} rows · ${columns} columns`;
  }

  if (preview.kind === 'metrics_report') {
    const rowCount = getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0;
    const metrics =
      preview.metrics && typeof preview.metrics === 'object' && !Array.isArray(preview.metrics)
        ? Object.keys(preview.metrics).length
        : 0;
    return `${rowCount} rows · ${metrics} metrics`;
  }

  if (preview.kind === 'dataset_version') {
    const name = getPreviewString(preview, 'datasetName', 'dataset_name', 'datasetId', 'dataset_id');
    const version = getPreviewNumber(preview, 'version');
    return version !== undefined ? `${name ?? 'Dataset'} / v${version}` : name ?? 'Dataset';
  }

  if (preview.kind === 'model_version') {
    const name = getPreviewString(preview, 'modelName', 'model_name', 'modelId', 'model_id');
    const version = getPreviewString(preview, 'version');
    return version ? `${name ?? 'Model'} / ${version}` : name ?? 'Model';
  }

  if (preview.kind === 'model_ref') {
    const algorithm = getPreviewString(preview, 'algorithmKey', 'algorithm_key') ?? 'model';
    const featureCount = Array.isArray(preview.featureNames)
      ? preview.featureNames.length
      : Array.isArray(preview.feature_names)
        ? preview.feature_names.length
        : 0;
    return `${algorithm} · ${featureCount} features`;
  }

  if (preview.kind === 'artifact_file') {
    return (
      getPreviewString(preview, 'name') ??
      getPreviewString(preview, 'path') ??
      'Artifact'
    );
  }

  return '';
}

function buildPreviewPayload(preview: WorkflowNodePreviewValue): unknown {
  if (preview.kind === 'table') {
    return {
      columns: Array.isArray(preview.columns) ? preview.columns : [],
      sampleRows:
        Array.isArray(preview.sampleRows) && preview.sampleRows.length
          ? preview.sampleRows
          : Array.isArray(preview.sample_rows)
            ? preview.sample_rows
            : [],
    };
  }

  if (preview.kind === 'metrics_report') {
    return {
      metrics: preview.metrics ?? {},
      predictionColumn:
        getPreviewString(preview, 'predictionColumn', 'prediction_column') ?? undefined,
      groundTruthColumn:
        getPreviewString(preview, 'groundTruthColumn', 'ground_truth_column') ?? undefined,
      rowCount: getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0,
    };
  }

  if (preview.kind === 'dataset_version') {
    return {
      datasetVersionId:
        getPreviewString(preview, 'datasetVersionId', 'dataset_version_id') ?? undefined,
      datasetId: getPreviewString(preview, 'datasetId', 'dataset_id') ?? undefined,
      datasetName: getPreviewString(preview, 'datasetName', 'dataset_name') ?? undefined,
      version: getPreviewNumber(preview, 'version') ?? undefined,
      status: getPreviewString(preview, 'status') ?? undefined,
    };
  }

  if (preview.kind === 'model_version') {
    return {
      modelVersionId:
        getPreviewString(preview, 'modelVersionId', 'model_version_id') ?? undefined,
      modelId: getPreviewString(preview, 'modelId', 'model_id') ?? undefined,
      modelName: getPreviewString(preview, 'modelName', 'model_name') ?? undefined,
      version: getPreviewString(preview, 'version') ?? undefined,
      framework: getPreviewString(preview, 'framework') ?? undefined,
      taskType: getPreviewString(preview, 'taskType', 'task_type') ?? undefined,
    };
  }

  if (preview.kind === 'model_ref') {
    return {
      algorithmKey: getPreviewString(preview, 'algorithmKey', 'algorithm_key') ?? undefined,
      featureNames: Array.isArray(preview.featureNames)
        ? preview.featureNames
        : Array.isArray(preview.feature_names)
          ? preview.feature_names
          : [],
      targetColumn:
        getPreviewString(preview, 'targetColumn', 'target_column') ?? undefined,
      metrics:
        preview.metrics && typeof preview.metrics === 'object' && !Array.isArray(preview.metrics)
          ? preview.metrics
          : {},
      rowCount: getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0,
      framework: getPreviewString(preview, 'framework') ?? undefined,
      defaultParameters:
        preview.defaultParameters && typeof preview.defaultParameters === 'object'
          ? preview.defaultParameters
          : preview.default_parameters &&
              typeof preview.default_parameters === 'object' &&
              !Array.isArray(preview.default_parameters)
            ? preview.default_parameters
            : {},
      trainingHyperparameters:
        preview.trainingHyperparameters &&
        typeof preview.trainingHyperparameters === 'object' &&
        !Array.isArray(preview.trainingHyperparameters)
          ? preview.trainingHyperparameters
          : preview.training_hyperparameters &&
              typeof preview.training_hyperparameters === 'object' &&
              !Array.isArray(preview.training_hyperparameters)
            ? preview.training_hyperparameters
            : {},
    };
  }

  if (preview.kind === 'artifact_file') {
    return {
      name: getPreviewString(preview, 'name') ?? undefined,
      path: getPreviewString(preview, 'path') ?? undefined,
      sizeBytes: getPreviewNumber(preview, 'sizeBytes', 'size_bytes') ?? undefined,
    };
  }

  return preview.value ?? preview;
}

function NodePreviewCard({
  portKey,
  preview,
}: {
  portKey: string;
  preview: WorkflowNodePreviewValue;
}) {
  return (
    <div className="workflow-node-test-card">
      <div className="workflow-node-test-card-head">
        <strong>{portKey}</strong>
        <Tag bordered={false}>{preview.kind.replace(/_/g, ' ')}</Tag>
      </div>
      {summarizeNodePreview(preview) ? (
        <Text type="secondary">{summarizeNodePreview(preview)}</Text>
      ) : null}
      <pre className="json-block workflow-node-test-json">
        {JSON.stringify(buildPreviewPayload(preview), null, 2)}
      </pre>
    </div>
  );
}

function ContractExampleCard({ example }: { example: WorkflowNodeExample }) {
  const kindLabel =
    example.kind === 'table'
      ? 'table'
      : example.kind === 'json'
        ? 'json'
        : 'text';

  const payload =
    example.kind === 'table'
      ? {
          columns: example.columns ?? [],
          sampleRows: example.rows ?? [],
        }
      : example.kind === 'json'
        ? JSON.parse(example.content ?? '{}')
        : example.content ?? '';

  return (
    <div className="workflow-node-test-card">
      <div className="workflow-node-test-card-head">
        <strong>{example.title}</strong>
        {example.portKey ? <Text type="secondary">{example.portKey}</Text> : null}
        <Tag bordered={false}>{kindLabel}</Tag>
      </div>
      <pre className="json-block workflow-node-test-json">
        {typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

function InspectorPanelLabel({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="workflow-inspector-panel-label">
      <span>{title}</span>
      {meta ? <span className="workflow-inspector-panel-meta">{meta}</span> : null}
    </div>
  );
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
  const previewParams = Object.entries(data.params)
    .map(([key, value]) => ({
      key,
      value: summarizeParamValue(value),
    }))
    .filter((item) => item.value)
    .slice(0, 2);

  return (
    <div
      className={`workflow-node-card workflow-node-card-${data.analysis.tone}${
        selected ? ' is-selected' : ''
      }`}
    >
      <div className="workflow-node-card-head">
        <div className="workflow-node-card-title-block">
          <strong className="workflow-node-card-title">{data.title}</strong>
          <div className="workflow-node-card-type" title={data.type}>
            {data.type}
          </div>
        </div>
        <div className="workflow-node-card-badges">
          <Tag bordered={false} color={data.analysis.tone}>
            {data.statusLabel}
          </Tag>
          <Tag color={categoryColor[data.category]}>{data.categoryLabel}</Tag>
        </div>
      </div>

      <div
        className={`workflow-node-card-summary workflow-node-card-summary-${data.analysis.tone}`}
        title={data.analysis.summary}
      >
        {data.analysis.summary}
      </div>

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
            <div key={port.key} className="workflow-node-port-row workflow-node-port-row-output">
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

function fallbackNodeAnalysis(
  definition: WorkflowNodeDefinition | undefined,
  nodeType: string,
): WorkflowNodeAnalysis {
  return {
    state: 'ready',
    tone: 'green',
    summary: definition?.description ?? nodeType,
    issues: [],
  };
}

function hydrateFlowNodes(
  nodes: WorkflowFlowNode[],
  edges: Edge[],
  definitions: WorkflowNodeDefinition[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  canManage: boolean,
  t: ReturnType<typeof useI18n>['t'],
): WorkflowFlowNode[] {
  const hydratedWorkflow = toWorkflowVersion(nodes, edges, workflowVersion);
  const analysisByNodeId = analyzeWorkflowGraph(definitions, hydratedWorkflow, context);

  return nodes.map((node) => {
    const definition = getWorkflowDefinitionByType(definitions, node.data.type);
    const analysis =
      analysisByNodeId[node.id] ?? fallbackNodeAnalysis(definition, node.data.type);
    const category = definition?.category ?? node.data.category;

    return {
      ...node,
      data: {
        ...node.data,
        title: definition?.label ?? node.data.title,
        description: definition?.description ?? node.data.description,
        category,
        categoryLabel: t(workflowCategoryKey(category)),
        inputs: definition?.inputs ?? node.data.inputs,
        outputs: definition?.outputs ?? node.data.outputs,
        params: {
          ...(definition ? createDefaultParams(definition, context) : {}),
          ...node.data.params,
        },
        inputBindings: buildInputBindings(edges, node.id),
        inputContracts: definition?.inputContracts ?? node.data.inputContracts,
        outputContracts: definition?.outputContracts ?? node.data.outputContracts,
        exampleInputs: definition?.exampleInputs ?? node.data.exampleInputs,
        exampleOutputs: definition?.exampleOutputs ?? node.data.exampleOutputs,
        commonErrors: definition?.commonErrors ?? node.data.commonErrors,
        analysis,
        statusLabel: nodeStatusLabel(analysis, t),
        canManage,
        inputLabel: t('workflows.inputsLabel'),
        outputLabel: t('workflows.outputsLabel'),
        unboundLabel: t('workflows.unbound'),
      },
    };
  });
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

function nodeStatusLabel(
  analysis: WorkflowNodeAnalysis,
  t: ReturnType<typeof useI18n>['t'],
): string {
  if (analysis.state === 'ready') {
    return t('workflows.nodeStatusReady');
  }
  if (analysis.state === 'missing_inputs') {
    return t('workflows.nodeStatusMissingInputs');
  }
  if (analysis.state === 'invalid_params') {
    return t('workflows.nodeStatusInvalidParams');
  }
  return t('workflows.nodeStatusSchemaMismatch');
}

function buildFlowNodes(
  definitions: WorkflowNodeDefinition[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  canManage: boolean,
  t: ReturnType<typeof useI18n>['t'],
): WorkflowFlowNode[] {
  const analysisByNodeId = analyzeWorkflowGraph(definitions, workflowVersion, context);

  return resolveNodeCollisions(
    workflowVersion.graph.nodes.map((node) => {
      const definition = getWorkflowDefinitionByType(definitions, node.type);
      const outputs = definition?.outputs ?? node.outputDefs;
      const analysis = analysisByNodeId[node.id] ?? {
        state: 'ready',
        tone: 'green',
        summary: definition?.description ?? node.type,
        issues: [],
      };

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
          inputContracts: definition?.inputContracts ?? [],
          outputContracts: definition?.outputContracts ?? [],
          exampleInputs: definition?.exampleInputs ?? [],
          exampleOutputs: definition?.exampleOutputs ?? [],
          commonErrors: definition?.commonErrors ?? [],
          analysis,
          statusLabel: nodeStatusLabel(analysis, t),
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
  canTest,
  datasets,
  datasetVersions,
  geeCredentials,
  modelVersions,
  authToken,
  onWorkflowChange,
}: {
  catalog: WorkflowNodeCatalogItem[];
  templates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  canTest: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  authToken?: string | null;
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
}) {
  const { message } = App.useApp();
  const { locale, t } = useI18n();
  const { fitView, screenToFlowPosition } = useReactFlow();
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const workflowVersionRef = useRef(workflowVersion);
  const editorContext = useMemo<WorkflowEditorContext>(
    () => ({
      datasets,
      datasetVersions,
      geeCredentials,
      modelVersions,
    }),
    [datasetVersions, datasets, geeCredentials, modelVersions],
  );
  const definitions = useMemo(() => catalog as WorkflowNodeDefinition[], [catalog]);
  const availableTemplates = useMemo(() => templates, [templates]);
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeInspectorPanels, setActiveInspectorPanels] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [selectedDataType, setSelectedDataType] = useState<WorkflowPortDataType | undefined>();
  const [selectedTask, setSelectedTask] = useState<string | undefined>();
  const [nodeTestLoading, setNodeTestLoading] = useState(false);
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, NodeTestResultState>>({});
  const [nodeTestModalOpen, setNodeTestModalOpen] = useState(false);
  const [nodeTestProgressOpen, setNodeTestProgressOpen] = useState(false);
  const [nodeTestProgressPercent, setNodeTestProgressPercent] = useState(0);
  const [nodeTestProgressMessage, setNodeTestProgressMessage] = useState('');
  const nodeTestProgressTimerRef = useRef<number | null>(null);
  const nodesRef = useRef<WorkflowFlowNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  const commitGraphState = useCallback(
    (
      nextNodes: WorkflowFlowNode[],
      nextEdges: Edge[],
      sync = false,
    ) => {
      const hydratedNodes = hydrateFlowNodes(
        nextNodes,
        nextEdges,
        definitions,
        workflowVersionRef.current,
        editorContext,
        canManage,
        t,
      );
      nodesRef.current = hydratedNodes;
      edgesRef.current = nextEdges;
      setNodes(hydratedNodes);
      setEdges(nextEdges);

      if (sync && onWorkflowChange) {
        onWorkflowChange(
          toWorkflowVersion(hydratedNodes, nextEdges, workflowVersionRef.current),
        );
      }
    },
    [canManage, definitions, editorContext, onWorkflowChange, t],
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
    setNodeTestResults({});
    setSelectedNodeId((currentSelectedNodeId) =>
      nextNodes.some((node) => node.id === currentSelectedNodeId) ? currentSelectedNodeId : undefined,
    );
  }, [canManage, commitGraphState, definitions, editorContext, t, workflowVersion]);

  useEffect(() => {
    setNodeTestModalOpen(false);
  }, [selectedNodeId]);

  useEffect(() => {
    if (!selectedNodeId) {
      setActiveInspectorPanels([]);
      return;
    }

    setActiveInspectorPanels(['status', 'parameters', 'nodeTest']);
  }, [selectedNodeId]);

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
  const currentWorkflow = useMemo(
    () => toWorkflowVersion(nodes, edges, workflowVersionRef.current),
    [edges, nodes],
  );
  const currentGraphSignature = useMemo(
    () => JSON.stringify(currentWorkflow.graph),
    [currentWorkflow.graph],
  );
  const selectedNodeTest = selectedNodeId ? nodeTestResults[selectedNodeId] : undefined;
  const selectedNodeTestIsStale = Boolean(
    selectedNodeTest && selectedNodeTest.graphSignature !== currentGraphSignature,
  );
  const selectedNodeType = selectedNode?.data.type;
  const nodeTestProgressCopy =
    locale === 'zh-CN'
      ? {
          title: '节点测试进行中',
          authenticating: '正在连接 Google Earth Engine...',
          searching: '正在检索 Sentinel 场景...',
          preparing: '正在生成节点输出预览...',
          completed: '节点测试完成。',
          failed: '节点测试失败。',
        }
      : {
          title: 'Node Test In Progress',
          authenticating: 'Connecting to Google Earth Engine...',
          searching: 'Searching Sentinel scenes...',
          preparing: 'Preparing node output preview...',
          completed: 'Node test completed.',
          failed: 'Node test failed.',
        };

  const stopNodeTestProgressTimer = useCallback(() => {
    if (nodeTestProgressTimerRef.current !== null) {
      window.clearInterval(nodeTestProgressTimerRef.current);
      nodeTestProgressTimerRef.current = null;
    }
  }, []);

  const startNodeTestProgress = useCallback(() => {
    if (selectedNodeType !== 'source.sentinel2_gee_download') {
      return;
    }

    stopNodeTestProgressTimer();
    setNodeTestProgressPercent(8);
    setNodeTestProgressMessage(nodeTestProgressCopy.authenticating);
    setNodeTestProgressOpen(true);

    const startedAt = Date.now();
    nodeTestProgressTimerRef.current = window.setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      if (elapsedSeconds < 4) {
        setNodeTestProgressPercent((current) => Math.max(current, 34));
        setNodeTestProgressMessage(nodeTestProgressCopy.authenticating);
        return;
      }
      if (elapsedSeconds < 12) {
        setNodeTestProgressPercent((current) => Math.max(current, 68));
        setNodeTestProgressMessage(nodeTestProgressCopy.searching);
        return;
      }
      setNodeTestProgressPercent((current) => Math.min(Math.max(current, 88), 94));
      setNodeTestProgressMessage(nodeTestProgressCopy.preparing);
    }, 700);
  }, [nodeTestProgressCopy, selectedNodeType, stopNodeTestProgressTimer]);

  const finishNodeTestProgress = useCallback(
    (nextMessage: string) => {
      if (selectedNodeType !== 'source.sentinel2_gee_download') {
        return;
      }

      stopNodeTestProgressTimer();
      setNodeTestProgressPercent(100);
      setNodeTestProgressMessage(nextMessage);
      window.setTimeout(() => setNodeTestProgressOpen(false), 450);
    },
    [selectedNodeType, stopNodeTestProgressTimer],
  );

  useEffect(
    () => () => {
      stopNodeTestProgressTimer();
    },
    [stopNodeTestProgressTimer],
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
  const templateContractMap = useMemo(
    () =>
      new Map(
        availableTemplates.map((template) => [
          template.id,
          getTemplateContractHints(template, definitions),
        ]),
      ),
    [availableTemplates, definitions],
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
  const selectedNodeCsvExample = useMemo(
    () => (selectedNode?.data.exampleInputs ?? []).find((item) => item.kind === 'table'),
    [selectedNode],
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
        inputContracts: definition.inputContracts ?? [],
        outputContracts: definition.outputContracts ?? [],
        exampleInputs: definition.exampleInputs ?? [],
        exampleOutputs: definition.exampleOutputs ?? [],
        commonErrors: definition.commonErrors ?? [],
        analysis: fallbackNodeAnalysis(definition, definition.type),
        statusLabel: t('workflows.nodeStatusReady'),
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

  const runSelectedNodeTest = async () => {
    if (!selectedNodeId || !authToken || !canTest) {
      return;
    }

    setNodeTestLoading(true);
    try {
      startNodeTestProgress();
      const result = await testWorkflowNode(authToken, currentWorkflow, selectedNodeId);
      setNodeTestResults((current) => ({
        ...current,
        [selectedNodeId]: {
          ...result,
          graphSignature: currentGraphSignature,
        },
      }));
      if (result.status === 'failed') {
        finishNodeTestProgress(nodeTestProgressCopy.failed);
        if (result.errors[0]) {
          message.error(result.errors[0]);
        }
      } else {
        finishNodeTestProgress(nodeTestProgressCopy.completed);
      }
      setNodeTestModalOpen(true);
    } catch (error) {
      finishNodeTestProgress(nodeTestProgressCopy.failed);
      message.error(
        isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : t('error.request_failed'),
      );
    } finally {
      setNodeTestLoading(false);
    }
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
    if (!authToken) {
      message.error(t('error.request_failed'));
      return;
    }

    try {
      await downloadDatasetVersion(authToken, datasetVersionId);
    } catch (error) {
      message.error(
        isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : t('error.request_failed'),
      );
    }
  };

  const onDownloadTemplateContract = (template: WorkflowTemplateDefinition) => {
    const exampleInput = templateContractMap.get(template.id)?.exampleInput;
    if (!exampleInput) {
      return;
    }

    downloadExampleTableTemplate(`${template.id}-template`, exampleInput);
  };

  const onDownloadSelectedNodeTemplate = () => {
    if (!selectedNode || !selectedNodeCsvExample) {
      return;
    }

    downloadExampleTableTemplate(
      `${selectedNode.data.type.replace(/\./g, '-')}-input-template`,
      selectedNodeCsvExample,
    );
  };

  const inspectorItems: CollapseProps['items'] =
    !selectedNode || !selectedDefinition
      ? []
      : (() => {
          const items: NonNullable<CollapseProps['items']> = [];

          items.push({
            key: 'status',
            label: (
              <InspectorPanelLabel
                title={t('workflows.nodeStatusTitle')}
                meta={
                  <Tag bordered={false} color={selectedNode.data.analysis.tone}>
                    {selectedNode.data.statusLabel}
                  </Tag>
                }
              />
            ),
            children: (
              <div className="workflow-node-status-card">
                <div className="workflow-node-status-summary">
                  {selectedNode.data.analysis.summary}
                </div>
                {selectedNode.data.analysis.issues.length ? (
                  <div className="workflow-node-status-issues">
                    <Text strong>{t('workflows.nodeStatusIssues')}</Text>
                    {selectedNode.data.analysis.issues.map((issue) => (
                      <div key={issue} className="workflow-node-status-issue">
                        {issue}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ),
          });

          if (
            selectedNode.data.inputContracts?.length ||
            selectedNode.data.outputContracts?.length ||
            selectedNode.data.commonErrors?.length
          ) {
            items.push({
              key: 'contracts',
              label: (
                <InspectorPanelLabel
                  title={t('workflows.contractInputTitle')}
                  meta={
                    (selectedNode.data.inputContracts?.length ?? 0) +
                    (selectedNode.data.outputContracts?.length ?? 0) +
                    (selectedNode.data.commonErrors?.length ?? 0)
                  }
                />
              ),
              children: (
                <div className="workflow-inspector-section">
                  {selectedNode.data.inputContracts?.length ? (
                    <div className="workflow-contract-section">
                      <Text className="workflow-inspector-section-title">
                        {t('workflows.contractInputTitle')}
                      </Text>
                      {selectedNode.data.inputContracts.map((contract) => (
                        <div key={`input-contract-${contract.portKey}`} className="workflow-contract-card">
                          <strong>{contract.portKey}</strong>
                          <div className="workflow-contract-copy">{contract.summary}</div>
                          {contract.datasetKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractDatasetKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.datasetKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {item}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.fileFormats?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractFileFormats')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.fileFormats.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {item}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.columnRequirements?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractColumnRequirements')}</Text>
                              {contract.columnRequirements.map((item) => (
                                <div key={item} className="workflow-contract-line">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {contract.sampleColumns?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractSampleColumns')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.sampleColumns.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {item}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.notes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractNotes')}</Text>
                              {contract.notes.map((item) => (
                                <div key={item} className="workflow-contract-line">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedNode.data.outputContracts?.length ? (
                    <div className="workflow-contract-section">
                      <Text className="workflow-inspector-section-title">
                        {t('workflows.contractOutputTitle')}
                      </Text>
                      {selectedNode.data.outputContracts.map((contract) => (
                        <div key={`output-contract-${contract.portKey}`} className="workflow-contract-card">
                          <strong>{contract.portKey}</strong>
                          <div className="workflow-contract-copy">{contract.summary}</div>
                          {contract.producedColumns?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractProducedColumns')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.producedColumns.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {item}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.fileFormats?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractFileFormats')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.fileFormats.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {item}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.notes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractNotes')}</Text>
                              {contract.notes.map((item) => (
                                <div key={item} className="workflow-contract-line">
                                  {item}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {selectedNode.data.commonErrors?.length ? (
                    <div className="workflow-contract-section">
                      <Text className="workflow-inspector-section-title">
                        {t('workflows.commonErrorsTitle')}
                      </Text>
                      <div className="workflow-contract-card">
                        {selectedNode.data.commonErrors.map((item) => (
                          <div key={item} className="workflow-contract-line">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ),
            });
          }

          if (selectedNode.data.exampleInputs?.length || selectedNode.data.exampleOutputs?.length) {
            items.push({
              key: 'examples',
              label: (
                <InspectorPanelLabel
                  title={t('workflows.contractExamplesTitle')}
                  meta={
                    (selectedNode.data.exampleInputs?.length ?? 0) +
                    (selectedNode.data.exampleOutputs?.length ?? 0)
                  }
                />
              ),
              children: (
                <div className="workflow-inspector-section">
                  <div className="workflow-node-test-header">
                    <Text className="workflow-inspector-section-title">
                      {t('workflows.contractExamplesTitle')}
                    </Text>
                    {selectedNodeCsvExample ? (
                      <Button size="small" onClick={onDownloadSelectedNodeTemplate}>
                        {t('workflows.downloadContractTemplate')}
                      </Button>
                    ) : null}
                  </div>
                  {selectedNode.data.exampleInputs?.length ? (
                    <div className="workflow-contract-section">
                      <Text strong>{t('workflows.nodeTestInput')}</Text>
                      {selectedNode.data.exampleInputs.map((example) => (
                        <ContractExampleCard
                          key={`example-input-${example.title}-${example.portKey ?? 'none'}`}
                          example={example}
                        />
                      ))}
                    </div>
                  ) : null}
                  {selectedNode.data.exampleOutputs?.length ? (
                    <div className="workflow-contract-section">
                      <Text strong>{t('workflows.nodeTestOutput')}</Text>
                      {selectedNode.data.exampleOutputs.map((example) => (
                        <ContractExampleCard
                          key={`example-output-${example.title}-${example.portKey ?? 'none'}`}
                          example={example}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ),
            });
          }

          items.push({
            key: 'ports',
            label: (
              <InspectorPanelLabel
                title={`${t('workflows.inputsLabel')} / ${t('workflows.outputsLabel')}`}
                meta={selectedNode.data.inputs.length + selectedNode.data.outputs.length}
              />
            ),
            children: (
              <div className="workflow-inspector-section">
                <div className="workflow-contract-section">
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

                <div className="workflow-contract-section">
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
              </div>
            ),
          });

          items.push({
            key: 'parameters',
            label: (
              <InspectorPanelLabel
                title={t('workflows.parametersLabel')}
                meta={selectedDefinition.params.length}
              />
            ),
            children: (
              <div className="workflow-inspector-section">
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
            ),
          });

          items.push({
            key: 'nodeTest',
            label: (
              <InspectorPanelLabel
                title={t('workflows.nodeTestTitle')}
                meta={
                  selectedNodeTest ? (
                    <Tag
                      bordered={false}
                      color={
                        selectedNodeTest.status === 'succeeded'
                          ? 'green'
                          : selectedNodeTest.status === 'failed'
                            ? 'red'
                            : 'default'
                      }
                    >
                      {selectedNodeTest.status === 'succeeded'
                        ? t('workflows.nodeTestSuccess')
                        : selectedNodeTest.status === 'failed'
                          ? t('workflows.nodeTestFailure')
                          : t('workflows.nodeTestNotSupported')}
                    </Tag>
                  ) : undefined
                }
              />
            ),
            children: (
              <div className="workflow-inspector-section">
                <Text type="secondary">{t('workflows.nodeTestCopy')}</Text>
                <div className="workflow-node-test-actions">
                  <Button
                    type="primary"
                    loading={nodeTestLoading}
                    disabled={!canTest}
                    onClick={() => void runSelectedNodeTest()}
                  >
                    {nodeTestLoading ? t('workflows.nodeTestRunning') : t('workflows.nodeTestRun')}
                  </Button>
                  {selectedNodeTest ? (
                    <Text type="secondary">
                      {t('workflows.nodeTestDuration')}: {selectedNodeTest.durationMs} ms
                    </Text>
                  ) : null}
                  {selectedNodeTestIsStale ? (
                    <Tag bordered={false} color="gold">
                      {t('workflows.nodeTestStale')}
                    </Tag>
                  ) : null}
                </div>

                {!canTest ? (
                  <Text type="secondary">{t('workflows.nodeTestUnavailable')}</Text>
                ) : null}

                {selectedNodeTest ? (
                  <Button onClick={() => setNodeTestModalOpen(true)}>
                    {t('workflows.nodeTestViewDetails')}
                  </Button>
                ) : (
                  <Text type="secondary">{t('workflows.nodeTestEmpty')}</Text>
                )}
              </div>
            ),
          });

          return items;
        })();

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
              const contractHints = templateContractMap.get(item.id);
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
                  {contractHints?.lines.length ? (
                    <div className="workflow-template-contracts">
                      <Text className="workflow-inspector-section-title">
                        {t('workflows.contractHighlights')}
                      </Text>
                      {contractHints.lines.map((line) => (
                        <div key={line} className="workflow-template-contract-line">
                          {line}
                        </div>
                      ))}
                      {contractHints.exampleInput ? (
                        <Button type="link" onClick={() => onDownloadTemplateContract(item)}>
                          {t('workflows.downloadContractTemplate')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
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

            <Collapse
              ghost
              className="workflow-inspector-collapse"
              activeKey={activeInspectorPanels}
              onChange={(keys) =>
                setActiveInspectorPanels(
                  Array.isArray(keys)
                    ? keys.map(String)
                    : keys
                      ? [String(keys)]
                      : [],
                )
              }
              items={inspectorItems}
            />

            {canManage ? (
              <Button danger onClick={removeSelectedNode}>
                {t('workflows.deleteNode')}
              </Button>
            ) : null}
          </div>
        )}
      </Card>

      <Modal
        title={
          selectedNode
            ? `${t('workflows.nodeTestTitle')} · ${selectedNode.data.title}`
            : t('workflows.nodeTestTitle')
        }
        open={nodeTestModalOpen}
        onCancel={() => setNodeTestModalOpen(false)}
        footer={null}
        width={1040}
        className="workflow-node-test-modal"
      >
        {selectedNodeTest ? (
          <div className="workflow-node-test-modal-body">
            {selectedNodeTest.errors.length ? (
              <div className="workflow-node-test-errors">
                <Text strong>{t('workflows.nodeTestErrors')}</Text>
                <pre className="json-block workflow-node-test-json">
                  {selectedNodeTest.errors.join('\n')}
                </pre>
              </div>
            ) : null}

            <div className="workflow-node-test-grid">
              <div className="workflow-node-test-column">
                <Text strong>{t('workflows.nodeTestInput')}</Text>
                {Object.entries(selectedNodeTest.inputPreview).length ? (
                  Object.entries(selectedNodeTest.inputPreview).map(([portKey, preview]) => (
                    <NodePreviewCard key={`input-${portKey}`} portKey={portKey} preview={preview} />
                  ))
                ) : (
                  <Text type="secondary">{t('workflows.nodeTestNoPreview')}</Text>
                )}
              </div>
              <div className="workflow-node-test-column">
                <Text strong>{t('workflows.nodeTestOutput')}</Text>
                {Object.entries(selectedNodeTest.outputPreview).length ? (
                  Object.entries(selectedNodeTest.outputPreview).map(([portKey, preview]) => (
                    <NodePreviewCard key={`output-${portKey}`} portKey={portKey} preview={preview} />
                  ))
                ) : (
                  <Text type="secondary">{t('workflows.nodeTestNoPreview')}</Text>
                )}
              </div>
            </div>
          </div>
        ) : (
          <Text type="secondary">{t('workflows.nodeTestEmpty')}</Text>
        )}
      </Modal>

      <Modal
        title={nodeTestProgressCopy.title}
        open={nodeTestProgressOpen}
        footer={null}
        closable={false}
        maskClosable={false}
      >
        <Progress percent={nodeTestProgressPercent} status="active" />
        <Text>{nodeTestProgressMessage}</Text>
      </Modal>
    </div>
  );
}

export function WorkflowCanvas(props: {
  catalog: WorkflowNodeCatalogItem[];
  templates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  canManage: boolean;
  canTest: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  authToken?: string | null;
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
