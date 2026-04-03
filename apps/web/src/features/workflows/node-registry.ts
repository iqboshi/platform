import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
  WorkflowNodeCatalogItem,
} from '@platform/types';

export type WorkflowParamFieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'select'
  | 'datasetVersion'
  | 'modelVersion';

export interface WorkflowPortDefinition {
  key: string;
  label: string;
  description?: string;
}

export interface WorkflowParamOption {
  label: string;
  value: string;
}

export interface WorkflowParamDefinition {
  key: string;
  label: string;
  fieldType: WorkflowParamFieldType;
  description?: string;
  defaultValue?: string | number | boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: WorkflowParamOption[];
}

export interface WorkflowNodeDefinition extends WorkflowNodeCatalogItem {
  inputs: WorkflowPortDefinition[];
  outputs: WorkflowPortDefinition[];
  params: WorkflowParamDefinition[];
}

export interface WorkflowEditorContext {
  datasets: DatasetSummary[];
  datasetVersions: DatasetVersionSummary[];
  modelVersions: ModelVersionSummary[];
}

type WorkflowNodeShape = Pick<WorkflowNodeDefinition, 'inputs' | 'outputs' | 'params'>;

const builtinNodeShape: Record<string, WorkflowNodeShape> = {
  'source.dataset': {
    inputs: [],
    outputs: [
      {
        key: 'image',
        label: 'Image',
      },
    ],
    params: [
      {
        key: 'datasetVersionId',
        label: 'Dataset Version',
        fieldType: 'datasetVersion',
        description: 'Bind a dataset version as the default source for this node.',
      },
    ],
  },
  'preprocess.cog': {
    inputs: [
      {
        key: 'image',
        label: 'Input Raster',
      },
    ],
    outputs: [
      {
        key: 'prepared',
        label: 'Prepared Raster',
      },
    ],
    params: [
      {
        key: 'normalize',
        label: 'Normalize',
        fieldType: 'boolean',
        defaultValue: true,
        description: 'Normalize bands before downstream jobs.',
      },
      {
        key: 'targetProjection',
        label: 'Target Projection',
        fieldType: 'text',
        defaultValue: 'EPSG:3857',
        placeholder: 'EPSG:3857',
      },
    ],
  },
  'split.grid': {
    inputs: [
      {
        key: 'raster',
        label: 'Prepared Raster',
      },
    ],
    outputs: [
      {
        key: 'tiles',
        label: 'Tiles',
      },
    ],
    params: [
      {
        key: 'tileSize',
        label: 'Tile Size',
        fieldType: 'number',
        defaultValue: 512,
        min: 64,
        step: 64,
      },
      {
        key: 'overlap',
        label: 'Overlap',
        fieldType: 'number',
        defaultValue: 64,
        min: 0,
        step: 16,
      },
      {
        key: 'splitStrategy',
        label: 'Split Strategy',
        fieldType: 'select',
        defaultValue: 'train-val-test',
        options: [
          { value: 'train-val-test', label: 'Train / Val / Test' },
          { value: 'fixed-grid', label: 'Fixed Grid' },
        ],
      },
    ],
  },
  'inference.segmentation': {
    inputs: [
      {
        key: 'tiles',
        label: 'Tiles',
      },
    ],
    outputs: [
      {
        key: 'predictions',
        label: 'Predictions',
      },
    ],
    params: [
      {
        key: 'modelVersionId',
        label: 'Model Version',
        fieldType: 'modelVersion',
        description: 'Select the default model bound to this node.',
      },
      {
        key: 'batchSize',
        label: 'Batch Size',
        fieldType: 'number',
        defaultValue: 4,
        min: 1,
        step: 1,
      },
      {
        key: 'threshold',
        label: 'Confidence Threshold',
        fieldType: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  'postprocess.export': {
    inputs: [
      {
        key: 'artifact',
        label: 'Predictions',
      },
    ],
    outputs: [
      {
        key: 'package',
        label: 'Export Package',
      },
    ],
    params: [
      {
        key: 'format',
        label: 'Export Format',
        fieldType: 'select',
        defaultValue: 'GeoTIFF',
        options: [
          { value: 'GeoTIFF', label: 'GeoTIFF' },
          { value: 'GeoJSON', label: 'GeoJSON' },
          { value: 'COCO', label: 'COCO JSON' },
        ],
      },
      {
        key: 'includePreview',
        label: 'Include Preview',
        fieldType: 'boolean',
        defaultValue: true,
      },
    ],
  },
};

const defaultNodeShape: WorkflowNodeShape = {
  inputs: [],
  outputs: [],
  params: [],
};

export function enrichWorkflowCatalog(
  catalog: WorkflowNodeCatalogItem[],
): WorkflowNodeDefinition[] {
  return catalog.map((item) => ({
    ...item,
    ...(builtinNodeShape[item.type] ?? defaultNodeShape),
  }));
}

export function createDefaultParams(
  definition: WorkflowNodeDefinition,
  context: WorkflowEditorContext,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const field of definition.params) {
    if (field.fieldType === 'datasetVersion') {
      defaults[field.key] = context.datasetVersions[0]?.id ?? '';
      continue;
    }
    if (field.fieldType === 'modelVersion') {
      defaults[field.key] = context.modelVersions[0]?.id ?? '';
      continue;
    }
    if (field.defaultValue !== undefined) {
      defaults[field.key] = field.defaultValue;
    }
  }

  return defaults;
}

export function resolveParameterOptions(
  definition: WorkflowParamDefinition,
  context: WorkflowEditorContext,
): WorkflowParamOption[] {
  if (definition.fieldType === 'datasetVersion') {
    const datasetNames = new Map(context.datasets.map((item) => [item.id, item.name]));
    return context.datasetVersions.map((item) => ({
      value: item.id,
      label: `${datasetNames.get(item.datasetId) ?? item.datasetId} / v${item.version}`,
    }));
  }

  if (definition.fieldType === 'modelVersion') {
    return context.modelVersions.map((item) => ({
      value: item.id,
      label: `${item.version} / ${item.framework}`,
    }));
  }

  return definition.options ?? [];
}

export function getWorkflowDefinitionByType(
  definitions: WorkflowNodeDefinition[],
  type: string,
): WorkflowNodeDefinition | undefined {
  return definitions.find((item) => item.type === type);
}

export function getPortLabel(
  ports: WorkflowPortDefinition[],
  key: string | undefined,
): string {
  if (!key) {
    return '';
  }
  return ports.find((item) => item.key === key)?.label ?? key;
}
