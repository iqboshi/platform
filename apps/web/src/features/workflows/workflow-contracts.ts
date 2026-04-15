import type {
  DatasetSummary,
  DatasetVersionSummary,
  GeeCredentialSummary,
  ModelVersionSummary,
  SpatialRoiSummary,
  WorkflowNodeCatalogItem,
  WorkflowNodeExample,
  WorkflowPortContract,
  WorkflowTemplateDefinition,
  WorkflowPortDataType,
  WorkflowValidationIssue,
  WorkflowVersionDetail,
} from '@platform/types';
import {
  arePortContractsCompatible,
  datasetMatchesPortContract,
  getDatasetSemantics,
  parseBinding,
  summarizePortContract,
} from './workflow-semantics';
import {
  FOR_EACH_INDEX_PORT_KEY,
  FOR_EACH_ITEM_PORT_KEY,
  FOR_EACH_NODE_TYPE,
  SUBGRAPH_INPUT_NODE_TYPE,
  SUBGRAPH_OUTPUT_NODE_TYPE,
  deriveSubgraphInputs,
  deriveSubgraphOutputs,
  getEffectiveInputContracts,
  getEffectiveNodeInputDefs,
  getEffectiveNodeOutputDefs,
  getEffectiveOutputContracts,
  isStructuralSubgraphNodeType,
} from './workflow-subgraphs';

export interface WorkflowEditorContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  geeCredentials: GeeCredentialSummary[];
  modelVersions: ModelVersionSummary[];
  spatialRois: SpatialRoiSummary[];
}

export interface WorkflowNodeAnalysis {
  state: 'ready' | 'missing_inputs' | 'invalid_params' | 'schema_mismatch';
  tone: 'green' | 'gold' | 'red';
  summary: string;
  issues: WorkflowValidationIssue[];
}

export interface WorkflowGraphAnalysis {
  byNodeId: Record<string, WorkflowNodeAnalysis>;
  issues: WorkflowValidationIssue[];
}

type WorkflowNodeLocalIssue = WorkflowValidationIssue & {
  _state: WorkflowNodeAnalysis['state'];
};

const TABULAR_PREDICT_NODE_TYPES = new Set([
  'tabular.predict_model',
  'tabular.linear_regression_predict',
  'tabular.svm_regression_predict',
  'tabular.random_forest_regression_predict',
  'custom.api_predict',
]);

function createIssue(
  state: WorkflowNodeAnalysis['state'],
  code: string,
  message: string,
  options: Omit<WorkflowValidationIssue, 'code' | 'severity' | 'message'> = {},
): WorkflowNodeLocalIssue {
  return {
    _state: state,
    code,
    severity: 'error',
    message,
    ...options,
  };
}

function hasRequiredValue(value: unknown, fieldType: WorkflowNodeCatalogItem['params'][number]['fieldType']): boolean {
  if (fieldType === 'boolean') {
    return typeof value === 'boolean';
  }
  if (fieldType === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  if (fieldType === 'multiselect') {
    return Array.isArray(value) && value.length > 0;
  }
  return typeof value === 'string' ? value.trim().length > 0 : value !== undefined && value !== null;
}

function parseBBoxText(value: unknown): number[] | undefined {
  if (Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')) {
    return value as number[];
  }
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const parts = value
    .split(/[,\s]+/)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
  return parts.length === 4 ? parts : undefined;
}

function parseIsoDateText(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) {
    return undefined;
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function parseJsonObject(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return true;
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

function parseJsonValue(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return true;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function stateRank(state: WorkflowNodeAnalysis['state']): number {
  if (state === 'schema_mismatch') {
    return 3;
  }
  if (state === 'invalid_params') {
    return 2;
  }
  if (state === 'missing_inputs') {
    return 1;
  }
  return 0;
}

function analysisFromIssues(
  definition: WorkflowNodeCatalogItem,
  issues: WorkflowNodeLocalIssue[],
): WorkflowNodeAnalysis {
  const state =
    issues.sort((a, b) => stateRank(b._state) - stateRank(a._state))[0]?._state ?? 'ready';
  const tone: WorkflowNodeAnalysis['tone'] =
    state === 'ready' ? 'green' : state === 'missing_inputs' ? 'gold' : 'red';
  const normalizedIssues = issues.map((issue) => {
    const sanitizedIssue: WorkflowValidationIssue = { ...issue };
    delete (sanitizedIssue as Partial<WorkflowNodeLocalIssue>)._state;
    return sanitizedIssue;
  });
  return {
    state,
    tone,
    summary: issues[0]?.message ?? definition.description,
    issues: normalizedIssues,
  };
}

function cloneContract(contract: WorkflowPortContract): WorkflowPortContract {
  return {
    ...contract,
    datasetKinds: [...(contract.datasetKinds ?? [])],
    fileFormats: [...(contract.fileFormats ?? [])],
    columnRequirements: [...(contract.columnRequirements ?? [])],
    sampleColumns: [...(contract.sampleColumns ?? [])],
    producedColumns: [...(contract.producedColumns ?? [])],
    taskTypes: [...(contract.taskTypes ?? [])],
    annotationKinds: [...(contract.annotationKinds ?? [])],
    sampleKinds: [...(contract.sampleKinds ?? [])],
    valueTypes: [...(contract.valueTypes ?? [])],
    notes: [...(contract.notes ?? [])],
  };
}

function orderedUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const token = String(value ?? '').trim();
    if (!token || seen.has(token)) {
      continue;
    }
    seen.add(token);
    ordered.push(token);
  }
  return ordered;
}

function taskTypesForAnnotationKinds(annotationKinds: string[]): string[] {
  const mapping: Record<string, string> = {
    class_label: 'image_classification',
    mask: 'semantic_segmentation',
    bbox: 'object_detection',
    polygon: 'instance_segmentation',
  };
  return orderedUnique(
    annotationKinds
      .map((kind) => mapping[String(kind).trim()])
      .filter((value): value is string => Boolean(value)),
  );
}

function annotationKindsForTaskTypes(taskTypes: string[]): string[] {
  const mapping: Record<string, string> = {
    image_classification: 'class_label',
    semantic_segmentation: 'mask',
    instance_segmentation: 'polygon',
    object_detection: 'bbox',
  };
  return orderedUnique(
    taskTypes
      .map((taskType) => mapping[String(taskType).trim()])
      .filter((value): value is string => Boolean(value)),
  );
}

function findPortContract(
  contracts: WorkflowPortContract[],
  portKey: string,
): WorkflowPortContract | undefined {
  return contracts.find((contract) => contract.portKey === portKey);
}

function createDefinitionMaps(
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
): {
  definitionByType: Map<string, WorkflowNodeCatalogItem>;
  nodeById: Map<string, WorkflowVersionDetail['graph']['nodes'][number]>;
} {
  return {
    definitionByType: new Map(definitions.map((definition) => [definition.type, definition])),
    nodeById: new Map(workflowVersion.graph.nodes.map((node) => [node.id, node])),
  };
}

function getBoundInputColumns(
  node: WorkflowVersionDetail['graph']['nodes'][number],
  inputKey: string,
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  visited = new Set<string>(),
): string[] {
  const parsed = parseBinding(node.inputBindings[inputKey]);
  if (!parsed) {
    return [];
  }

  const { nodeById, definitionByType } = createDefinitionMaps(definitions, workflowVersion);
  const sourceNode = nodeById.get(parsed.nodeId);
  if (!sourceNode) {
    return [];
  }

  if (sourceNode.type === 'source.dataset_version') {
    const datasetVersionId =
      typeof sourceNode.params.datasetVersionId === 'string' ? sourceNode.params.datasetVersionId : '';
    return orderedUnique(getDatasetSemantics(context, datasetVersionId)?.columns ?? []);
  }

  const sourceDefinition = definitionByType.get(sourceNode.type);
  const outputContract = sourceDefinition
    ? getEffectiveOutputContractForGraph(
        definitions,
        workflowVersion,
        context,
        sourceNode,
        parsed.portKey,
        visited,
      )
    : undefined;
  if (!outputContract) {
    return [];
  }
  return orderedUnique([...(outputContract.producedColumns ?? []), ...(outputContract.sampleColumns ?? [])]);
}

export function getEffectiveInputContractForGraph(
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
  _context: WorkflowEditorContext,
  node: WorkflowVersionDetail['graph']['nodes'][number],
  portKey: string,
): WorkflowPortContract | undefined {
  const { definitionByType } = createDefinitionMaps(definitions, workflowVersion);
  const definition = definitionByType.get(node.type);
  if (!definition) {
    return undefined;
  }

  const baseContract = findPortContract(getEffectiveInputContracts(node, definition), portKey);
  if (!baseContract) {
    return undefined;
  }

  if (node.type === 'custom.api_train_samples' && (portKey === 'trainSamples' || portKey === 'validationSamples')) {
    const taskType = typeof node.params.taskType === 'string' ? node.params.taskType.trim() : '';
    if (!taskType) {
      return cloneContract(baseContract);
    }
    return {
      ...cloneContract(baseContract),
      summary:
        portKey === 'trainSamples'
          ? 'Labeled sample set matching the configured training task semantics.'
          : 'Optional labeled sample set matching the configured training task semantics.',
      taskTypes: [taskType],
      annotationKinds: annotationKindsForTaskTypes([taskType]),
    };
  }

  if (node.type === 'metrics.validate_regression' && (portKey === 'predictionTable' || portKey === 'groundTruthTable')) {
    const configuredColumn =
      typeof node.params[portKey === 'predictionTable' ? 'predictionColumn' : 'groundTruthColumn'] === 'string'
        ? String(node.params[portKey === 'predictionTable' ? 'predictionColumn' : 'groundTruthColumn']).trim()
        : '';
    const column = configuredColumn || (portKey === 'predictionTable' ? 'prediction' : 'target');
    return {
      ...cloneContract(baseContract),
      summary:
        portKey === 'predictionTable'
          ? 'Prediction table containing the configured prediction column.'
          : 'Ground-truth table containing the configured target column.',
      columnRequirements: [column],
      sampleColumns: orderedUnique([...(baseContract.sampleColumns ?? []), column]),
    };
  }

  return cloneContract(baseContract);
}

export function getEffectiveOutputContractForGraph(
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  node: WorkflowVersionDetail['graph']['nodes'][number],
  portKey: string,
  visited = new Set<string>(),
): WorkflowPortContract | undefined {
  const token = `${node.id}:${portKey}`;
  const { definitionByType } = createDefinitionMaps(definitions, workflowVersion);
  const definition = definitionByType.get(node.type);
  if (!definition) {
    return undefined;
  }

  const baseContract = findPortContract(getEffectiveOutputContracts(node, definition), portKey);
  if (!baseContract) {
    return undefined;
  }
  if (visited.has(token)) {
    return cloneContract(baseContract);
  }

  const nextVisited = new Set(visited);
  nextVisited.add(token);

  const boundInputContract = (inputKey: string): WorkflowPortContract | undefined => {
    const parsed = parseBinding(node.inputBindings[inputKey]);
    if (!parsed) {
      return undefined;
    }
    const { nodeById } = createDefinitionMaps(definitions, workflowVersion);
    const sourceNode = nodeById.get(parsed.nodeId);
    if (!sourceNode) {
      return undefined;
    }
    return getEffectiveOutputContractForGraph(
      definitions,
      workflowVersion,
      context,
      sourceNode,
      parsed.portKey,
      nextVisited,
    );
  };

  if (node.type === 'dataset.build_samples' && portKey === 'samples') {
    const tilesContract = boundInputContract('tiles');
    const labelsContract = boundInputContract('labels');
    const annotationKinds = labelsContract?.annotationKinds?.length
      ? [...labelsContract.annotationKinds]
      : [];
    return {
      ...cloneContract(baseContract),
      summary: 'Sample set built from an RGB tile grid and optional aligned annotations.',
      sampleKinds:
        tilesContract?.sampleKinds?.length ? [...tilesContract.sampleKinds] : [...(baseContract.sampleKinds ?? [])],
      annotationKinds,
      taskTypes:
        labelsContract?.taskTypes?.length
          ? [...labelsContract.taskTypes]
          : taskTypesForAnnotationKinds(annotationKinds),
    };
  }

  if (node.type === 'dataset.split_samples' && ['trainSamples', 'valSamples', 'testSamples'].includes(portKey)) {
    const samplesContract = boundInputContract('samples');
    if (!samplesContract) {
      return cloneContract(baseContract);
    }
    return {
      ...cloneContract(baseContract),
      summary:
        portKey === 'trainSamples'
          ? 'Training sample split preserving upstream sample semantics.'
          : portKey === 'valSamples'
            ? 'Validation sample split preserving upstream sample semantics.'
            : 'Test sample split preserving upstream sample semantics.',
      sampleKinds: [...(samplesContract.sampleKinds ?? [])],
      annotationKinds: [...(samplesContract.annotationKinds ?? [])],
      taskTypes: [...(samplesContract.taskTypes ?? [])],
    };
  }

  if (node.type === 'custom.api_predict_samples' && portKey === 'predictions') {
    const samplesContract = boundInputContract('samples');
    if (!samplesContract) {
      return cloneContract(baseContract);
    }
    const taskTypes = [...(samplesContract.taskTypes ?? [])];
    return {
      ...cloneContract(baseContract),
      summary: 'Prediction set preserving the upstream sample grid and task semantics.',
      sampleKinds: [...(samplesContract.sampleKinds ?? [])],
      taskTypes,
      annotationKinds:
        annotationKindsForTaskTypes(taskTypes).length > 0
          ? annotationKindsForTaskTypes(taskTypes)
          : [...(samplesContract.annotationKinds ?? [])],
    };
  }

  if (node.type === 'table.load_csv' && portKey === 'table') {
    const producedColumns = getBoundInputColumns(
      node,
      'dataset',
      definitions,
      workflowVersion,
      context,
      nextVisited,
    );
    if (!producedColumns.length) {
      return cloneContract(baseContract);
    }
    return {
      ...cloneContract(baseContract),
      summary: 'In-memory table decoded from the bound CSV dataset version.',
      sampleColumns: producedColumns,
      producedColumns,
    };
  }

  if (node.type === 'table.train_test_split' && (portKey === 'trainTable' || portKey === 'testTable')) {
    const producedColumns = getBoundInputColumns(
      node,
      'table',
      definitions,
      workflowVersion,
      context,
      nextVisited,
    );
    if (!producedColumns.length) {
      return cloneContract(baseContract);
    }
    return {
      ...cloneContract(baseContract),
      summary:
        portKey === 'trainTable'
          ? 'Training table split preserving the upstream table schema.'
          : 'Test table split preserving the upstream table schema.',
      sampleColumns: producedColumns,
      producedColumns,
    };
  }

  if (TABULAR_PREDICT_NODE_TYPES.has(node.type) && portKey === 'table') {
    const upstreamColumns = getBoundInputColumns(
      node,
      'table',
      definitions,
      workflowVersion,
      context,
      nextVisited,
    );
    const configuredPredictionColumn =
      typeof node.params.predictionColumn === 'string' ? node.params.predictionColumn.trim() : '';
    const predictionColumn = configuredPredictionColumn || 'prediction';
    const producedColumns = orderedUnique([...upstreamColumns, predictionColumn]);
    if (!producedColumns.length) {
      return cloneContract(baseContract);
    }
    return {
      ...cloneContract(baseContract),
      summary: 'Prediction table preserving upstream columns and appending the configured prediction column.',
      sampleColumns: producedColumns,
      producedColumns,
    };
  }

  return cloneContract(baseContract);
}

export function getEffectiveNodeContractsForGraph(
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  node: WorkflowVersionDetail['graph']['nodes'][number],
): {
  inputContracts: WorkflowPortContract[];
  outputContracts: WorkflowPortContract[];
} {
  const { definitionByType } = createDefinitionMaps(definitions, workflowVersion);
  const definition = definitionByType.get(node.type);
  if (!definition) {
    return { inputContracts: [], outputContracts: [] };
  }

  return {
    inputContracts: getEffectiveInputContracts(node, definition)
      .map((contract) =>
        getEffectiveInputContractForGraph(definitions, workflowVersion, context, node, contract.portKey) ??
        cloneContract(contract),
      ),
    outputContracts: getEffectiveOutputContracts(node, definition)
      .map((contract) =>
        getEffectiveOutputContractForGraph(definitions, workflowVersion, context, node, contract.portKey) ??
        cloneContract(contract),
      ),
  };
}

export function getTemplateContractHints(
  template: WorkflowTemplateDefinition,
  definitions: WorkflowNodeCatalogItem[],
): { lines: string[]; exampleInput?: WorkflowNodeExample } {
  const definition = template.graph.nodes
    .map((node) => definitions.find((item) => item.type === node.type))
    .find((item) => item && ((item.inputContracts?.length ?? 0) > 0 || (item.inputs?.length ?? 0) > 0));

  if (!definition) {
    return { lines: [], exampleInput: undefined };
  }

  const lines = (definition.inputContracts ?? []).length
    ? (definition.inputContracts ?? [])
        .map((contract) => `${contract.portKey}: ${contract.summary}`)
        .slice(0, 2)
    : (definition.inputs ?? [])
        .filter((port) => port.required)
        .map((port) => `${port.label}: ${port.dataTypes.join(', ')}`)
        .slice(0, 2);

  const exampleInput = (definition.exampleInputs ?? []).find((item) => item.kind === 'table');
  return { lines, exampleInput };
}

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadExampleTableTemplate(fileStem: string, example: WorkflowNodeExample): void {
  const columns = example.columns ?? [];
  if (example.kind !== 'table' || !columns.length) {
    return;
  }

  const rows = example.rows ?? [];
  const csv = [
    columns.map((column) => escapeCsvValue(column)).join(','),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue((row as Record<string, unknown>)[column])).join(','),
    ),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${fileStem}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function analyzeWorkflowGraph(
  definitions: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
  context: WorkflowEditorContext,
  options?: { insideSubgraph?: boolean },
): WorkflowGraphAnalysis {
  const definitionByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const nodeById = new Map(workflowVersion.graph.nodes.map((node) => [node.id, node]));
  const datasetVersionIds = new Set(context.datasetVersions.map((item) => item.id));
  const modelVersionIds = new Set(context.modelVersions.map((item) => item.id));
  const spatialRoiIds = new Set(context.spatialRois.map((item) => item.id));
  const geeCredentialIds = new Set(context.geeCredentials.map((item) => item.id));

  const outputTypeForBinding = (binding: string | undefined): WorkflowPortDataType[] => {
    const parsed = parseBinding(binding);
    if (!parsed) {
      return [];
    }
    const sourceNode = nodeById.get(parsed.nodeId);
    const sourceDefinition = sourceNode ? definitionByType.get(sourceNode.type) : undefined;
    const sourcePort = sourceNode
      ? getEffectiveNodeOutputDefs(sourceNode, sourceDefinition).find((port) => port.key === parsed.portKey)
      : sourceDefinition?.outputs.find((port) => port.key === parsed.portKey);
    return sourcePort?.dataTypes ?? [];
  };

  const resolveEffectiveSources = (
    sourceNodeId: string,
    portKey: string,
    visited = new Set<string>(),
  ): Array<{
    nodeId: string;
    node: WorkflowVersionDetail['graph']['nodes'][number];
    definition?: WorkflowNodeCatalogItem;
    portKey: string;
  }> => {
    const visitToken = `${sourceNodeId}:${portKey}`;
    if (visited.has(visitToken)) {
      return [];
    }
    const nextVisited = new Set(visited);
    nextVisited.add(visitToken);

    const sourceNode = nodeById.get(sourceNodeId);
    const sourceDefinition = sourceNode ? definitionByType.get(sourceNode.type) : undefined;
    if (!sourceNode) {
      return [];
    }

    if (sourceNode.type === 'control.guard' && portKey === 'payload') {
      const payloadBinding = parseBinding(sourceNode.inputBindings.payload);
      if (!payloadBinding) {
        return [];
      }
      return resolveEffectiveSources(payloadBinding.nodeId, payloadBinding.portKey, nextVisited);
    }

    if (sourceNode.type === 'control.coalesce' && portKey === 'output') {
      const resolved = new Map<
        string,
        {
          nodeId: string;
          node: WorkflowVersionDetail['graph']['nodes'][number];
          definition?: WorkflowNodeCatalogItem;
          portKey: string;
        }
      >();
      for (const inputKey of ['primary', 'fallback'] as const) {
        const candidateBinding = parseBinding(sourceNode.inputBindings[inputKey]);
        if (!candidateBinding) {
          continue;
        }
        for (const candidate of resolveEffectiveSources(
          candidateBinding.nodeId,
          candidateBinding.portKey,
          nextVisited,
        )) {
          resolved.set(`${candidate.nodeId}:${candidate.portKey}`, candidate);
        }
      }
      return [...resolved.values()];
    }

    return [{ nodeId: sourceNodeId, node: sourceNode, definition: sourceDefinition, portKey }];
  };

  const byNodeId = Object.fromEntries(
    workflowVersion.graph.nodes.map((node) => {
      const definition = definitionByType.get(node.type);
      if (!definition) {
        const issues = [
          createIssue(
            'invalid_params',
            'unsupported_node_type',
            'Unsupported node type.',
            {
              nodeId: node.id,
              actual: node.type,
            },
          ),
        ];
        return [node.id, analysisFromIssues({
          type: node.type,
          label: node.type,
          category: 'preprocess',
          description: 'Unsupported node type.',
          runtimeKind: 'transform',
          supportedTasks: [],
          tags: [],
          inputs: [],
          outputs: [],
          params: [],
        }, issues)] as const;
      }

      const issues: WorkflowNodeLocalIssue[] = [];
      const effectiveInputs = getEffectiveNodeInputDefs(node, definition);

      if (
        !options?.insideSubgraph &&
        (node.type === SUBGRAPH_INPUT_NODE_TYPE || node.type === SUBGRAPH_OUTPUT_NODE_TYPE)
      ) {
        issues.push(
          createIssue(
            'invalid_params',
            'subgraph_boundary_outside_subgraph',
            'Subgraph boundary nodes are valid only inside a nested subgraph editor.',
            {
              nodeId: node.id,
            },
          ),
        );
      }

      if (isStructuralSubgraphNodeType(node.type)) {
        if (!node.subgraph) {
          issues.push(
            createIssue('invalid_params', 'missing_subgraph', 'A nested subgraph is required.', {
              nodeId: node.id,
            }),
          );
        } else {
          const inputKeys = deriveSubgraphInputs(node.subgraph).map((item) => item.port.key);
          const outputKeys = deriveSubgraphOutputs(node.subgraph).map((item) => item.port.key);
          if (new Set(inputKeys).size !== inputKeys.length) {
            issues.push(
              createIssue(
                'invalid_params',
                'duplicate_subgraph_input_port',
                'Subgraph input port keys must be unique.',
                { nodeId: node.id },
              ),
            );
          }
          if (new Set(outputKeys).size !== outputKeys.length) {
            issues.push(
              createIssue(
                'invalid_params',
                'duplicate_subgraph_output_port',
                'Subgraph output port keys must be unique.',
                { nodeId: node.id },
              ),
            );
          }
          if (node.type === FOR_EACH_NODE_TYPE) {
            const conflictingInput = inputKeys.includes('items') ? 'items' : undefined;
            if (conflictingInput) {
              issues.push(
                createIssue(
                  'invalid_params',
                  'for_each_input_key_conflict',
                  'Nested subgraph input `items` conflicts with the outer loop input.',
                  { nodeId: node.id, portKey: conflictingInput },
                ),
              );
            }

            const itemBoundary = deriveSubgraphInputs(node.subgraph).find((item) => item.port.key === FOR_EACH_ITEM_PORT_KEY);
            if (itemBoundary && itemBoundary.port.dataTypes.join(',') !== 'value') {
              issues.push(
                createIssue(
                  'invalid_params',
                  'for_each_item_port_type_mismatch',
                  'Reserved loop input `item` must use the value data type.',
                  { nodeId: node.id, portKey: FOR_EACH_ITEM_PORT_KEY },
                ),
              );
            }

            const indexBoundary = deriveSubgraphInputs(node.subgraph).find((item) => item.port.key === FOR_EACH_INDEX_PORT_KEY);
            if (indexBoundary && indexBoundary.port.dataTypes.join(',') !== 'value') {
              issues.push(
                createIssue(
                  'invalid_params',
                  'for_each_index_port_type_mismatch',
                  'Reserved loop input `index` must use the value data type.',
                  { nodeId: node.id, portKey: FOR_EACH_INDEX_PORT_KEY },
                ),
              );
            }
          }
        }
      }

      for (const input of effectiveInputs) {
        if (input.required && !parseBinding(node.inputBindings[input.key])) {
          issues.push(
            createIssue(
              'missing_inputs',
              'missing_required_input_binding',
              `${input.label} is required.`,
              {
                nodeId: node.id,
                portKey: input.key,
                expected: input.label,
              },
            ),
          );
        }
      }

      for (const field of definition.params ?? []) {
        const value = node.params[field.key];
        if (field.required && !hasRequiredValue(value, field.fieldType)) {
          issues.push(
            createIssue(
              'invalid_params',
              'missing_required_param',
              `${field.label} is required.`,
              {
                nodeId: node.id,
                paramKey: field.key,
                expected: field.label,
              },
            ),
          );
          continue;
        }

        if (
          field.fieldType === 'datasetVersion' &&
          typeof value === 'string' &&
          value &&
          !datasetVersionIds.has(value)
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'unknown_dataset_version',
              `${field.label} does not exist.`,
              {
                nodeId: node.id,
                paramKey: field.key,
                actual: value,
              },
            ),
          );
        }
        if (
          field.fieldType === 'modelVersion' &&
          typeof value === 'string' &&
          value &&
          !modelVersionIds.has(value)
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'unknown_model_version',
              `${field.label} does not exist.`,
              {
                nodeId: node.id,
                paramKey: field.key,
                actual: value,
              },
            ),
          );
        }
        if (
          field.fieldType === 'spatialRoi' &&
          typeof value === 'string' &&
          value &&
          !spatialRoiIds.has(value)
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'unknown_spatial_roi',
              `${field.label} does not exist.`,
              {
                nodeId: node.id,
                paramKey: field.key,
                actual: value,
              },
            ),
          );
        }
        if (
          field.fieldType === 'geeCredential' &&
          typeof value === 'string' &&
          value &&
          !geeCredentialIds.has(value)
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'unknown_gee_credential',
              `${field.label} does not exist.`,
              {
                nodeId: node.id,
                paramKey: field.key,
                actual: value,
              },
            ),
          );
        }
      }

      const bboxValue = node.params.bbox;
      if (bboxValue !== undefined && bboxValue !== '' && !parseBBoxText(bboxValue)) {
        issues.push(
          createIssue(
            'invalid_params',
            'invalid_bbox',
            'bbox must contain four coordinates in minLon,minLat,maxLon,maxLat order.',
            {
              nodeId: node.id,
              paramKey: 'bbox',
            },
          ),
        );
      }

      const startDate = parseIsoDateText(node.params.startDate);
      const endDate = parseIsoDateText(node.params.endDate);
      if ((node.params.startDate || node.params.endDate) && (!startDate || !endDate)) {
        issues.push(
          createIssue(
            'invalid_params',
            'invalid_date_range',
            'Date parameters must use YYYY-MM-DD.',
            {
              nodeId: node.id,
              paramKey: !startDate ? 'startDate' : 'endDate',
            },
          ),
        );
      } else if (startDate && endDate && endDate < startDate) {
        issues.push(
          createIssue(
            'invalid_params',
            'reversed_date_range',
            'endDate must be on or after startDate.',
            {
              nodeId: node.id,
              paramKey: 'endDate',
            },
          ),
        );
      }

      for (const key of ['filtersJson', 'hyperparametersJson', 'runtimeParametersJson', 'callParametersJson']) {
        if (!parseJsonObject(node.params[key])) {
          issues.push(
            createIssue(
              'invalid_params',
              'invalid_json_param',
              `${key} must be valid JSON.`,
              {
                nodeId: node.id,
                paramKey: key,
              },
            ),
          );
        }
      }

      for (const key of ['tileWidth', 'tileHeight', 'strideX', 'strideY', 'scale', 'limit']) {
        const value = node.params[key];
        if (
          value !== undefined &&
          value !== null &&
          value !== '' &&
          (!Number.isFinite(Number(value)) || Number(value) <= 0)
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'invalid_positive_number',
              `${key} must be a positive number.`,
              {
                nodeId: node.id,
                paramKey: key,
              },
            ),
          );
        }
      }

      if (node.type === 'control.list_literal' && !parseJsonValue(node.params.itemsJson)) {
        issues.push(
          createIssue('invalid_params', 'invalid_json_param', 'itemsJson must be valid JSON.', {
            nodeId: node.id,
            paramKey: 'itemsJson',
          }),
        );
      }

      if (node.type === 'control.compare') {
        const operator = String(node.params.operator ?? '').trim();
        if (!['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'].includes(operator)) {
          issues.push(
            createIssue('invalid_params', 'invalid_compare_operator', 'operator is invalid.', {
              nodeId: node.id,
              paramKey: 'operator',
            }),
          );
        }
        if (!parseJsonValue(node.params.rightValueJson)) {
          issues.push(
            createIssue(
              'invalid_params',
              'invalid_json_param',
              'rightValueJson must be valid JSON.',
              {
                nodeId: node.id,
                paramKey: 'rightValueJson',
              },
            ),
          );
        }
      }

      if (node.type === 'dataset.split_samples') {
        const trainRatio = Number(node.params.trainRatio ?? 0);
        const valRatio = Number(node.params.valRatio ?? 0);
        const testRatio = Number(node.params.testRatio ?? 0);
        if (
          Number.isFinite(trainRatio + valRatio + testRatio) &&
          Math.abs(trainRatio + valRatio + testRatio - 1) > 1e-6
        ) {
          issues.push(
            createIssue(
              'invalid_params',
              'invalid_split_ratio',
              'trainRatio + valRatio + testRatio must equal 1.',
              {
                nodeId: node.id,
                paramKey: 'trainRatio',
              },
            ),
          );
        }
      }

      if (node.type === 'tabular.predict_model' || node.type === 'custom.api_predict') {
        const hasModelInput = Boolean(parseBinding(node.inputBindings.model));
        const hasModelParam =
          typeof node.params.modelVersionId === 'string' &&
          node.params.modelVersionId.trim().length > 0;
        if (!hasModelInput && !hasModelParam) {
          issues.push(
            createIssue(
              'invalid_params',
              'missing_model_reference',
              'A model input or modelVersionId is required.',
              {
                nodeId: node.id,
                paramKey: 'modelVersionId',
                portKey: 'model',
              },
            ),
          );
        }
      }

      for (const input of effectiveInputs) {
        const binding = node.inputBindings[input.key];
        const parsedBinding = parseBinding(binding);
        const sourceTypes = outputTypeForBinding(binding);
        if (
          binding &&
          sourceTypes.length &&
          !sourceTypes.some((type) => input.dataTypes.includes(type))
        ) {
          issues.push(
            createIssue(
              'schema_mismatch',
              'incompatible_edge_data_types',
              `${input.label} is connected to an incompatible output type.`,
              {
                nodeId: node.id,
                portKey: input.key,
                expected: input.dataTypes.join(', '),
                actual: sourceTypes.join(', '),
              },
            ),
          );
          continue;
        }

        if (!binding || !parsedBinding) {
          continue;
        }

        const sourceNode = nodeById.get(parsedBinding.nodeId);
        const sourceDefinition = sourceNode ? definitionByType.get(sourceNode.type) : undefined;
        const targetContract = getEffectiveInputContractForGraph(
          definitions,
          workflowVersion,
          context,
          node,
          input.key,
        );
        if (!sourceNode || !targetContract) {
          continue;
        }

        const resolvedEffectiveSources = resolveEffectiveSources(
          parsedBinding.nodeId,
          parsedBinding.portKey,
        );
        const effectiveSources =
          resolvedEffectiveSources.length > 0
            ? resolvedEffectiveSources
            : [
                {
                  nodeId: parsedBinding.nodeId,
                  node: sourceNode,
                  definition: sourceDefinition,
                  portKey: parsedBinding.portKey,
                },
              ];

        for (const candidate of effectiveSources) {
          if (candidate.node.type === 'source.dataset_version') {
            const datasetVersionId =
              typeof candidate.node.params.datasetVersionId === 'string'
                ? candidate.node.params.datasetVersionId
                : '';
            if (!datasetVersionId.trim()) {
              continue;
            }
            const semanticMatch = datasetMatchesPortContract(context, datasetVersionId, targetContract);
            if (!semanticMatch.ok) {
              issues.push(
                createIssue(
                  'schema_mismatch',
                  'dataset_semantic_mismatch',
                  `${input.label} expects ${summarizePortContract(targetContract)}.`,
                  {
                    nodeId: node.id,
                    portKey: input.key,
                    expected: summarizePortContract(targetContract),
                    actual: `${candidate.node.id}.${candidate.portKey}: ${semanticMatch.reasons.join('; ')}`,
                    suggestion:
                      'Choose a compatible dataset version or reconnect this input to a compatible upstream node.',
                  },
                ),
              );
            }
            continue;
          }

          const sourceContract = getEffectiveOutputContractForGraph(
            definitions,
            workflowVersion,
            context,
            candidate.node,
            candidate.portKey,
          );
          if (!sourceContract) {
            continue;
          }
          const compatibility = arePortContractsCompatible(sourceContract, targetContract);
          if (!compatibility.ok) {
            issues.push(
              createIssue(
                'schema_mismatch',
                'edge_contract_mismatch',
                `${input.label} expects ${summarizePortContract(targetContract)}.`,
                {
                  nodeId: node.id,
                  portKey: input.key,
                  expected: summarizePortContract(targetContract),
                  actual: `${candidate.node.id}.${candidate.portKey}: ${compatibility.reasons.join('; ')}`,
                  suggestion:
                    'Replace the upstream node or insert a compatible transform before this input.',
                },
              ),
            );
          }
        }
      }

      return [node.id, analysisFromIssues(definition, issues)] as const;
    }),
  );

  const issues = Object.values(byNodeId).flatMap((analysis) => analysis.issues);

  return {
    byNodeId,
    issues,
  };
}
