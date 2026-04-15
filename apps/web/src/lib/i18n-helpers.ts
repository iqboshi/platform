import type {
  DatasetKind,
  DatasetStatus,
  LocaleCode,
  RoleKey,
  WorkflowNodeCatalogItem,
  WorkflowRunStatus,
} from '@platform/types';

import type { TranslationKey } from '@/i18n/messages';

export function roleKey(role: RoleKey): TranslationKey {
  switch (role) {
    case 'ADMIN':
      return 'role.ADMIN';
    case 'ML_ENGINEER':
      return 'role.ML_ENGINEER';
    default:
      return 'role.MEMBER';
  }
}

export function localeKey(locale: LocaleCode): TranslationKey {
  return locale === 'zh-CN' ? 'locale.zh-CN' : 'locale.en-US';
}

export function datasetKindKey(kind: DatasetKind): TranslationKey {
  switch (kind) {
    case 'raster':
      return 'dataset.kind.raster';
    case 'vector':
      return 'dataset.kind.vector';
    case 'table':
      return 'dataset.kind.table';
    default:
      return 'dataset.kind.artifact';
  }
}

export function datasetStatusKey(status: DatasetStatus): TranslationKey {
  switch (status) {
    case 'uploaded':
      return 'dataset.status.uploaded';
    case 'processing':
      return 'dataset.status.processing';
    case 'ready':
      return 'dataset.status.ready';
    default:
      return 'dataset.status.failed';
  }
}

export function workflowRunStatusKey(status: WorkflowRunStatus): TranslationKey {
  switch (status) {
    case 'draft':
      return 'workflow.status.draft';
    case 'queued':
      return 'workflow.status.queued';
    case 'running':
      return 'workflow.status.running';
    case 'succeeded':
      return 'workflow.status.succeeded';
    default:
      return 'workflow.status.failed';
  }
}

export function workflowCategoryKey(category: WorkflowNodeCatalogItem['category']): TranslationKey {
  switch (category) {
    case 'source':
      return 'workflows.category.source';
    case 'preprocess':
      return 'workflows.category.preprocess';
    case 'split':
      return 'workflows.category.split';
    case 'inference':
      return 'workflows.category.inference';
    case 'control':
      return 'workflows.category.control';
    default:
      return 'workflows.category.postprocess';
  }
}

export function workflowNodeLabelKey(type: string): TranslationKey {
  switch (type) {
    case 'source.dataset':
      return 'workflow.node.source.dataset.label';
    case 'preprocess.cog':
      return 'workflow.node.preprocess.cog.label';
    case 'split.grid':
      return 'workflow.node.split.grid.label';
    case 'inference.segmentation':
      return 'workflow.node.inference.segmentation.label';
    default:
      return 'workflow.node.postprocess.export.label';
  }
}

export function workflowNodeDescriptionKey(type: string): TranslationKey {
  switch (type) {
    case 'source.dataset':
      return 'workflow.node.source.dataset.description';
    case 'preprocess.cog':
      return 'workflow.node.preprocess.cog.description';
    case 'split.grid':
      return 'workflow.node.split.grid.description';
    case 'inference.segmentation':
      return 'workflow.node.inference.segmentation.description';
    default:
      return 'workflow.node.postprocess.export.description';
  }
}

export function apiErrorKey(code: string): TranslationKey {
  switch (code) {
    case 'invalid_credentials':
      return 'error.invalid_credentials';
    case 'pending_approval':
      return 'error.pending_approval';
    case 'account_rejected':
      return 'error.account_rejected';
    case 'email_exists':
      return 'error.email_exists';
    case 'permission_denied':
      return 'error.permission_denied';
    default:
      return 'error.request_failed';
  }
}
