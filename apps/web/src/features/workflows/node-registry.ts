import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelAlgorithmKey,
  ModelVersionSummary,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeCatalogItem,
  WorkflowParamDefinition,
  WorkflowParamOption,
  WorkflowPortDataType,
  WorkflowPortDefinition,
  WorkflowTemplateDefinition,
} from '@platform/types';
import type { Connection } from '@xyflow/react';

export type WorkflowNodeDefinition = WorkflowNodeCatalogItem;
export type WorkflowTemplate = WorkflowTemplateDefinition;

export interface WorkflowEditorContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
}

function algorithmForNodeType(nodeType: string): ModelAlgorithmKey | undefined {
  if (nodeType === 'tabular.linear_regression_predict') {
    return 'linear_regression';
  }
  if (nodeType === 'tabular.svm_regression_predict') {
    return 'svm_regression';
  }
  if (nodeType === 'tabular.random_forest_regression_predict') {
    return 'random_forest_regression';
  }
  return undefined;
}

function compatibleModelVersions(
  context: WorkflowEditorContext,
  nodeType: string,
): ModelVersionSummary[] {
  if (nodeType === 'custom.api_predict') {
    return context.modelVersions.filter((item) => item.sourceType === 'custom_api');
  }

  const requiredAlgorithm = algorithmForNodeType(nodeType);
  return context.modelVersions.filter((item) => {
    if (item.sourceType === 'custom_api') {
      return false;
    }
    if (!requiredAlgorithm) {
      return true;
    }
    return item.algorithmKey === requiredAlgorithm;
  });
}

const dataTypeLabels: Record<WorkflowPortDataType, string> = {
  dataset_version: 'Dataset',
  table: 'Table',
  raster: 'Raster',
  vector: 'Vector',
  roi: 'ROI',
  tile_set: 'Tiles',
  label_set: 'Labels',
  model_ref: 'Model',
  metrics_report: 'Metrics',
  prediction_mask: 'Mask',
  prediction_vector: 'Pred Vector',
  artifact: 'Artifact',
};

export function createDefaultParams(
  definition: WorkflowNodeDefinition,
  context: WorkflowEditorContext,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const matchingModels = compatibleModelVersions(context, definition.type);

  for (const field of definition.params) {
    if (field.fieldType === 'datasetVersion') {
      defaults[field.key] = context.datasetVersions[0]?.id ?? '';
      continue;
    }

    if (field.fieldType === 'modelVersion') {
      defaults[field.key] = matchingModels[0]?.id ?? '';
      continue;
    }

    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    }
  }

  return defaults;
}

export function resolveParameterOptions(
  definition: WorkflowParamDefinition,
  context: WorkflowEditorContext,
  nodeType?: string,
): WorkflowParamOption[] {
  if (definition.fieldType === 'datasetVersion') {
    const datasetNames = new Map(context.datasets.map((item) => [item.id, item.name]));
    return context.datasetVersions.map((item) => ({
      value: item.id,
      label: `${datasetNames.get(item.datasetId) ?? item.datasetId} / v${item.version}`,
    }));
  }

  if (definition.fieldType === 'modelVersion') {
    const models = nodeType ? compatibleModelVersions(context, nodeType) : context.modelVersions;
    return models.map((item) => ({
      value: item.id,
      label: `${item.modelName ?? item.modelId} / ${item.version} / ${item.framework}`,
    }));
  }

  return definition.options ?? [];
}

export function getWorkflowDefinitionByType(
  definitions: WorkflowNodeDefinition[],
  type: string,
): WorkflowNodeDefinition | undefined {
  return definitions.find((item) => item.type === type);
}

export function getDataTypeLabels(port: WorkflowPortDefinition): string[] {
  return port.dataTypes.map((dataType) => dataTypeLabels[dataType] ?? dataType);
}

export function getPortLabel(
  ports: WorkflowPortDefinition[],
  key: string | undefined,
): string {
  if (!key) {
    return '';
  }
  return ports.find((item) => item.key === key)?.label ?? key;
}

function getNodePort(
  definitions: WorkflowNodeDefinition[],
  node: WorkflowNode | undefined,
  handle: string | null | undefined,
  kind: 'input' | 'output',
): WorkflowPortDefinition | undefined {
  if (!node || !handle) {
    return undefined;
  }

  const definition = getWorkflowDefinitionByType(definitions, node.type);
  const ports = kind === 'input' ? definition?.inputs ?? [] : node.outputDefs;
  return ports.find((port) => port.key === handle);
}

export function canConnectPorts(
  definitions: WorkflowNodeDefinition[],
  nodes: WorkflowNode[],
  connection: Pick<Connection, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): boolean {
  if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) {
    return false;
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  const sourcePort = getNodePort(definitions, sourceNode, connection.sourceHandle, 'output');
  const targetPort = getNodePort(definitions, targetNode, connection.targetHandle, 'input');

  if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
    return false;
  }

  return sourcePort.dataTypes.some((dataType) => targetPort.dataTypes.includes(dataType));
}

export function catalogMatchesFilters(
  definition: WorkflowNodeDefinition,
  filters: {
    keyword: string;
    dataType?: WorkflowPortDataType;
    task?: string;
  },
): boolean {
  const normalizedKeyword = filters.keyword.trim().toLowerCase();
  const searchable = [
    definition.label,
    definition.description,
    definition.type,
    ...definition.tags,
  ]
    .join(' ')
    .toLowerCase();

  if (normalizedKeyword && !searchable.includes(normalizedKeyword)) {
    return false;
  }

  if (filters.dataType) {
    const portTypes = [...definition.inputs, ...definition.outputs].flatMap((port) => port.dataTypes);
    if (!portTypes.includes(filters.dataType)) {
      return false;
    }
  }

  if (filters.task && !definition.supportedTasks.includes(filters.task)) {
    return false;
  }

  return true;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function instantiateTemplateGraph(
  template: WorkflowTemplate,
  definitions: WorkflowNodeDefinition[],
  context: WorkflowEditorContext,
  anchorPosition: { x: number; y: number },
  options?: { useSampleBindings?: boolean },
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const minX = Math.min(...template.graph.nodes.map((node) => node.position.x));
  const minY = Math.min(...template.graph.nodes.map((node) => node.position.y));
  const nodeIdMap = new Map<string, string>();
  const sampleBindings = new Map(
    (template.sampleBindings ?? []).map((item) => [item.nodeId, item.params]),
  );

  for (const node of template.graph.nodes) {
    nodeIdMap.set(node.id, createId(node.type.replace(/\./g, '-')));
  }

  const nodes = template.graph.nodes.map((node) => {
    const definition = getWorkflowDefinitionByType(definitions, node.type);
    const nextId = nodeIdMap.get(node.id) ?? node.id;

    return {
      id: nextId,
      type: node.type,
      position: {
        x: anchorPosition.x + (node.position.x - minX),
        y: anchorPosition.y + (node.position.y - minY),
      },
      params: {
        ...(definition ? createDefaultParams(definition, context) : {}),
        ...node.params,
        ...(options?.useSampleBindings ? sampleBindings.get(node.id) ?? {} : {}),
      },
      inputBindings: Object.fromEntries(
        Object.entries(node.inputBindings).map(([key, binding]) => {
          const [sourceNodeId, sourceHandle] = binding.split(':');
          return [key, `${nodeIdMap.get(sourceNodeId) ?? sourceNodeId}:${sourceHandle}`];
        }),
      ),
      outputDefs: definition?.outputs ?? node.outputDefs,
    } satisfies WorkflowNode;
  });

  const edges = template.graph.edges.map((edge) => ({
    id: createId('edge'),
    source: nodeIdMap.get(edge.source) ?? edge.source,
    target: nodeIdMap.get(edge.target) ?? edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  }));

  return { nodes, edges };
}
