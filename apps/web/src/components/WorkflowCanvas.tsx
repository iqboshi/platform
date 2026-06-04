import type {
  DatasetSummary,
  DatasetVersionSummary,
  GeeCredentialSummary,
  LocaleCode,
  ModelVersionSummary,
  WorkflowNode as WorkflowGraphNode,
  SpatialRoiSummary,
  WorkflowNodeCatalogItem,
  WorkflowNodeExample,
  WorkflowNodePreviewValue,
  WorkflowGraph,
  WorkflowParamDefinition,
  WorkflowPortContract,
  WorkflowPortDataType,
  WorkflowPortDefinition,
  WorkflowTemplateDefinition,
  WorkflowNodeTestResult,
  WorkflowValidationIssue,
  WorkflowValidationResult,
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
  Drawer,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
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
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';

import { isApiError } from '@/auth/errors';
import { createHandoffPath } from '@/features/asset-flow/handoff';
import { WorkflowPointPickerModal } from '@/components/WorkflowPointPickerModal';
import { WorkflowPreviewVisual } from '@/components/WorkflowPreviewVisuals';
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
  downloadExampleTableTemplate,
  getEffectiveNodeContractsForGraph,
  getTemplateContractHints,
  type WorkflowNodeAnalysis,
} from '@/features/workflows/workflow-contracts';
import {
  localizeWorkflowIssue,
  localizeWorkflowText,
} from '@/features/workflows/workflow-i18n';
import {
  FOR_EACH_NODE_TYPE,
  SUBGRAPH_INPUT_NODE_TYPE,
  SUBGRAPH_OUTPUT_NODE_TYPE,
  createDefaultDynamicNodeShape,
  getEffectiveNodeInputDefs,
  getEffectiveNodeOutputDefs,
  isStructuralSubgraphNodeType,
  isSubgraphBoundaryNode,
  syncCallSubgraphNodeInterfaces,
} from '@/features/workflows/workflow-subgraphs';
import { getEffectiveWorkflowValidationState } from '@/features/workflows/workflow-validation-state';
import { useI18n } from '@/i18n/useI18n';
import { downloadDatasetVersion, testWorkflowNode } from '@/lib/api';
import { workflowCategoryKey } from '@/lib/i18n-helpers';

const { Paragraph, Text, Title } = Typography;

const categoryColor: Record<WorkflowNodeDefinition['category'], string> = {
  source: '#155e75',
  preprocess: '#0f766e',
  split: '#a16207',
  control: '#9f1239',
  inference: '#1d4ed8',
  postprocess: '#7c3aed',
};

const categoryOrder: WorkflowNodeDefinition['category'][] = [
  'source',
  'preprocess',
  'split',
  'control',
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
  subgraph?: WorkflowGraph;
  subgraphPreviewItems?: WorkflowSubgraphPreviewItem[];
  subgraphHiddenPreviewCount?: number;
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

interface WorkflowStructuralDropPlacement {
  xRatio: number;
  yRatio: number;
}

interface WorkflowSubgraphPreviewItem {
  id: string;
  label: string;
  type: string;
  kind: 'input' | 'output' | 'structural' | 'standard';
}

interface WorkflowCanvasUiContextValue {
  onDropNodeIntoSubgraph: (
    parentNodeId: string,
    nodeType: string,
    placement: WorkflowStructuralDropPlacement,
  ) => void;
  hoveredStructuralDropNodeId: string | null;
}

interface WorkflowSubgraphExtractionPayload {
  movedGraph: WorkflowGraph;
  remainingGraph: WorkflowGraph;
  movedNodeIds: string[];
}

type WorkflowLibraryTab = 'nodes' | 'templates';
type SemanticNodeTag = 'boundary' | 'convenience';
type PendingIssueFocusTarget =
  | {
      nodeId: string;
      kind: 'status';
    }
  | {
      nodeId: string;
      kind: 'port';
      key: string;
    }
  | {
      nodeId: string;
      kind: 'param';
      key: string;
    };

const WORKFLOW_NODE_LIBRARY_DRAG_MIME = 'application/x-platform-workflow-node';
const WorkflowCanvasUiContext = createContext<WorkflowCanvasUiContextValue | null>(null);

function workflowIssueKey(issue: WorkflowValidationIssue): string {
  return [
    issue.severity,
    issue.code,
    issue.nodeId ?? '',
    issue.portKey ?? '',
    issue.paramKey ?? '',
    issue.message,
  ].join('::');
}

function workflowIssueTarget(issue: WorkflowValidationIssue): string | undefined {
  if (!issue.nodeId) {
    return undefined;
  }
  if (issue.paramKey) {
    return `${issue.nodeId}.${issue.paramKey}`;
  }
  if (issue.portKey) {
    return `${issue.nodeId}.${issue.portKey}`;
  }
  return issue.nodeId;
}

function portIssuesForNode(
  issues: WorkflowValidationIssue[],
  portKey: string,
): WorkflowValidationIssue[] {
  return issues.filter((issue) => issue.portKey === portKey);
}

function paramIssuesForNode(
  issues: WorkflowValidationIssue[],
  paramKey: string,
): WorkflowValidationIssue[] {
  return issues.filter((issue) => issue.paramKey === paramKey);
}

function formatBindingSummary(binding: string | undefined): string {
  if (!binding) {
    return '';
  }

  const [sourceNodeId, sourcePort] = binding.split(':');
  return sourcePort ? `${sourceNodeId} -> ${sourcePort}` : sourceNodeId;
}

function isLegacyNode(definition: WorkflowNodeDefinition): boolean {
  return definition.tags.includes('legacy');
}

function isConvenienceNode(definition: WorkflowNodeDefinition): boolean {
  return definition.tags.includes('convenience');
}

function semanticNodeTags(definition: WorkflowNodeDefinition): SemanticNodeTag[] {
  const tags: SemanticNodeTag[] = [];
  if (definition.tags.includes('boundary')) {
    tags.push('boundary');
  }
  if (definition.tags.includes('convenience')) {
    tags.push('convenience');
  }
  return tags;
}

function catalogPreviewTags(definition: WorkflowNodeDefinition): string[] {
  return [
    ...definition.tags.filter((tag) => !['boundary', 'convenience', 'legacy'].includes(tag)).slice(0, 2),
    ...definition.supportedTasks.slice(0, 1),
  ];
}

function summarizeParamValue(value: unknown, locale: LocaleCode): string {
  if (Array.isArray(value)) {
    const rendered = value
      .filter((item): item is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof item))
      .map((item) => String(item))
      .join(', ');
    return rendered.length > 22 ? `${rendered.slice(0, 19)}...` : rendered;
  }
  if (typeof value === 'boolean') {
    return localizeWorkflowText(locale, value ? 'On' : 'Off') ?? (value ? 'On' : 'Off');
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

function summarizeNodePreview(preview: WorkflowNodePreviewValue, locale: LocaleCode): string {
  if (typeof preview.summary === 'string' && preview.summary.trim()) {
    return localizeWorkflowText(locale, preview.summary) ?? preview.summary;
  }

  if (preview.kind === 'table') {
    const rowCount = getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0;
    const columns = Array.isArray(preview.columns) ? preview.columns.length : 0;
    return `${rowCount} ${localizeWorkflowText(locale, 'rows') ?? 'rows'} / ${columns} ${
      localizeWorkflowText(locale, 'columns') ?? 'columns'
    }`;
  }

  if (preview.kind === 'metrics_report') {
    const rowCount = getPreviewNumber(preview, 'rowCount', 'row_count') ?? 0;
    const metrics =
      preview.metrics && typeof preview.metrics === 'object' && !Array.isArray(preview.metrics)
        ? Object.keys(preview.metrics).length
        : 0;
    return `${rowCount} ${localizeWorkflowText(locale, 'rows') ?? 'rows'} / ${metrics} ${
      localizeWorkflowText(locale, 'metrics') ?? 'metrics'
    }`;
  }

  if (preview.kind === 'dataset_version') {
    const name = getPreviewString(preview, 'datasetName', 'dataset_name', 'datasetId', 'dataset_id');
    const version = getPreviewNumber(preview, 'version');
    const fallback = localizeWorkflowText(locale, 'Dataset') ?? 'Dataset';
    return version !== undefined ? `${name ?? fallback} / v${version}` : name ?? fallback;
  }

  if (preview.kind === 'model_version') {
    const name = getPreviewString(preview, 'modelName', 'model_name', 'modelId', 'model_id');
    const version = getPreviewString(preview, 'version');
    const fallback = localizeWorkflowText(locale, 'Model') ?? 'Model';
    return version ? `${name ?? fallback} / ${version}` : name ?? fallback;
  }

  if (preview.kind === 'model_ref') {
    const algorithm = getPreviewString(preview, 'algorithmKey', 'algorithm_key') ?? 'model';
    const featureCount = Array.isArray(preview.featureNames)
      ? preview.featureNames.length
      : Array.isArray(preview.feature_names)
        ? preview.feature_names.length
        : 0;
    return `${algorithm} / ${featureCount} ${localizeWorkflowText(locale, 'features') ?? 'features'}`;
  }

  if (preview.kind === 'artifact_file') {
    return (
      getPreviewString(preview, 'name') ??
      getPreviewString(preview, 'path') ??
      (localizeWorkflowText(locale, 'Artifact') ?? 'Artifact')
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
  datasets,
  datasetVersions,
  authToken,
  onActionClick,
  showRawPayload = true,
  compact = false,
}: {
  portKey: string;
  preview: WorkflowNodePreviewValue;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  authToken?: string | null;
  onActionClick?: (action: NonNullable<WorkflowNodePreviewValue['nextActions']>[number]) => void;
  showRawPayload?: boolean;
  compact?: boolean;
}) {
  const { locale } = useI18n();
  const previewKindLabel =
    localizeWorkflowText(locale, preview.kind) ?? preview.kind.replace(/_/g, ' ');
  const previewSummary = summarizeNodePreview(preview, locale);

  return (
    <div className="workflow-node-test-card">
      <div className="workflow-node-test-card-head">
        <strong>{portKey}</strong>
        <Tag bordered={false}>{previewKindLabel}</Tag>
      </div>
      {previewSummary ? (
        <Text type="secondary">{previewSummary}</Text>
      ) : null}
      <WorkflowPreviewVisual
        preview={preview}
        datasets={datasets}
        datasetVersions={datasetVersions}
        authToken={authToken}
        compact={compact}
      />
      {preview.nextActions?.length ? (
        <Space wrap size={[8, 8]}>
          {preview.nextActions.map((action) => (
            <Button key={action.key} size="small" onClick={() => onActionClick?.(action)}>
              {localizeWorkflowText(locale, action.label ?? action.key) ?? action.label ?? action.key}
            </Button>
          ))}
        </Space>
      ) : null}
      {showRawPayload ? (
        <pre className="json-block workflow-node-test-json">
          {JSON.stringify(buildPreviewPayload(preview), null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function ContractExampleCard({ example }: { example: WorkflowNodeExample }) {
  const { locale } = useI18n();
  const kindLabel =
    example.kind === 'table'
      ? localizeWorkflowText(locale, 'table') ?? 'table'
      : example.kind === 'json'
        ? localizeWorkflowText(locale, 'json') ?? 'json'
        : localizeWorkflowText(locale, 'text') ?? 'text';

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

function createWorkflowNodeId(definitionType: string): string {
  return `${definitionType}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function hasWorkflowLibraryDragPayload(dataTransfer: DataTransfer | null): boolean {
  return Boolean(
    dataTransfer &&
      Array.from(dataTransfer.types ?? []).includes(WORKFLOW_NODE_LIBRARY_DRAG_MIME),
  );
}

function writeWorkflowLibraryDragPayload(
  event: ReactDragEvent<HTMLElement>,
  nodeType: string,
): void {
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(WORKFLOW_NODE_LIBRARY_DRAG_MIME, nodeType);
  event.dataTransfer.setData('text/plain', nodeType);
}

function readWorkflowLibraryDragPayload(
  dataTransfer: DataTransfer | null,
): string | undefined {
  if (!hasWorkflowLibraryDragPayload(dataTransfer)) {
    return undefined;
  }
  const nodeType = dataTransfer?.getData(WORKFLOW_NODE_LIBRARY_DRAG_MIME).trim();
  return nodeType || undefined;
}

function fallbackPreviewLabel(nodeType: string): string {
  if (nodeType === SUBGRAPH_INPUT_NODE_TYPE) {
    return 'Input';
  }
  if (nodeType === SUBGRAPH_OUTPUT_NODE_TYPE) {
    return 'Output';
  }
  if (nodeType === FOR_EACH_NODE_TYPE) {
    return 'Loop';
  }
  if (nodeType === 'workflow.call_subgraph') {
    return 'Subflow';
  }
  return (
    nodeType
      .split('.')
      .pop()
      ?.split(/[_-]/)
      .map((segment) =>
        segment ? `${segment.charAt(0).toUpperCase()}${segment.slice(1)}` : '',
      )
      .join(' ') ?? nodeType
  );
}

function previewKindForNodeType(nodeType: string): WorkflowSubgraphPreviewItem['kind'] {
  if (nodeType === SUBGRAPH_INPUT_NODE_TYPE) {
    return 'input';
  }
  if (nodeType === SUBGRAPH_OUTPUT_NODE_TYPE) {
    return 'output';
  }
  if (isStructuralSubgraphNodeType(nodeType)) {
    return 'structural';
  }
  return 'standard';
}

function buildSubgraphPreview(
  subgraph: WorkflowGraph | undefined,
  definitions: WorkflowNodeDefinition[],
): {
  items: WorkflowSubgraphPreviewItem[];
  hiddenCount: number;
} {
  const orderedNodes = [...(subgraph?.nodes ?? [])].sort((left, right) => {
    if (left.position.y !== right.position.y) {
      return left.position.y - right.position.y;
    }
    if (left.position.x !== right.position.x) {
      return left.position.x - right.position.x;
    }
    return left.id.localeCompare(right.id);
  });
  const items = orderedNodes.slice(0, 6).map((node) => ({
    id: node.id,
    label: getWorkflowDefinitionByType(definitions, node.type)?.label ?? fallbackPreviewLabel(node.type),
    type: node.type,
    kind: previewKindForNodeType(node.type),
  }));
  return {
    items,
    hiddenCount: Math.max(orderedNodes.length - items.length, 0),
  };
}

function createWorkflowGraphNodeFromDefinition(
  definition: WorkflowNodeDefinition,
  position: WorkflowGraphNode['position'],
  context: WorkflowEditorContext,
): WorkflowGraphNode {
  const dynamicShape = createDefaultDynamicNodeShape(definition.type);
  return syncCallSubgraphNodeInterfaces({
    id: createWorkflowNodeId(definition.type),
    type: definition.type,
    position,
    params: createDefaultParams(definition, context),
    inputBindings: {},
    inputDefs: dynamicShape.inputDefs ?? definition.inputs,
    inputContracts: dynamicShape.inputContracts ?? definition.inputContracts ?? [],
    outputDefs: dynamicShape.outputDefs ?? definition.outputs,
    outputContracts: dynamicShape.outputContracts ?? definition.outputContracts ?? [],
    subgraph: dynamicShape.subgraph,
  });
}

function createWorkflowGraphNodeFromFlowNode(
  node: WorkflowFlowNode,
  position: WorkflowGraphNode['position'],
): WorkflowGraphNode {
  return syncCallSubgraphNodeInterfaces({
    id: node.id,
    type: node.data.type,
    position,
    params: node.data.params,
    inputBindings: node.data.inputBindings,
    inputDefs: node.data.inputs,
    inputContracts: node.data.inputContracts ?? [],
    outputDefs: node.data.outputs,
    outputContracts: node.data.outputContracts ?? [],
    subgraph: node.data.subgraph,
  });
}

function resolveSubgraphDropPosition(
  subgraph: WorkflowGraph | undefined,
  placement?: WorkflowStructuralDropPlacement,
): WorkflowGraphNode['position'] {
  const nodeCount = subgraph?.nodes.length ?? 0;
  if (!placement) {
    return {
      x: 88 + (nodeCount % 2) * 220,
      y: 80 + Math.floor(nodeCount / 2) * 136,
    };
  }
  return {
    x: Math.round(52 + Math.min(Math.max(placement.xRatio, 0), 1) * 420),
    y: Math.round(54 + Math.min(Math.max(placement.yRatio, 0), 1) * 340),
  };
}

function structuralDropPlacementFromPoint(
  clientX: number,
  clientY: number,
): {
  parentNodeId: string;
  placement: WorkflowStructuralDropPlacement;
} | null {
  const documentRef = window.document;
  const stackedElements =
    typeof documentRef.elementsFromPoint === 'function'
      ? documentRef.elementsFromPoint(clientX, clientY)
      : [documentRef.elementFromPoint(clientX, clientY)].filter(
          (element): element is Element => Boolean(element),
        );
  const dropZone = stackedElements.find(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      Boolean(element.closest<HTMLElement>('[data-workflow-structural-drop-zone]')),
  )?.closest<HTMLElement>('[data-workflow-structural-drop-zone]');
  if (!dropZone) {
    return null;
  }
  const parentNodeId = dropZone.dataset.workflowStructuralDropZone;
  if (!parentNodeId) {
    return null;
  }
  const rect = dropZone.getBoundingClientRect();
  return {
    parentNodeId,
    placement: {
      xRatio: rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5,
      yRatio: rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5,
    },
  };
}

function isPointInsideParentDropZone(clientX: number, clientY: number): boolean {
  const documentRef = window.document;
  const stackedElements =
    typeof documentRef.elementsFromPoint === 'function'
      ? documentRef.elementsFromPoint(clientX, clientY)
      : [documentRef.elementFromPoint(clientX, clientY)].filter(
          (element): element is Element => Boolean(element),
        );
  return stackedElements.some(
    (element) =>
      element instanceof HTMLElement &&
      Boolean(element.closest<HTMLElement>('[data-workflow-parent-drop-zone]')),
  );
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
  id,
  data,
  selected,
}: NodeProps<WorkflowFlowNode>) {
  const { locale } = useI18n();
  const workflowCanvasUi = useContext(WorkflowCanvasUiContext);
  const nodeIssues = (data.analysis.issues ?? []).map((issue) => localizeWorkflowIssue(locale, issue));
  const isStructuralNode = isStructuralSubgraphNodeType(data.type);
  const isBoundaryNode = isSubgraphBoundaryNode(data.type);
  const isBoundaryInputNode = data.type === SUBGRAPH_INPUT_NODE_TYPE;
  const isBoundaryOutputNode = data.type === SUBGRAPH_OUTPUT_NODE_TYPE;
  const isForEachNode = data.type === FOR_EACH_NODE_TYPE;
  const structuralNodeCount = data.subgraph?.nodes.length ?? 0;
  const structuralEdgeCount = data.subgraph?.edges.length ?? 0;
  const structuralHeadline =
    localizeWorkflowText(locale, isForEachNode ? 'Loop body' : 'Nested flow') ??
    (isForEachNode ? 'Loop body' : 'Nested flow');
  const structuralPreviewItems = data.subgraphPreviewItems ?? [];
  const structuralHiddenPreviewCount = data.subgraphHiddenPreviewCount ?? 0;
  const [isNestedDropHover, setIsNestedDropHover] = useState(false);
  const isCanvasNodeDropHover = workflowCanvasUi?.hoveredStructuralDropNodeId === id;
  const isStructuralDropActive = isNestedDropHover || isCanvasNodeDropHover;
  const previewKindLabel = useCallback((kind: WorkflowSubgraphPreviewItem['kind']): string => {
    if (kind === 'input') {
      return localizeWorkflowText(locale, 'Boundary input') ?? 'Boundary input';
    }
    if (kind === 'output') {
      return localizeWorkflowText(locale, 'Boundary output') ?? 'Boundary output';
    }
    if (kind === 'structural') {
      return localizeWorkflowText(locale, 'Nested node') ?? 'Nested node';
    }
    return localizeWorkflowText(locale, 'Node') ?? 'Node';
  }, [locale]);
  const previewParams = Object.entries(data.params)
    .map(([key, value]) => ({
      key,
      value: summarizeParamValue(value, locale),
    }))
    .filter((item) => item.value)
    .slice(0, 2);
  const localizedSummary = localizeWorkflowText(locale, data.analysis.summary) ?? data.analysis.summary;
  const cardClassName = [
    'workflow-node-card',
    `workflow-node-card-${data.analysis.tone}`,
    selected ? 'is-selected' : '',
    isStructuralNode ? 'workflow-node-card-structural' : '',
    isStructuralNode && isStructuralDropActive ? 'workflow-node-card-structural-drop-active' : '',
    isBoundaryNode ? 'workflow-node-card-boundary' : '',
    isBoundaryInputNode ? 'workflow-node-card-boundary-input' : '',
    isBoundaryOutputNode ? 'workflow-node-card-boundary-output' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const handleStructuralDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isStructuralNode || !data.canManage || !hasWorkflowLibraryDragPayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'copy';
      if (!isNestedDropHover) {
        setIsNestedDropHover(true);
      }
    },
    [data.canManage, isNestedDropHover, isStructuralNode],
  );
  const handleStructuralDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) {
        return;
      }
      setIsNestedDropHover(false);
    },
    [],
  );
  const handleStructuralDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!isStructuralNode || !data.canManage) {
        return;
      }
      const draggedNodeType = readWorkflowLibraryDragPayload(event.dataTransfer);
      if (!draggedNodeType) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      const xRatio = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
      const yRatio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
      setIsNestedDropHover(false);
      workflowCanvasUi?.onDropNodeIntoSubgraph(id, draggedNodeType, {
        xRatio,
        yRatio,
      });
    },
    [data.canManage, id, isStructuralNode, workflowCanvasUi],
  );

  return (
    <div
      className={cardClassName}
      data-workflow-structural-drop-zone={isStructuralNode ? id : undefined}
      onDragEnter={isStructuralNode ? handleStructuralDragOver : undefined}
      onDragOver={isStructuralNode ? handleStructuralDragOver : undefined}
      onDragLeave={isStructuralNode ? handleStructuralDragLeave : undefined}
      onDrop={isStructuralNode ? handleStructuralDrop : undefined}
    >
      <div className="workflow-node-card-head">
        <div className="workflow-node-card-title-block">
          {isStructuralNode ? (
            <div className="workflow-node-card-eyebrow">
              {localizeWorkflowText(locale, isForEachNode ? 'Loop' : 'Subgraph') ??
                (isForEachNode ? 'Loop' : 'Subgraph')}
            </div>
          ) : null}
          {isBoundaryInputNode ? (
            <div className="workflow-node-card-eyebrow">
              {localizeWorkflowText(locale, 'Boundary Input') ?? 'Boundary Input'}
            </div>
          ) : null}
          {isBoundaryOutputNode ? (
            <div className="workflow-node-card-eyebrow">
              {localizeWorkflowText(locale, 'Boundary Output') ?? 'Boundary Output'}
            </div>
          ) : null}
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

      {isStructuralNode ? (
        <>
          <div
            className={`workflow-node-card-summary workflow-node-card-summary-${data.analysis.tone}`}
            title={localizedSummary}
          >
            <div className="workflow-node-structural-summary-head">
              <strong>{structuralHeadline}</strong>
              <span>
                {structuralNodeCount} nodes / {structuralEdgeCount} edges
              </span>
            </div>
            <div className="workflow-node-structural-summary-copy">{localizedSummary}</div>
            <div className="workflow-node-structural-meta">
              <span>{localizeWorkflowText(locale, 'Scoped interface') ?? 'Scoped interface'}</span>
              <span>
                {data.inputs.length} in / {data.outputs.length} out
              </span>
              <span>{localizeWorkflowText(locale, 'Double-click to open') ?? 'Double-click to open'}</span>
            </div>
          </div>
          <div
            className={`workflow-node-structural-mini-flow${isStructuralDropActive ? ' is-drop-hover' : ''}`}
          >
            <div className="workflow-node-structural-mini-flow-head">
              <span>{localizeWorkflowText(locale, 'Nested steps') ?? 'Nested steps'}</span>
              <span>{structuralNodeCount}</span>
            </div>
            {data.canManage && isStructuralDropActive ? (
              <div className="workflow-node-structural-drop-banner">可放入子流程</div>
            ) : null}
            <div className="workflow-node-structural-mini-flow-canvas">
              {structuralPreviewItems.length ? (
                structuralPreviewItems.map((item) => (
                  <div
                    key={item.id}
                    className={`workflow-node-structural-preview-card workflow-node-structural-preview-card-${item.kind}`}
                  >
                    <div className="workflow-node-structural-preview-card-kicker">
                      {previewKindLabel(item.kind)}
                    </div>
                    <div className="workflow-node-structural-preview-card-title">{item.label}</div>
                    <div className="workflow-node-structural-preview-card-type" title={item.type}>
                      {item.type}
                    </div>
                  </div>
                ))
              ) : !data.canManage ? (
                <div className="workflow-node-structural-empty">
                  {localizeWorkflowText(locale, 'Drag nodes here to build the nested flow.') ??
                    'Drag nodes here to build the nested flow.'}
                </div>
              ) : null}
              {structuralHiddenPreviewCount ? (
                <div className="workflow-node-structural-preview-more">
                  +{structuralHiddenPreviewCount} more
                </div>
              ) : null}
              {data.canManage ? (
                <div
                  className={`workflow-node-structural-preview-slot${
                    isStructuralDropActive ? ' is-drop-hover' : ''
                  }`}
                >
                  <span className="workflow-node-structural-preview-slot-plus">+</span>
                  <div className="workflow-node-structural-preview-slot-copy">
                    <strong>
                      {isStructuralDropActive
                        ? '可放入子流程'
                        : localizeWorkflowText(locale, 'Drop node here') ?? 'Drop node here'}
                    </strong>
                    <span>
                      {isStructuralDropActive
                        ? '拖到此处即可放入该子流程'
                        : localizeWorkflowText(locale, 'Drag from library or from the parent canvas') ??
                          'Drag from library or from the parent canvas'}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="workflow-node-structural-drop-hint">
              {data.canManage
                ? isStructuralDropActive
                  ? '松开即可放入子流程'
                  : '拖到结构节点上即可放入子流程'
                : localizeWorkflowText(locale, 'Nested flow preview') ?? 'Nested flow preview'}
            </div>
          </div>
        </>
      ) : isBoundaryNode ? (
        <div
          className={`workflow-node-card-summary workflow-node-card-summary-${data.analysis.tone}`}
          title={localizedSummary}
        >
          <div className="workflow-node-boundary-summary-head">
            <strong>
              {localizeWorkflowText(
                locale,
                isBoundaryInputNode ? 'Expose parent input' : 'Return child output',
              ) ?? (isBoundaryInputNode ? 'Expose parent input' : 'Return child output')}
            </strong>
            <span>
              {localizeWorkflowText(locale, isBoundaryInputNode ? 'Entry port' : 'Exit port') ??
                (isBoundaryInputNode ? 'Entry port' : 'Exit port')}
            </span>
          </div>
          <div className="workflow-node-boundary-summary-copy">{localizedSummary}</div>
        </div>
      ) : (
        <div
          className={`workflow-node-card-summary workflow-node-card-summary-${data.analysis.tone}`}
          title={localizedSummary}
        >
          {localizedSummary}
        </div>
      )}

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
              className={`workflow-node-port-row${
                portIssuesForNode(nodeIssues, port.key).length ? ' workflow-node-port-row-error' : ''
              }`}
            >
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
                      {localizeWorkflowText(locale, label) ?? label}
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
              className={`workflow-node-port-row workflow-node-port-row-output${
                portIssuesForNode(nodeIssues, port.key).length ? ' workflow-node-port-row-error' : ''
              }`}
            >
              <div className="workflow-node-port-copy">
                <div className="workflow-node-port-label">{port.label}</div>
                <div className="workflow-node-port-types">
                  {getDataTypeLabels(port).map((label) => (
                    <Tag key={label} bordered={false} className="workflow-type-tag">
                      {localizeWorkflowText(locale, label) ?? label}
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
  const sourceOutputs = sourceNode
    ? getEffectiveNodeOutputDefs(sourceNode, sourceDefinition)
    : sourceDefinition?.outputs ?? [];
  const targetInputs = targetNode
    ? getEffectiveNodeInputDefs(targetNode, targetDefinition)
    : targetDefinition?.inputs ?? [];

  return {
    sourceHandle: edge.sourceHandle ?? sourceOutputs[0]?.key,
    targetHandle: edge.targetHandle ?? targetInputs[0]?.key,
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
  validationResult: WorkflowValidationResult | null | undefined,
  validationGraphSignature: string | null | undefined,
  canManage: boolean,
  graphContext: 'root' | 'subgraph',
  t: ReturnType<typeof useI18n>['t'],
): WorkflowFlowNode[] {
  const hydratedWorkflow = toWorkflowVersion(nodes, edges, workflowVersion);
  const validationState = getEffectiveWorkflowValidationState({
    definitions,
    workflowVersion: hydratedWorkflow,
    context,
    validationResult,
    validationGraphSignature,
    insideSubgraph: graphContext === 'subgraph',
  });

  return nodes.map((node) => {
    const definition = getWorkflowDefinitionByType(definitions, node.data.type);
    const syncedNode = syncCallSubgraphNodeInterfaces({
      id: node.id,
      type: node.data.type,
      position: node.position,
      params: node.data.params,
      inputBindings: node.data.inputBindings,
      inputDefs: node.data.inputs,
      inputContracts: node.data.inputContracts ?? [],
      outputDefs: node.data.outputs,
      outputContracts: node.data.outputContracts ?? [],
      subgraph: node.data.subgraph,
    });
    const subgraphPreview = buildSubgraphPreview(syncedNode.subgraph, definitions);
    const analysis =
      validationState.analysisByNodeId[node.id] ?? fallbackNodeAnalysis(definition, node.data.type);
    const category = definition?.category ?? node.data.category;
    const resolvedContracts = getEffectiveNodeContractsForGraph(
      definitions,
      hydratedWorkflow,
      context,
      syncedNode,
    );

    return {
      ...node,
      data: {
        ...node.data,
        title: definition?.label ?? node.data.title,
        description: definition?.description ?? node.data.description,
        category,
        categoryLabel: t(workflowCategoryKey(category)),
        inputs: getEffectiveNodeInputDefs(syncedNode, definition),
        outputs: getEffectiveNodeOutputDefs(syncedNode, definition),
        params: {
          ...(definition ? createDefaultParams(definition, context) : {}),
          ...node.data.params,
        },
        inputBindings: buildInputBindings(edges, node.id),
        inputContracts: resolvedContracts.inputContracts,
        outputContracts: resolvedContracts.outputContracts,
        exampleInputs: definition?.exampleInputs ?? node.data.exampleInputs,
        exampleOutputs: definition?.exampleOutputs ?? node.data.exampleOutputs,
        commonErrors: definition?.commonErrors ?? node.data.commonErrors,
        subgraph: syncedNode.subgraph,
        subgraphPreviewItems: subgraphPreview.items,
        subgraphHiddenPreviewCount: subgraphPreview.hiddenCount,
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
  validationResult: WorkflowValidationResult | null | undefined,
  validationGraphSignature: string | null | undefined,
  canManage: boolean,
  graphContext: 'root' | 'subgraph',
  t: ReturnType<typeof useI18n>['t'],
): WorkflowFlowNode[] {
  const validationState = getEffectiveWorkflowValidationState({
    definitions,
    workflowVersion,
    context,
    validationResult,
    validationGraphSignature,
    insideSubgraph: graphContext === 'subgraph',
  });

  return resolveNodeCollisions(
    workflowVersion.graph.nodes.map((node) => {
      const syncedNode = syncCallSubgraphNodeInterfaces(node);
      const definition = getWorkflowDefinitionByType(definitions, syncedNode.type);
      const inputs = getEffectiveNodeInputDefs(syncedNode, definition);
      const outputs = getEffectiveNodeOutputDefs(syncedNode, definition);
      const subgraphPreview = buildSubgraphPreview(syncedNode.subgraph, definitions);
      const analysis = validationState.analysisByNodeId[node.id] ?? {
        state: 'ready',
        tone: 'green',
        summary: definition?.description ?? node.type,
        issues: [],
      };
      const resolvedContracts = getEffectiveNodeContractsForGraph(
        definitions,
        workflowVersion,
        context,
        syncedNode,
      );

      return {
        id: node.id,
        type: 'workflowNode',
        position: node.position,
        draggable: canManage,
        selectable: true,
        data: {
          type: syncedNode.type,
          title: definition?.label ?? syncedNode.type,
          description: definition?.description ?? syncedNode.type,
          category: definition?.category ?? 'source',
          categoryLabel: t(
            workflowCategoryKey(definition?.category ?? 'source'),
          ),
          inputs,
          outputs,
          params: {
            ...(definition ? createDefaultParams(definition, context) : {}),
            ...syncedNode.params,
          },
          inputBindings: syncedNode.inputBindings,
          inputContracts: resolvedContracts.inputContracts,
          outputContracts: resolvedContracts.outputContracts,
          exampleInputs: definition?.exampleInputs ?? [],
          exampleOutputs: definition?.exampleOutputs ?? [],
          commonErrors: definition?.commonErrors ?? [],
          subgraph: syncedNode.subgraph,
          subgraphPreviewItems: subgraphPreview.items,
          subgraphHiddenPreviewCount: subgraphPreview.hiddenCount,
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
      nodes: nodes.map((node) =>
        syncCallSubgraphNodeInterfaces({
          id: node.id,
          type: node.data.type,
          position: {
            x: node.position.x,
            y: node.position.y,
          },
          params: node.data.params,
          inputBindings: buildInputBindings(edges, node.id),
          inputDefs: node.data.inputs.map((port) => ({
            key: port.key,
            label: port.label,
            description: port.description,
            dataTypes: port.dataTypes,
            required: port.required,
          })),
          inputContracts: (node.data.inputContracts ?? []).map((contract) => ({ ...contract })),
          outputDefs: node.data.outputs.map((port) => ({
            key: port.key,
            label: port.label,
            description: port.description,
            dataTypes: port.dataTypes,
            required: port.required,
          })),
          outputContracts: (node.data.outputContracts ?? []).map((contract) => ({ ...contract })),
          subgraph: node.data.subgraph,
        }),
      ),
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
  definitions,
  nodeId,
  nodeType,
  value,
  context,
  workflowVersion,
  onChange,
}: {
  definition: WorkflowParamDefinition;
  definitions: WorkflowNodeDefinition[];
  nodeId: string;
  nodeType: string;
  value: unknown;
  context: WorkflowEditorContext;
  workflowVersion: WorkflowVersionDetail;
  onChange: (value: unknown) => void;
}) {
  const { t } = useI18n();
  const { options, emptyReason } = resolveParameterOptions(definition, context, {
    nodeId,
    nodeType,
    workflowVersion,
    definitions,
  });
  const noCompatibleDatasetContent =
    emptyReason === 'no_compatible_dataset_versions'
      ? t('workflows.noCompatibleDatasetVersions')
      : undefined;

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
    case 'spatialRoi':
    case 'geeCredential':
      return (
        <Select
          showSearch
          value={typeof value === 'string' ? value : undefined}
          options={options}
          notFoundContent={noCompatibleDatasetContent}
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

function shouldRenderParameterField(
  nodeType: string,
  params: Record<string, unknown>,
  definition: WorkflowParamDefinition,
): boolean {
  void nodeType;

  const credentialMode =
    typeof params.credentialMode === 'string' ? params.credentialMode : 'platform_default';
  const roiMode = typeof params.roiMode === 'string' ? params.roiMode : undefined;

  if (definition.key === 'personalCredentialId' || definition.fieldType === 'geeCredential') {
    return credentialMode === 'personal';
  }

  if (definition.key === 'bbox' && roiMode) {
    return roiMode === 'manual_bbox';
  }

  if ((definition.key === 'roiId' || definition.fieldType === 'spatialRoi') && roiMode) {
    return roiMode === 'saved_roi';
  }

  return true;
}

function CanvasInner({
  catalog,
  templates,
  workflowVersion,
  validationResult,
  validationGraphSignature,
  canManage,
  canTest,
  datasets,
  datasetVersions,
  geeCredentials,
  modelVersions,
  spatialRois,
  authToken,
  onWorkflowChange,
  graphContext = 'root',
  onExtractNodesToParent,
}: {
  catalog: WorkflowNodeCatalogItem[];
  templates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  validationResult?: WorkflowValidationResult | null;
  validationGraphSignature?: string | null;
  canManage: boolean;
  canTest: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  spatialRois: SpatialRoiSummary[];
  authToken?: string | null;
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
  graphContext?: 'root' | 'subgraph';
  onExtractNodesToParent?: (payload: WorkflowSubgraphExtractionPayload) => void;
}) {
  const { message } = App.useApp();
  const { locale, t } = useI18n();
  const localizeText = useCallback(
    (value: string | undefined | null) => localizeWorkflowText(locale, value) ?? value ?? '',
    [locale],
  );
  const navigate = useNavigate();
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow();
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const inspectorBodyRef = useRef<HTMLDivElement | null>(null);
  const statusCardRef = useRef<HTMLDivElement | null>(null);
  const parameterFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const portFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const issueFocusTimerRef = useRef<number | null>(null);
  const issueMarkerTimerRef = useRef<number | null>(null);
  const workflowVersionRef = useRef(workflowVersion);
  const editorContext = useMemo<WorkflowEditorContext>(
    () => ({
      datasets,
      datasetVersions,
      geeCredentials,
      modelVersions,
      spatialRois,
    }),
    [datasetVersions, datasets, geeCredentials, modelVersions, spatialRois],
  );
  const definitions = useMemo(() => catalog as WorkflowNodeDefinition[], [catalog]);
  const availableTemplates = useMemo(() => templates, [templates]);
  const [nodes, setNodes] = useState<WorkflowFlowNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [activeInspectorPanels, setActiveInspectorPanels] = useState<string[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<WorkflowLibraryTab>('nodes');
  const [keyword, setKeyword] = useState('');
  const [selectedDataType, setSelectedDataType] = useState<WorkflowPortDataType | undefined>();
  const [selectedTask, setSelectedTask] = useState<string | undefined>();
  const [showConvenienceNodes, setShowConvenienceNodes] = useState(false);
  const [nodeTestLoading, setNodeTestLoading] = useState(false);
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, NodeTestResultState>>({});
  const [nodeTestModalOpen, setNodeTestModalOpen] = useState(false);
  const [pointPickerOpen, setPointPickerOpen] = useState(false);
  const [subgraphEditorOpen, setSubgraphEditorOpen] = useState(false);
  const [nodeTestProgressOpen, setNodeTestProgressOpen] = useState(false);
  const [nodeTestProgressPercent, setNodeTestProgressPercent] = useState(0);
  const [nodeTestProgressMessage, setNodeTestProgressMessage] = useState('');
  const [isParentDropHover, setIsParentDropHover] = useState(false);
  const [hoveredStructuralDropNodeId, setHoveredStructuralDropNodeId] = useState<string | null>(null);
  const [pendingIssueFocusTarget, setPendingIssueFocusTarget] = useState<PendingIssueFocusTarget | null>(null);
  const [focusedIssueMarker, setFocusedIssueMarker] = useState<string | null>(null);
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
        validationResult,
        validationGraphSignature,
        canManage,
        graphContext,
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
    [
      canManage,
      definitions,
      editorContext,
      graphContext,
      onWorkflowChange,
      t,
      validationGraphSignature,
      validationResult,
    ],
  );

  useEffect(() => {
    workflowVersionRef.current = workflowVersion;
    const nextNodes = buildFlowNodes(
      definitions,
      workflowVersion,
      editorContext,
      validationResult,
      validationGraphSignature,
      canManage,
      graphContext,
      t,
    );
    const nextEdges = buildFlowEdges(definitions, workflowVersion);

    commitGraphState(nextNodes, nextEdges);
    setNodeTestResults({});
    setSelectedNodeId((currentSelectedNodeId) =>
      nextNodes.some((node) => node.id === currentSelectedNodeId) ? currentSelectedNodeId : undefined,
    );
  }, [
    canManage,
    commitGraphState,
    definitions,
    editorContext,
    graphContext,
    t,
    validationGraphSignature,
    validationResult,
    workflowVersion,
  ]);

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
  const selectedNodeIsForEach = selectedNode?.data.type === FOR_EACH_NODE_TYPE;
  const selectedNodeHasStructuralSubgraph = Boolean(
    selectedNode && isStructuralSubgraphNodeType(selectedNode.data.type),
  );
  const selectedNodeIsSubgraphInput = selectedNode?.data.type === SUBGRAPH_INPUT_NODE_TYPE;
  const selectedNodeIsSubgraphOutput = selectedNode?.data.type === SUBGRAPH_OUTPUT_NODE_TYPE;
  const selectedSubgraphWorkflowVersion = useMemo<WorkflowVersionDetail | undefined>(() => {
    if (!selectedNodeHasStructuralSubgraph || !selectedNode?.data.subgraph) {
      return undefined;
    }
    return {
      ...workflowVersionRef.current,
      id: `${workflowVersionRef.current.id}::${selectedNode.id}`,
      graph: selectedNode.data.subgraph,
    };
  }, [selectedNode, selectedNodeHasStructuralSubgraph]);
  useEffect(() => {
    if (!selectedNodeHasStructuralSubgraph) {
      setSubgraphEditorOpen(false);
    }
  }, [selectedNodeHasStructuralSubgraph]);
  const currentWorkflow = useMemo(
    () => toWorkflowVersion(nodes, edges, workflowVersionRef.current),
    [edges, nodes],
  );
  const effectiveValidationState = useMemo(
    () =>
      getEffectiveWorkflowValidationState({
        definitions,
        workflowVersion: currentWorkflow,
        context: editorContext,
        validationResult,
        validationGraphSignature,
        insideSubgraph: graphContext === 'subgraph',
      }),
    [
      currentWorkflow,
      definitions,
      editorContext,
      graphContext,
      validationGraphSignature,
      validationResult,
    ],
  );
  const currentGraphSignature = effectiveValidationState.currentGraphSignature;
  const validationIssuesAreFresh = effectiveValidationState.validationIssuesAreFresh;
  const combinedIssues = useMemo(
    () => effectiveValidationState.combinedIssues.map((issue) => localizeWorkflowIssue(locale, issue)),
    [effectiveValidationState.combinedIssues, locale],
  );
  const issuesByNodeId = effectiveValidationState.issuesByNodeId;
  const selectedNodeTest = selectedNodeId ? nodeTestResults[selectedNodeId] : undefined;
  const selectedNodeTestIsStale = Boolean(
    selectedNodeTest && selectedNodeTest.graphSignature !== currentGraphSignature,
  );
  const selectedNodeType = selectedNode?.data.type;
  const selectedNodeSupportsPointPicker =
    selectedNode?.data.type === 'gee.nee_point_timeseries_export';
  const selectedNodeCurrentPoint = useMemo(() => {
    if (!selectedNodeSupportsPointPicker || !selectedNode) {
      return null;
    }
    const longitude = Number(selectedNode.data.params.longitude);
    const latitude = Number(selectedNode.data.params.latitude);
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      Math.abs(longitude) > 180 ||
      Math.abs(latitude) > 90
    ) {
      return null;
    }
    return {
      longitude,
      latitude,
    };
  }, [selectedNode, selectedNodeSupportsPointPicker]);
  useEffect(() => {
    if (!selectedNodeSupportsPointPicker) {
      setPointPickerOpen(false);
    }
  }, [selectedNodeSupportsPointPicker]);
  const selectedNodeIssues = useMemo(
    () =>
      selectedNodeId
        ? (issuesByNodeId[selectedNodeId] ?? []).map((issue) => localizeWorkflowIssue(locale, issue))
        : [],
    [issuesByNodeId, locale, selectedNodeId],
  );

  useEffect(() => {
    if (!pendingIssueFocusTarget || pendingIssueFocusTarget.nodeId !== selectedNodeId) {
      return;
    }

    if (issueFocusTimerRef.current !== null) {
      window.clearTimeout(issueFocusTimerRef.current);
    }

    issueFocusTimerRef.current = window.setTimeout(() => {
      const targetKey =
        pendingIssueFocusTarget.kind === 'status'
          ? pendingIssueFocusTarget.nodeId
          : `${pendingIssueFocusTarget.nodeId}:${pendingIssueFocusTarget.key}`;
      const targetElement =
        pendingIssueFocusTarget.kind === 'status'
          ? statusCardRef.current
          : pendingIssueFocusTarget.kind === 'param'
            ? parameterFieldRefs.current[targetKey]
            : portFieldRefs.current[targetKey];
      issueFocusTimerRef.current = null;

      if (!targetElement) {
        return;
      }

      if (inspectorBodyRef.current && !inspectorBodyRef.current.contains(targetElement)) {
        return;
      }

      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const focusable = targetElement.querySelector<HTMLElement>(
        'input, textarea, button, [tabindex], .ant-select-selector',
      );
      focusable?.focus?.({ preventScroll: true });

      setFocusedIssueMarker(
        pendingIssueFocusTarget.kind === 'status'
          ? `status:${pendingIssueFocusTarget.nodeId}`
          : `${pendingIssueFocusTarget.kind}:${targetKey}`,
      );
      setPendingIssueFocusTarget(null);

      if (issueMarkerTimerRef.current !== null) {
        window.clearTimeout(issueMarkerTimerRef.current);
      }
      issueMarkerTimerRef.current = window.setTimeout(() => {
        setFocusedIssueMarker(null);
      }, 1600);
    }, 220);

    return () => {
      if (issueFocusTimerRef.current !== null) {
        window.clearTimeout(issueFocusTimerRef.current);
        issueFocusTimerRef.current = null;
      }
    };
  }, [activeInspectorPanels, pendingIssueFocusTarget, selectedNodeId]);
  const nodeLibraryCopy = useMemo(
    () => ({
      openButton: t('workflows.nodeLibrary'),
      drawerDescription: t('workflows.nodeLibraryCopy'),
    }),
    [t],
  );
  const nodeTestProgressCopy = useMemo(
    () => ({
      title: localizeText('Node Test In Progress'),
      authenticating: localizeText('Connecting to Google Earth Engine...'),
      searching: localizeText('Searching Sentinel scenes...'),
      preparing: localizeText('Preparing node output preview...'),
      completed: localizeText('Node test completed.'),
      failed: localizeText('Node test failed.'),
    }),
    [localizeText],
  );
  const pointPickerCopy = useMemo(
    () =>
      locale === 'zh-CN'
        ? {
            title: '地图选点',
            description: '打开地图后单击一次即可回填经纬度。',
            action: '从地图选点',
            empty: '尚未设置经纬度',
          }
        : {
            title: 'Map Point Picker',
            description: 'Open the map and click once to write longitude and latitude back.',
            action: 'Pick On Map',
            empty: 'Longitude and latitude are not set yet.',
          },
    [locale],
  );
  const stopNodeTestProgressTimer = useCallback(() => {
    if (nodeTestProgressTimerRef.current !== null) {
      window.clearInterval(nodeTestProgressTimerRef.current);
      nodeTestProgressTimerRef.current = null;
    }
  }, []);
  const selectedNodeUsesRemoteGeo =
    selectedNodeType === 'geo.query_raster_collection' ||
    selectedNodeType === 'geo.fetch_scene_as_dataset';

  const startNodeTestProgress = useCallback(() => {
    if (!selectedNodeUsesRemoteGeo) {
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
  }, [nodeTestProgressCopy, selectedNodeUsesRemoteGeo, stopNodeTestProgressTimer]);

  const finishNodeTestProgress = useCallback(
    (nextMessage: string) => {
      if (!selectedNodeUsesRemoteGeo) {
        return;
      }

      stopNodeTestProgressTimer();
      setNodeTestProgressPercent(100);
      setNodeTestProgressMessage(nextMessage);
      window.setTimeout(() => setNodeTestProgressOpen(false), 450);
    },
    [selectedNodeUsesRemoteGeo, stopNodeTestProgressTimer],
  );

  useEffect(
    () => () => {
      stopNodeTestProgressTimer();
    },
    [stopNodeTestProgressTimer],
  );
  useEffect(
    () => () => {
      if (issueFocusTimerRef.current !== null) {
        window.clearTimeout(issueFocusTimerRef.current);
      }
      if (issueMarkerTimerRef.current !== null) {
        window.clearTimeout(issueMarkerTimerRef.current);
      }
    },
    [],
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
  const matchingDefinitions = useMemo(
    () =>
      definitions.filter((definition) =>
        !isLegacyNode(definition) &&
        (graphContext === 'subgraph' || !isSubgraphBoundaryNode(definition.type)) &&
        catalogMatchesFilters(definition, {
          keyword,
          dataType: selectedDataType,
          task: selectedTask,
        }),
      ),
    [definitions, graphContext, keyword, selectedDataType, selectedTask],
  );
  const filteredDefinitions = useMemo(
    () =>
      matchingDefinitions.filter(
        (definition) => showConvenienceNodes || !isConvenienceNode(definition),
      ),
    [matchingDefinitions, showConvenienceNodes],
  );
  const matchingConvenienceCount = useMemo(
    () => matchingDefinitions.filter(isConvenienceNode).length,
    [matchingDefinitions],
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
  const selectedNodeSemanticTags = useMemo(
    () => (selectedDefinition ? semanticNodeTags(selectedDefinition) : []),
    [selectedDefinition],
  );
  const selectedBoundaryPort = useMemo(
    () =>
      selectedNodeIsSubgraphInput
        ? selectedNode?.data.outputs[0]
        : selectedNodeIsSubgraphOutput
          ? selectedNode?.data.inputs[0]
          : undefined,
    [selectedNode, selectedNodeIsSubgraphInput, selectedNodeIsSubgraphOutput],
  );
  const selectedBoundaryContract = useMemo(
    () =>
      selectedNodeIsSubgraphInput
        ? selectedNode?.data.outputContracts?.[0]
        : selectedNodeIsSubgraphOutput
          ? selectedNode?.data.inputContracts?.[0]
          : undefined,
    [selectedNode, selectedNodeIsSubgraphInput, selectedNodeIsSubgraphOutput],
  );
  const renderSemanticTag = useCallback(
    (tag: SemanticNodeTag) => (
      <Tag
        key={tag}
        bordered={false}
        className={`workflow-semantic-tag workflow-semantic-tag-${tag}`}
      >
        {tag === 'boundary'
          ? t('workflows.semanticBoundary')
          : t('workflows.semanticConvenience')}
      </Tag>
    ),
    [t],
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
          inputDefs: node.data.inputs,
          inputContracts: node.data.inputContracts ?? [],
          outputDefs: node.data.outputs,
          outputContracts: node.data.outputContracts ?? [],
          subgraph: node.data.subgraph,
        })),
        editorContext,
        {
          source: connection.source,
          sourceHandle: connection.sourceHandle ?? null,
          target: connection.target,
          targetHandle: connection.targetHandle ?? null,
        },
      ),
    [definitions, editorContext],
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

  const createFlowNodeFromDefinition = useCallback(
    (
      definition: WorkflowNodeDefinition,
      position: WorkflowGraphNode['position'],
    ): WorkflowFlowNode | undefined => {
      const rawNode = createWorkflowGraphNodeFromDefinition(definition, position, editorContext);
      return buildFlowNodes(
        definitions,
        {
          ...workflowVersionRef.current,
          graph: {
            nodes: [rawNode],
            edges: [],
          },
        },
        editorContext,
        validationResult,
        validationGraphSignature,
        canManage,
        graphContext,
        t,
      )[0];
    },
    [canManage, definitions, editorContext, graphContext, t],
  );

  const insertNodeIntoCurrentGraph = useCallback(
    (
      definition: WorkflowNodeDefinition,
      position: WorkflowGraphNode['position'],
      options?: {
        closeLibrary?: boolean;
      },
    ) => {
      if (!canManage) {
        return;
      }
      const nextNode = createFlowNodeFromDefinition(definition, position);
      if (!nextNode) {
        return;
      }
      commitGraphState([...nodesRef.current, nextNode], edgesRef.current, true);
      setSelectedNodeId(nextNode.id);
      if (options?.closeLibrary) {
        setLibraryOpen(false);
      }
    },
    [canManage, commitGraphState, createFlowNodeFromDefinition],
  );

  const addNode = (definition: WorkflowNodeDefinition) => {
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
    insertNodeIntoCurrentGraph(definition, centeredPosition, { closeLibrary: true });
  };

  const dropNodeIntoSubgraph = useCallback(
    (
      parentNodeId: string,
      nodeType: string,
      placement: WorkflowStructuralDropPlacement,
    ) => {
      if (!canManage) {
        return;
      }
      const definition = getWorkflowDefinitionByType(definitions, nodeType);
      if (!definition) {
        return;
      }
      const parentNode = nodesRef.current.find((node) => node.id === parentNodeId);
      if (!parentNode || !isStructuralSubgraphNodeType(parentNode.data.type)) {
        return;
      }

      const nextNodes = nodesRef.current.map((node) => {
        if (node.id !== parentNodeId) {
          return node;
        }
        const currentSubgraph = node.data.subgraph ?? { nodes: [], edges: [] };
        const insertedNode = createWorkflowGraphNodeFromDefinition(
          definition,
          resolveSubgraphDropPosition(currentSubgraph, placement),
          editorContext,
        );
        const nextSubgraph: WorkflowGraph = {
          nodes: [...currentSubgraph.nodes, insertedNode],
          edges: currentSubgraph.edges,
        };
        const synced = syncCallSubgraphNodeInterfaces({
          id: node.id,
          type: node.data.type,
          position: node.position,
          params: node.data.params,
          inputBindings: node.data.inputBindings,
          inputDefs: node.data.inputs,
          inputContracts: node.data.inputContracts ?? [],
          outputDefs: node.data.outputs,
          outputContracts: node.data.outputContracts ?? [],
          subgraph: nextSubgraph,
        });
        return {
          ...node,
          data: {
            ...node.data,
            inputs: synced.inputDefs ?? [],
            outputs: synced.outputDefs,
            inputContracts: synced.inputContracts ?? [],
            outputContracts: synced.outputContracts ?? [],
            subgraph: synced.subgraph,
          },
        };
      });

      commitGraphState(nextNodes, edgesRef.current, true);
      setSelectedNodeId(parentNodeId);
      message.success(`${definition.label} added to ${parentNode.data.title}`);
    },
    [canManage, commitGraphState, definitions, editorContext, message],
  );
  const moveRootNodesIntoSubgraph = useCallback(
    (
      parentNodeId: string,
      movedNodeIds: string[],
      placement: WorkflowStructuralDropPlacement,
    ) => {
      if (!canManage) {
        return;
      }
      const uniqueMovedNodeIds = [...new Set(movedNodeIds)].filter((nodeId) => nodeId !== parentNodeId);
      if (!uniqueMovedNodeIds.length) {
        return;
      }
      const parentNode = nodesRef.current.find((node) => node.id === parentNodeId);
      if (!parentNode || !isStructuralSubgraphNodeType(parentNode.data.type)) {
        return;
      }
      const movedNodes = nodesRef.current.filter((node) => uniqueMovedNodeIds.includes(node.id));
      if (!movedNodes.length) {
        return;
      }

      const sourceBounds = movedNodes.reduce(
        (accumulator, node) => ({
          minX: Math.min(accumulator.minX, node.position.x),
          minY: Math.min(accumulator.minY, node.position.y),
        }),
        {
          minX: Number.POSITIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
        },
      );
      const currentSubgraph = parentNode.data.subgraph ?? { nodes: [], edges: [] };
      const anchorPosition = resolveSubgraphDropPosition(currentSubgraph, placement);
      const movedNodeIdSet = new Set(uniqueMovedNodeIds);
      const movedSubgraphNodes = movedNodes.map((node) =>
        createWorkflowGraphNodeFromFlowNode(node, {
          x: anchorPosition.x + (node.position.x - sourceBounds.minX),
          y: anchorPosition.y + (node.position.y - sourceBounds.minY),
        }),
      );
      const carriedEdges = edgesRef.current
        .filter(
          (edge) => movedNodeIdSet.has(edge.source) && movedNodeIdSet.has(edge.target),
        )
        .map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined,
        }));
      const remainingRootEdges = edgesRef.current.filter(
        (edge) => !movedNodeIdSet.has(edge.source) && !movedNodeIdSet.has(edge.target),
      );

      const nextNodes = nodesRef.current
        .filter((node) => !movedNodeIdSet.has(node.id))
        .map((node) => {
          if (node.id !== parentNodeId) {
            return node;
          }
          const nextSubgraph: WorkflowGraph = {
            nodes: [...currentSubgraph.nodes, ...movedSubgraphNodes],
            edges: [...currentSubgraph.edges, ...carriedEdges],
          };
          const synced = syncCallSubgraphNodeInterfaces({
            id: node.id,
            type: node.data.type,
            position: node.position,
            params: node.data.params,
            inputBindings: node.data.inputBindings,
            inputDefs: node.data.inputs,
            inputContracts: node.data.inputContracts ?? [],
            outputDefs: node.data.outputs,
            outputContracts: node.data.outputContracts ?? [],
            subgraph: nextSubgraph,
          });
          return {
            ...node,
            data: {
              ...node.data,
              inputs: synced.inputDefs ?? [],
              outputs: synced.outputDefs,
              inputContracts: synced.inputContracts ?? [],
              outputContracts: synced.outputContracts ?? [],
              subgraph: synced.subgraph,
            },
          };
        });

      commitGraphState(nextNodes, remainingRootEdges, true);
      setSelectedNodeId(parentNodeId);
      message.success(
        `${movedNodes.length} node${movedNodes.length > 1 ? 's' : ''} moved into ${parentNode.data.title}`,
      );
    },
    [canManage, commitGraphState, message],
  );

  const handleRootNodeDragStop = useCallback(
    (event: ReactMouseEvent, _node: WorkflowFlowNode, draggedNodes: WorkflowFlowNode[]) => {
      if (!canManage) {
        return;
      }
      setHoveredStructuralDropNodeId(null);
      const dropTarget = structuralDropPlacementFromPoint(event.clientX, event.clientY);
      if (!dropTarget) {
        return;
      }
      moveRootNodesIntoSubgraph(
        dropTarget.parentNodeId,
        draggedNodes.map((item) => item.id),
        dropTarget.placement,
      );
    },
    [canManage, moveRootNodesIntoSubgraph],
  );
  const handleRootNodeDrag = useCallback(
    (event: ReactMouseEvent, _node: WorkflowFlowNode, draggedNodes: WorkflowFlowNode[]) => {
      if (!canManage) {
        return;
      }
      const hoveredDropTarget = structuralDropPlacementFromPoint(event.clientX, event.clientY);
      const movedNodeIds = new Set(draggedNodes.map((item) => item.id));
      const nextHoveredId =
        hoveredDropTarget && !movedNodeIds.has(hoveredDropTarget.parentNodeId)
          ? hoveredDropTarget.parentNodeId
          : null;
      setHoveredStructuralDropNodeId((current) => (current === nextHoveredId ? current : nextHoveredId));
    },
    [canManage],
  );
  const handleSubgraphNodeDrag = useCallback(
    (event: ReactMouseEvent) => {
      if (graphContext !== 'subgraph' || !onExtractNodesToParent) {
        return;
      }
      const nextHover = isPointInsideParentDropZone(event.clientX, event.clientY);
      setIsParentDropHover((current) => (current === nextHover ? current : nextHover));
    },
    [graphContext, onExtractNodesToParent],
  );

  const handleSubgraphNodeDragStop = useCallback(
    (event: ReactMouseEvent, _node: WorkflowFlowNode, draggedNodes: WorkflowFlowNode[]) => {
      if (graphContext !== 'subgraph' || !onExtractNodesToParent) {
        return;
      }
      const shouldExtract = isPointInsideParentDropZone(event.clientX, event.clientY);
      setIsParentDropHover(false);
      if (!shouldExtract) {
        return;
      }

      const extractableNodes = draggedNodes.filter(
        (item) => !isSubgraphBoundaryNode(item.data.type),
      );
      const skippedBoundaryCount = draggedNodes.length - extractableNodes.length;
      if (!extractableNodes.length) {
        if (skippedBoundaryCount) {
          message.warning(localizeText('Boundary nodes must stay inside the nested flow.'));
        }
        return;
      }

      const movedNodeIdSet = new Set(extractableNodes.map((item) => item.id));
      const movedEdges = edgesRef.current.filter(
        (edge) => movedNodeIdSet.has(edge.source) && movedNodeIdSet.has(edge.target),
      );
      const remainingNodes = nodesRef.current.filter((item) => !movedNodeIdSet.has(item.id));
      const remainingEdges = edgesRef.current.filter(
        (edge) => !movedNodeIdSet.has(edge.source) && !movedNodeIdSet.has(edge.target),
      );

      onExtractNodesToParent({
        movedNodeIds: extractableNodes.map((item) => item.id),
        movedGraph: toWorkflowVersion(extractableNodes, movedEdges, workflowVersionRef.current).graph,
        remainingGraph: toWorkflowVersion(remainingNodes, remainingEdges, workflowVersionRef.current).graph,
      });

      if (skippedBoundaryCount) {
        message.warning(localizeText('Boundary nodes were kept inside the nested flow.'));
      }
    },
    [graphContext, message, onExtractNodesToParent],
  );

  const handleCanvasDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!canManage || !hasWorkflowLibraryDragPayload(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    [canManage],
  );

  const handleCanvasDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!canManage) {
        return;
      }
      const draggedNodeType = readWorkflowLibraryDragPayload(event.dataTransfer);
      if (!draggedNodeType) {
        return;
      }
      const definition = getWorkflowDefinitionByType(definitions, draggedNodeType);
      if (!definition) {
        return;
      }
      event.preventDefault();
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      insertNodeIntoCurrentGraph(definition, position);
    },
    [canManage, definitions, insertNodeIntoCurrentGraph, screenToFlowPosition],
  );
  const workflowCanvasUiContextValue = useMemo<WorkflowCanvasUiContextValue>(
    () => ({
      onDropNodeIntoSubgraph: dropNodeIntoSubgraph,
      hoveredStructuralDropNodeId,
    }),
    [dropNodeIntoSubgraph, hoveredStructuralDropNodeId],
  );

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
      validationResult,
      validationGraphSignature,
      canManage,
      graphContext,
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
    setLibraryOpen(false);
    message.success(
      `${t('workflows.insertTemplateSuccess')}: ${template.label}${
        options?.useSampleBindings ? ` (${t('workflows.useSampleInputs')})` : ''
      }`,
    );
  };

  const applySelectedNodeParamPatch = (patch: Record<string, unknown>) => {
    if (!selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== selectedNodeId) {
        return node;
      }

      let nextParams: Record<string, unknown> = {
        ...node.data.params,
        ...patch,
      };

      if ('credentialMode' in patch) {
        const credentialMode = patch.credentialMode;
        if (credentialMode === 'platform_default') {
          nextParams = {
            ...nextParams,
            personalCredentialId: '',
          };
        }
        if (
          credentialMode === 'personal' &&
          (!nextParams.personalCredentialId || typeof nextParams.personalCredentialId !== 'string')
        ) {
          nextParams = {
            ...nextParams,
            personalCredentialId: editorContext.geeCredentials[0]?.id ?? '',
          };
        }
      }

      if (patch.roiMode === 'saved_roi') {
        nextParams = {
          ...nextParams,
          roiId:
            typeof nextParams.roiId === 'string' && nextParams.roiId
              ? nextParams.roiId
              : editorContext.spatialRois[0]?.id ?? '',
        };
      }

      return {
        ...node,
        data: {
          ...node.data,
          params: nextParams,
        },
      };
    });

    commitGraphState(nextNodes, edgesRef.current, true);
  };

  const updateSelectedNodeParams = (paramKey: string, value: unknown) => {
    applySelectedNodeParamPatch({ [paramKey]: value });
  };

  const applySelectedPointToNode = useCallback(
    (point: { longitude: number; latitude: number }) => {
      if (!selectedNodeSupportsPointPicker || !canManage) {
        return;
      }
      applySelectedNodeParamPatch({
        longitude: point.longitude,
        latitude: point.latitude,
      });
      setPointPickerOpen(false);
      message.success(
        locale === 'zh-CN'
          ? '已把地图点位写入当前节点。'
          : 'The selected map point has been applied to the node.',
      );
    },
    [applySelectedNodeParamPatch, canManage, locale, message, selectedNodeSupportsPointPicker],
  );

  const updateSelectedBoundaryInterface = (
    kind: 'input' | 'output',
    patch: Partial<WorkflowPortDefinition>,
  ) => {
    if (!selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== selectedNodeId) {
        return node;
      }

      const currentPorts = kind === 'input' ? [...node.data.inputs] : [...node.data.outputs];
      const basePort = currentPorts[0] ?? {
        key: kind === 'input' ? 'output' : 'input',
        label: kind === 'input' ? 'Output' : 'Input',
        dataTypes: ['value'] as WorkflowPortDataType[],
        required: kind === 'input',
      };
      const nextPort: WorkflowPortDefinition = {
        ...basePort,
        ...patch,
        dataTypes: patch.dataTypes ?? basePort.dataTypes,
      };
      const nextContracts = kind === 'input' ? [...(node.data.inputContracts ?? [])] : [...(node.data.outputContracts ?? [])];
      const nextContract: WorkflowPortContract = {
        ...(nextContracts[0] ?? { portKey: nextPort.key, summary: kind === 'input' ? 'Subgraph output boundary.' : 'Subgraph input boundary.' }),
        portKey: nextPort.key,
      };

      return {
        ...node,
        data: {
          ...node.data,
          inputs: kind === 'input' ? [nextPort] : node.data.inputs,
          outputs: kind === 'output' ? [nextPort] : node.data.outputs,
          inputContracts: kind === 'input' ? [nextContract] : node.data.inputContracts,
          outputContracts: kind === 'output' ? [nextContract] : node.data.outputContracts,
        },
      };
    });

    commitGraphState(nextNodes, edgesRef.current, true);
  };

  const updateSelectedBoundaryContractSummary = (
    kind: 'input' | 'output',
    summary: string,
  ) => {
    if (!selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== selectedNodeId) {
        return node;
      }
      const portKey = kind === 'input' ? node.data.inputs[0]?.key : node.data.outputs[0]?.key;
      if (!portKey) {
        return node;
      }
      const nextContract: WorkflowPortContract = {
        ...((kind === 'input' ? node.data.inputContracts?.[0] : node.data.outputContracts?.[0]) ?? {
          portKey,
          summary,
        }),
        portKey,
        summary,
      };
      return {
        ...node,
        data: {
          ...node.data,
          inputContracts: kind === 'input' ? [nextContract] : node.data.inputContracts,
          outputContracts: kind === 'output' ? [nextContract] : node.data.outputContracts,
        },
      };
    });

    commitGraphState(nextNodes, edgesRef.current, true);
  };

  const updateSelectedNodeSubgraph = (subgraph: WorkflowGraph) => {
    if (!selectedNodeId) {
      return;
    }

    const nextNodes = nodesRef.current.map((node) => {
      if (node.id !== selectedNodeId) {
        return node;
      }
      const synced = syncCallSubgraphNodeInterfaces({
        id: node.id,
        type: node.data.type,
        position: node.position,
        params: node.data.params,
        inputBindings: node.data.inputBindings,
        inputDefs: node.data.inputs,
        inputContracts: node.data.inputContracts ?? [],
        outputDefs: node.data.outputs,
        outputContracts: node.data.outputContracts ?? [],
        subgraph,
      });
      return {
        ...node,
        data: {
          ...node.data,
          inputs: synced.inputDefs ?? [],
          outputs: synced.outputDefs,
          inputContracts: synced.inputContracts ?? [],
          outputContracts: synced.outputContracts ?? [],
          subgraph: synced.subgraph,
        },
      };
    });

    commitGraphState(nextNodes, edgesRef.current, true);
  };
  const extractSelectedSubgraphNodesToParent = useCallback(
    (payload: WorkflowSubgraphExtractionPayload) => {
      if (!selectedNodeId) {
        return;
      }
      const parentNode = nodesRef.current.find((node) => node.id === selectedNodeId);
      if (!parentNode || !isStructuralSubgraphNodeType(parentNode.data.type)) {
        return;
      }
      if (!payload.movedGraph.nodes.length) {
        return;
      }

      const sourceBounds = payload.movedGraph.nodes.reduce(
        (accumulator, node) => ({
          minX: Math.min(accumulator.minX, node.position.x),
          minY: Math.min(accumulator.minY, node.position.y),
        }),
        {
          minX: Number.POSITIVE_INFINITY,
          minY: Number.POSITIVE_INFINITY,
        },
      );
      const anchor = {
        x: parentNode.position.x + 420,
        y: parentNode.position.y + 40,
      };
      const relocatedNodes = payload.movedGraph.nodes.map((node) => ({
        ...node,
        position: {
          x: anchor.x + (node.position.x - sourceBounds.minX),
          y: anchor.y + (node.position.y - sourceBounds.minY),
        },
      }));
      const movedWorkflowVersion: WorkflowVersionDetail = {
        ...workflowVersionRef.current,
        id: `${workflowVersionRef.current.id}::extracted`,
        graph: {
          nodes: relocatedNodes,
          edges: payload.movedGraph.edges,
        },
      };
      const appendedRootNodes = buildFlowNodes(
        definitions,
        movedWorkflowVersion,
        editorContext,
        validationResult,
        validationGraphSignature,
        canManage,
        'root',
        t,
      );
      const appendedRootEdges = buildFlowEdges(definitions, movedWorkflowVersion);

      const nextNodes = nodesRef.current.map((node) => {
        if (node.id !== selectedNodeId) {
          return node;
        }
        const synced = syncCallSubgraphNodeInterfaces({
          id: node.id,
          type: node.data.type,
          position: node.position,
          params: node.data.params,
          inputBindings: node.data.inputBindings,
          inputDefs: node.data.inputs,
          inputContracts: node.data.inputContracts ?? [],
          outputDefs: node.data.outputs,
          outputContracts: node.data.outputContracts ?? [],
          subgraph: payload.remainingGraph,
        });
        return {
          ...node,
          data: {
            ...node.data,
            inputs: synced.inputDefs ?? [],
            outputs: synced.outputDefs,
            inputContracts: synced.inputContracts ?? [],
            outputContracts: synced.outputContracts ?? [],
            subgraph: synced.subgraph,
          },
        };
      });

      commitGraphState([...nextNodes, ...appendedRootNodes], [...edgesRef.current, ...appendedRootEdges], true);
      setSelectedNodeId(appendedRootNodes[0]?.id ?? selectedNodeId);
      setSubgraphEditorOpen(false);
      message.success(
        localizeText(
          `${payload.movedGraph.nodes.length} node${payload.movedGraph.nodes.length > 1 ? 's' : ''} moved to parent graph`,
        ),
      );
    },
    [canManage, commitGraphState, definitions, editorContext, message, selectedNodeId, t],
  );

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

  const handleNodePreviewAction = useCallback(
    (action: NonNullable<WorkflowNodePreviewValue['nextActions']>[number]) => {
      const handoff = action.handoff;
      if (!handoff || typeof handoff !== 'object' || !('target' in handoff)) {
        return;
      }

      navigate(createHandoffPath(handoff.target === 'spatial' ? '/spatial' : '/workflows', handoff));
    },
    [navigate],
  );

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

  const focusIssue = useCallback(
    async (issue: WorkflowValidationIssue) => {
      if (issue.nodeId) {
        setSelectedNodeId(issue.nodeId);
        const nextPanels = ['status'];
        let nextFocusTarget: PendingIssueFocusTarget = {
          nodeId: issue.nodeId,
          kind: 'status',
        };
        if (issue.paramKey) {
          nextPanels.push('parameters');
          nextFocusTarget = {
            nodeId: issue.nodeId,
            kind: 'param',
            key: issue.paramKey,
          };
        }
        if (issue.portKey) {
          nextPanels.push('ports');
          if (!issue.paramKey) {
            nextFocusTarget = {
              nodeId: issue.nodeId,
              kind: 'port',
              key: issue.portKey,
            };
          }
        }
        setActiveInspectorPanels(nextPanels);
        setPendingIssueFocusTarget(nextFocusTarget);

        const targetNode = nodesRef.current.find((node) => node.id === issue.nodeId);
        if (targetNode) {
          await setCenter(
            targetNode.position.x + 140,
            targetNode.position.y + 120,
            { zoom: 0.78, duration: 180 },
          );
        }
      }
    },
    [setCenter],
  );

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
              <div
                ref={statusCardRef}
                className={`workflow-node-status-card${
                  focusedIssueMarker === `status:${selectedNode.id}` ? ' workflow-issue-focus-target' : ''
                }`}
              >
                <div className="workflow-node-status-summary">
                  {localizeText(selectedNode.data.analysis.summary)}
                </div>
                {selectedNodeIssues.length ? (
                  <div className="workflow-node-status-issues">
                    <Text strong>{t('workflows.nodeStatusIssues')}</Text>
                    {selectedNodeIssues.map((issue) => (
                      <div key={workflowIssueKey(issue)} className="workflow-node-status-issue">
                        <div>{issue.message}</div>
                        {issue.suggestion ? (
                          <Text type="secondary">{issue.suggestion}</Text>
                        ) : null}
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
                  title={t('workflows.contractsTitle')}
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
                          <div className="workflow-contract-copy">{localizeText(contract.summary)}</div>
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
                          {contract.taskTypes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractTaskTypes')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.taskTypes.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.annotationKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractAnnotationKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.annotationKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.sampleKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractSampleKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.sampleKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.valueTypes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractValueTypes')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.valueTypes.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
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
                          <div className="workflow-contract-copy">{localizeText(contract.summary)}</div>
                          {contract.datasetKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractDatasetKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.datasetKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
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
                          {contract.taskTypes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractTaskTypes')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.taskTypes.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.annotationKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractAnnotationKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.annotationKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.sampleKinds?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractSampleKinds')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.sampleKinds.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.valueTypes?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractValueTypes')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.valueTypes.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          {contract.sampleColumns?.length ? (
                            <div className="workflow-contract-field">
                              <Text type="secondary">{t('workflows.contractSampleColumns')}</Text>
                              <div className="workflow-node-port-types">
                                {contract.sampleColumns.map((item) => (
                                  <Tag key={item} bordered={false} className="workflow-type-tag">
                                    {localizeText(item)}
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
                                  {localizeText(item)}
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
                                  {localizeText(item)}
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
                    selectedNode.data.inputs.map((port) => {
                      const portIssues = portIssuesForNode(selectedNodeIssues, port.key);
                      const issueFocusKey = `port:${selectedNode.id}:${port.key}`;
                      return (
                        <div
                          key={port.key}
                          ref={(element) => {
                            portFieldRefs.current[`${selectedNode.id}:${port.key}`] = element;
                          }}
                          data-workflow-port-key={port.key}
                          className={`workflow-binding-row workflow-binding-row-detail${
                            portIssues.length ? ' workflow-binding-row-error' : ''
                          }${
                            focusedIssueMarker === issueFocusKey ? ' workflow-issue-focus-target' : ''
                          }`}
                        >
                          <div className="workflow-binding-row-content">
                            <strong>{port.label}</strong>
                            <div className="workflow-node-port-types">
                              {getDataTypeLabels(port).map((label) => (
                                <Tag key={label} bordered={false} className="workflow-type-tag">
                                  {localizeText(label)}
                                </Tag>
                              ))}
                            </div>
                          </div>
                          <span>
                            {formatBindingSummary(selectedNode.data.inputBindings[port.key]) ||
                              t('workflows.unbound')}
                          </span>
                          {portIssues.length ? (
                            <div className="workflow-binding-row-issue">{portIssues[0]?.message}</div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <Text type="secondary">{t('workflows.unbound')}</Text>
                  )}
                </div>

                <div className="workflow-contract-section">
                  <Text className="workflow-inspector-section-title">{t('workflows.outputsLabel')}</Text>
                  {selectedNode.data.outputs.map((port) => {
                    const portIssues = portIssuesForNode(selectedNodeIssues, port.key);
                    const issueFocusKey = `port:${selectedNode.id}:${port.key}`;
                    return (
                      <div
                        key={port.key}
                        ref={(element) => {
                          portFieldRefs.current[`${selectedNode.id}:${port.key}`] = element;
                        }}
                        data-workflow-port-key={port.key}
                        className={`workflow-binding-row workflow-binding-row-detail${
                          portIssues.length ? ' workflow-binding-row-error' : ''
                        }${
                          focusedIssueMarker === issueFocusKey ? ' workflow-issue-focus-target' : ''
                        }`}
                      >
                        <div className="workflow-binding-row-content">
                          <strong>{port.label}</strong>
                          <div className="workflow-node-port-types">
                            {getDataTypeLabels(port).map((label) => (
                              <Tag key={label} bordered={false} className="workflow-type-tag">
                                {localizeText(label)}
                              </Tag>
                            ))}
                          </div>
                        </div>
                        <span>{port.key}</span>
                        {portIssues.length ? (
                          <div className="workflow-binding-row-issue">{portIssues[0]?.message}</div>
                        ) : null}
                      </div>
                    );
                  })}
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
                  selectedDefinition.params
                    .filter((field) =>
                      shouldRenderParameterField(
                        selectedNode.data.type,
                        selectedNode.data.params,
                        field,
                      ),
                    )
                    .map((field) => {
                      const issueFocusKey = `param:${selectedNode.id}:${field.key}`;
                      return (
                        <div
                          key={field.key}
                          ref={(element) => {
                            parameterFieldRefs.current[`${selectedNode.id}:${field.key}`] = element;
                          }}
                          data-workflow-param-key={field.key}
                          className={`workflow-parameter-field${
                            paramIssuesForNode(selectedNodeIssues, field.key).length
                              ? ' workflow-parameter-field-error'
                              : ''
                          }${
                            focusedIssueMarker === issueFocusKey ? ' workflow-issue-focus-target' : ''
                          }`}
                        >
                          <div className="workflow-parameter-head">
                            <strong>{field.label}</strong>
                            {field.description ? (
                              <Text type="secondary">{field.description}</Text>
                            ) : null}
                          </div>
                          <ParameterField
                            definition={field}
                            definitions={definitions}
                            nodeId={selectedNode.id}
                            nodeType={selectedNode.data.type}
                            value={selectedNode.data.params[field.key]}
                            context={editorContext}
                            workflowVersion={currentWorkflow}
                            onChange={(value) => updateSelectedNodeParams(field.key, value)}
                          />
                          {paramIssuesForNode(selectedNodeIssues, field.key).length ? (
                            <div className="workflow-parameter-field-issue">
                              {paramIssuesForNode(selectedNodeIssues, field.key)[0]?.message}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                ) : (
                  <Text type="secondary">{t('workflows.noParameters')}</Text>
                )}
                {selectedNodeSupportsPointPicker ? (
                  <div className="workflow-parameter-field workflow-parameter-field-accent">
                    <div className="workflow-parameter-head">
                      <strong>{pointPickerCopy.title}</strong>
                      <Text type="secondary">{pointPickerCopy.description}</Text>
                    </div>
                    <Space wrap size={[8, 8]}>
                      <Button disabled={!canManage} onClick={() => setPointPickerOpen(true)}>
                        {pointPickerCopy.action}
                      </Button>
                      {selectedNodeCurrentPoint ? (
                        <Tag color="processing">
                          {selectedNodeCurrentPoint.longitude.toFixed(6)},{' '}
                          {selectedNodeCurrentPoint.latitude.toFixed(6)}
                        </Tag>
                      ) : (
                        <Text type="secondary">{pointPickerCopy.empty}</Text>
                      )}
                    </Space>
                  </div>
                ) : null}
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
                  <>
                    <Button onClick={() => setNodeTestModalOpen(true)}>
                      {t('workflows.nodeTestViewDetails')}
                    </Button>
                    {Object.entries(selectedNodeTest.outputPreview).length ? (
                      <div className="workflow-node-test-inline-grid">
                        {Object.entries(selectedNodeTest.outputPreview).map(([portKey, preview]) => (
                          <NodePreviewCard
                            key={`inline-output-${portKey}`}
                            portKey={portKey}
                            preview={preview}
                            datasets={datasets}
                            datasetVersions={datasetVersions}
                            authToken={authToken}
                            onActionClick={handleNodePreviewAction}
                            showRawPayload={false}
                            compact
                          />
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Text type="secondary">{t('workflows.nodeTestEmpty')}</Text>
                )}
              </div>
            ),
          });

          return items;
        })();
  const nodeLibraryContent = (
    <div className="workflow-library-drawer-body">
      <Paragraph className="workflow-library-drawer-copy">
        {nodeLibraryCopy.drawerDescription}
      </Paragraph>
      <Segmented
        block
        value={libraryTab}
        options={[
          { label: t('workflows.libraryNodesTab'), value: 'nodes' },
          { label: t('workflows.libraryTemplatesTab'), value: 'templates' },
        ]}
        onChange={(value) => setLibraryTab(value as WorkflowLibraryTab)}
      />
      {libraryTab === 'nodes' ? (
        <>
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
                label: localizeText(task),
              }))}
            />
            <div className="workflow-library-filter-toggle">
              <div className="workflow-library-filter-toggle-copy">
                <Text strong>{`${t('workflows.showConvenienceNodes')} (${matchingConvenienceCount})`}</Text>
                <Text type="secondary">{t('workflows.showConvenienceNodesHint')}</Text>
              </div>
              <Switch checked={showConvenienceNodes} onChange={setShowConvenienceNodes} />
            </div>
          </div>
          {canManage ? (
            <Paragraph className="workflow-library-drawer-copy">
              {localizeText(
                'Click to add to the current graph, or drag onto the canvas or a nested node body to place it.',
              )}
            </Paragraph>
          ) : null}
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
                        aria-grabbed={canManage ? 'false' : undefined}
                        draggable={canManage}
                        className={`workflow-library-item${
                          canManage ? '' : ' workflow-library-item-disabled'
                        }`}
                        onDragStart={(event) => writeWorkflowLibraryDragPayload(event, item.type)}
                        onClick={() => addNode(item)}
                        onKeyDown={(event) => triggerOnEnterOrSpace(event, () => addNode(item))}
                      >
                        <div className="workflow-library-item-head">
                          <div className="workflow-library-item-type">{item.type}</div>
                          <strong className="workflow-library-item-title">{item.label}</strong>
                        </div>
                        <Paragraph className="workflow-library-item-copy">{item.description}</Paragraph>
                        <div className="workflow-node-parameter-preview">
                          {semanticNodeTags(item).map((tag) => renderSemanticTag(tag))}
                          {catalogPreviewTags(item).map((tag) => (
                            <Tag key={tag} bordered={false} className="workflow-type-tag">
                              {tag}
                            </Tag>
                          ))}
                        </div>
                        {canManage ? (
                          <div className="workflow-library-item-drag-hint">
                            Drag to place
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workflows.searchNodes')} />
            )}
          </div>
        </>
      ) : (
        <div className="workflow-library-scroll">
          {availableTemplates.length ? (
            <div className="workflow-template-grid workflow-template-grid-drawer">
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
                              <strong>
                                {sample.kind === 'dataset'
                                  ? t('workflows.sampleDataset')
                                  : t('workflows.sampleModel')}
                              </strong>
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
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('workflows.templates')} />
          )}
        </div>
      )}
    </div>
  );

  const issuesPanelContent = (
    <Card className="workflow-issues-card" variant="borderless">
      <div className="workflow-issues-panel">
        <div className="workflow-issues-panel-head">
          <div>
            <Text className="workflow-inspector-section-title">{t('workflows.issuesTitle')}</Text>
            <Paragraph className="workflow-issues-panel-copy">
              {validationIssuesAreFresh
                ? t('workflows.issuesValidatedCopy')
                : t('workflows.issuesLiveCopy')}
            </Paragraph>
          </div>
          <Tag bordered={false} color={combinedIssues.length ? 'red' : 'green'}>
            {combinedIssues.length}
          </Tag>
        </div>
        {!validationIssuesAreFresh && validationResult ? (
          <Text type="secondary">{t('workflows.issuesValidationStale')}</Text>
        ) : null}
        {combinedIssues.length ? (
          <div className="workflow-issues-list">
            {combinedIssues.map((issue) => (
              <button
                key={workflowIssueKey(issue)}
                type="button"
                className={`workflow-issue-item${
                  issue.nodeId ? '' : ' workflow-issue-item-disabled'
                }`}
                onClick={() => void focusIssue(issue)}
                disabled={!issue.nodeId}
              >
                <div className="workflow-issue-item-head">
                  <Tag bordered={false} color={issue.severity === 'error' ? 'red' : 'gold'}>
                    {localizeText(issue.severity)}
                  </Tag>
                  {workflowIssueTarget(issue) ? (
                    <span className="workflow-issue-item-target">{workflowIssueTarget(issue)}</span>
                  ) : null}
                </div>
                <div className="workflow-issue-item-message">{issue.message}</div>
              </button>
            ))}
          </div>
        ) : (
          <Text type="secondary">{t('workflows.noIssues')}</Text>
        )}
      </div>
    </Card>
  );

  const inspectorDrawerContent =
    !selectedNode || !selectedDefinition ? null : (
      <div ref={inspectorBodyRef} className="workflow-inspector-body workflow-inspector-drawer-body">
        <div>
          <Text className="panel-kicker">{t('workflows.inspector')}</Text>
          <Paragraph className="workflow-inspector-copy">{t('workflows.inspectorCopy')}</Paragraph>
        </div>
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

        {selectedNodeSemanticTags.length ? (
          <div className="workflow-library-semantic-tags">
            {selectedNodeSemanticTags.map((tag) => renderSemanticTag(tag))}
          </div>
        ) : null}

        {selectedNodeHasStructuralSubgraph ? (
          <div className="workflow-node-test-card">
            <div className="workflow-node-test-card-head">
              <strong>
                {localizeText(selectedNodeIsForEach ? 'Loop Body' : 'Subgraph')}
              </strong>
              <Tag bordered={false}>
                {(selectedNode.data.subgraph?.nodes.length ?? 0)} nodes / {(selectedNode.data.subgraph?.edges.length ?? 0)} edges
              </Tag>
            </div>
            <Text type="secondary">
              {selectedNodeIsForEach
                ? '循环体接口由嵌套的 `workflow.subgraph_input` 与 `workflow.subgraph_output` 边界节点推导而来。保留输入 `item` 和 `index` 会在每次迭代时自动注入，不会暴露为外层循环输入。'
                : '外层节点接口由嵌套的 `workflow.subgraph_input` 与 `workflow.subgraph_output` 边界节点推导而来。'}
            </Text>
            <div style={{ marginTop: 12 }}>
              <Button type="primary" disabled={!canManage} onClick={() => setSubgraphEditorOpen(true)}>
                {localizeText(selectedNodeIsForEach ? 'Open Loop Body Editor' : 'Open Subgraph Editor')}
              </Button>
            </div>
          </div>
        ) : null}

        {selectedBoundaryPort ? (
          <div className="workflow-node-test-card">
            <div className="workflow-node-test-card-head">
              <strong>{localizeText('Boundary Interface')}</strong>
              <Tag bordered={false}>{selectedBoundaryPort.key}</Tag>
            </div>
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Input
                addonBefore={localizeText('Port Key')}
                disabled={!canManage}
                value={selectedBoundaryPort.key}
                onChange={(event) =>
                  updateSelectedBoundaryInterface(
                    selectedNodeIsSubgraphOutput ? 'input' : 'output',
                    { key: event.target.value.trim() || selectedBoundaryPort.key },
                  )
                }
              />
              <Input
                addonBefore={localizeText('Label')}
                disabled={!canManage}
                value={selectedBoundaryPort.label}
                onChange={(event) =>
                  updateSelectedBoundaryInterface(
                    selectedNodeIsSubgraphOutput ? 'input' : 'output',
                    { label: event.target.value },
                  )
                }
              />
              <Select
                value={selectedBoundaryPort.dataTypes[0]}
                disabled={!canManage}
                options={availableDataTypes.map((dataType) => ({
                  value: dataType,
                  label: localizeText(dataType),
                }))}
                onChange={(value) =>
                  updateSelectedBoundaryInterface(
                    selectedNodeIsSubgraphOutput ? 'input' : 'output',
                    { dataTypes: [value as WorkflowPortDataType] },
                  )
                }
              />
              <div className="workflow-library-filter-toggle">
                <div className="workflow-library-filter-toggle-copy">
                  <Text strong>{localizeText('Required')}</Text>
                  <Text type="secondary">
                    {localizeText('Require this port to be bound before execution.')}
                  </Text>
                </div>
                <Switch
                  disabled={!canManage}
                  checked={Boolean(selectedBoundaryPort.required)}
                  onChange={(checked) =>
                    updateSelectedBoundaryInterface(
                      selectedNodeIsSubgraphOutput ? 'input' : 'output',
                      { required: checked },
                    )
                  }
                />
              </div>
              <Input.TextArea
                rows={3}
                disabled={!canManage}
                value={selectedBoundaryContract?.summary ?? ''}
                placeholder={localizeText('Contract summary')}
                onChange={(event) =>
                  updateSelectedBoundaryContractSummary(
                    selectedNodeIsSubgraphOutput ? 'input' : 'output',
                    event.target.value,
                  )
                }
              />
            </Space>
          </div>
        ) : null}

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
    );

  return (
    <div className="workflow-grid">
      <div className="workflow-canvas-stack">
        <Card className="workflow-canvas-card" variant="borderless">
          <div className="workflow-canvas-toolbar">
            <Text className="panel-kicker">
              {t('workflows.nodesLabel')}: {nodes.length}
            </Text>
            <div className="workflow-toolbar-actions">
              <Button onClick={() => setLibraryOpen(true)}>{nodeLibraryCopy.openButton}</Button>
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
          {graphContext === 'subgraph' && onExtractNodesToParent ? (
            <div
              className={`workflow-parent-drop-lane${isParentDropHover ? ' is-drop-hover' : ''}`}
              data-workflow-parent-drop-zone="true"
            >
              <strong>{localizeText('Parent Graph')}</strong>
              <span>
                {isParentDropHover
                  ? localizeText('Release to move selected nested nodes back to the parent graph')
                  : localizeText('Drag selected nested nodes here to move them back to the parent graph')}
              </span>
            </div>
          ) : null}
          <WorkflowCanvasUiContext.Provider value={workflowCanvasUiContextValue}>
            <div
              ref={canvasWrapperRef}
              className="workflow-canvas"
              onDragOver={handleCanvasDragOver}
              onDrop={handleCanvasDrop}
            >
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
                onNodeDrag={graphContext === 'subgraph' ? handleSubgraphNodeDrag : handleRootNodeDrag}
                onNodeDragStop={graphContext === 'subgraph' ? handleSubgraphNodeDragStop : handleRootNodeDragStop}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onNodeDoubleClick={(_, node) => {
                  setSelectedNodeId(node.id);
                  if (isStructuralSubgraphNodeType(String(node.data?.type ?? ''))) {
                    setSubgraphEditorOpen(true);
                  }
                }}
                onPaneClick={() => setSelectedNodeId(undefined)}
              >
                <Background gap={20} color="#d6d3d1" />
                <MiniMap zoomable pannable />
                <Controls />
              </ReactFlow>
            </div>
          </WorkflowCanvasUiContext.Provider>
        </Card>
        {issuesPanelContent}
      </div>

      <Drawer
        title={t('workflows.nodeLibrary')}
        placement="left"
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        mask={false}
        className="workflow-library-drawer"
        rootClassName="workflow-library-drawer"
      >
        {nodeLibraryContent}
      </Drawer>

      <Drawer
        title={selectedNode?.data.title ?? t('workflows.inspector')}
        placement="right"
        open={Boolean(selectedNode && selectedDefinition)}
        onClose={() => setSelectedNodeId(undefined)}
        mask={false}
        className="workflow-inspector-drawer"
        rootClassName="workflow-inspector-drawer"
      >
        {inspectorDrawerContent ?? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('workflows.selectNode')}
          />
        )}
      </Drawer>

      <WorkflowPointPickerModal
        open={pointPickerOpen}
        token={authToken}
        locale={locale}
        spatialRois={spatialRois}
        initialPoint={selectedNodeCurrentPoint}
        onCancel={() => setPointPickerOpen(false)}
        onConfirm={applySelectedPointToNode}
      />

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
                    <NodePreviewCard
                      key={`input-${portKey}`}
                      portKey={portKey}
                      preview={preview}
                      datasets={datasets}
                      datasetVersions={datasetVersions}
                      authToken={authToken}
                      onActionClick={handleNodePreviewAction}
                    />
                  ))
                ) : (
                  <Text type="secondary">{t('workflows.nodeTestNoPreview')}</Text>
                )}
              </div>
              <div className="workflow-node-test-column">
                <Text strong>{t('workflows.nodeTestOutput')}</Text>
                {Object.entries(selectedNodeTest.outputPreview).length ? (
                  Object.entries(selectedNodeTest.outputPreview).map(([portKey, preview]) => (
                    <NodePreviewCard
                      key={`output-${portKey}`}
                      portKey={portKey}
                      preview={preview}
                      datasets={datasets}
                      datasetVersions={datasetVersions}
                      authToken={authToken}
                      onActionClick={handleNodePreviewAction}
                    />
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
        title={selectedNode ? `Subgraph Editor · ${selectedNode.data.title}` : 'Subgraph Editor'}
        open={subgraphEditorOpen && Boolean(selectedSubgraphWorkflowVersion)}
        onCancel={() => setSubgraphEditorOpen(false)}
        footer={null}
        destroyOnClose
        width="92vw"
        style={{ top: 24 }}
      >
        {selectedSubgraphWorkflowVersion ? (
          <div style={{ height: '78vh' }}>
            <WorkflowCanvas
              catalog={catalog}
              templates={templates}
              workflowVersion={selectedSubgraphWorkflowVersion}
              validationResult={null}
              validationGraphSignature={null}
              canManage={canManage}
              canTest={canTest}
              datasets={datasets}
              datasetVersions={datasetVersions}
              geeCredentials={geeCredentials}
              modelVersions={modelVersions}
              spatialRois={spatialRois}
              authToken={authToken}
              onWorkflowChange={(nextWorkflowVersion) => updateSelectedNodeSubgraph(nextWorkflowVersion.graph)}
              graphContext="subgraph"
              onExtractNodesToParent={extractSelectedSubgraphNodesToParent}
            />
          </div>
        ) : null}
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
  validationResult?: WorkflowValidationResult | null;
  validationGraphSignature?: string | null;
  canManage: boolean;
  canTest: boolean;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  spatialRois: SpatialRoiSummary[];
  authToken?: string | null;
  onWorkflowChange?: (workflowVersion: WorkflowVersionDetail) => void;
  graphContext?: 'root' | 'subgraph';
  onExtractNodesToParent?: (payload: WorkflowSubgraphExtractionPayload) => void;
}) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}





