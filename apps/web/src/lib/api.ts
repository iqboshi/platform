import type {
  AssetScope,
  AuthTokenResponse,
  AuthUser,
  DashboardAnnouncementItem,
  DashboardConfig,
  DashboardFeatureItem,
  DatasetKind,
  DatasetSummary,
  DatasetVisibility,
  DatasetVersionSummary,
  EmailSettingsSummary,
  EmailSettingsUpdatePayload,
  EmailCodeSendResult,
  EmailVerificationScene,
  FeedbackTicketCategory,
  FeedbackTicketPriority,
  FeedbackTicketStatus,
  FeedbackTicketSummary,
  FeedbackTicketSummaryCounts,
  GeeCredentialSummary,
  ImageCaptchaChallenge,
  LocaleCode,
  ModelVersionSummary,
  PasswordChangePayload,
  PendingUserSummary,
  ProductAssetSummary,
  RegisterPayload,
  RegisterResponse,
  RoleKey,
  RoleUpgradeRequestSummary,
  SpatialOverlayCreatePayload,
  SpatialOverlaySummary,
  SpatialOverlayUpdatePayload,
  SpatialRoiCreatePayload,
  SpatialRoiSummary,
  SpatialRoiUpdatePayload,
  UserProfileUpdatePayload,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowNodeExample,
  WorkflowNodePreviewValue,
  WorkflowNodeTestResult,
  WorkflowParamDefinition,
  WorkflowParamOption,
  WorkflowPortContract,
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
  geeCredentials: GeeCredentialSummary[];
  workflowCatalog: WorkflowNodeCatalogItem[];
  workflowTemplates: WorkflowTemplateDefinition[];
  workflowVersion: WorkflowVersionDetail;
  workflowRuns: WorkflowRunSummary[];
  modelVersions: ModelVersionSummary[];
  dashboardConfig: DashboardConfig;
  feedbackTickets: FeedbackTicketSummary[];
  feedbackSummary: FeedbackTicketSummaryCounts;
  source: 'api' | 'mock';
}

export interface AssetOverview {
  scope: AssetScope;
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  products: ProductAssetSummary[];
  geeCredentials: GeeCredentialSummary[];
  workflowVersions: WorkflowVersionSummary[];
  workflowRuns: WorkflowRunSummary[];
  modelVersions: ModelVersionSummary[];
  spatialRois: SpatialRoiSummary[];
  spatialOverlays: SpatialOverlaySummary[];
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

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8010/api/v1';

type ApiRecord = Record<string, unknown>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: Record<string, unknown> | FormData;
  token?: string;
}

function createFallbackDashboardConfig(): DashboardConfig {
  return {
    featureSections: [
      {
        id: 'public-datasets',
        titleZh: '公开数据集浏览',
        titleEn: 'Public Dataset Catalog',
        summaryZh: '集中浏览公开数据集、查看简介并快速下载可用版本。',
        summaryEn:
          'Browse published datasets, review curated descriptions, and download usable versions quickly.',
        buttonLabelZh: '进入数据集',
        buttonLabelEn: 'Open catalog',
        href: '/datasets',
        iconKey: 'datasets',
        enabled: true,
      },
      {
        id: 'visual-workflows',
        titleZh: '可视化工作流编排',
        titleEn: 'Visual Workflow Builder',
        summaryZh: '用节点化方式组织数据处理、模型推理和结果导出流程。',
        summaryEn:
          'Compose data preparation, model inference, and export steps through a visual node graph.',
        buttonLabelZh: '打开工作流',
        buttonLabelEn: 'Open workflows',
        href: '/workflows',
        iconKey: 'workflows',
        enabled: true,
      },
      {
        id: 'model-assets',
        titleZh: '模型资产中心',
        titleEn: 'Model Asset Center',
        summaryZh: '统一管理平台模型、训练产物和外部 API 模型接入信息。',
        summaryEn:
          'Manage packaged models, trained weights, and external API model registrations in one place.',
        buttonLabelZh: '查看模型',
        buttonLabelEn: 'View models',
        href: '/models',
        iconKey: 'models',
        enabled: true,
      },
      {
        id: 'personal-assets',
        titleZh: '个人资产管理',
        titleEn: 'Personal Asset Control',
        summaryZh: '统一查看和维护个人数据集、结果、工作流与凭证资产。',
        summaryEn:
          'Review and manage your datasets, results, workflows, and credentials from a single workspace view.',
        buttonLabelZh: '进入个人资产',
        buttonLabelEn: 'Open my assets',
        href: '/assets',
        iconKey: 'assets',
        enabled: true,
      },
    ],
    announcements: [
      {
        id: 'ops-portal-upgrade',
        titleZh: '总览页升级为运营门户',
        titleEn: 'Overview Upgraded to an Operations Portal',
        summaryZh: '新的首页聚合了能力介绍、更新公告、快速入口和反馈工作台。',
        summaryEn:
          'The new landing page brings together product highlights, updates, quick actions, and a feedback workbench.',
        contentZh:
          '总览页已经升级为更适合团队协作的运营门户，可直接查看平台能力、更新公告与反馈工单。',
        contentEn:
          'The overview page now acts as an operations-style portal with product highlights, updates, and feedback workflows.',
        tagZh: '平台更新',
        tagEn: 'Platform Update',
        publishedAt: '2026-04-05',
        pinned: true,
        published: true,
      },
      {
        id: 'feedback-workbench-live',
        titleZh: '意见反馈工作台已启用',
        titleEn: 'Feedback Workbench is Live',
        summaryZh: '成员可以提交问题、需求和体验建议，管理员可统一跟进处理。',
        summaryEn:
          'Members can file bugs, requests, and UX notes while administrators triage and respond.',
        contentZh:
          '首页新增完整反馈工单入口，支持提交问题、查看状态以及管理员回复。',
        contentEn:
          'The dashboard now includes a full feedback ticket workflow for submission, tracking, and administrator responses.',
        tagZh: '协作',
        tagEn: 'Collaboration',
        publishedAt: '2026-04-05',
        pinned: false,
        published: true,
      },
    ],
  };
}

function emptyFeedbackSummary(): FeedbackTicketSummaryCounts {
  return {
    myOpenCount: 0,
    myActiveCount: 0,
    adminOpenCount: 0,
    adminInProgressCount: 0,
  };
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

async function requestBlob(path: string, token: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response, path);
  }

  return response.blob();
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
    description: getOptionalString(input, 'description'),
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

function normalizeSpatialRoiSummary(input: ApiRecord): SpatialRoiSummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId: getString(input, 'ownerUserId') || getString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    name: getString(input, 'name'),
    description: getOptionalString(input, 'description'),
    geometryType:
      (getString(input, 'geometryType') ||
        getString(input, 'geometry_type')) as SpatialRoiSummary['geometryType'],
    geometry: (input.geometry as Record<string, unknown> | undefined) ?? {},
    bbox:
      getBBox(input) ??
      ([0, 0, 0, 0] as SpatialRoiSummary['bbox']),
    style: (input.style as Record<string, unknown> | undefined) ?? {},
    tags:
      getStringArray<string>(input, 'tags').length > 0
        ? getStringArray<string>(input, 'tags')
        : [],
    visibility:
      (getOptionalString(input, 'visibility') as SpatialRoiSummary['visibility'] | undefined) ??
      'private',
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeSpatialOverlaySummary(input: ApiRecord): SpatialOverlaySummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId: getString(input, 'ownerUserId') || getString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    datasetVersionId:
      getString(input, 'datasetVersionId') || getString(input, 'dataset_version_id'),
    datasetId: getString(input, 'datasetId') || getString(input, 'dataset_id'),
    datasetName: getString(input, 'datasetName') || getString(input, 'dataset_name'),
    datasetKind:
      (getString(input, 'datasetKind') ||
        getString(input, 'dataset_kind')) as SpatialOverlaySummary['datasetKind'],
    datasetVersionNumber:
      getOptionalNumber(input, 'datasetVersionNumber') ??
      getOptionalNumber(input, 'dataset_version_number') ??
      1,
    originalFileName:
      getOptionalString(input, 'originalFileName') ??
      getOptionalString(input, 'original_file_name'),
    contentType:
      getOptionalString(input, 'contentType') ?? getOptionalString(input, 'content_type'),
    bbox: getBBox(input),
    previewUrl: getOptionalString(input, 'previewUrl') ?? getOptionalString(input, 'preview_url'),
    name: getString(input, 'name'),
    description: getOptionalString(input, 'description'),
    overlayType:
      (getString(input, 'overlayType') ||
        getString(input, 'overlay_type')) as SpatialOverlaySummary['overlayType'],
    opacity: getOptionalNumber(input, 'opacity') ?? 0.85,
    style: (input.style as Record<string, unknown> | undefined) ?? {},
    visibility:
      (getOptionalString(input, 'visibility') as SpatialOverlaySummary['visibility'] | undefined) ??
      'private',
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeProductAssetSummary(input: ApiRecord): ProductAssetSummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId: getString(input, 'ownerUserId') || getString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    name: getString(input, 'name'),
    description: getOptionalString(input, 'description'),
    category: getOptionalString(input, 'category'),
    tags: getStringArray<string>(input, 'tags'),
    highlights: getStringArray<string>(input, 'highlights'),
    specifications:
      (input.specifications as Record<string, string> | undefined) ??
      ((input.specifications_json as Record<string, string> | undefined) ?? {}),
    visibility:
      (getOptionalString(input, 'visibility') as ProductAssetSummary['visibility'] | undefined) ??
      'private',
    assetPath: getString(input, 'assetPath') || getString(input, 'asset_path'),
    originalFileName:
      getString(input, 'originalFileName') || getString(input, 'original_file_name'),
    contentType: getString(input, 'contentType') || getString(input, 'content_type'),
    sizeBytes: getOptionalNumber(input, 'sizeBytes') ?? getOptionalNumber(input, 'size_bytes') ?? 0,
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeGeeCredentialSummary(input: ApiRecord): GeeCredentialSummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id') ?? '',
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
    name: getString(input, 'name'),
    provider: getString(input, 'provider') || 'gee',
    description: getOptionalString(input, 'description'),
    projectId: getOptionalString(input, 'projectId') ?? getOptionalString(input, 'project_id'),
    serviceAccountEmail:
      getOptionalString(input, 'serviceAccountEmail') ??
      getOptionalString(input, 'service_account_email'),
    isPlatformDefault:
      getOptionalBoolean(input, 'isPlatformDefault') ??
      getOptionalBoolean(input, 'is_platform_default'),
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

function normalizeWorkflowPortContract(input: ApiRecord): WorkflowPortContract {
  return {
    portKey: getString(input, 'portKey') || getString(input, 'port_key'),
    summary: getString(input, 'summary'),
    datasetKinds:
      getStringArray<DatasetKind>(input, 'datasetKinds').length > 0
        ? getStringArray<DatasetKind>(input, 'datasetKinds')
        : getStringArray<DatasetKind>(input, 'dataset_kinds'),
    fileFormats:
      getStringArray<string>(input, 'fileFormats').length > 0
        ? getStringArray<string>(input, 'fileFormats')
        : getStringArray<string>(input, 'file_formats'),
    columnRequirements:
      getStringArray<string>(input, 'columnRequirements').length > 0
        ? getStringArray<string>(input, 'columnRequirements')
        : getStringArray<string>(input, 'column_requirements'),
    sampleColumns:
      getStringArray<string>(input, 'sampleColumns').length > 0
        ? getStringArray<string>(input, 'sampleColumns')
        : getStringArray<string>(input, 'sample_columns'),
    producedColumns:
      getStringArray<string>(input, 'producedColumns').length > 0
        ? getStringArray<string>(input, 'producedColumns')
        : getStringArray<string>(input, 'produced_columns'),
    notes: getStringArray<string>(input, 'notes'),
  };
}

function normalizeWorkflowNodeExample(input: ApiRecord): WorkflowNodeExample {
  const rawRows = Array.isArray(input.rows) ? input.rows : [];

  return {
    title: getString(input, 'title'),
    kind: (getString(input, 'kind') || 'text') as WorkflowNodeExample['kind'],
    portKey: getOptionalString(input, 'portKey') ?? getOptionalString(input, 'port_key'),
    columns: getStringArray<string>(input, 'columns'),
    rows: rawRows.filter(
      (row): row is Record<string, unknown> =>
        typeof row === 'object' && row !== null && !Array.isArray(row),
    ),
    content: getOptionalString(input, 'content'),
  };
}

function normalizeWorkflowCatalogItem(input: ApiRecord): WorkflowNodeCatalogItem {
  const rawInputs = Array.isArray(input.inputs) ? (input.inputs as ApiRecord[]) : [];
  const rawOutputs = Array.isArray(input.outputs) ? (input.outputs as ApiRecord[]) : [];
  const rawParams = Array.isArray(input.params) ? (input.params as ApiRecord[]) : [];
  const rawInputContracts = Array.isArray(input.inputContracts)
    ? (input.inputContracts as ApiRecord[])
    : Array.isArray(input.input_contracts)
      ? (input.input_contracts as ApiRecord[])
      : [];
  const rawOutputContracts = Array.isArray(input.outputContracts)
    ? (input.outputContracts as ApiRecord[])
    : Array.isArray(input.output_contracts)
      ? (input.output_contracts as ApiRecord[])
      : [];
  const rawExampleInputs = Array.isArray(input.exampleInputs)
    ? (input.exampleInputs as ApiRecord[])
    : Array.isArray(input.example_inputs)
      ? (input.example_inputs as ApiRecord[])
      : [];
  const rawExampleOutputs = Array.isArray(input.exampleOutputs)
    ? (input.exampleOutputs as ApiRecord[])
    : Array.isArray(input.example_outputs)
      ? (input.example_outputs as ApiRecord[])
      : [];

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
    inputContracts: rawInputContracts.map(normalizeWorkflowPortContract),
    outputContracts: rawOutputContracts.map(normalizeWorkflowPortContract),
    exampleInputs: rawExampleInputs.map(normalizeWorkflowNodeExample),
    exampleOutputs: rawExampleOutputs.map(normalizeWorkflowNodeExample),
    commonErrors:
      getStringArray<string>(input, 'commonErrors').length > 0
        ? getStringArray<string>(input, 'commonErrors')
        : getStringArray<string>(input, 'common_errors'),
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
    visibility:
      (getOptionalString(input, 'visibility') as WorkflowVersionSummary['visibility'] | undefined) ??
      'private',
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
  const rawMetrics =
    (input.metrics as Record<string, unknown> | undefined) ??
    (input.metrics_json as Record<string, unknown> | undefined) ??
    {};
  const errorMessage =
    getOptionalString(input, 'errorMessage') ??
    getOptionalString(input, 'error_message') ??
    (typeof rawMetrics.error === 'string' ? rawMetrics.error : undefined);

  return {
    id: getString(input, 'id'),
    workflowVersionId:
      getString(input, 'workflowVersionId') || getString(input, 'workflow_version_id'),
    workflowName:
      getOptionalString(input, 'workflowName') ?? getOptionalString(input, 'workflow_name'),
    status: getString(input, 'status') as WorkflowRunSummary['status'],
    startedAt: getOptionalString(input, 'startedAt') ?? getOptionalString(input, 'started_at'),
    finishedAt:
      getOptionalString(input, 'finishedAt') ?? getOptionalString(input, 'finished_at'),
    submittedBy: getString(input, 'submittedBy') || getString(input, 'submitted_by'),
    resultDatasetVersionId:
      getOptionalString(input, 'resultDatasetVersionId') ??
      getOptionalString(input, 'result_dataset_version_id'),
    inputAssetVersionIds:
      getStringArray<string>(input, 'inputAssetVersionIds').length > 0
        ? getStringArray<string>(input, 'inputAssetVersionIds')
        : getStringArray<string>(input, 'input_asset_version_ids'),
    outputAssetVersionIds:
      getStringArray<string>(input, 'outputAssetVersionIds').length > 0
        ? getStringArray<string>(input, 'outputAssetVersionIds')
        : getStringArray<string>(input, 'output_asset_version_ids'),
    primaryOutputAssetVersionId:
      getOptionalString(input, 'primaryOutputAssetVersionId') ??
      getOptionalString(input, 'primary_output_asset_version_id'),
    metrics: rawMetrics,
    errorMessage,
  };
}

function normalizeDashboardFeatureItem(input: ApiRecord): DashboardFeatureItem {
  return {
    id: getString(input, 'id'),
    titleZh: getString(input, 'titleZh') || getString(input, 'title_zh'),
    titleEn: getString(input, 'titleEn') || getString(input, 'title_en'),
    summaryZh: getString(input, 'summaryZh') || getString(input, 'summary_zh'),
    summaryEn: getString(input, 'summaryEn') || getString(input, 'summary_en'),
    buttonLabelZh:
      getString(input, 'buttonLabelZh') || getString(input, 'button_label_zh'),
    buttonLabelEn:
      getString(input, 'buttonLabelEn') || getString(input, 'button_label_en'),
    href: getString(input, 'href'),
    iconKey: getString(input, 'iconKey') || getString(input, 'icon_key') || 'overview',
    enabled: getOptionalBoolean(input, 'enabled') ?? true,
  };
}

function normalizeDashboardAnnouncementItem(input: ApiRecord): DashboardAnnouncementItem {
  return {
    id: getString(input, 'id'),
    titleZh: getString(input, 'titleZh') || getString(input, 'title_zh'),
    titleEn: getString(input, 'titleEn') || getString(input, 'title_en'),
    summaryZh: getString(input, 'summaryZh') || getString(input, 'summary_zh'),
    summaryEn: getString(input, 'summaryEn') || getString(input, 'summary_en'),
    contentZh: getString(input, 'contentZh') || getString(input, 'content_zh'),
    contentEn: getString(input, 'contentEn') || getString(input, 'content_en'),
    tagZh: getOptionalString(input, 'tagZh') ?? getOptionalString(input, 'tag_zh'),
    tagEn: getOptionalString(input, 'tagEn') ?? getOptionalString(input, 'tag_en'),
    publishedAt: getString(input, 'publishedAt') || getString(input, 'published_at'),
    pinned: getOptionalBoolean(input, 'pinned') ?? false,
    published: getOptionalBoolean(input, 'published') ?? true,
  };
}

function normalizeDashboardConfig(input: ApiRecord): DashboardConfig {
  const rawFeatures = Array.isArray(input.featureSections)
    ? (input.featureSections as ApiRecord[])
    : Array.isArray(input.feature_sections)
      ? (input.feature_sections as ApiRecord[])
      : [];
  const rawAnnouncements = Array.isArray(input.announcements)
    ? (input.announcements as ApiRecord[])
    : [];

  return {
    featureSections: rawFeatures.map(normalizeDashboardFeatureItem),
    announcements: rawAnnouncements.map(normalizeDashboardAnnouncementItem),
  };
}

function normalizeFeedbackTicketSummary(input: ApiRecord): FeedbackTicketSummary {
  return {
    id: getString(input, 'id'),
    workspaceId: getString(input, 'workspaceId') || getString(input, 'workspace_id'),
    createdBy: getString(input, 'createdBy') || getString(input, 'created_by'),
    createdByDisplayName:
      getOptionalString(input, 'createdByDisplayName') ??
      getOptionalString(input, 'created_by_display_name'),
    title: getString(input, 'title'),
    category: (getString(input, 'category') as FeedbackTicketCategory) || 'other',
    priority: (getString(input, 'priority') as FeedbackTicketPriority) || 'medium',
    status: (getString(input, 'status') as FeedbackTicketStatus) || 'open',
    content: getString(input, 'content'),
    contact: getOptionalString(input, 'contact'),
    adminReply: getOptionalString(input, 'adminReply') ?? getOptionalString(input, 'admin_reply'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    updatedAt: getString(input, 'updatedAt') || getString(input, 'updated_at'),
  };
}

function normalizeFeedbackTicketSummaryCounts(input: ApiRecord): FeedbackTicketSummaryCounts {
  return {
    myOpenCount:
      getOptionalNumber(input, 'myOpenCount') ?? getOptionalNumber(input, 'my_open_count') ?? 0,
    myActiveCount:
      getOptionalNumber(input, 'myActiveCount') ?? getOptionalNumber(input, 'my_active_count') ?? 0,
    adminOpenCount:
      getOptionalNumber(input, 'adminOpenCount') ??
      getOptionalNumber(input, 'admin_open_count') ??
      0,
    adminInProgressCount:
      getOptionalNumber(input, 'adminInProgressCount') ??
      getOptionalNumber(input, 'admin_in_progress_count') ??
      0,
  };
}

function normalizeWorkflowNodePreviewValue(input: unknown): WorkflowNodePreviewValue {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      kind: 'value',
      value: input,
    };
  }

  const record = input as ApiRecord;
  return {
    ...(record as Record<string, unknown>),
    kind: (getString(record, 'kind') || 'value') as WorkflowNodePreviewValue['kind'],
    title: getOptionalString(record, 'title'),
    summary: getOptionalString(record, 'summary'),
  };
}

function normalizeWorkflowNodeTestResult(input: ApiRecord): WorkflowNodeTestResult {
  const rawInputPreview = input.inputPreview ?? input.input_preview;
  const rawOutputPreview = input.outputPreview ?? input.output_preview;
  const inputPreview =
    rawInputPreview && typeof rawInputPreview === 'object' && !Array.isArray(rawInputPreview)
      ? Object.fromEntries(
          Object.entries(rawInputPreview as Record<string, unknown>).map(([key, value]) => [
            key,
            normalizeWorkflowNodePreviewValue(value),
          ]),
        )
      : {};
  const outputPreview =
    rawOutputPreview && typeof rawOutputPreview === 'object' && !Array.isArray(rawOutputPreview)
      ? Object.fromEntries(
          Object.entries(rawOutputPreview as Record<string, unknown>).map(([key, value]) => [
            key,
            normalizeWorkflowNodePreviewValue(value),
          ]),
        )
      : {};

  return {
    status: getString(input, 'status') as WorkflowNodeTestResult['status'],
    nodeId: getString(input, 'nodeId') || getString(input, 'node_id'),
    durationMs:
      getOptionalNumber(input, 'durationMs') ?? getOptionalNumber(input, 'duration_ms') ?? 0,
    inputPreview,
    outputPreview,
    errors: getStringArray<string>(input, 'errors'),
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
    sourceType: (getOptionalString(input, 'sourceType') ?? getOptionalString(input, 'source_type')) as ModelVersionSummary['sourceType'],
    executionMode:
      (getOptionalString(input, 'executionMode') ??
        getOptionalString(input, 'execution_mode')) as ModelVersionSummary['executionMode'],
    visibility:
      (getOptionalString(input, 'visibility') as ModelVersionSummary['visibility'] | undefined) ??
      undefined,
    ownerUserId:
      getOptionalString(input, 'ownerUserId') ?? getOptionalString(input, 'owner_user_id'),
    ownerDisplayName:
      getOptionalString(input, 'ownerDisplayName') ??
      getOptionalString(input, 'owner_display_name'),
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
    avatarUrl: getOptionalString(input, 'avatarUrl') || getOptionalString(input, 'avatar_url'),
    jobTitle: getOptionalString(input, 'jobTitle') || getOptionalString(input, 'job_title'),
    organization:
      getOptionalString(input, 'organization') || getOptionalString(input, 'organization'),
    bio: getOptionalString(input, 'bio') || getOptionalString(input, 'bio'),
    lastLoginAt: getOptionalString(input, 'lastLoginAt') || getOptionalString(input, 'last_login_at'),
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

function normalizeImageCaptcha(input: ApiRecord): ImageCaptchaChallenge {
  return {
    captchaKey: getString(input, 'captchaKey') || getString(input, 'captcha_key'),
    imageDataUrl: getString(input, 'imageDataUrl') || getString(input, 'image_data_url'),
    expiresInSeconds:
      getOptionalNumber(input, 'expiresInSeconds') ??
      getOptionalNumber(input, 'expires_in_seconds') ??
      0,
  };
}

function normalizeEmailCodeSendResult(input: ApiRecord): EmailCodeSendResult {
  return {
    message: getString(input, 'message'),
    resendAfterSeconds:
      getOptionalNumber(input, 'resendAfterSeconds') ??
      getOptionalNumber(input, 'resend_after_seconds') ??
      60,
  };
}

function normalizeRoleUpgradeRequestSummary(input: ApiRecord): RoleUpgradeRequestSummary {
  return {
    id: getString(input, 'id'),
    userId: getString(input, 'userId') || getString(input, 'user_id'),
    userDisplayName:
      getString(input, 'userDisplayName') || getString(input, 'user_display_name'),
    userEmail: getString(input, 'userEmail') || getString(input, 'user_email'),
    currentRole: (getString(input, 'currentRole') || getString(input, 'current_role')) as RoleKey,
    requestedRole:
      (getString(input, 'requestedRole') || getString(input, 'requested_role')) as RoleKey,
    status: (getString(input, 'status') as RoleUpgradeRequestSummary['status']) || 'pending',
    reason: getString(input, 'reason'),
    reviewNote: getOptionalString(input, 'reviewNote') || getOptionalString(input, 'review_note'),
    createdAt: getString(input, 'createdAt') || getString(input, 'created_at'),
    reviewedAt: getOptionalString(input, 'reviewedAt') || getOptionalString(input, 'reviewed_at'),
    reviewedBy: getOptionalString(input, 'reviewedBy') || getOptionalString(input, 'reviewed_by'),
    reviewedByDisplayName:
      getOptionalString(input, 'reviewedByDisplayName') ||
      getOptionalString(input, 'reviewed_by_display_name'),
  };
}

function normalizeEmailSettingsSummary(input: ApiRecord): EmailSettingsSummary {
  return {
    emailEnabled:
      getOptionalBoolean(input, 'emailEnabled') ?? getOptionalBoolean(input, 'email_enabled') ?? false,
    smtpHost: getString(input, 'smtpHost') || getString(input, 'smtp_host'),
    smtpPort: getOptionalNumber(input, 'smtpPort') ?? getOptionalNumber(input, 'smtp_port') ?? 465,
    smtpUseSsl:
      getOptionalBoolean(input, 'smtpUseSsl') ?? getOptionalBoolean(input, 'smtp_use_ssl') ?? true,
    smtpUsername: getString(input, 'smtpUsername') || getString(input, 'smtp_username'),
    smtpPasswordConfigured:
      getOptionalBoolean(input, 'smtpPasswordConfigured') ??
      getOptionalBoolean(input, 'smtp_password_configured') ??
      false,
    smtpFromEmail: getString(input, 'smtpFromEmail') || getString(input, 'smtp_from_email'),
    smtpFromName: getString(input, 'smtpFromName') || getString(input, 'smtp_from_name'),
    smtpTimeoutSeconds:
      getOptionalNumber(input, 'smtpTimeoutSeconds') ??
      getOptionalNumber(input, 'smtp_timeout_seconds') ??
      20,
    emailCodeExpireMinutes:
      getOptionalNumber(input, 'emailCodeExpireMinutes') ??
      getOptionalNumber(input, 'email_code_expire_minutes') ??
      10,
    emailCodeResendSeconds:
      getOptionalNumber(input, 'emailCodeResendSeconds') ??
      getOptionalNumber(input, 'email_code_resend_seconds') ??
      60,
    imageCaptchaExpireMinutes:
      getOptionalNumber(input, 'imageCaptchaExpireMinutes') ??
      getOptionalNumber(input, 'image_captcha_expire_minutes') ??
      5,
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

export async function getImageCaptcha(): Promise<ImageCaptchaChallenge> {
  const payload = await requestJson<ApiRecord>('/auth/captcha');
  return normalizeImageCaptcha(payload);
}

export async function sendEmailVerificationCode(
  payload: {
    email: string;
    scene: EmailVerificationScene;
    captchaKey: string;
    captchaCode: string;
  },
  token?: string,
): Promise<EmailCodeSendResult> {
  const response = await requestJson<ApiRecord>('/auth/email-code/send', {
    method: 'POST',
    token,
    body: {
      email: payload.email,
      scene: payload.scene,
      captcha_key: payload.captchaKey,
      captcha_code: payload.captchaCode,
    },
  });
  return normalizeEmailCodeSendResult(response);
}

export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  const response = await requestJson<ApiRecord>('/auth/register', {
    method: 'POST',
    body: {
      email: payload.email,
      display_name: payload.displayName,
      password: payload.password,
      email_code: payload.emailCode,
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

export async function updateCurrentUserProfile(
  token: string,
  payload: UserProfileUpdatePayload,
): Promise<AuthUser> {
  const response = await requestJson<ApiRecord>('/auth/me', {
    method: 'PATCH',
    token,
    body: {
      display_name: payload.displayName,
      preferred_locale: payload.preferredLocale,
      email: payload.email,
      email_code: payload.emailCode,
      avatar_url: payload.avatarUrl,
      job_title: payload.jobTitle,
      organization: payload.organization,
      bio: payload.bio,
    },
  });
  return normalizeAuthUser(response);
}

export async function changeCurrentUserPassword(
  token: string,
  payload: PasswordChangePayload,
): Promise<void> {
  await requestJson<ApiRecord>('/auth/me/password', {
    method: 'POST',
    token,
    body: {
      current_password: payload.currentPassword,
      new_password: payload.newPassword,
    },
  });
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

export async function listMyRoleUpgradeRequests(
  token: string,
): Promise<RoleUpgradeRequestSummary[]> {
  const payload = await requestJson<ApiRecord[]>('/auth/role-upgrade-requests/mine', { token });
  return payload.map(normalizeRoleUpgradeRequestSummary);
}

export async function listRoleUpgradeRequests(
  token: string,
): Promise<RoleUpgradeRequestSummary[]> {
  const payload = await requestJson<ApiRecord[]>('/auth/role-upgrade-requests', { token });
  return payload.map(normalizeRoleUpgradeRequestSummary);
}

export async function createRoleUpgradeRequest(
  token: string,
  reason: string,
): Promise<RoleUpgradeRequestSummary> {
  const payload = await requestJson<ApiRecord>('/auth/role-upgrade-requests', {
    method: 'POST',
    token,
    body: { reason },
  });
  return normalizeRoleUpgradeRequestSummary(payload);
}

export async function approveRoleUpgradeRequest(
  token: string,
  requestId: string,
  reviewNote = '',
): Promise<RoleUpgradeRequestSummary> {
  const payload = await requestJson<ApiRecord>(`/auth/role-upgrade-requests/${requestId}/approve`, {
    method: 'POST',
    token,
    body: { review_note: reviewNote },
  });
  return normalizeRoleUpgradeRequestSummary(payload);
}

export async function rejectRoleUpgradeRequest(
  token: string,
  requestId: string,
  reviewNote = '',
): Promise<RoleUpgradeRequestSummary> {
  const payload = await requestJson<ApiRecord>(`/auth/role-upgrade-requests/${requestId}/reject`, {
    method: 'POST',
    token,
    body: { review_note: reviewNote },
  });
  return normalizeRoleUpgradeRequestSummary(payload);
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
    description?: string;
    kind: DatasetKind;
    file: File;
  },
): Promise<DatasetVersionSummary> {
  const formData = new FormData();
  formData.append('workspace_id', payload.workspaceId);
  formData.append('dataset_name', payload.datasetName);
  formData.append('description', payload.description ?? '');
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
    description?: string;
    originalFileName?: string;
    contentType?: string;
    rowCount?: number;
    columns?: string[];
    sampleRecord?: Record<string, unknown>;
    visibility?: 'public' | 'private';
  },
): Promise<DatasetSummary> {
  const response = await requestJson<ApiRecord>(`/datasets/${datasetId}`, {
    method: 'PATCH',
    token,
    body: {
      name: payload.name,
      description: payload.description,
      original_file_name: payload.originalFileName,
      content_type: payload.contentType,
      row_count: payload.rowCount,
      columns: payload.columns,
      sample_record: payload.sampleRecord,
      visibility: payload.visibility,
    },
  });
  return normalizeDatasetSummary(response);
}

export async function deleteDataset(token: string, datasetId: string): Promise<void> {
  await requestJson<ApiRecord>(`/datasets/${datasetId}`, {
    method: 'DELETE',
    token,
  });
}

export async function listDatasets(
  token: string,
  scope: AssetScope = 'visible',
  visibility?: DatasetVisibility,
): Promise<DatasetSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/datasets', {
      scope,
      visibility,
    }),
    { token },
  );
  return payload.map(normalizeDatasetSummary);
}

export async function listProductAssets(
  token: string,
  scope: AssetScope = 'visible',
  visibility?: 'private' | 'public',
): Promise<ProductAssetSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/products', {
      scope,
      visibility,
    }),
    { token },
  );
  return payload.map(normalizeProductAssetSummary);
}

export async function uploadProductAsset(
  token: string,
  payload: {
    workspaceId: string;
    name: string;
    description?: string;
    category?: string;
    tags?: string[];
    highlights?: string[];
    specifications?: Record<string, string>;
    visibility?: 'private' | 'public';
    file: File;
  },
): Promise<ProductAssetSummary> {
  const formData = new FormData();
  formData.append('workspace_id', payload.workspaceId);
  formData.append('name', payload.name);
  formData.append('description', payload.description ?? '');
  formData.append('category', payload.category ?? '');
  formData.append('tags_json', JSON.stringify(payload.tags ?? []));
  formData.append('highlights_json', JSON.stringify(payload.highlights ?? []));
  formData.append('specifications_json', JSON.stringify(payload.specifications ?? {}));
  if (payload.visibility) {
    formData.append('visibility', payload.visibility);
  }
  formData.append('file', payload.file);

  const response = await requestJson<ApiRecord>('/products/upload', {
    method: 'POST',
    token,
    body: formData,
  });
  return normalizeProductAssetSummary(response);
}

export async function updateProductAsset(
  token: string,
  productId: string,
  payload: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
    highlights?: string[];
    specifications?: Record<string, string>;
    visibility?: 'private' | 'public';
    file?: File;
  },
): Promise<ProductAssetSummary> {
  const formData = new FormData();
  if (payload.name !== undefined) {
    formData.append('name', payload.name);
  }
  if (payload.description !== undefined) {
    formData.append('description', payload.description);
  }
  if (payload.category !== undefined) {
    formData.append('category', payload.category);
  }
  if (payload.tags !== undefined) {
    formData.append('tags_json', JSON.stringify(payload.tags));
  }
  if (payload.highlights !== undefined) {
    formData.append('highlights_json', JSON.stringify(payload.highlights));
  }
  if (payload.specifications !== undefined) {
    formData.append('specifications_json', JSON.stringify(payload.specifications));
  }
  if (payload.visibility !== undefined) {
    formData.append('visibility', payload.visibility);
  }
  if (payload.file) {
    formData.append('file', payload.file);
  }

  const response = await requestJson<ApiRecord>(`/products/${productId}`, {
    method: 'PATCH',
    token,
    body: formData,
  });
  return normalizeProductAssetSummary(response);
}

export async function updateSpatialRoi(
  token: string,
  roiId: string,
  payload: SpatialRoiUpdatePayload,
): Promise<SpatialRoiSummary> {
  const response = await requestJson<ApiRecord>(`/spatial/rois/${roiId}`, {
    method: 'PATCH',
    token,
    body: {
      name: payload.name,
      description: payload.description,
      geometry_type: payload.geometryType,
      geometry: payload.geometry,
      style: payload.style,
      tags: payload.tags,
      visibility: payload.visibility,
    },
  });
  return normalizeSpatialRoiSummary(response);
}

export async function deleteProductAsset(token: string, productId: string): Promise<void> {
  await requestJson<ApiRecord>(`/products/${productId}`, {
    method: 'DELETE',
    token,
  });
}

export async function downloadProductAsset(
  token: string,
  productId: string,
  fallbackFileName = `product-${productId}`,
): Promise<void> {
  const path = `/products/${productId}/download`;
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

export async function fetchProductAssetArrayBuffer(
  token: string,
  productId: string,
): Promise<{ fileName: string; buffer: ArrayBuffer; sizeBytes: number; contentType: string }> {
  const path = `/products/${productId}/download`;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw await buildApiError(response, path);
  }

  const buffer = await response.arrayBuffer();
  return {
    fileName: extractDownloadFileName(response, `product-${productId}`),
    buffer,
    sizeBytes: buffer.byteLength,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

export async function listDatasetVersions(
  token: string,
  scope: AssetScope = 'visible',
  datasetId?: string,
): Promise<DatasetVersionSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/dataset-versions', {
      scope,
      dataset_id: datasetId,
    }),
    { token },
  );
  return payload.map(normalizeDatasetVersionSummary);
}

export async function fetchDatasetVersionBlob(
  token: string,
  datasetVersionId: string,
): Promise<Blob> {
  return requestBlob(`/dataset-versions/${datasetVersionId}/download`, token);
}

export async function fetchDatasetVersionText(
  token: string,
  datasetVersionId: string,
): Promise<string> {
  const blob = await fetchDatasetVersionBlob(token, datasetVersionId);
  return blob.text();
}

export async function listSpatialRois(
  token: string,
  scope: AssetScope = 'mine',
): Promise<SpatialRoiSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/spatial/rois', { scope }),
    { token },
  );
  return payload.map(normalizeSpatialRoiSummary);
}

export async function createSpatialRoi(
  token: string,
  payload: SpatialRoiCreatePayload,
): Promise<SpatialRoiSummary> {
  const response = await requestJson<ApiRecord>('/spatial/rois', {
    method: 'POST',
    token,
    body: {
      workspace_id: payload.workspaceId,
      name: payload.name,
      description: payload.description ?? '',
      geometry_type: payload.geometryType,
      geometry: payload.geometry,
      style: payload.style ?? {},
      tags: payload.tags ?? [],
    },
  });
  return normalizeSpatialRoiSummary(response);
}

export async function deleteSpatialRoi(token: string, roiId: string): Promise<void> {
  await requestJson<ApiRecord>(`/spatial/rois/${roiId}`, {
    method: 'DELETE',
    token,
  });
}

export async function listSpatialOverlays(
  token: string,
  scope: AssetScope = 'mine',
): Promise<SpatialOverlaySummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/spatial/overlays', { scope }),
    { token },
  );
  return payload.map(normalizeSpatialOverlaySummary);
}

export async function createSpatialOverlay(
  token: string,
  payload: SpatialOverlayCreatePayload,
): Promise<SpatialOverlaySummary> {
  const response = await requestJson<ApiRecord>('/spatial/overlays', {
    method: 'POST',
    token,
    body: {
      workspace_id: payload.workspaceId,
      dataset_version_id: payload.datasetVersionId,
      name: payload.name,
      description: payload.description ?? '',
      opacity: payload.opacity ?? 0.85,
      style: payload.style ?? {},
    },
  });
  return normalizeSpatialOverlaySummary(response);
}

export async function updateSpatialOverlay(
  token: string,
  overlayId: string,
  payload: SpatialOverlayUpdatePayload,
): Promise<SpatialOverlaySummary> {
  const response = await requestJson<ApiRecord>(`/spatial/overlays/${overlayId}`, {
    method: 'PATCH',
    token,
    body: {
      name: payload.name,
      description: payload.description,
      opacity: payload.opacity,
      style: payload.style,
      visibility: payload.visibility,
    },
  });
  return normalizeSpatialOverlaySummary(response);
}

export async function deleteSpatialOverlay(token: string, overlayId: string): Promise<void> {
  await requestJson<ApiRecord>(`/spatial/overlays/${overlayId}`, {
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

export async function createCustomApiModel(
  token: string,
  payload: {
    workspaceId: string;
    modelName: string;
    version: string;
    taskType: string;
    description?: string;
    endpointUrl: string;
    timeoutSeconds: number;
    authType: 'none' | 'bearer' | 'header';
    authToken?: string;
    authHeaderName?: string;
    responseMode: 'prediction_values' | 'table_rows';
    defaultPredictionColumn: string;
    defaultParameters?: Record<string, unknown>;
  },
): Promise<ModelVersionSummary> {
  const response = await requestJson<ApiRecord>('/models/custom', {
    method: 'POST',
    token,
    body: {
      workspace_id: payload.workspaceId,
      model_name: payload.modelName,
      version: payload.version,
      task_type: payload.taskType,
      description: payload.description ?? '',
      endpoint_url: payload.endpointUrl,
      timeout_seconds: payload.timeoutSeconds,
      auth_type: payload.authType,
      auth_token: payload.authToken ?? '',
      auth_header_name: payload.authHeaderName ?? '',
      response_mode: payload.responseMode,
      default_prediction_column: payload.defaultPredictionColumn,
      default_parameters: payload.defaultParameters ?? {},
    },
  });
  return normalizeModelVersion(response);
}

export async function listModelVersions(
  token: string,
  scope: AssetScope = 'visible',
): Promise<ModelVersionSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/models/versions', { scope }),
    { token },
  );
  return payload.map(normalizeModelVersion);
}

export async function downloadModelVersion(
  token: string,
  modelVersionId: string,
  fallbackFileName = `model-${modelVersionId}`,
): Promise<void> {
  const path = `/models/versions/${modelVersionId}/download`;
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

export async function deleteModelVersion(token: string, modelVersionId: string): Promise<void> {
  await requestJson<ApiRecord>(`/models/versions/${modelVersionId}`, {
    method: 'DELETE',
    token,
  });
}

export async function updateModelVersion(
  token: string,
  modelVersionId: string,
  payload: {
    visibility?: 'private' | 'public' | 'workspace';
  },
): Promise<ModelVersionSummary> {
  const response = await requestJson<ApiRecord>(`/models/versions/${modelVersionId}`, {
    method: 'PATCH',
    token,
    body: {
      visibility: payload.visibility,
    },
  });
  return normalizeModelVersion(response);
}

export async function listGeeCredentials(
  token: string,
  scope: AssetScope = 'mine',
): Promise<GeeCredentialSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/integrations/gee-credentials', { scope }),
    { token },
  );
  return payload.map(normalizeGeeCredentialSummary);
}

export async function createGeeCredential(
  token: string,
  payload: {
    workspaceId: string;
    name: string;
    description?: string;
    projectId?: string;
    serviceAccountJson: string;
  },
): Promise<GeeCredentialSummary> {
  const response = await requestJson<ApiRecord>('/integrations/gee-credentials', {
    method: 'POST',
    token,
    body: {
      workspace_id: payload.workspaceId,
      name: payload.name,
      description: payload.description ?? '',
      project_id: payload.projectId ?? '',
      service_account_json: payload.serviceAccountJson,
    },
  });
  return normalizeGeeCredentialSummary(response);
}

export async function deleteGeeCredential(token: string, credentialId: string): Promise<void> {
  await requestJson<ApiRecord>(`/integrations/gee-credentials/${credentialId}`, {
    method: 'DELETE',
    token,
  });
}

export async function setPlatformDefaultGeeCredential(
  token: string,
  credentialId: string,
): Promise<GeeCredentialSummary> {
  const response = await requestJson<ApiRecord>(
    `/integrations/gee-credentials/${credentialId}/set-platform-default`,
    {
      method: 'POST',
      token,
    },
  );
  return normalizeGeeCredentialSummary(response);
}

export async function getDashboardConfig(token: string): Promise<DashboardConfig> {
  const payload = await requestJson<ApiRecord>('/platform-settings/dashboard', { token });
  return normalizeDashboardConfig(payload);
}

export async function updateDashboardConfig(
  token: string,
  payload: DashboardConfig,
): Promise<DashboardConfig> {
  const response = await requestJson<ApiRecord>('/platform-settings/dashboard', {
    method: 'PUT',
    token,
    body: {
      feature_sections: payload.featureSections.map((item) => ({
        id: item.id,
        title_zh: item.titleZh,
        title_en: item.titleEn,
        summary_zh: item.summaryZh,
        summary_en: item.summaryEn,
        button_label_zh: item.buttonLabelZh,
        button_label_en: item.buttonLabelEn,
        href: item.href,
        icon_key: item.iconKey,
        enabled: item.enabled,
      })),
      announcements: payload.announcements.map((item) => ({
        id: item.id,
        title_zh: item.titleZh,
        title_en: item.titleEn,
        summary_zh: item.summaryZh,
        summary_en: item.summaryEn,
        content_zh: item.contentZh,
        content_en: item.contentEn,
        tag_zh: item.tagZh ?? '',
        tag_en: item.tagEn ?? '',
        published_at: item.publishedAt,
        pinned: item.pinned,
        published: item.published,
      })),
    },
  });
  return normalizeDashboardConfig(response);
}

export async function getEmailSettings(token: string): Promise<EmailSettingsSummary> {
  const payload = await requestJson<ApiRecord>('/platform-settings/email', { token });
  return normalizeEmailSettingsSummary(payload);
}

export async function updateEmailSettings(
  token: string,
  payload: EmailSettingsUpdatePayload,
): Promise<EmailSettingsSummary> {
  const response = await requestJson<ApiRecord>('/platform-settings/email', {
    method: 'PUT',
    token,
    body: {
      email_enabled: payload.emailEnabled,
      smtp_host: payload.smtpHost,
      smtp_port: payload.smtpPort,
      smtp_use_ssl: payload.smtpUseSsl,
      smtp_username: payload.smtpUsername,
      smtp_password: payload.smtpPassword,
      clear_smtp_password: payload.clearSmtpPassword,
      smtp_from_email: payload.smtpFromEmail,
      smtp_from_name: payload.smtpFromName,
      smtp_timeout_seconds: payload.smtpTimeoutSeconds,
      email_code_expire_minutes: payload.emailCodeExpireMinutes,
      email_code_resend_seconds: payload.emailCodeResendSeconds,
      image_captcha_expire_minutes: payload.imageCaptchaExpireMinutes,
    },
  });
  return normalizeEmailSettingsSummary(response);
}

export async function listFeedbackTickets(
  token: string,
  options: { scope?: 'mine' | 'all'; limit?: number } = {},
): Promise<FeedbackTicketSummary[]> {
  const payload = await requestJson<ApiRecord[]>(
    withQuery('/feedback-tickets', {
      scope: options.scope ?? 'mine',
      limit: options.limit ? String(options.limit) : undefined,
    }),
    { token },
  );
  return payload.map(normalizeFeedbackTicketSummary);
}

export async function getFeedbackTicket(
  token: string,
  ticketId: string,
): Promise<FeedbackTicketSummary> {
  const payload = await requestJson<ApiRecord>(`/feedback-tickets/${ticketId}`, { token });
  return normalizeFeedbackTicketSummary(payload);
}

export async function createFeedbackTicket(
  token: string,
  payload: {
    workspaceId: string;
    title: string;
    category: FeedbackTicketCategory;
    priority: FeedbackTicketPriority;
    content: string;
    contact?: string;
  },
): Promise<FeedbackTicketSummary> {
  const response = await requestJson<ApiRecord>('/feedback-tickets', {
    method: 'POST',
    token,
    body: {
      workspace_id: payload.workspaceId,
      title: payload.title,
      category: payload.category,
      priority: payload.priority,
      content: payload.content,
      contact: payload.contact ?? '',
    },
  });
  return normalizeFeedbackTicketSummary(response);
}

export async function updateFeedbackTicket(
  token: string,
  ticketId: string,
  payload: {
    title?: string;
    category?: FeedbackTicketCategory;
    priority?: FeedbackTicketPriority;
    status?: FeedbackTicketStatus;
    content?: string;
    contact?: string;
    adminReply?: string;
  },
): Promise<FeedbackTicketSummary> {
  const response = await requestJson<ApiRecord>(`/feedback-tickets/${ticketId}`, {
    method: 'PATCH',
    token,
    body: {
      title: payload.title,
      category: payload.category,
      priority: payload.priority,
      status: payload.status,
      content: payload.content,
      contact: payload.contact,
      admin_reply: payload.adminReply,
    },
  });
  return normalizeFeedbackTicketSummary(response);
}

export async function getFeedbackTicketSummary(
  token: string,
): Promise<FeedbackTicketSummaryCounts> {
  const payload = await requestJson<ApiRecord>('/feedback-tickets/summary', { token });
  return normalizeFeedbackTicketSummaryCounts(payload);
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

export async function updateWorkflowVersion(
  token: string,
  workflowVersionId: string,
  payload: {
    visibility?: 'private' | 'public';
  },
): Promise<WorkflowVersionSummary> {
  const response = await requestJson<ApiRecord>(`/workflows/versions/${workflowVersionId}`, {
    method: 'PATCH',
    token,
    body: {
      visibility: payload.visibility,
    },
  });
  return normalizeWorkflowVersionSummary(response);
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

export async function testWorkflowNode(
  token: string,
  workflowVersion: WorkflowVersionDetail,
  nodeId: string,
): Promise<WorkflowNodeTestResult> {
  const payload = await requestJson<ApiRecord>('/workflows/test-node', {
    method: 'POST',
    token,
    body: {
      graph: toWorkflowValidationPayload(workflowVersion),
      node_id: nodeId,
    },
  });
  return normalizeWorkflowNodeTestResult(payload);
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
  const [
    datasets,
    datasetVersions,
    products,
    geeCredentials,
    workflowVersions,
    workflowRuns,
    modelVersions,
    spatialRois,
    spatialOverlays,
  ] = await Promise.all([
    requestJson<ApiRecord[]>(withQuery('/datasets', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/dataset-versions', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/products', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/integrations/gee-credentials', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/workflows/versions', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/workflow-runs', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/models/versions', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/spatial/rois', { scope }), { token }),
    requestJson<ApiRecord[]>(withQuery('/spatial/overlays', { scope }), { token }),
  ]);

  return {
    scope,
    datasets: datasets.map(normalizeDatasetSummary),
    datasetVersions: datasetVersions.map(normalizeDatasetVersionSummary),
    products: products.map(normalizeProductAssetSummary),
    geeCredentials: geeCredentials.map(normalizeGeeCredentialSummary),
    workflowVersions: workflowVersions.map(normalizeWorkflowVersionSummary),
    workflowRuns: workflowRuns.map(normalizeWorkflowRun),
    modelVersions: modelVersions.map(normalizeModelVersion),
    spatialRois: spatialRois.map(normalizeSpatialRoiSummary),
    spatialOverlays: spatialOverlays.map(normalizeSpatialOverlaySummary),
  };
}

export async function loadPlatformData(
  token: string,
  options: { includeModels: boolean; includeAdminData: boolean },
): Promise<PlatformDataSnapshot> {
  const baseRequests = [
    requestJson<ApiRecord[]>('/workspaces', { token }),
    requestJson<ApiRecord[]>('/datasets', { token }),
    requestJson<ApiRecord[]>('/dataset-versions', { token }),
    requestJson<ApiRecord[]>('/integrations/gee-credentials?scope=mine', { token }),
    requestJson<ApiRecord[]>('/workflows/catalog', { token }),
    requestJson<ApiRecord[]>('/workflows/templates', { token }),
    requestJson<ApiRecord>('/workflows/versions/current', { token }),
    requestJson<ApiRecord[]>('/workflow-runs', { token }),
  ] as const;

  const [
    workspaces,
    datasets,
    datasetVersions,
    geeCredentials,
    workflowCatalog,
    workflowTemplates,
    workflowVersion,
    workflowRuns,
  ] = await Promise.all(baseRequests);

  const [modelVersionsResult, dashboardConfigResult, feedbackTicketsResult, feedbackSummaryResult] =
    await Promise.allSettled([
      options.includeModels
        ? requestJson<ApiRecord[]>('/models/versions', { token })
        : Promise.resolve([] as ApiRecord[]),
      requestJson<ApiRecord>('/platform-settings/dashboard', { token }),
      requestJson<ApiRecord[]>(
        withQuery('/feedback-tickets', {
          scope: options.includeAdminData ? 'all' : 'mine',
          limit: '6',
        }),
        { token },
      ),
      requestJson<ApiRecord>('/feedback-tickets/summary', { token }),
    ]);

  const modelVersions =
    modelVersionsResult.status === 'fulfilled'
      ? modelVersionsResult.value
      : [];
  const dashboardConfig =
    dashboardConfigResult.status === 'fulfilled'
      ? normalizeDashboardConfig(dashboardConfigResult.value)
      : createFallbackDashboardConfig();
  const feedbackTickets =
    feedbackTicketsResult.status === 'fulfilled'
      ? feedbackTicketsResult.value.map(normalizeFeedbackTicketSummary)
      : [];
  const feedbackSummary =
    feedbackSummaryResult.status === 'fulfilled'
      ? normalizeFeedbackTicketSummaryCounts(feedbackSummaryResult.value)
      : emptyFeedbackSummary();

  return {
    workspace: normalizeWorkspaceSummary(workspaces[0]),
    datasets: datasets.map(normalizeDatasetSummary),
    datasetVersions: datasetVersions.map(normalizeDatasetVersionSummary),
    geeCredentials: geeCredentials.map(normalizeGeeCredentialSummary),
    workflowCatalog: workflowCatalog.map(normalizeWorkflowCatalogItem),
    workflowTemplates: workflowTemplates.map(normalizeWorkflowTemplate),
    workflowVersion: normalizeWorkflowVersion(workflowVersion),
    workflowRuns: workflowRuns.map(normalizeWorkflowRun),
    modelVersions: modelVersions.map(normalizeModelVersion),
    dashboardConfig,
    feedbackTickets,
    feedbackSummary,
    source: 'api',
  };
}
