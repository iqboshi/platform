import type {
  DatasetSummary,
  DatasetVersionSummary,
  GeeCredentialSummary,
  ModelVersionSummary,
  SpatialRoiSummary,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeCatalogItem,
  WorkflowParamDefinition,
  WorkflowParamOption,
  WorkflowPortContract,
  WorkflowPortDataType,
  WorkflowPortDefinition,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
} from '@platform/types';
import type { Connection } from '@xyflow/react';
import {
  arePortContractsCompatible,
  datasetMatchesPortContract,
  getPortContract,
  parseBinding,
} from './workflow-semantics';
import {
  getEffectiveInputContracts,
  getEffectiveNodeInputDefs,
  getEffectiveNodeOutputDefs,
  getEffectiveOutputContracts,
  syncCallSubgraphNodeInterfaces,
} from './workflow-subgraphs';

export type WorkflowNodeDefinition = WorkflowNodeCatalogItem;
export type WorkflowTemplate = WorkflowTemplateDefinition;

export interface WorkflowEditorContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  spatialRois: SpatialRoiSummary[];
}

export interface WorkflowParameterOptionsResult {
  options: WorkflowParamOption[];
  emptyReason?: 'no_compatible_dataset_versions';
}

function compatibleModelVersions(
  context: WorkflowEditorContext,
  nodeType: string,
): ModelVersionSummary[] {
  if (nodeType === 'custom.api_predict' || nodeType === 'custom.api_predict_samples') {
    return context.modelVersions.filter((item) => item.sourceType === 'custom_api');
  }
  if (nodeType === 'source.model_version') {
    return context.modelVersions;
  }
  return context.modelVersions.filter((item) => item.sourceType !== 'custom_api');
}

function compatibleDatasetVersions(
  context: WorkflowEditorContext,
  nodeType: string,
  options?: {
    nodeId?: string;
    workflowVersion?: WorkflowVersionDetail;
    definitions?: WorkflowNodeDefinition[];
  },
): DatasetVersionSummary[] {
  if (nodeType !== 'source.dataset_version' || !options?.nodeId || !options.workflowVersion || !options.definitions) {
    return context.datasetVersions;
  }

  const nodeById = new Map(options.workflowVersion.graph.nodes.map((node) => [node.id, node]));
  const outgoingContracts = options.workflowVersion.graph.edges
    .filter((edge) => edge.source === options.nodeId)
    .map((edge) => {
      const targetNode = nodeById.get(edge.target);
      const targetDefinition = targetNode
        ? getWorkflowDefinitionByType(options.definitions ?? [], targetNode.type)
        : undefined;
      let targetHandle = edge.targetHandle;
      if (!targetHandle && targetNode) {
        targetHandle = Object.entries(targetNode.inputBindings).find(([, binding]) => {
          const parsed = parseBinding(binding);
          return parsed?.nodeId === options.nodeId && parsed?.portKey === edge.sourceHandle;
        })?.[0];
      }
      const contracts = targetNode
        ? getEffectiveInputContracts(targetNode, targetDefinition)
        : targetDefinition?.inputContracts ?? [];
      return contracts.find((contract) => contract.portKey === targetHandle);
    })
    .filter((contract): contract is WorkflowPortContract => Boolean(contract));

  if (!outgoingContracts.length) {
    return context.datasetVersions;
  }

  return context.datasetVersions.filter((version) =>
    outgoingContracts.every((contract) => datasetMatchesPortContract(context, version.id, contract).ok),
  );
}

function resolveDatasetVersionEmptyReason(
  context: WorkflowEditorContext,
  definition: WorkflowParamDefinition,
  nodeType: string,
  options?: {
    nodeId?: string;
    workflowVersion?: WorkflowVersionDetail;
    definitions?: WorkflowNodeDefinition[];
  },
): WorkflowParameterOptionsResult['emptyReason'] {
  if (definition.fieldType !== 'datasetVersion') {
    return undefined;
  }
  if (compatibleDatasetVersions(context, nodeType, options).length > 0) {
    return undefined;
  }
  if (nodeType === 'source.dataset_version' && options?.nodeId && options.workflowVersion && options.definitions) {
    return 'no_compatible_dataset_versions';
  }
  return undefined;
}

function buildDatasetVersionOptionsResult(
  context: WorkflowEditorContext,
  definition: WorkflowParamDefinition,
  nodeType: string,
  options?: {
    nodeId?: string;
    workflowVersion?: WorkflowVersionDetail;
    definitions?: WorkflowNodeDefinition[];
  },
): WorkflowParameterOptionsResult {
  const versions =
    nodeType === 'source.dataset_version'
      ? context.datasetVersions
      : compatibleDatasetVersions(context, nodeType, options);
  return {
    options: formatDatasetVersionOptions(context, versions),
    emptyReason: resolveDatasetVersionEmptyReason(context, definition, nodeType, options),
  };
}

function formatDatasetVersionOptions(
  context: WorkflowEditorContext,
  versions: DatasetVersionSummary[],
): WorkflowParamOption[] {
  const datasetNames = new Map(context.datasets.map((item) => [item.id, item.name]));
  return versions.map((item) => ({
    value: item.id,
    label: `${datasetNames.get(item.datasetId) ?? item.datasetId} / v${item.version}`,
  }));
}

const dataTypeLabels: Record<WorkflowPortDataType, string> = {
  dataset_version: 'Dataset',
  table: 'Table',
  raster: 'Raster',
  vector: 'Vector',
  roi: 'ROI',
  geo_raster: 'Geo Raster',
  image_collection: 'Image Collection',
  feature_collection: 'Feature Collection',
  mask_raster: 'Mask Raster',
  mask_collection: 'Mask Collection',
  scene_collection: 'Scene Collection',
  scene: 'Scene',
  tile_set: 'Tiles',
  label_set: 'Labels',
  annotation_set: 'Annotations',
  prediction_set: 'Predictions',
  sample_set: 'Samples',
  value: 'Value',
  value_list: 'Value List',
  model_version: 'Model Version',
  model_ref: 'Model',
  metrics_report: 'Metrics',
  prediction_mask: 'Mask',
  prediction_vector: 'Pred Vector',
  artifact: 'Artifact',
};

function defaultCredentialMode(context: WorkflowEditorContext): string {
  if (context.geeCredentials.some((item) => item.isPlatformDefault)) {
    return 'platform_default';
  }
  return context.geeCredentials.length ? 'personal' : 'platform_default';
}

function applyParamDependencies(
  definition: WorkflowNodeDefinition,
  params: Record<string, unknown>,
  context: WorkflowEditorContext,
): Record<string, unknown> {
  const nextParams = { ...params };
  const hasPersonalCredentialField = definition.params.some(
    (field) => field.key === 'personalCredentialId' || field.fieldType === 'geeCredential',
  );
  const hasRoiField = definition.params.some(
    (field) => field.key === 'roiId' || field.fieldType === 'spatialRoi',
  );

  if (hasPersonalCredentialField) {
    const credentialMode =
      typeof nextParams.credentialMode === 'string'
        ? nextParams.credentialMode
        : defaultCredentialMode(context);
    nextParams.credentialMode = credentialMode;
    if (credentialMode === 'platform_default') {
      nextParams.personalCredentialId = '';
    }
  }

  if (hasRoiField && nextParams.roiMode === 'saved_roi' && !nextParams.roiId) {
    nextParams.roiId = '';
  }

  return nextParams;
}

export function createDefaultParams(
  definition: WorkflowNodeDefinition,
  context: WorkflowEditorContext,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const field of definition.params) {
    if (
      field.key === 'credentialMode' &&
      (field.options ?? []).some((option) => ['platform_default', 'personal'].includes(option.value))
    ) {
      defaults[field.key] = defaultCredentialMode(context);
      continue;
    }

    if (field.fieldType === 'datasetVersion') {
      defaults[field.key] = '';
      continue;
    }

    if (field.fieldType === 'modelVersion') {
      defaults[field.key] = '';
      continue;
    }

    if (field.fieldType === 'spatialRoi') {
      defaults[field.key] = '';
      continue;
    }

    if (field.fieldType === 'geeCredential') {
      defaults[field.key] = '';
      continue;
    }

    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    }
  }

  return applyParamDependencies(definition, defaults, context);
}

export function resolveParameterOptions(
  definition: WorkflowParamDefinition,
  context: WorkflowEditorContext,
  options?: {
    nodeId?: string;
    nodeType?: string;
    workflowVersion?: WorkflowVersionDetail;
    definitions?: WorkflowNodeDefinition[];
  },
): WorkflowParameterOptionsResult {
  const nodeType = options?.nodeType ?? '';
  if (definition.fieldType === 'datasetVersion') {
    return buildDatasetVersionOptionsResult(context, definition, nodeType, options);
  }

  if (definition.fieldType === 'modelVersion') {
    return {
      options: compatibleModelVersions(context, nodeType).map((item) => ({
        value: item.id,
        label: `${item.modelName ?? item.modelId} / ${item.version} / ${item.framework}`,
      })),
    };
  }

  if (definition.fieldType === 'spatialRoi') {
    return {
      options: context.spatialRois.map((item) => ({
        value: item.id,
        label: `${item.name}${item.tags?.length ? ` / ${item.tags.join(', ')}` : ''}`,
      })),
    };
  }

  if (definition.fieldType === 'geeCredential') {
    return {
      options: context.geeCredentials.map((item) => ({
        value: item.id,
        label: `${item.name}${item.projectId ? ` / ${item.projectId}` : ''}`,
      })),
    };
  }

  return {
    options: definition.options ?? [],
  };
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
  const ports =
    kind === 'input'
      ? getEffectiveNodeInputDefs(node, definition)
      : getEffectiveNodeOutputDefs(node, definition);
  return ports.find((port) => port.key === handle);
}

export function canConnectPorts(
  definitions: WorkflowNodeDefinition[],
  nodes: WorkflowNode[],
  context: WorkflowEditorContext,
  connection: Pick<Connection, 'source' | 'sourceHandle' | 'target' | 'targetHandle'>,
): boolean {
  if (!connection.source || !connection.sourceHandle || !connection.target || !connection.targetHandle) {
    return false;
  }

  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  const sourceDefinition = sourceNode
    ? getWorkflowDefinitionByType(definitions, sourceNode.type)
    : undefined;
  const targetDefinition = targetNode
    ? getWorkflowDefinitionByType(definitions, targetNode.type)
    : undefined;
  const sourcePort = getNodePort(definitions, sourceNode, connection.sourceHandle, 'output');
  const targetPort = getNodePort(definitions, targetNode, connection.targetHandle, 'input');

  if (!sourceNode || !targetNode || !sourcePort || !targetPort) {
    return false;
  }

  if (!sourcePort.dataTypes.some((dataType) => targetPort.dataTypes.includes(dataType))) {
    return false;
  }

  const targetContract = getPortContract(targetDefinition, 'input', connection.targetHandle);
  const effectiveTargetContract = targetNode
    ? getEffectiveInputContracts(targetNode, targetDefinition).find(
        (contract) => contract.portKey === connection.targetHandle,
      )
    : targetContract;
  if (!effectiveTargetContract) {
    return true;
  }

  if (sourceNode.type === 'source.dataset_version') {
    const datasetVersionId =
      typeof sourceNode.params.datasetVersionId === 'string' ? sourceNode.params.datasetVersionId : '';
    if (datasetVersionId.trim()) {
      return datasetMatchesPortContract(context, datasetVersionId, effectiveTargetContract).ok;
    }
    return true;
  }

  const sourceContract = sourceNode
    ? getEffectiveOutputContracts(sourceNode, sourceDefinition).find(
        (contract) => contract.portKey === connection.sourceHandle,
      )
    : getPortContract(sourceDefinition, 'output', connection.sourceHandle);
  if (sourceContract) {
    return arePortContractsCompatible(sourceContract, effectiveTargetContract).ok;
  }

  return true;
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

function clearTemplateAssetBindings(
  definition: WorkflowNodeDefinition | undefined,
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (!definition) {
    return params;
  }

  let nextParams: Record<string, unknown> | undefined;
  for (const field of definition.params) {
    if (
      field.fieldType !== 'datasetVersion' &&
      field.fieldType !== 'modelVersion' &&
      field.fieldType !== 'spatialRoi' &&
      field.fieldType !== 'geeCredential'
    ) {
      continue;
    }

    if (!(field.key in params)) {
      continue;
    }

    if (!nextParams) {
      nextParams = { ...params };
    }
    nextParams[field.key] = '';
  }

  return nextParams ?? params;
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
    const syncedNode = syncCallSubgraphNodeInterfaces(node);
    const nextId = nodeIdMap.get(node.id) ?? node.id;
    const templateParams = options?.useSampleBindings
      ? syncedNode.params
      : clearTemplateAssetBindings(definition, syncedNode.params);
    const mergedParams = applyParamDependencies(
      definition ?? {
        ...node,
        label: node.type,
        category: 'preprocess',
        description: '',
        runtimeKind: 'transform',
        supportedTasks: [],
        tags: [],
        inputs: [],
        outputs: node.outputDefs,
        params: [],
      },
      {
        ...(definition ? createDefaultParams(definition, context) : {}),
        ...templateParams,
        ...(options?.useSampleBindings ? sampleBindings.get(node.id) ?? {} : {}),
      },
      context,
    );

    return {
      id: nextId,
      type: syncedNode.type,
      position: {
        x: anchorPosition.x + (syncedNode.position.x - minX),
        y: anchorPosition.y + (syncedNode.position.y - minY),
      },
      params: mergedParams,
      inputBindings: Object.fromEntries(
        Object.entries(syncedNode.inputBindings).map(([key, binding]) => {
          const [sourceNodeId, sourceHandle] = binding.split(':');
          return [key, `${nodeIdMap.get(sourceNodeId) ?? sourceNodeId}:${sourceHandle}`];
        }),
      ),
      inputDefs: getEffectiveNodeInputDefs(syncedNode, definition),
      inputContracts: getEffectiveInputContracts(syncedNode, definition),
      outputDefs: getEffectiveNodeOutputDefs(syncedNode, definition),
      outputContracts: getEffectiveOutputContracts(syncedNode, definition),
      subgraph: syncedNode.subgraph
        ? {
            nodes: syncedNode.subgraph.nodes.map((childNode) => syncCallSubgraphNodeInterfaces(childNode)),
            edges: syncedNode.subgraph.edges.map((edge) => ({ ...edge })),
          }
        : undefined,
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
