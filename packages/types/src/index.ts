export type RoleKey = 'ADMIN' | 'ML_ENGINEER' | 'MEMBER';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type LocaleCode = 'zh-CN' | 'en-US';
export type EmailVerificationScene = 'register' | 'change_email';
export type RoleUpgradeRequestStatus = 'pending' | 'approved' | 'rejected';
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
export type AssetType = 'dataset' | 'workflow' | 'model' | 'product' | 'spatial';
export type WorkflowRunStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed';
export type AssetCapability =
  | 'downloadable'
  | 'publishable'
  | 'workflow_input_ready'
  | 'workflow_roi_ready'
  | 'map_overlay_ready'
  | 'lineage_tracked'
  | 'execution_output';
export type AssetConsumer =
  | 'workflow_dataset'
  | 'workflow_roi'
  | 'workflow_model'
  | 'workflow_gee_credential'
  | 'map_overlay';
export type AssetFormat = 'csv' | 'geojson' | 'geotiff' | 'json' | 'workflow_graph' | 'roi_geometry' | 'unknown';
export type AssetHandoffTarget = 'workflow' | 'spatial';
export type WorkflowStarterInputKind =
  | 'dataset_version'
  | 'spatial_roi'
  | 'model_version'
  | 'gee_credential';
export type AssetInputCandidateType =
  | 'asset_version'
  | 'spatial_roi'
  | 'model_version'
  | 'gee_credential';
export type AssetHandoffSource =
  | 'asset_flow'
  | 'my_assets'
  | 'workflow_node_test'
  | 'workflow_run_history'
  | 'spatial_roi'
  | 'unknown';
export type AssetHandoffPayload =
  | {
      version: 1;
      target: 'workflow';
      inputKind: 'dataset_version';
      datasetVersionId: string;
      label?: string;
      source?: AssetHandoffSource;
    }
  | {
      version: 1;
      target: 'workflow';
      inputKind: 'spatial_roi';
      roiId: string;
      label?: string;
      source?: AssetHandoffSource;
    }
  | {
      version: 1;
      target: 'workflow';
      inputKind: 'model_version';
      modelVersionId: string;
      label?: string;
      source?: AssetHandoffSource;
    }
  | {
      version: 1;
      target: 'workflow';
      inputKind: 'gee_credential';
      geeCredentialId: string;
      label?: string;
      source?: AssetHandoffSource;
    }
  | {
      version: 1;
      target: 'spatial';
      inputKind: 'asset_version';
      assetVersionId: string;
      label?: string;
      source?: AssetHandoffSource;
    };
export type FeedbackTicketCategory = 'bug' | 'feature_request' | 'ux' | 'question' | 'other';
export type FeedbackTicketPriority = 'low' | 'medium' | 'high';
export type FeedbackTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type WorkflowNodeCategory = 'source' | 'preprocess' | 'split' | 'inference' | 'postprocess';
export type WorkflowNodeTestStatus = 'succeeded' | 'failed' | 'not_supported';
export type ExecutionType = 'workflow_run';
export type LineageRelationship = 'execution_output';
export type WorkflowPortDataType =
  | 'dataset_version'
  | 'table'
  | 'raster'
  | 'vector'
  | 'roi'
  | 'tile_set'
  | 'label_set'
  | 'model_version'
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
  avatarUrl?: string;
  jobTitle?: string;
  organization?: string;
  bio?: string;
  lastLoginAt?: string;
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
  emailCode: string;
  preferredLocale: LocaleCode;
}

export interface ImageCaptchaChallenge {
  captchaKey: string;
  imageDataUrl: string;
  expiresInSeconds: number;
}

export interface EmailCodeSendResult {
  message: string;
  resendAfterSeconds: number;
}

export interface UserProfileUpdatePayload {
  displayName?: string;
  preferredLocale?: LocaleCode;
  email?: string;
  emailCode?: string;
  avatarUrl?: string;
  jobTitle?: string;
  organization?: string;
  bio?: string;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
}

export interface EmailSettingsSummary {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUseSsl: boolean;
  smtpUsername: string;
  smtpPasswordConfigured: boolean;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpTimeoutSeconds: number;
  emailCodeExpireMinutes: number;
  emailCodeResendSeconds: number;
  imageCaptchaExpireMinutes: number;
}

export interface EmailSettingsUpdatePayload {
  emailEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUseSsl: boolean;
  smtpUsername: string;
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
  smtpFromEmail: string;
  smtpFromName: string;
  smtpTimeoutSeconds: number;
  emailCodeExpireMinutes: number;
  emailCodeResendSeconds: number;
  imageCaptchaExpireMinutes: number;
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

export interface RoleUpgradeRequestSummary {
  id: string;
  userId: string;
  userDisplayName: string;
  userEmail: string;
  currentRole: RoleKey;
  requestedRole: RoleKey;
  status: RoleUpgradeRequestStatus;
  reason: string;
  reviewNote?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByDisplayName?: string;
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

export interface SpatialRoiSummary {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  name: string;
  description?: string;
  geometryType: 'rectangle' | 'polygon';
  geometry: Record<string, unknown>;
  bbox: [number, number, number, number];
  style?: Record<string, unknown>;
  tags?: string[];
  visibility?: 'private' | 'public';
  createdAt: string;
  updatedAt: string;
}

export interface SpatialRoiCreatePayload {
  workspaceId: string;
  name: string;
  description?: string;
  geometryType: 'rectangle' | 'polygon';
  geometry: Record<string, unknown>;
  style?: Record<string, unknown>;
  tags?: string[];
}

export interface SpatialRoiUpdatePayload {
  name?: string;
  description?: string;
  geometryType?: 'rectangle' | 'polygon';
  geometry?: Record<string, unknown>;
  style?: Record<string, unknown>;
  tags?: string[];
  visibility?: 'private' | 'public';
}

export interface SpatialOverlaySummary {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  datasetVersionId: string;
  datasetId: string;
  datasetName: string;
  datasetKind: DatasetKind;
  datasetVersionNumber: number;
  originalFileName?: string;
  contentType?: string;
  bbox?: [number, number, number, number];
  previewUrl?: string;
  name: string;
  description?: string;
  overlayType: 'raster' | 'vector';
  opacity: number;
  style?: Record<string, unknown>;
  visibility?: 'private' | 'public';
  createdAt: string;
  updatedAt: string;
}

export interface SpatialOverlayCreatePayload {
  workspaceId: string;
  datasetVersionId: string;
  name: string;
  description?: string;
  opacity?: number;
  style?: Record<string, unknown>;
}

export interface SpatialOverlayUpdatePayload {
  name?: string;
  description?: string;
  opacity?: number;
  style?: Record<string, unknown>;
  visibility?: 'private' | 'public';
}

export interface ProductAssetSummary {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  highlights?: string[];
  specifications?: Record<string, string>;
  visibility?: 'private' | 'public';
  assetPath: string;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
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

export interface WorkflowNodeStarterBinding {
  inputKind: WorkflowStarterInputKind;
  paramKey: string;
  presetParams?: Record<string, string | number | boolean | string[]>;
  autoCreate?: boolean;
  priority?: number;
}

export interface WorkflowNodeOutputUsage {
  target: AssetHandoffTarget;
  inputKind: WorkflowStarterInputKind | 'asset_version';
  label?: string;
}

export interface WorkflowNodeOutputBehavior {
  portKey: string;
  previewKinds?: WorkflowNodePreviewKind[];
  usages: WorkflowNodeOutputUsage[];
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
  starterBindings?: WorkflowNodeStarterBinding[];
  outputBehaviors?: WorkflowNodeOutputBehavior[];
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
  visibility?: 'private' | 'public';
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

export interface AssetRef {
  id: string;
  assetType: AssetType;
  assetKind: string;
  workspaceId: string;
  name: string;
  visibility: DatasetVisibility;
  ownerUserId?: string;
  ownerDisplayName?: string;
}

export interface AssetVersionRef {
  id: string;
  asset: AssetRef;
  versionLabel: string;
  versionNumber?: number;
  status?: string;
  createdAt: string;
  sourceExecutionId?: string;
  upstreamAssetVersionIds: string[];
  format: AssetFormat;
  capabilities: AssetCapability[];
  consumableBy: AssetConsumer[];
  spatialTraits?: SpatialAssetTraits;
}

export interface SpatialAssetTraits {
  overlayType?: 'raster' | 'vector';
  bbox?: [number, number, number, number];
  previewUrl?: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowVersionId: string;
  workflowName?: string;
  status: WorkflowRunStatus;
  startedAt?: string;
  finishedAt?: string;
  submittedBy: string;
  resultDatasetVersionId?: string;
  inputAssetVersionIds?: string[];
  outputAssetVersionIds?: string[];
  primaryOutputAssetVersionId?: string;
  metrics?: Record<string, unknown>;
  errorMessage?: string;
}

export interface ExecutionSummary {
  id: string;
  executionType: ExecutionType;
  status: WorkflowRunStatus;
  submittedBy: string;
  workflowVersionId: string;
  workflowName?: string;
  inputAssetVersionIds: string[];
  outputAssetVersionIds: string[];
  primaryOutputAssetVersionId?: string;
  metrics?: Record<string, unknown>;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface LineageEdge {
  id: string;
  relationship: LineageRelationship;
  sourceAssetVersionId: string;
  targetAssetVersionId: string;
  executionId?: string;
}

export interface AssetFlowOverview {
  scope: AssetScope;
  assetVersions: AssetVersionRef[];
  executions: ExecutionSummary[];
  lineageEdges: LineageEdge[];
}

export interface AssetInputCandidate {
  id: string;
  consumer: AssetConsumer;
  candidateType: AssetInputCandidateType;
  title: string;
  description?: string;
  assetVersion?: AssetVersionRef;
  spatialRoi?: SpatialRoiSummary;
  modelVersion?: ModelVersionSummary;
  geeCredential?: GeeCredentialSummary;
}

export interface DashboardFeatureItem {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  buttonLabelZh: string;
  buttonLabelEn: string;
  href: string;
  iconKey: string;
  enabled: boolean;
}

export interface DashboardAnnouncementItem {
  id: string;
  titleZh: string;
  titleEn: string;
  summaryZh: string;
  summaryEn: string;
  contentZh: string;
  contentEn: string;
  tagZh?: string;
  tagEn?: string;
  publishedAt: string;
  pinned: boolean;
  published: boolean;
}

export interface DashboardConfig {
  featureSections: DashboardFeatureItem[];
  announcements: DashboardAnnouncementItem[];
}

export interface FeedbackTicketSummary {
  id: string;
  workspaceId: string;
  createdBy: string;
  createdByDisplayName?: string;
  title: string;
  category: FeedbackTicketCategory;
  priority: FeedbackTicketPriority;
  status: FeedbackTicketStatus;
  content: string;
  contact?: string;
  adminReply?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackTicketSummaryCounts {
  myOpenCount: number;
  myActiveCount: number;
  adminOpenCount: number;
  adminInProgressCount: number;
}

export type WorkflowNodePreviewKind =
  | 'dataset_version'
  | 'model_ref'
  | 'model_version'
  | 'gee_credential'
  | 'table'
  | 'metrics_report'
  | 'artifact_file'
  | 'value';

export interface WorkflowPreviewAction {
  key: string;
  label?: string;
  handoff: AssetHandoffPayload;
}

export interface WorkflowNodePreviewValue {
  kind: WorkflowNodePreviewKind;
  title?: string;
  summary?: string;
  nextActions?: WorkflowPreviewAction[];
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

export interface GeeCredentialSummary {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  name: string;
  provider: string;
  description?: string;
  projectId?: string;
  serviceAccountEmail?: string;
  isPlatformDefault?: boolean;
  createdAt: string;
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
