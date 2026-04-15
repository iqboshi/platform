import type {
  WorkflowAnnotationKind,
  DatasetKind,
  DatasetSummary,
  DatasetVersionSummary,
  WorkflowNodeCatalogItem,
  WorkflowPortContract,
  WorkflowSampleKind,
  WorkflowSemanticTaskType,
  WorkflowValueType,
} from '@platform/types';

export interface WorkflowDatasetContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
}

export interface WorkflowDatasetSemantics {
  datasetKind?: DatasetKind;
  formats: string[];
  columns: string[];
  taskTypes: WorkflowSemanticTaskType[];
  annotationKinds: WorkflowAnnotationKind[];
  sampleKinds: WorkflowSampleKind[];
  valueTypes: WorkflowValueType[];
}

export function parseBinding(
  binding: string | undefined,
): { nodeId: string; portKey: string } | undefined {
  if (!binding) {
    return undefined;
  }
  const [nodeId, portKey] = binding.split(':');
  if (!nodeId || !portKey) {
    return undefined;
  }
  return { nodeId, portKey };
}

export function getPortContract(
  definition: WorkflowNodeCatalogItem | undefined,
  kind: 'input' | 'output',
  portKey: string | undefined,
): WorkflowPortContract | undefined {
  if (!definition || !portKey) {
    return undefined;
  }
  const contracts = kind === 'input' ? definition.inputContracts ?? [] : definition.outputContracts ?? [];
  return contracts.find((contract) => contract.portKey === portKey);
}

function metadataString(metadata: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function normalizeSemanticToken(value: string): string {
  return value.trim().toLowerCase().replace(/[-\s]+/g, '_');
}

function semanticTokensFromValue(value: unknown): string[] {
  const items: unknown[] =
    typeof value === 'string'
      ? value.includes(',')
        ? value.split(',')
        : [value]
      : Array.isArray(value)
        ? value
        : value === undefined || value === null
          ? []
          : [value];

  const tokens = new Set<string>();
  for (const item of items) {
    const token = normalizeSemanticToken(String(item ?? ''));
    if (token) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

function metadataSemanticValues(metadata: Record<string, unknown>, ...keys: string[]): string[] {
  const tokens = new Set<string>();
  for (const key of keys) {
    for (const token of semanticTokensFromValue(metadata[key])) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

function canonicalFormatTokens(value: string): string[] {
  const normalized = value.trim().toLowerCase().replace(/^\./, '');
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  if (normalized.includes('/')) {
    candidates.add(normalized.split('/', 2)[1] ?? normalized);
  }

  const tokens = new Set<string>();
  for (const candidate of candidates) {
    const token = candidate.replace(/^x-/, '');
    if (token === 'csv' || token.includes('csv')) {
      tokens.add('csv');
      continue;
    }
    if (token === 'geojson' || token.includes('geo+json')) {
      tokens.add('geojson');
      tokens.add('json');
      continue;
    }
    if (token === 'json' || token.endsWith('/json') || token.endsWith('+json')) {
      tokens.add('json');
      continue;
    }
    if (token === 'jpg' || token === 'jpeg' || token.includes('jpeg')) {
      tokens.add('jpg');
      tokens.add('jpeg');
      continue;
    }
    if (token === 'png' || token.includes('png')) {
      tokens.add('png');
      continue;
    }
    if (
      token === 'tif' ||
      token === 'tiff' ||
      token === 'geotiff' ||
      token.includes('tiff') ||
      token.includes('geotiff')
    ) {
      tokens.add('geotiff');
      tokens.add('tif');
      tokens.add('tiff');
      continue;
    }
    if (token === 'zip' || token.includes('zip')) {
      tokens.add('zip');
      continue;
    }
    tokens.add(token);
  }

  return [...tokens];
}

function datasetFormats(datasetVersion: DatasetVersionSummary): string[] {
  const metadata = datasetVersion.metadata ?? {};
  const fileName =
    metadataString(metadata, 'original_file_name', 'originalFileName') || datasetVersion.assetPath;
  const contentType = metadataString(metadata, 'content_type', 'contentType');
  const formatHint = metadataString(metadata, 'format', 'file_format', 'fileFormat');
  const tokens = new Set<string>();

  const lastSegment = fileName.split(/[\\/]/).pop() ?? fileName;
  const suffix = lastSegment.includes('.') ? lastSegment.split('.').pop() ?? '' : '';
  if (suffix) {
    for (const token of canonicalFormatTokens(suffix)) {
      tokens.add(token);
    }
  }
  for (const token of canonicalFormatTokens(contentType)) {
    tokens.add(token);
  }
  for (const token of canonicalFormatTokens(formatHint)) {
    tokens.add(token);
  }

  return [...tokens];
}

function datasetColumns(datasetVersion: DatasetVersionSummary): string[] {
  const columns = datasetVersion.metadata?.columns;
  if (!Array.isArray(columns)) {
    return [];
  }
  return columns
    .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
    .filter(Boolean);
}

function normalizedSemanticValues(values: string[]): Set<string> {
  return new Set(values.map((value) => normalizeSemanticToken(value)).filter(Boolean));
}

export function getDatasetSemantics(
  context: WorkflowDatasetContext,
  datasetVersionId: string,
): WorkflowDatasetSemantics | undefined {
  const datasetVersion = context.datasetVersions.find((item) => item.id === datasetVersionId);
  if (!datasetVersion) {
    return undefined;
  }
  const dataset = context.datasets.find((item) => item.id === datasetVersion.datasetId);
  return {
    datasetKind: dataset?.kind,
    formats: datasetFormats(datasetVersion),
    columns: datasetColumns(datasetVersion),
    taskTypes: metadataSemanticValues(
      datasetVersion.metadata,
      'taskType',
      'task_type',
      'taskTypes',
      'task_types',
    ) as WorkflowSemanticTaskType[],
    annotationKinds: metadataSemanticValues(
      datasetVersion.metadata,
      'annotationKind',
      'annotation_kind',
      'annotationKinds',
      'annotation_kinds',
    ) as WorkflowAnnotationKind[],
    sampleKinds: metadataSemanticValues(
      datasetVersion.metadata,
      'sampleKind',
      'sample_kind',
      'sampleKinds',
      'sample_kinds',
    ) as WorkflowSampleKind[],
    valueTypes: metadataSemanticValues(
      datasetVersion.metadata,
      'valueType',
      'value_type',
      'valueTypes',
      'value_types',
    ) as WorkflowValueType[],
  };
}

function contractFormats(contract: WorkflowPortContract): string[] {
  const tokens = new Set<string>();
  for (const format of contract.fileFormats ?? []) {
    for (const token of canonicalFormatTokens(format)) {
      tokens.add(token);
    }
  }
  return [...tokens];
}

export function summarizePortContract(contract: WorkflowPortContract): string {
  return contract.summary;
}

function semanticRequirementReason(
  actual: string[],
  expected: string[] | undefined,
  label: string,
): string | undefined {
  const normalizedExpected = normalizedSemanticValues(expected ?? []);
  if (!normalizedExpected.size) {
    return undefined;
  }
  if (!actual.length) {
    return `${label} metadata is missing; expected one of ${(expected ?? []).join(', ')}`;
  }
  const normalizedActual = normalizedSemanticValues(actual);
  for (const token of normalizedActual) {
    if (normalizedExpected.has(token)) {
      return undefined;
    }
  }
  return `${label} ${actual.join(', ')} does not satisfy ${(expected ?? []).join(', ')}`;
}

export function datasetMatchesPortContract(
  context: WorkflowDatasetContext,
  datasetVersionId: string,
  contract: WorkflowPortContract,
): { ok: boolean; reasons: string[] } {
  const semantics = getDatasetSemantics(context, datasetVersionId);
  if (!semantics) {
    return { ok: false, reasons: ['dataset version not found'] };
  }

  const reasons: string[] = [];
  const expectedKinds = contract.datasetKinds ?? [];
  if (expectedKinds.length) {
    if (!semantics.datasetKind) {
      reasons.push(`dataset kind is missing; expected one of ${expectedKinds.join(', ')}`);
    } else if (!expectedKinds.includes(semantics.datasetKind)) {
      reasons.push(`dataset kind ${semantics.datasetKind} is not one of ${expectedKinds.join(', ')}`);
    }
  }

  const expectedFormats = contractFormats(contract);
  if (expectedFormats.length) {
    const availableFormats = new Set(semantics.formats);
    if (!availableFormats.size) {
      reasons.push(`file format metadata is missing; expected one of ${expectedFormats.join(', ')}`);
    } else if (!expectedFormats.some((format) => availableFormats.has(format))) {
      reasons.push(
        `file format ${semantics.formats.join(', ')} is not compatible with ${expectedFormats.join(', ')}`,
      );
    }
  }

  const expectedColumns = contract.columnRequirements ?? [];
  if (expectedColumns.length) {
    if (!semantics.columns.length) {
      reasons.push(`column metadata is missing; expected columns: ${expectedColumns.join(', ')}`);
    } else {
      const availableColumns = new Set(semantics.columns);
      const missingColumns = expectedColumns.filter((column) => !availableColumns.has(column));
      if (missingColumns.length) {
        reasons.push(`missing columns: ${missingColumns.join(', ')}`);
      }
    }
  }

  const taskTypeReason = semanticRequirementReason(semantics.taskTypes, contract.taskTypes, 'task types');
  if (taskTypeReason) {
    reasons.push(taskTypeReason);
  }

  const annotationKindReason = semanticRequirementReason(
    semantics.annotationKinds,
    contract.annotationKinds,
    'annotation kinds',
  );
  if (annotationKindReason) {
    reasons.push(annotationKindReason);
  }

  const sampleKindReason = semanticRequirementReason(
    semantics.sampleKinds,
    contract.sampleKinds,
    'sample kinds',
  );
  if (sampleKindReason) {
    reasons.push(sampleKindReason);
  }

  const valueTypeReason = semanticRequirementReason(semantics.valueTypes, contract.valueTypes, 'value types');
  if (valueTypeReason) {
    reasons.push(valueTypeReason);
  }

  return { ok: reasons.length === 0, reasons };
}

function contractSemanticRequirementReason(
  sourceValues: string[] | undefined,
  targetValues: string[] | undefined,
  label: string,
): string | undefined {
  const normalizedTarget = normalizedSemanticValues(targetValues ?? []);
  if (!normalizedTarget.size) {
    return undefined;
  }
  const normalizedSource = normalizedSemanticValues(sourceValues ?? []);
  if (!normalizedSource.size) {
    return `${label} are not declared by the upstream contract; expected ${(targetValues ?? []).join(', ')}`;
  }
  for (const token of normalizedSource) {
    if (normalizedTarget.has(token)) {
      return undefined;
    }
  }
  return `${label} ${(sourceValues ?? []).join(', ')} do not satisfy ${(targetValues ?? []).join(', ')}`;
}

export function arePortContractsCompatible(
  sourceContract: WorkflowPortContract,
  targetContract: WorkflowPortContract,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const sourceKinds = sourceContract.datasetKinds ?? [];
  const targetKinds = targetContract.datasetKinds ?? [];
  if (targetKinds.length) {
    if (!sourceKinds.length) {
      reasons.push(`dataset kinds are not declared by the upstream contract; expected ${targetKinds.join(', ')}`);
    } else if (!sourceKinds.some((kind) => targetKinds.includes(kind))) {
      reasons.push(`dataset kinds ${sourceKinds.join(', ')} do not satisfy ${targetKinds.join(', ')}`);
    }
  }

  const sourceFormats = contractFormats(sourceContract);
  const targetFormats = contractFormats(targetContract);
  if (targetFormats.length) {
    if (!sourceFormats.length) {
      reasons.push(`file formats are not declared by the upstream contract; expected ${targetFormats.join(', ')}`);
    } else if (!sourceFormats.some((format) => targetFormats.includes(format))) {
      reasons.push(`file formats ${sourceFormats.join(', ')} do not satisfy ${targetFormats.join(', ')}`);
    }
  }

  const producedColumns = sourceContract.producedColumns ?? [];
  const requiredColumns = targetContract.columnRequirements ?? [];
  if (requiredColumns.length) {
    if (!producedColumns.length) {
      reasons.push(`upstream contract does not declare produced columns; expected ${requiredColumns.join(', ')}`);
    } else {
      const missingColumns = requiredColumns.filter((column) => !producedColumns.includes(column));
      if (missingColumns.length) {
        reasons.push(`missing output columns ${missingColumns.join(', ')}`);
      }
    }
  }

  const taskTypeReason = contractSemanticRequirementReason(
    sourceContract.taskTypes,
    targetContract.taskTypes,
    'task types',
  );
  if (taskTypeReason) {
    reasons.push(taskTypeReason);
  }

  const annotationKindReason = contractSemanticRequirementReason(
    sourceContract.annotationKinds,
    targetContract.annotationKinds,
    'annotation kinds',
  );
  if (annotationKindReason) {
    reasons.push(annotationKindReason);
  }

  const sampleKindReason = contractSemanticRequirementReason(
    sourceContract.sampleKinds,
    targetContract.sampleKinds,
    'sample kinds',
  );
  if (sampleKindReason) {
    reasons.push(sampleKindReason);
  }

  const valueTypeReason = contractSemanticRequirementReason(
    sourceContract.valueTypes,
    targetContract.valueTypes,
    'value types',
  );
  if (valueTypeReason) {
    reasons.push(valueTypeReason);
  }

  return { ok: reasons.length === 0, reasons };
}
