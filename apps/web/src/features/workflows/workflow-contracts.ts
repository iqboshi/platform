import type {
  DatasetKind,
  DatasetSummary,
  DatasetVersionSummary,
  ModelAlgorithmKey,
  ModelVersionSummary,
  WorkflowNode,
  WorkflowNodeCatalogItem,
  WorkflowNodeExample,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
} from '@platform/types';

export interface WorkflowEditorContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
}

export interface WorkflowNodeAnalysis {
  state: 'ready' | 'missing_inputs' | 'invalid_params' | 'schema_mismatch';
  tone: 'green' | 'gold' | 'red';
  summary: string;
  issues: string[];
}

interface ResolvedDatasetRef {
  dataset?: DatasetSummary;
  datasetVersion?: DatasetVersionSummary;
}

interface InferredTableSchema {
  columns: string[];
  datasetKind?: DatasetKind;
  datasetVersionId?: string;
  datasetName?: string;
}

function parseBinding(binding: string | undefined): { nodeId: string; portKey: string } | undefined {
  if (!binding) {
    return undefined;
  }

  const [nodeId, portKey] = binding.split(':');
  if (!nodeId || !portKey) {
    return undefined;
  }

  return { nodeId, portKey };
}

function parseCsvColumns(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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

function normalizeColumns(metadata: Record<string, unknown>): string[] {
  const value = metadata.columns;
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function resolveDatasetMaps(context: WorkflowEditorContext) {
  return {
    datasetsById: new Map(context.datasets.map((dataset) => [dataset.id, dataset])),
    datasetVersionsById: new Map(
      context.datasetVersions.map((datasetVersion) => [datasetVersion.id, datasetVersion]),
    ),
    modelsById: new Map(context.modelVersions.map((modelVersion) => [modelVersion.id, modelVersion])),
  };
}

function requiredAlgorithmForNode(nodeType: string): ModelAlgorithmKey | undefined {
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

function compactSummaryForNode(definition: WorkflowNodeCatalogItem): string {
  switch (definition.type) {
    case 'source.dataset_version':
      return 'Select a dataset version';
    case 'table.load_csv':
      return 'CSV dataset version -> table';
    case 'table.train_test_split':
      return 'Split one table into train and test';
    case 'tabular.linear_regression_train':
    case 'tabular.svm_regression_train':
    case 'tabular.random_forest_regression_train':
      return 'Needs feature columns and target column';
    case 'tabular.linear_regression_predict':
    case 'tabular.svm_regression_predict':
    case 'tabular.random_forest_regression_predict':
    case 'tabular.predict':
      return 'Needs model features in the input table';
    case 'custom.api_predict':
      return 'Needs a saved Custom API model';
    case 'metrics.validate_regression':
      return 'Needs prediction and ground-truth tables';
    case 'model.save_trained_model':
      return 'Save a trained model into assets';
    case 'export.table':
      return 'Export the current table to CSV';
    case 'export.metrics':
      return 'Export the current metrics report';
    default:
      return definition.description;
  }
}

export function getTemplateContractHints(
  template: WorkflowTemplateDefinition,
  definitions: WorkflowNodeCatalogItem[],
): { lines: string[]; exampleInput?: WorkflowNodeExample } {
  const preferredNodeTypes = [
    'metrics.validate_regression',
    'custom.api_predict',
    'tabular.linear_regression_train',
    'tabular.svm_regression_train',
    'tabular.random_forest_regression_train',
    'tabular.linear_regression_predict',
    'tabular.svm_regression_predict',
    'tabular.random_forest_regression_predict',
    'tabular.predict',
    'table.load_csv',
  ];
  const templateNodeTypes = new Set(template.graph.nodes.map((node) => node.type));
  const primaryType = preferredNodeTypes.find((nodeType) => templateNodeTypes.has(nodeType));
  const definition = definitions.find((item) => item.type === primaryType);
  if (!definition) {
    return { lines: [], exampleInput: undefined };
  }

  const portLabelByKey = new Map((definition.inputs ?? []).map((port) => [port.key, port.label]));
  const lines = (definition.inputContracts ?? [])
    .map((contract) => {
      const label = portLabelByKey.get(contract.portKey) ?? contract.portKey;
      if (contract.sampleColumns?.length) {
        return `${label}: ${contract.sampleColumns.join(', ')}`;
      }
      if (contract.columnRequirements?.length) {
        return `${label}: ${contract.columnRequirements.join(', ')}`;
      }
      return `${label}: ${contract.summary}`;
    })
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
): Record<string, WorkflowNodeAnalysis> {
  const { datasetsById, datasetVersionsById, modelsById } = resolveDatasetMaps(context);
  const nodesById = new Map(workflowVersion.graph.nodes.map((node) => [node.id, node]));
  const definitionsByType = new Map(definitions.map((definition) => [definition.type, definition]));
  const datasetRefMemo = new Map<string, ResolvedDatasetRef | null>();
  const tableSchemaMemo = new Map<string, InferredTableSchema | null>();

  const inferDatasetRef = (nodeId: string, portKey: string): ResolvedDatasetRef | null => {
    const memoKey = `${nodeId}:${portKey}`;
    if (datasetRefMemo.has(memoKey)) {
      return datasetRefMemo.get(memoKey) ?? null;
    }

    const node = nodesById.get(nodeId);
    if (!node || node.type !== 'source.dataset_version' || portKey !== 'dataset') {
      datasetRefMemo.set(memoKey, null);
      return null;
    }

    const datasetVersionId =
      typeof node.params.datasetVersionId === 'string' ? node.params.datasetVersionId : '';
    const datasetVersion = datasetVersionsById.get(datasetVersionId);
    const dataset = datasetVersion ? datasetsById.get(datasetVersion.datasetId) : undefined;
    const resolvedRef = { dataset, datasetVersion };
    datasetRefMemo.set(memoKey, resolvedRef);
    return resolvedRef;
  };

  const inferInputTableSchema = (node: WorkflowNode, portKey: string): InferredTableSchema | null => {
    const binding = parseBinding(node.inputBindings[portKey]);
    if (!binding) {
      return null;
    }
    return inferTableSchema(binding.nodeId, binding.portKey);
  };

  const inferTableSchema = (nodeId: string, portKey: string): InferredTableSchema | null => {
    const memoKey = `${nodeId}:${portKey}`;
    if (tableSchemaMemo.has(memoKey)) {
      return tableSchemaMemo.get(memoKey) ?? null;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      tableSchemaMemo.set(memoKey, null);
      return null;
    }

    let inferred: InferredTableSchema | null = null;

    if (node.type === 'table.load_csv' && portKey === 'table') {
      const datasetBinding = parseBinding(node.inputBindings.dataset);
      if (datasetBinding) {
        const datasetRef = inferDatasetRef(datasetBinding.nodeId, datasetBinding.portKey);
        const metadata =
          (datasetRef?.datasetVersion?.metadata as Record<string, unknown> | undefined) ?? {};
        inferred = {
          columns: normalizeColumns(metadata),
          datasetKind: datasetRef?.dataset?.kind,
          datasetVersionId: datasetRef?.datasetVersion?.id,
          datasetName: datasetRef?.dataset?.name,
        };
      }
    } else if (
      node.type === 'table.train_test_split' &&
      (portKey === 'trainTable' || portKey === 'testTable')
    ) {
      inferred = inferInputTableSchema(node, 'table');
    } else if (
      [
        'tabular.linear_regression_predict',
        'tabular.svm_regression_predict',
        'tabular.random_forest_regression_predict',
        'tabular.predict',
        'custom.api_predict',
      ].includes(node.type) &&
      portKey === 'table'
    ) {
      const inputSchema = inferInputTableSchema(node, 'table');
      if (inputSchema) {
        const predictionColumn =
          typeof node.params.predictionColumn === 'string' && node.params.predictionColumn.trim()
            ? node.params.predictionColumn.trim()
            : 'prediction';
        inferred = {
          ...inputSchema,
          columns: inputSchema.columns.includes(predictionColumn)
            ? inputSchema.columns
            : [...inputSchema.columns, predictionColumn],
        };
      }
    }

    tableSchemaMemo.set(memoKey, inferred);
    return inferred;
  };

  const analysisEntries = workflowVersion.graph.nodes.map((node) => {
    const definition = definitionsByType.get(node.type);
    if (!definition) {
      return [
        node.id,
        {
          state: 'invalid_params',
          tone: 'red',
          summary: 'Unsupported node type.',
          issues: ['Unsupported node type.'],
        } satisfies WorkflowNodeAnalysis,
      ] as const;
    }

    const issues: { state: WorkflowNodeAnalysis['state']; message: string }[] = [];

    for (const input of definition.inputs ?? []) {
      if (input.required && !parseBinding(node.inputBindings[input.key])) {
        issues.push({
          state: 'missing_inputs',
          message: `${input.label} is required.`,
        });
      }
    }

    for (const field of definition.params ?? []) {
      if (field.required && !hasRequiredValue(node.params[field.key], field.fieldType)) {
        issues.push({
          state: 'invalid_params',
          message: `${field.label} is required.`,
        });
      }
    }

    if (node.type === 'source.dataset_version') {
      const datasetVersionId =
        typeof node.params.datasetVersionId === 'string' ? node.params.datasetVersionId : '';
      if (datasetVersionId && !datasetVersionsById.has(datasetVersionId)) {
        issues.push({
          state: 'invalid_params',
          message: 'The selected dataset version does not exist.',
        });
      }
    }

    if (node.type === 'table.load_csv') {
      const datasetBinding = parseBinding(node.inputBindings.dataset);
      if (datasetBinding) {
        const datasetRef = inferDatasetRef(datasetBinding.nodeId, datasetBinding.portKey);
        if (!datasetRef?.datasetVersion || !datasetRef.dataset) {
          issues.push({
            state: 'schema_mismatch',
            message: 'The bound dataset version could not be resolved.',
          });
        } else if (datasetRef.dataset.kind !== 'table') {
          issues.push({
            state: 'schema_mismatch',
            message: 'Load CSV requires a table dataset version backed by CSV.',
          });
        }
      }
    }

    if (
      [
        'tabular.linear_regression_train',
        'tabular.svm_regression_train',
        'tabular.random_forest_regression_train',
      ].includes(node.type)
    ) {
      const tableSchema = inferInputTableSchema(node, 'trainTable');
      const featureColumns = parseCsvColumns(node.params.featureColumns);
      const targetColumn =
        typeof node.params.targetColumn === 'string' ? node.params.targetColumn.trim() : '';

      if (!featureColumns.length) {
        issues.push({
          state: 'invalid_params',
          message: 'featureColumns must contain at least one column name.',
        });
      }

      if (tableSchema?.columns.length) {
        const missingFeatures = featureColumns.filter(
          (column) => !tableSchema.columns.includes(column),
        );
        if (missingFeatures.length) {
          issues.push({
            state: 'schema_mismatch',
            message: `Missing feature columns: ${missingFeatures.join(', ')}.`,
          });
        }

        if (targetColumn && !tableSchema.columns.includes(targetColumn)) {
          issues.push({
            state: 'schema_mismatch',
            message: `Missing target column: ${targetColumn}.`,
          });
        }
      }
    }

    if (
      [
        'tabular.linear_regression_predict',
        'tabular.svm_regression_predict',
        'tabular.random_forest_regression_predict',
        'tabular.predict',
        'custom.api_predict',
      ].includes(node.type)
    ) {
      const modelVersionId =
        typeof node.params.modelVersionId === 'string' ? node.params.modelVersionId : '';
      const modelVersion = modelsById.get(modelVersionId);

      if (modelVersionId && !modelVersion) {
        issues.push({
          state: 'invalid_params',
          message: 'The selected model asset does not exist.',
        });
      }

      if (modelVersion) {
        if (node.type === 'custom.api_predict' && modelVersion.sourceType !== 'custom_api') {
          issues.push({
            state: 'schema_mismatch',
            message: 'Custom API Predict requires a Custom API model asset.',
          });
        }

        const requiredAlgorithm = requiredAlgorithmForNode(node.type);
        if (
          requiredAlgorithm &&
          modelVersion.sourceType !== 'custom_api' &&
          modelVersion.algorithmKey !== requiredAlgorithm
        ) {
          issues.push({
            state: 'schema_mismatch',
            message: `This node requires a ${requiredAlgorithm} model asset.`,
          });
        }

        const inputSchema = inferInputTableSchema(node, 'table');
        const requiredFeatures = modelVersion.featureNames ?? [];
        if (inputSchema?.columns.length && requiredFeatures.length) {
          const missingFeatures = requiredFeatures.filter(
            (column) => !inputSchema.columns.includes(column),
          );
          if (missingFeatures.length) {
            issues.push({
              state: 'schema_mismatch',
              message: `The input table is missing model features: ${missingFeatures.join(', ')}.`,
            });
          }
        }
      }
    }

    if (node.type === 'metrics.validate_regression') {
      const predictionSchema = inferInputTableSchema(node, 'predictionTable');
      const groundTruthSchema = inferInputTableSchema(node, 'groundTruthTable');
      const predictionColumn =
        typeof node.params.predictionColumn === 'string' ? node.params.predictionColumn.trim() : '';
      const groundTruthColumn =
        typeof node.params.groundTruthColumn === 'string'
          ? node.params.groundTruthColumn.trim()
          : '';

      if (predictionSchema?.columns.length && predictionColumn) {
        if (!predictionSchema.columns.includes(predictionColumn)) {
          issues.push({
            state: 'schema_mismatch',
            message: `Prediction table is missing ${predictionColumn}.`,
          });
        }
      }

      if (groundTruthSchema?.columns.length && groundTruthColumn) {
        if (!groundTruthSchema.columns.includes(groundTruthColumn)) {
          issues.push({
            state: 'schema_mismatch',
            message: `Ground-truth table is missing ${groundTruthColumn}.`,
          });
        }
      }
    }

    let analysis: WorkflowNodeAnalysis;
    if (!issues.length) {
      analysis = {
        state: 'ready',
        tone: 'green',
        summary: compactSummaryForNode(definition),
        issues: [],
      };
    } else {
      const issue = issues[0];
      analysis = {
        state: issue.state,
        tone: issue.state === 'schema_mismatch' ? 'red' : 'gold',
        summary: issue.message,
        issues: issues.map((entry) => entry.message),
      };
    }

    return [node.id, analysis] as const;
  });

  return Object.fromEntries(analysisEntries);
}
