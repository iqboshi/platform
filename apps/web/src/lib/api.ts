import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowRunSummary,
  WorkflowVersionDetail,
} from '@platform/types';

import { platformMock } from '@/mocks/platform';

export interface PlatformDataSnapshot {
  workspace: WorkspaceSummary;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  workflowCatalog: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
  workflowRuns: WorkflowRunSummary[];
  modelVersions: ModelVersionSummary[];
  source: 'api' | 'mock';
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

type ApiRecord = Record<string, unknown>;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
  return (await response.json()) as T;
}

function getString(record: ApiRecord, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function getOptionalString(record: ApiRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getOptionalNumber(record: ApiRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function getBBox(record: ApiRecord): [number, number, number, number] | undefined {
  const value = record.bbox;
  if (Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')) {
    return value as [number, number, number, number];
  }
  return undefined;
}

function normalizeWorkspaceSummary(input: ApiRecord): WorkspaceSummary {
  return {
    id: getString(input, 'id'),
    name: getString(input, 'name'),
    slug: getString(input, 'slug'),
    description: getString(input, 'description'),
    memberCount:
      getOptionalNumber(input, 'memberCount') ?? getOptionalNumber(input, 'member_count') ?? 0,
  };
}

function normalizeDatasetSummary(input: ApiRecord): DatasetSummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    name: getString(input, 'name'),
    kind: getString(input, 'kind') as DatasetSummary['kind'],
    status: getString(input, 'status') as DatasetSummary['status'],
    bands: getOptionalNumber(input, 'bands'),
    projection: getOptionalString(input, 'projection'),
    footprint: getOptionalString(input, 'footprint'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeDatasetVersionSummary(input: ApiRecord): DatasetVersionSummary {
  return {
    id: getString(input, 'id'),
    datasetId: getString(input, 'datasetId') || getString(input, 'dataset_id'),
    version: getOptionalNumber(input, 'version') ?? 1,
    status: getString(input, 'status') as DatasetVersionSummary['status'],
    assetPath: getString(input, 'assetPath') || getString(input, 'asset_path'),
    previewUrl: getOptionalString(input, 'previewUrl') ?? getOptionalString(input, 'preview_url'),
    bbox: getBBox(input),
    metadata: (input.metadata as Record<string, unknown> | undefined) ?? {},
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeWorkflowVersion(input: ApiRecord): WorkflowVersionDetail {
  const graph = (input.graph as ApiRecord | undefined) ?? {};
  const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as ApiRecord[]) : [];
  const rawEdges = Array.isArray(graph.edges) ? (graph.edges as ApiRecord[]) : [];

  return {
    id: getString(input, 'id'),
    workflowId: getString(input, 'workflowId') || getString(input, 'workflow_id'),
    version: getOptionalNumber(input, 'version') ?? 1,
    graph: {
      nodes: rawNodes.map((node) => ({
        id: getString(node, 'id'),
        type: getString(node, 'type'),
        position: (node.position as { x: number; y: number } | undefined) ?? { x: 0, y: 0 },
        params: (node.params as Record<string, unknown> | undefined) ?? {},
        inputBindings:
          (node.inputBindings as Record<string, string> | undefined) ??
          (node.input_bindings as Record<string, string> | undefined) ??
          {},
        outputDefs:
          (node.outputDefs as WorkflowVersionDetail['graph']['nodes'][number]['outputDefs']) ??
          (node.output_defs as WorkflowVersionDetail['graph']['nodes'][number]['outputDefs']) ??
          [],
      })),
      edges: rawEdges.map((edge) => ({
        id: getString(edge, 'id'),
        source: getString(edge, 'source'),
        target: getString(edge, 'target'),
        sourceHandle: getOptionalString(edge, 'sourceHandle') ?? getOptionalString(edge, 'source_handle'),
        targetHandle: getOptionalString(edge, 'targetHandle') ?? getOptionalString(edge, 'target_handle'),
      })),
    },
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeWorkflowRun(input: ApiRecord): WorkflowRunSummary {
  return {
    id: getString(input, 'id'),
    workflowVersionId: getString(input, 'workflowVersionId') || getString(input, 'workflow_version_id'),
    status: getString(input, 'status') as WorkflowRunSummary['status'],
    startedAt: getOptionalString(input, 'startedAt') ?? getOptionalString(input, 'started_at'),
    finishedAt: getOptionalString(input, 'finishedAt') ?? getOptionalString(input, 'finished_at'),
    submittedBy: getString(input, 'submittedBy') || getString(input, 'submitted_by'),
  };
}

function normalizeModelVersion(input: ApiRecord): ModelVersionSummary {
  return {
    id: getString(input, 'id'),
    modelId: getString(input, 'modelId') || getString(input, 'model_id'),
    version: getString(input, 'version'),
    framework: getString(input, 'framework'),
    taskType: getString(input, 'taskType') || getString(input, 'task_type'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

export async function loadPlatformData(): Promise<PlatformDataSnapshot> {
  try {
    const [workspaces, datasets, datasetVersions, workflowCatalog, workflowVersion, workflowRuns, modelVersions] =
      await Promise.all([
        fetchJson<ApiRecord[]>('/workspaces'),
        fetchJson<ApiRecord[]>('/datasets'),
        fetchJson<ApiRecord[]>('/dataset-versions'),
        fetchJson<WorkflowNodeCatalogItem[]>('/workflows/catalog'),
        fetchJson<ApiRecord>('/workflows/versions/current'),
        fetchJson<ApiRecord[]>('/workflow-runs'),
        fetchJson<ApiRecord[]>('/models/versions'),
      ]);

    return {
      workspace: normalizeWorkspaceSummary(workspaces[0]),
      datasets: datasets.map(normalizeDatasetSummary),
      datasetVersions: datasetVersions.map(normalizeDatasetVersionSummary),
      workflowCatalog,
      workflowVersion: normalizeWorkflowVersion(workflowVersion),
      workflowRuns: workflowRuns.map(normalizeWorkflowRun),
      modelVersions: modelVersions.map(normalizeModelVersion),
      source: 'api',
    };
  } catch {
    return {
      ...platformMock,
      source: 'mock',
    };
  }
}
