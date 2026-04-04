export type RoleKey = 'ADMIN' | 'ML_ENGINEER' | 'MEMBER';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type LocaleCode = 'zh-CN' | 'en-US';
export type PermissionKey =
  | 'workspace.view'
  | 'workspace.manage'
  | 'dataset.view'
  | 'dataset.manage'
  | 'workflow.view'
  | 'workflow.manage'
  | 'workflow.run'
  | 'model.view'
  | 'model.manage'
  | 'job.view'
  | 'result.view'
  | 'user.approve'
  | 'system.configure';

export type DatasetKind = 'raster' | 'vector' | 'table' | 'artifact';
export type DatasetStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export type DatasetVisibility = 'public' | 'private' | 'workspace';
export type AssetScope = 'visible' | 'mine' | 'all';
export type WorkflowRunStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed';
export type WorkflowNodeCategory = 'source' | 'preprocess' | 'split' | 'inference' | 'postprocess';
export type WorkflowNodeTestStatus = 'succeeded' | 'failed' | 'not_supported';
export type WorkflowPortDataType =
  | 'dataset_version'
  | 'table'
  | 'raster'
  | 'vector'
  | 'roi'
  | 'tile_set'
  | 'label_set'
  | 'model_ref'
  | 'metrics_report'
  | 'prediction_mask'
  | 'prediction_vector'
  | 'artifact';
export type WorkflowParamFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'datasetVersion'
  | 'modelVersion';
export type ModelAlgorithmKey =
  | 'linear_regression'
  | 'svm_regression'
  | 'random_forest_regression';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: RoleKey;
  approvalStatus: ApprovalStatus;
  preferredLocale: LocaleCode;
  permissions: PermissionKey[];
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: string;
  user: AuthUser;
}

export interface RegisterPayload {
  email: string;
  displayName: string;
  password: string;
  preferredLocale: LocaleCode;
}

export interface RegisterResponse {
  userId: string;
  approvalStatus: ApprovalStatus;
  message: string;
}

export interface PendingUserSummary {
  id: string;
  email: string;
  displayName: string;
  role: RoleKey;
  approvalStatus: ApprovalStatus;
  preferredLocale: LocaleCode;
  createdAt: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  memberCount: number;
}

export interface DatasetSummary {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  kind: DatasetKind;
  status: DatasetStatus;
  isPrivate?: boolean;
  bands?: number;
  projection?: string;
  footprint?: string;
  visibility?: DatasetVisibility;
  ownerUserId?: string;
  ownerDisplayName?: string;
  latestVersionId?: string;
  latestVersionNumber?: number;
  updatedAt: string;
}

export interface DatasetVersionSummary {
  id: string;
  datasetId: string;
  version: number;
  status: DatasetStatus;
  assetPath: string;
  previewUrl?: string;
  bbox?: [number, number, number, number];
  metadata: Record<string, unknown>;
  isPrivate?: boolean;
  visibility?: DatasetVisibility;
  ownerUserId?: string;
  ownerDisplayName?: string;
  createdAt: string;
}

export interface WorkflowParamOption {
  label: string;
  value: string;
}

export interface WorkflowPortDefinition {
  key: string;
  label: string;
  description?: string;
  dataTypes: WorkflowPortDataType[];
  required?: boolean;
}

export interface WorkflowParamDefinition {
  key: string;
  label: string;
  fieldType: WorkflowParamFieldType;
  description?: string;
  defaultValue?: string | number | boolean | string[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: WorkflowParamOption[];
  required?: boolean;
}

export interface WorkflowPortContract {
  portKey: string;
  summary: string;
  datasetKinds?: DatasetKind[];
  fileFormats?: string[];
  columnRequirements?: string[];
  sampleColumns?: string[];
  producedColumns?: string[];
  notes?: string[];
}

export interface WorkflowNodeExample {
  title: string;
  kind: 'table' | 'json' | 'text';
  portKey?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  content?: string;
}

export interface WorkflowNodeCatalogItem {
  type: string;
  label: string;
  category: WorkflowNodeCategory;
  description: string;
  runtimeKind: 'source' | 'transform' | 'inference' | 'export';
  supportedTasks: string[];
  tags: string[];
  inputs: WorkflowPortDefinition[];
  outputs: WorkflowPortDefinition[];
  params: WorkflowParamDefinition[];
  inputContracts?: WorkflowPortContract[];
  outputContracts?: WorkflowPortContract[];
  exampleInputs?: WorkflowNodeExample[];
  exampleOutputs?: WorkflowNodeExample[];
  commonErrors?: string[];
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: {
    x: number;
    y: number;
  };
  params: Record<string, unknown>;
  inputBindings: Record<string, string>;
  outputDefs: WorkflowPortDefinition[];
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowVersionDetail {
  id: string;
  workflowId: string;
  version: number;
  ownerUserId?: string;
  ownerDisplayName?: string;
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  createdAt: string;
}

export interface WorkflowVersionSummary {
  id: string;
  workflowId: string;
  version: number;
  ownerUserId?: string;
  ownerDisplayName?: string;
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  createdAt: string;
}

export interface WorkflowTemplateSampleBinding {
  nodeId: string;
  params: Record<string, unknown>;
}

export interface WorkflowTemplateDefinition {
  id: string;
  label: string;
  description: string;
  tags: string[];
  supportedTasks: string[];
  sampleBindings?: WorkflowTemplateSampleBinding[];
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
}

export interface WorkflowRunSummary {
  id: string;
  workflowVersionId: string;
  status: WorkflowRunStatus;
  startedAt?: string;
  finishedAt?: string;
  submittedBy: string;
  resultDatasetVersionId?: string;
  metrics?: Record<string, unknown>;
}

export interface WorkflowNodePreviewValue {
  kind:
    | 'dataset_version'
    | 'model_ref'
    | 'model_version'
    | 'table'
    | 'metrics_report'
    | 'artifact_file'
    | 'value';
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface WorkflowNodeTestResult {
  status: WorkflowNodeTestStatus;
  nodeId: string;
  durationMs: number;
  inputPreview: Record<string, WorkflowNodePreviewValue>;
  outputPreview: Record<string, WorkflowNodePreviewValue>;
  errors: string[];
}

export interface ModelVersionSummary {
  id: string;
  modelId: string;
  modelName?: string;
  algorithmKey?: string;
  version: string;
  framework: string;
  taskType: string;
  featureNames?: string[];
  defaultParameters?: Record<string, unknown>;
  artifactFormat?: string;
  sourceType?: 'uploaded' | 'trained' | 'custom_api' | 'seeded';
  executionMode?: 'in_process' | 'external_api';
  visibility?: 'private' | 'public' | 'workspace';
  ownerUserId?: string;
  ownerDisplayName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
