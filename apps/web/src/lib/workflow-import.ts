import type { WorkflowPortDefinition, WorkflowVersionDetail } from '@platform/types';

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(record: ApiRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function getOptionalString(record: ApiRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getOptionalBoolean(record: ApiRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getStringMap(record: ApiRecord, key: string): Record<string, string> {
  const value = record[key];
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizePort(record: ApiRecord): WorkflowPortDefinition {
  const dataTypesRaw =
    (Array.isArray(record.dataTypes) ? record.dataTypes : undefined) ??
    (Array.isArray(record.data_types) ? record.data_types : []);

  return {
    key: getString(record, 'key'),
    label: getString(record, 'label'),
    description: getOptionalString(record, 'description'),
    dataTypes: dataTypesRaw.filter(
      (item): item is WorkflowPortDefinition['dataTypes'][number] => typeof item === 'string',
    ),
    required: getOptionalBoolean(record, 'required') ?? false,
  };
}

function normalizeNode(record: ApiRecord): WorkflowVersionDetail['graph']['nodes'][number] {
  const position = isRecord(record.position) ? record.position : {};
  const outputDefsRaw =
    (Array.isArray(record.outputDefs) ? record.outputDefs : undefined) ??
    (Array.isArray(record.output_defs) ? record.output_defs : []);

  return {
    id: getString(record, 'id'),
    type: getString(record, 'type'),
    position: {
      x: typeof position.x === 'number' ? position.x : 0,
      y: typeof position.y === 'number' ? position.y : 0,
    },
    params: isRecord(record.params) ? record.params : {},
    inputBindings: {
      ...getStringMap(record, 'inputBindings'),
      ...getStringMap(record, 'input_bindings'),
    },
    outputDefs: outputDefsRaw.filter(isRecord).map(normalizePort),
  };
}

function normalizeEdge(record: ApiRecord): WorkflowVersionDetail['graph']['edges'][number] {
  return {
    id: getString(record, 'id'),
    source: getString(record, 'source'),
    target: getString(record, 'target'),
    sourceHandle: getOptionalString(record, 'sourceHandle') ?? getOptionalString(record, 'source_handle'),
    targetHandle: getOptionalString(record, 'targetHandle') ?? getOptionalString(record, 'target_handle'),
  };
}

function extractGraphPayload(parsed: unknown): ApiRecord | null {
  if (!isRecord(parsed)) {
    return null;
  }

  const graph = parsed.graph;
  if (isRecord(graph) && Array.isArray(graph.nodes) && Array.isArray(graph.edges)) {
    return graph;
  }

  if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
    return parsed;
  }

  return null;
}

export function parseImportedWorkflowGraph(jsonText: string): WorkflowVersionDetail['graph'] {
  const parsed = JSON.parse(jsonText) as unknown;
  const graphPayload = extractGraphPayload(parsed);
  if (!graphPayload) {
    throw new Error('invalid_workflow_graph');
  }

  const nodes = Array.isArray(graphPayload.nodes) ? graphPayload.nodes.filter(isRecord).map(normalizeNode) : [];
  const edges = Array.isArray(graphPayload.edges) ? graphPayload.edges.filter(isRecord).map(normalizeEdge) : [];

  return { nodes, edges };
}
