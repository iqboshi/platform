import type {
  AssetVersionRef,
  DatasetKind,
  GeeCredentialSummary,
  ModelVersionSummary,
  ProductAssetSummary,
} from '@platform/types';
import type { AssetOverview } from '@/lib/api';

export type AssetNextStepLocale = 'zh-CN' | 'en-US';

export interface AssetNextStepBadge {
  key: string;
  label: string;
  color?: string;
}

export interface AssetNextStepAction {
  key: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface AssetNextStepModel {
  badges: AssetNextStepBadge[];
  actions: AssetNextStepAction[];
  note?: string;
}

const NEXT_STEP_COPY = {
  'zh-CN': {
    noVersionBadge: '暂无版本',
    workflowReady: '可进工作流',
    mapReady: '可上图',
    roiReady: '可作 ROI 输入',
    productReady: '产品展示可见',
    productPending: '发布后可展示',
    modelReady: '工作流可选模型',
    overlayReady: '已沉淀为空间图层',
    workflowAction: '送入工作流',
    mapAction: '打开到地图',
    noVersionNote: '当前资产还没有可复用版本，暂时不能继续送入其他功能页。',
    mapUnavailableNote: '当前版本不是可直接上图的空间格式。',
    noResultNote: '当前还没有产出可复用的结果版本。',
    productReadyNote: '该资产已经可以在产品展示页中继续复用与公开展示。',
    productPendingNote: '先发布该资产，再进入产品展示页对外展示。',
    modelTrainedNote: '该模型版本已经能在兼容算法的工作流节点中直接选择。',
    modelCustomApiNote: '该模型版本已经能在自定义 API 推理节点中直接选择。',
    overlayNote: '该图层已经沉淀为空间资产，仍可继续回到地图中预览与叠加。',
  },
  'en-US': {
    noVersionBadge: 'No version yet',
    workflowReady: 'Workflow ready',
    mapReady: 'Map ready',
    roiReady: 'ROI input',
    productReady: 'Visible in products',
    productPending: 'Publish to show',
    modelReady: 'Workflow model',
    overlayReady: 'Saved map overlay',
    workflowAction: 'Use In Workflow',
    mapAction: 'Open In Map',
    noVersionNote: 'This asset does not have a reusable version yet.',
    mapUnavailableNote: 'This version is not in a map-ready spatial format.',
    noResultNote: 'This item does not have a reusable output version yet.',
    productReadyNote: 'This asset is already reusable from the product showcase.',
    productPendingNote: 'Publish this asset before exposing it on the product showcase.',
    modelTrainedNote: 'This model version is already selectable in compatible workflow nodes.',
    modelCustomApiNote: 'This model version is already selectable in custom API workflow nodes.',
    overlayNote: 'This overlay is already a saved spatial asset and can be previewed on the map again.',
  },
} as const;

function joinNotes(locale: AssetNextStepLocale, notes: string[]): string | undefined {
  const filtered = notes.filter((item) => item.trim().length > 0);
  if (!filtered.length) {
    return undefined;
  }
  return filtered.join(locale === 'zh-CN' ? '；' : '; ');
}

export function isDatasetVersionMapReady(
  kind: DatasetKind,
  datasetVersion: Pick<AssetOverview['datasetVersions'][number], 'metadata'> | undefined,
): boolean {
  if (!datasetVersion || !['raster', 'vector'].includes(kind)) {
    return false;
  }

  const metadata = datasetVersion.metadata ?? {};
  const contentType = String(metadata.content_type ?? '').toLowerCase();
  const originalFileName = String(metadata.original_file_name ?? '').toLowerCase();

  if (kind === 'raster') {
    return (
      contentType.includes('tiff') ||
      contentType.includes('geotiff') ||
      originalFileName.endsWith('.tif') ||
      originalFileName.endsWith('.tiff')
    );
  }

  return (
    contentType.includes('geo+json') ||
    contentType.endsWith('/json') ||
    originalFileName.endsWith('.geojson') ||
    originalFileName.endsWith('.json')
  );
}

function assetVersionCanOpenInMap(assetVersion: AssetVersionRef): boolean {
  return (
    assetVersion.consumableBy.includes('map_overlay') ||
    Boolean(assetVersion.spatialTraits?.overlayType) ||
    Boolean(assetVersion.spatialTraits?.previewUrl)
  );
}

export function buildDatasetNextSteps(
  locale: AssetNextStepLocale,
  options: {
    latestVersionId?: string;
    mapReady?: boolean;
    onOpenInWorkflow?: () => void;
    onOpenInMap?: () => void;
    missingVersionNote?: string;
  },
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];

  if (!options.latestVersionId) {
    return {
      badges: [{ key: 'missing-version', label: copy.noVersionBadge }],
      actions: [],
      note: options.missingVersionNote ?? copy.noVersionNote,
    };
  }

  const badges: AssetNextStepBadge[] = [{ key: 'workflow', label: copy.workflowReady, color: 'blue' }];
  const actions: AssetNextStepAction[] = [];
  const notes: string[] = [];

  if (options.onOpenInWorkflow) {
    actions.push({
      key: 'workflow',
      label: copy.workflowAction,
      onClick: options.onOpenInWorkflow,
    });
  }

  if (options.mapReady) {
    badges.push({ key: 'map', label: copy.mapReady, color: 'green' });
    if (options.onOpenInMap) {
      actions.push({
        key: 'map',
        label: copy.mapAction,
        onClick: options.onOpenInMap,
      });
    }
  } else {
    notes.push(copy.mapUnavailableNote);
  }

  return {
    badges,
    actions,
    note: joinNotes(locale, notes),
  };
}

export function buildAssetVersionRefNextSteps(
  locale: AssetNextStepLocale,
  options: {
    assetVersion: AssetVersionRef;
    onOpenInWorkflow?: () => void;
    onOpenInMap?: () => void;
  },
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  const { assetVersion } = options;
  const workflowReady = assetVersion.consumableBy.includes('workflow_dataset');
  const mapReady = assetVersionCanOpenInMap(assetVersion);
  const badges: AssetNextStepBadge[] = [];
  const actions: AssetNextStepAction[] = [];
  const notes: string[] = [];

  if (workflowReady) {
    badges.push({ key: 'workflow', label: copy.workflowReady, color: 'blue' });
    if (options.onOpenInWorkflow) {
      actions.push({
        key: 'workflow',
        label: copy.workflowAction,
        onClick: options.onOpenInWorkflow,
      });
    }
  }

  if (mapReady) {
    badges.push({ key: 'map', label: copy.mapReady, color: 'green' });
    if (options.onOpenInMap) {
      actions.push({
        key: 'map',
        label: copy.mapAction,
        onClick: options.onOpenInMap,
      });
    }
  } else {
    notes.push(copy.mapUnavailableNote);
  }

  if (!workflowReady && !mapReady) {
    notes.push(copy.noResultNote);
  }

  return {
    badges,
    actions,
    note: joinNotes(locale, notes),
  };
}

export function buildSpatialRoiNextSteps(
  locale: AssetNextStepLocale,
  options: {
    onOpenInWorkflow?: () => void;
  },
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  return {
    badges: [{ key: 'roi', label: copy.roiReady, color: 'gold' }],
    actions: options.onOpenInWorkflow
      ? [
          {
            key: 'workflow',
            label: copy.workflowAction,
            onClick: options.onOpenInWorkflow,
          },
        ]
      : [],
  };
}

export function buildProductNextSteps(
  locale: AssetNextStepLocale,
  product: Pick<ProductAssetSummary, 'visibility'>,
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  const isPublic = product.visibility === 'public';
  return {
    badges: [
      {
        key: 'product-showcase',
        label: isPublic ? copy.productReady : copy.productPending,
        color: isPublic ? 'green' : 'default',
      },
    ],
    actions: [],
    note: isPublic ? copy.productReadyNote : copy.productPendingNote,
  };
}

export function buildModelNextSteps(
  locale: AssetNextStepLocale,
  model: Pick<ModelVersionSummary, 'sourceType'>,
  options: {
    onOpenInWorkflow?: () => void;
  } = {},
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  const isCustomApi = model.sourceType === 'custom_api';
  return {
    badges: [{ key: 'model', label: copy.modelReady, color: 'purple' }],
    actions: options.onOpenInWorkflow
      ? [
          {
            key: 'workflow',
            label: copy.workflowAction,
            onClick: options.onOpenInWorkflow,
          },
        ]
      : [],
    note: isCustomApi ? copy.modelCustomApiNote : copy.modelTrainedNote,
  };
}

export function buildGeeCredentialNextSteps(
  locale: AssetNextStepLocale,
  _credential: Pick<GeeCredentialSummary, 'isPlatformDefault'>,
  options: {
    onOpenInWorkflow?: () => void;
  } = {},
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  return {
    badges: [
      {
        key: 'gee',
        label: locale === 'zh-CN' ? 'GEE 工作流输入' : 'GEE workflow input',
        color: 'cyan',
      },
    ],
    actions: options.onOpenInWorkflow
      ? [
          {
            key: 'workflow',
            label: copy.workflowAction,
            onClick: options.onOpenInWorkflow,
          },
        ]
      : [],
    note:
      locale === 'zh-CN'
        ? '该凭证可以直接送入兼容的 Sentinel 工作流起点。'
        : 'This credential can be sent directly into compatible Sentinel workflow starters.',
  };
}

export function buildSpatialOverlayNextSteps(
  locale: AssetNextStepLocale,
  options: {
    onOpenInMap?: () => void;
  },
): AssetNextStepModel {
  const copy = NEXT_STEP_COPY[locale];
  return {
    badges: [{ key: 'overlay', label: copy.overlayReady, color: 'green' }],
    actions: options.onOpenInMap
      ? [
          {
            key: 'map',
            label: copy.mapAction,
            onClick: options.onOpenInMap,
          },
        ]
      : [],
    note: copy.overlayNote,
  };
}
