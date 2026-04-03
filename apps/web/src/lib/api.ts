import type {
  AuthTokenResponse,
  AuthUser,
  DatasetKind,
  DatasetSummary,
  DatasetVersionSummary,
  LocaleCode,
  ModelVersionSummary,
  PendingUserSummary,
  RegisterPayload,
  RegisterResponse,
  RoleKey,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowRunSummary,
  WorkflowVersionDetail,
} from '@platform/types';

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

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, options: { status: number; code: string }) {
    super(message);
    this.status = options.status;
    this.code = options.code;
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000/api/v1';

type ApiRecord = Record<string, unknown>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  body?: Record<string, unknown> | FormData;
  token?: string;
}

function buildHeaders(options: RequestOptions): HeadersInit {
  const isFormData = options.body instanceof FormData;
  return {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  };
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: buildHeaders(options),
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });

  if (!response.ok) {
    let message = `Request failed: ${path}`;
    let code = 'request_failed';
    try {
      const payload = (await response.json()) as { detail?: string | { code?: string; message?: string } };
      if (typeof payload.detail === 'string') {
        message = payload.detail;
      } else if (payload.detail) {
        message = payload.detail.message ?? message;
        code = payload.detail.code ?? code;
      }
    } catch {
      // Keep the default message when the response body is not JSON.
    }
    throw new ApiError(message, { status: response.status, code });
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

function getStringArray<T extends string>(record: ApiRecord, key: string): T[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is T => typeof item === 'string');
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
        sourceHandle:
          getOptionalString(edge, 'sourceHandle') ?? getOptionalString(edge, 'source_handle'),
        targetHandle:
          getOptionalString(edge, 'targetHandle') ?? getOptionalString(edge, 'target_handle'),
      })),
    },
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeWorkflowRun(input: ApiRecord): WorkflowRunSummary {
  return {
    id: getString(input, 'id'),
    workflowVersionId:
      getString(input, 'workflowVersionId') || getString(input, 'workflow_version_id'),
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

function normalizeAuthUser(input: ApiRecord): AuthUser {
  return {
    id: getString(input, 'id'),
    email: getString(input, 'email'),
    displayName: getString(input, 'displayName') || getString(input, 'display_name'),
    role: getString(input, 'role') as AuthUser['role'],
    approvalStatus: (
      getString(input, 'approvalStatus') || getString(input, 'approval_status')
    ) as AuthUser['approvalStatus'],
    preferredLocale:
      (getString(input, 'preferredLocale') || getString(input, 'preferred_locale')) as LocaleCode,
    permissions: getStringArray<AuthUser['permissions'][number]>(input, 'permissions'),
  };
}

function normalizeTokenResponse(input: ApiRecord): AuthTokenResponse {
  return {
    accessToken: getString(input, 'accessToken') || getString(input, 'access_token'),
    tokenType: getString(input, 'tokenType') || getString(input, 'token_type'),
    user: normalizeAuthUser((input.user as ApiRecord | undefined) ?? {}),
  };
}

function normalizeRegisterResponse(input: ApiRecord): RegisterResponse {
  return {
    userId: getString(input, 'userId') || getString(input, 'user_id'),
    approvalStatus:
      (getString(input, 'approvalStatus') || getString(input, 'approval_status')) as RegisterResponse['approvalStatus'],
    message: getString(input, 'message'),
  };
}

function normalizePendingUser(input: ApiRecord): PendingUserSummary {
  return {
    id: getString(input, 'id'),
    email: getString(input, 'email'),
    displayName: getString(input, 'displayName') || getString(input, 'display_name'),
    role: getString(input, 'role') as RoleKey,
    approvalStatus:
      (getString(input, 'approvalStatus') || getString(input, 'approval_status')) as PendingUserSummary['approvalStatus'],
    preferredLocale:
      (getString(input, 'preferredLocale') || getString(input, 'preferred_locale')) as LocaleCode,
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function toWorkflowValidationPayload(workflowVersion: WorkflowVersionDetail): Record<string, unknown> {
  return {
    nodes: workflowVersion.graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      params: node.params,
      input_bindings: node.inputBindings,
      output_defs: node.outputDefs,
    })),
    edges: workflowVersion.graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      source_handle: edge.sourceHandle,
      target_handle: edge.targetHandle,
    })),
  };
}

export async function login(credentials: {
  email: string;
  password: string;
}): Promise<AuthTokenResponse> {
  const payload = await requestJson<ApiRecord>('/auth/login', {
    method: 'POST',
    body: credentials,
  });
  return normalizeTokenResponse(payload);
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const response = await requestJson<ApiRecord>('/auth/register', {
    method: 'POST',
    body: {
      email: payload.email,
      display_name: payload.displayName,
      password: payload.password,
      preferred_locale: payload.preferredLocale,
    },
  });
  return normalizeRegisterResponse(response);
}

export async function logout(token: string): Promise<void> {
  await requestJson<ApiRecord>('/auth/logout', {
    method: 'POST',
    token,
  });
}

export async function loadCurrentUser(token: string): Promise<AuthUser> {
  const payload = await requestJson<ApiRecord>('/auth/me', { token });
  return normalizeAuthUser(payload);
}

export async function listPendingUsers(token: string): Promise<PendingUserSummary[]> {
  const payload = await requestJson<ApiRecord[]>('/auth/pending-users', { token });
  return payload.map(normalizePendingUser);
}

export async function approvePendingUser(
  token: string,
  userId: string,
  role: RoleKey,
): Promise<AuthUser> {
  const payload = await requestJson<ApiRecord>(`/auth/approve/${userId}`, {
    method: 'POST',
    token,
    body: { role },
  });
  return normalizeAuthUser(payload);
}

export async function rejectPendingUser(token: string, userId: string): Promise<AuthUser> {
  const payload = await requestJson<ApiRecord>(`/auth/reject/${userId}`, {
    method: 'POST',
    token,
  });
  return normalizeAuthUser(payload);
}

export async function createDemoUploadSession(
  token: string,
  workspaceId: string,
): Promise<{ objectKey: string; uploadUrl: string }> {
  const payload = await requestJson<ApiRecord>('/datasets/upload-session', {
    method: 'POST',
    token,
    body: {
      workspace_id: workspaceId,
      dataset_name: 'Demo Upload Request',
      kind: 'raster',
      file_name: 'demo-upload.tif',
      content_type: 'image/tiff',
      size_bytes: 4096,
    },
  });
  return {
    objectKey: getString(payload, 'objectKey') || getString(payload, 'object_key'),
    uploadUrl: getString(payload, 'uploadUrl') || getString(payload, 'upload_url'),
  };
}

export async function uploadDataset(
  token: string,
  payload: {
    workspaceId: string;
    datasetName: string;
    kind: DatasetKind;
    file: File;
  },
): Promise<DatasetVersionSummary> {
  const formData = new FormData();
  formData.append('workspace_id', payload.workspaceId);
  formData.append('dataset_name', payload.datasetName);
  formData.append('kind', payload.kind);
  formData.append('file', payload.file);

  const response = await requestJson<ApiRecord>('/datasets/upload', {
    method: 'POST',
    token,
    body: formData,
  });
  return normalizeDatasetVersionSummary(response);
}

export async function saveWorkflowVersion(
  token: string,
  workflowVersion: WorkflowVersionDetail,
): Promise<WorkflowVersionDetail> {
  const payload = await requestJson<ApiRecord>('/workflows/versions/current', {
    method: 'PUT',
    token,
    body: toWorkflowValidationPayload(workflowVersion),
  });
  return normalizeWorkflowVersion(payload);
}

export function getDatasetDownloadUrl(datasetVersionId: string): string {
  return `${apiBaseUrl}/dataset-versions/${datasetVersionId}/download`;
}

export async function validateWorkflow(
  token: string,
  workflowVersion: WorkflowVersionDetail,
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const payload = await requestJson<ApiRecord>('/workflows/validate', {
    method: 'POST',
    token,
    body: toWorkflowValidationPayload(workflowVersion),
  });
  return {
    valid: Boolean(payload.valid),
    errors: getStringArray<string>(payload, 'errors'),
    warnings: getStringArray<string>(payload, 'warnings'),
  };
}

export async function createWorkflowRun(
  token: string,
  workflowVersion: WorkflowVersionDetail,
  datasetVersionId: string,
  modelVersionId: string,
  workspaceId: string,
): Promise<WorkflowRunSummary> {
  const payload = await requestJson<ApiRecord>('/workflow-runs', {
    method: 'POST',
    token,
    body: {
      workflow_version_id: workflowVersion.id,
      workspace_id: workspaceId,
      model_version_id: modelVersionId,
      input_dataset_version_id: datasetVersionId,
      priority: 5,
    },
  });
  return normalizeWorkflowRun(payload);
}

export async function loadPlatformData(
  token: string,
  options: { includeModels: boolean },
): Promise<PlatformDataSnapshot> {
  const baseRequests = [
    requestJson<ApiRecord[]>('/workspaces', { token }),
    requestJson<ApiRecord[]>('/datasets', { token }),
    requestJson<ApiRecord[]>('/dataset-versions', { token }),
    requestJson<WorkflowNodeCatalogItem[]>('/workflows/catalog', { token }),
    requestJson<ApiRecord>('/workflows/versions/current', { token }),
    requestJson<ApiRecord[]>('/workflow-runs', { token }),
  ] as const;

  const [
    workspaces,
    datasets,
    datasetVersions,
    workflowCatalog,
    workflowVersion,
    workflowRuns,
  ] = await Promise.all(baseRequests);

  const modelVersions = options.includeModels
    ? await requestJson<ApiRecord[]>('/models/versions', { token })
    : [];

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
}
