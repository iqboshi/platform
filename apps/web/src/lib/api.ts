import type {
  AssetScope,
  AuthTokenResponse,
  AuthUser,
  DatasetKind,
  DatasetSummary,
  DatasetVisibility,
  DatasetVersionSummary,
  LocaleCode,
  ModelVersionSummary,
  PendingUserSummary,
  RegisterPayload,
  RegisterResponse,
  RoleKey,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowParamDefinition,
  WorkflowParamOption,
  WorkflowPortDefinition,
  WorkflowRunSummary,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
  WorkflowVersionSummary,
} from '@platform/types';

export interface PlatformDataSnapshot {
  workspace: WorkspaceSummary;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  workflowCatalog: WorkflowNodeCatalogItem[];
  workflowTemplates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  workflowRuns: WorkflowRunSummary[];
  modelVersions: ModelVersionSummary[];
  source: 'api' | 'mock';
}

export interface AssetOverview {
  scope: AssetScope;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  workflowVersions: WorkflowVersionSummary[];
  workflowRuns: WorkflowRunSummary[];
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8002/api/v1';

type ApiRecord = Record<string, unknown>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
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

async function buildApiError(response: Response, path: string): Promise<ApiError> {
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
  return new ApiError(message, { status: response.status, code });
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
    throw await buildApiError(response, path);
  }

  return (await response.json()) as T;
}

function extractDownloadFileName(response: Response, fallbackFileName: string): string {
  const disposition = response.headers.get('content-disposition');
  if (!disposition) {
    return fallbackFileName;
  }

  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename\s*=\s*"([^"]+)"/i) ?? disposition.match(/filename\s*=\s*([^;]+)/i);
  return plainMatch?.[1]?.trim() || fallbackFileName;
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

function getOptionalBoolean(record: ApiRecord, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getPrimitiveValue(
  value: unknown,
): string | number | boolean | string[] | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? (value as string[])
    : undefined;
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
    isPrivate: getOptionalBoolean(input, 'isPrivate') ?? getOptionalBoolean(input, 'is_private'),
    bands: getOptionalNumber(input, 'bands'),
    projection: getOptionalString(input, 'projection'),
    footprint: getOptionalString(input, 'footprint'),
    visibility:
      (getOptionalString(input, 'visibility') as DatasetVisibility | undefined) ?? undefined,
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    latestVersionId:
      getOptionalString(input, 'latestVersionId') ??
      getOptionalString(input, 'latest_version_id'),
    latestVersionNumber:
      getOptionalNumber(input, 'latestVersionNumber') ??
      getOptionalNumber(input, 'latest_version_number'),
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
    isPrivate: getOptionalBoolean(input, 'isPrivate') ?? getOptionalBoolean(input, 'is_private'),
    visibility:
      (getOptionalString(input, 'visibility') as DatasetVisibility | undefined) ?? undefined,
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
  };
}

function normalizeWorkflowPort(input: ApiRecord): WorkflowPortDefinition {
  return {
    key: getString(input, 'key'),
    label: getString(input, 'label'),
    description: getOptionalString(input, 'description'),
    dataTypes:
      getStringArray<WorkflowPortDefinition['dataTypes'][number]>(input, 'dataTypes').length > 0
        ? getStringArray<WorkflowPortDefinition['dataTypes'][number]>(input, 'dataTypes')
        : getStringArray<WorkflowPortDefinition['dataTypes'][number]>(input, 'data_types'),
    required: Boolean(input.required),
  };
}

function normalizeWorkflowParamOption(input: ApiRecord): WorkflowParamOption {
  return {
    label: getString(input, 'label'),
    value: getString(input, 'value'),
  };
}

function normalizeWorkflowParamDefinition(input: ApiRecord): WorkflowParamDefinition {
  const rawOptions = Array.isArray(input.options) ? (input.options as ApiRecord[]) : [];

  return {
    key: getString(input, 'key'),
    label: getString(input, 'label'),
    fieldType:
      (getString(input, 'fieldType') ||
        getString(input, 'field_type')) as WorkflowParamDefinition['fieldType'],
    description: getOptionalString(input, 'description'),
    defaultValue: getPrimitiveValue(input.defaultValue ?? input.default_value),
    placeholder: getOptionalString(input, 'placeholder'),
    min: getOptionalNumber(input, 'min'),
    max: getOptionalNumber(input, 'max'),
    step: getOptionalNumber(input, 'step'),
    required: Boolean(input.required),
    options: rawOptions.map(normalizeWorkflowParamOption),
  };
}

function normalizeWorkflowCatalogItem(input: ApiRecord): WorkflowNodeCatalogItem {
  const rawInputs = Array.isArray(input.inputs) ? (input.inputs as ApiRecord[]) : [];
  const rawOutputs = Array.isArray(input.outputs) ? (input.outputs as ApiRecord[]) : [];
  const rawParams = Array.isArray(input.params) ? (input.params as ApiRecord[]) : [];

  return {
    type: getString(input, 'type'),
    label: getString(input, 'label'),
    category: getString(input, 'category') as WorkflowNodeCatalogItem['category'],
    description: getString(input, 'description'),
    runtimeKind:
      (getString(input, 'runtimeKind') ||
        getString(input, 'runtime_kind')) as WorkflowNodeCatalogItem['runtimeKind'],
    supportedTasks:
      getStringArray<WorkflowNodeCatalogItem['supportedTasks'][number]>(input, 'supportedTasks')
        .length > 0
        ? getStringArray<WorkflowNodeCatalogItem['supportedTasks'][number]>(input, 'supportedTasks')
        : getStringArray<WorkflowNodeCatalogItem['supportedTasks'][number]>(input, 'supported_tasks'),
    tags: getStringArray<string>(input, 'tags'),
    inputs: rawInputs.map(normalizeWorkflowPort),
    outputs: rawOutputs.map(normalizeWorkflowPort),
    params: rawParams.map(normalizeWorkflowParamDefinition),
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
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
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
        outputDefs: Array.isArray(node.outputDefs)
          ? (node.outputDefs as ApiRecord[]).map(normalizeWorkflowPort)
          : Array.isArray(node.output_defs)
            ? (node.output_defs as ApiRecord[]).map(normalizeWorkflowPort)
            : [],
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

function normalizeWorkflowVersionSummary(input: ApiRecord): WorkflowVersionSummary {
  const graph = (input.graph as ApiRecord | undefined) ?? {};
  const rawNodes = Array.isArray(graph.nodes) ? (graph.nodes as ApiRecord[]) : [];
  const rawEdges = Array.isArray(graph.edges) ? (graph.edges as ApiRecord[]) : [];

  return {
    id: getString(input, 'id'),
    workflowId: getString(input, 'workflowId') || getString(input, 'workflow_id'),
    version: getOptionalNumber(input, 'version') ?? 1,
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
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
        outputDefs: Array.isArray(node.outputDefs)
          ? (node.outputDefs as ApiRecord[]).map(normalizeWorkflowPort)
          : Array.isArray(node.output_defs)
            ? (node.output_defs as ApiRecord[]).map(normalizeWorkflowPort)
            : [],
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

function normalizeWorkflowTemplate(input: ApiRecord): WorkflowTemplateDefinition {
  const graph = normalizeWorkflowVersion({
    ...input,
    id: getString(input, 'id') || 'template-graph',
    workflowId: getString(input, 'id') || 'template',
    version: 1,
    createdAt: new Date().toISOString(),
  }).graph;
  const sampleBindingsRaw = Array.isArray(input.sampleBindings)
    ? (input.sampleBindings as ApiRecord[])
    : Array.isArray(input.sample_bindings)
      ? (input.sample_bindings as ApiRecord[])
      : [];

  return {
    id: getString(input, 'id'),
    label: getString(input, 'label'),
    description: getString(input, 'description'),
    tags: getStringArray<string>(input, 'tags'),
    supportedTasks:
      getStringArray<string>(input, 'supportedTasks').length > 0
        ? getStringArray<string>(input, 'supportedTasks')
        : getStringArray<string>(input, 'supported_tasks'),
    sampleBindings: sampleBindingsRaw.map((item) => ({
      nodeId: getString(item, 'nodeId') || getString(item, 'node_id'),
      params: (item.params as Record<string, unknown> | undefined) ?? {},
    })),
    graph,
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
    resultDatasetVersionId:
      getOptionalString(input, 'resultDatasetVersionId') ??
      getOptionalString(input, 'result_dataset_version_id'),
    metrics: (input.metrics as Record<string, unknown> | undefined) ?? {},
  };
}

function normalizeModelVersion(input: ApiRecord): ModelVersionSummary {
  return {
    id: getString(input, 'id'),
    modelId: getString(input, 'modelId') || getString(input, 'model_id'),
    modelName: getOptionalString(input, 'modelName') ?? getOptionalString(input, 'model_name'),
    algorithmKey:
      getOptionalString(input, 'algorithmKey') ?? getOptionalString(input, 'algorithm_key'),
    version: getString(input, 'version'),
    framework: getString(input, 'framework'),
    taskType: getString(input, 'taskType') || getString(input, 'task_type'),
    featureNames:
      getStringArray<string>(input, 'featureNames').length > 0
        ? getStringArray<string>(input, 'featureNames')
        : getStringArray<string>(input, 'feature_names'),
    defaultParameters:
      (input.defaultParameters as Record<string, unknown> | undefined) ??
      (input.default_parameters as Record<string, unknown> | undefined) ??
      {},
    artifactFormat:
      getOptionalString(input, 'artifactFormat') ?? getOptionalString(input, 'artifact_format'),
    metadata: (input.metadata as Record<string, unknown> | undefined) ?? {},
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
      output_defs: node.outputDefs.map((port) => ({
        key: port.key,
        label: port.label,
        description: port.description,
        data_types: port.dataTypes,
        required: port.required,
      })),
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

function withQuery(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `${path}?${query}` : path;
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

export async function updateDataset(
  token: string,
  datasetId: string,
  payload: {
    name?: string;
    visibility?: 'public' | 'private';
  },
): Promise<DatasetSummary> {
  const response = await requestJson<ApiRecord>(`/datasets/${datasetId}`, {
    method: 'PATCH',
    token,
    body: payload,
  });
  return normalizeDatasetSummary(response);
}

export async function deleteDataset(token: string, datasetId: string): Promise<void> {
  await requestJson<ApiRecord>(`/datasets/${datasetId}`, {
    method: 'DELETE',
    token,
  });
}

export async function uploadModelPackage(
  token: string,
  payload: {
    workspaceId: string;
    modelName: string;
    version: string;
    algorithmKey: string;
    taskType: string;
    framework?: string;
    featureNames?: string[];
    defaultParameters?: Record<string, unknown>;
    file: File;
  },
): Promise<ModelVersionSummary> {
  const formData = new FormData();
  formData.append('workspace_id', payload.workspaceId);
  formData.append('model_name', payload.modelName);
  formData.append('version', payload.version);
  formData.append('algorithm_key', payload.algorithmKey);
  formData.append('task_type', payload.taskType);
  formData.append('framework', payload.framework ?? '');
  formData.append('feature_names_json', JSON.stringify(payload.featureNames ?? []));
  formData.append(
    'default_parameters_json',
    JSON.stringify(payload.defaultParameters ?? {}),
  );
  formData.append('file', payload.file);

  const response = await requestJson<ApiRecord>('/models/upload', {
    method: 'POST',
    token,
    body: formData,
  });
  return normalizeModelVersion(response);
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

export async function importWorkflowVersion(
  token: string,
  workflowGraph: WorkflowVersionDetail['graph'],
): Promise<WorkflowVersionDetail> {
  const payload = await requestJson<ApiRecord>('/workflows/versions/import', {
    method: 'POST',
    token,
    body: {
      nodes: workflowGraph.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        params: node.params,
        input_bindings: node.inputBindings,
        output_defs: node.outputDefs.map((port) => ({
          key: port.key,
          label: port.label,
          description: port.description,
          data_types: port.dataTypes,
          required: port.required,
        })),
      })),
      edges: workflowGraph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        source_handle: edge.sourceHandle,
        target_handle: edge.targetHandle,
      })),
    },
  });
  return normalizeWorkflowVersion(payload);
}

export function getDatasetDownloadUrl(datasetVersionId: string): string {
  return `${apiBaseUrl}/dataset-versions/${datasetVersionId}/download`;
}

export async function downloadDatasetVersion(
  token: string,
  datasetVersionId: string,
  fallbackFileName = `dataset-${datasetVersionId}`,
): Promise<void> {
  const path = `/dataset-versions/${datasetVersionId}/download`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response, path);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = extractDownloadFileName(response, fallbackFileName);
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}

export async function listWorkflowVersions(
  token: string,
  scope: AssetScope = 'mine',
): Promise<WorkflowVersionSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/workflows/versions', { scope }),
    { token },
  );
  return payload.map(normalizeWorkflowVersionSummary);
}

export async function downloadWorkflowVersion(
  token: string,
  workflowVersionId: string,
  fallbackFileName = `workflow-${workflowVersionId}.json`,
): Promise<void> {
  const path = `/workflows/versions/${workflowVersionId}/download`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response, path);
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = extractDownloadFileName(response, fallbackFileName);
  anchor.click();
  window.URL.revokeObjectURL(objectUrl);
}

export async function deleteWorkflowVersion(
  token: string,
  workflowVersionId: string,
): Promise<void> {
  await requestJson<ApiRecord>(`/workflows/versions/${workflowVersionId}`, {
    method: 'DELETE',
    token,
  });
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
  workspaceId: string,
): Promise<WorkflowRunSummary> {
  const payload = await requestJson<ApiRecord>('/workflow-runs', {
    method: 'POST',
    token,
    body: {
      workflow_version_id: workflowVersion.id,
      workspace_id: workspaceId,
      priority: 5,
    },
  });
  return normalizeWorkflowRun(payload);
}

export async function loadAssetOverview(
  token: string,
  scope: AssetScope = 'mine',
): Promise<AssetOverview> {
  const [datasets, datasetVersions, workflowVersions, workflowRuns] = await Promise.all([
    requestJson<ApiRecord[]>(withQuery('/datasets', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/dataset-versions', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/workflows/versions', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/workflow-runs', { scope }), { token }),
  ]);

  return {
    scope,
    datasets: datasets.map(normalizeDatasetSummary),
    datasetVersions: datasetVersions.map(normalizeDatasetVersionSummary),
    workflowVersions: workflowVersions.map(normalizeWorkflowVersionSummary),
    workflowRuns: workflowRuns.map(normalizeWorkflowRun),
  };
}

export async function loadPlatformData(
  token: string,
  options: { includeModels: boolean },
): Promise<PlatformDataSnapshot> {
  const baseRequests = [
    requestJson<ApiRecord[]>('/workspaces', { token }),
    requestJson<ApiRecord[]>('/datasets', { token }),
    requestJson<ApiRecord[]>('/dataset-versions', { token }),
    requestJson<ApiRecord[]>('/workflows/catalog', { token }),
    requestJson<ApiRecord[]>('/workflows/templates', { token }),
    requestJson<ApiRecord>('/workflows/versions/current', { token }),
    requestJson<ApiRecord[]>('/workflow-runs', { token }),
  ] as const;

  const [
    workspaces,
    datasets,
    datasetVersions,
    workflowCatalog,
    workflowTemplates,
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
    workflowCatalog: workflowCatalog.map(normalizeWorkflowCatalogItem),
    workflowTemplates: workflowTemplates.map(normalizeWorkflowTemplate),
    workflowVersion: normalizeWorkflowVersion(workflowVersion),
    workflowRuns: workflowRuns.map(normalizeWorkflowRun),
    modelVersions: modelVersions.map(normalizeModelVersion),
    source: 'api',
  };
}
