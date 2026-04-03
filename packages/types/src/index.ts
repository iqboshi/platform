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
export type WorkflowRunStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed';

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
  kind: DatasetKind;
  status: DatasetStatus;
  bands?: number;
  projection?: string;
  footprint?: string;
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
  createdAt: string;
}

export interface WorkflowNodeCatalogItem {
  type: string;
  label: string;
  category: 'source' | 'preprocess' | 'split' | 'inference' | 'postprocess';
  description: string;
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
  outputDefs: Array<{
    key: string;
    label: string;
  }>;
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
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  };
  createdAt: string;
}

export interface WorkflowRunSummary {
  id: string;
  workflowVersionId: string;
  status: WorkflowRunStatus;
  startedAt?: string;
  finishedAt?: string;
  submittedBy: string;
}

export interface ModelVersionSummary {
  id: string;
  modelId: string;
  version: string;
  framework: string;
  taskType: string;
  createdAt: string;
}
