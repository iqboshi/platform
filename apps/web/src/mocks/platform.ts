import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowRunSummary,
  WorkflowVersionDetail,
} from '@platform/types';

const workspace: WorkspaceSummary = {
  id: 'ws-earth-lab',
  name: 'Earth Observation Lab',
  slug: 'earth-observation-lab',
  description: 'Remote sensing datasets, workflows, and inference runs for the internal team.',
  memberCount: 7,
};

const datasets: DatasetSummary[] = [
  {
    id: 'dataset-s2-north',
    workspaceId: 'ws-earth-lab',
    name: 'Sentinel-2 Mosaic North Plot',
    kind: 'raster',
    status: 'ready',
    bands: 4,
    projection: 'EPSG:3857',
    footprint: 'North plot AOI',
    updatedAt: '2026-04-03T11:00:00Z',
  },
  {
    id: 'dataset-boundaries',
    workspaceId: 'ws-earth-lab',
    name: 'Parcel Boundaries',
    kind: 'vector',
    status: 'ready',
    projection: 'EPSG:4326',
    footprint: 'Beijing peri-urban parcels',
    updatedAt: '2026-04-03T08:00:00Z',
  },
  {
    id: 'dataset-inference-output',
    workspaceId: 'ws-earth-lab',
    name: 'Segmentation Predictions',
    kind: 'artifact',
    status: 'processing',
    updatedAt: '2026-04-03T12:00:00Z',
  },
];

const datasetVersions: DatasetVersionSummary[] = [
  {
    id: 'dsv-s2-v1',
    datasetId: 'dataset-s2-north',
    version: 1,
    status: 'ready',
    assetPath: 's3://platform-dev/datasets/sentinel-2-north/v1/cog.tif',
    previewUrl: '/tiles/datasets/dsv-s2-v1/tilejson.json',
    bbox: [116.2, 39.7, 116.8, 40.2],
    metadata: { sensor: 'Sentinel-2', resolution_m: 10 },
    createdAt: '2026-04-01T12:00:00Z',
  },
  {
    id: 'dsv-boundaries-v1',
    datasetId: 'dataset-boundaries',
    version: 1,
    status: 'ready',
    assetPath: 's3://platform-dev/datasets/parcel-boundaries/v1/source.geojson',
    previewUrl: '/tiles/datasets/dsv-boundaries-v1/tilejson.json',
    bbox: [116.2, 39.7, 116.8, 40.2],
    metadata: { feature_count: 328 },
    createdAt: '2026-03-30T09:00:00Z',
  },
];

const workflowCatalog: WorkflowNodeCatalogItem[] = [
  {
    type: 'source.dataset',
    label: 'Dataset Source',
    category: 'source',
    description: 'Bind a dataset version as the workflow input.',
  },
  {
    type: 'preprocess.cog',
    label: 'Raster Preprocess',
    category: 'preprocess',
    description: 'Prepare raster inputs, normalize, or build COG derivatives.',
  },
  {
    type: 'split.grid',
    label: 'Tile Split',
    category: 'split',
    description: 'Generate fixed-size tiles or train/val/test derivatives.',
  },
  {
    type: 'inference.segmentation',
    label: 'Model Inference',
    category: 'inference',
    description: 'Run model inference against tiles or full-scene windows.',
  },
  {
    type: 'postprocess.export',
    label: 'Export Artifact',
    category: 'postprocess',
    description: 'Export predictions or derived products for delivery.',
  },
];

const workflowVersion: WorkflowVersionDetail = {
  id: 'wfv-segmentation-demo-v1',
  workflowId: 'wf-segmentation-demo',
  version: 1,
  graph: {
    nodes: [
      {
        id: 'node-source',
        type: 'source.dataset',
        position: { x: 0, y: 80 },
        params: { datasetVersionId: 'dsv-s2-v1' },
        inputBindings: {},
        outputDefs: [{ key: 'image', label: 'Image' }],
      },
      {
        id: 'node-preprocess',
        type: 'preprocess.cog',
        position: { x: 280, y: 80 },
        params: { normalize: true },
        inputBindings: { image: 'node-source:image' },
        outputDefs: [{ key: 'prepared', label: 'Prepared Raster' }],
      },
      {
        id: 'node-split',
        type: 'split.grid',
        position: { x: 560, y: 80 },
        params: { tileSize: 512, overlap: 64 },
        inputBindings: { raster: 'node-preprocess:prepared' },
        outputDefs: [{ key: 'tiles', label: 'Tiles' }],
      },
      {
        id: 'node-inference',
        type: 'inference.segmentation',
        position: { x: 840, y: 80 },
        params: { modelVersionId: 'modelv-seg-unet-v1' },
        inputBindings: { tiles: 'node-split:tiles' },
        outputDefs: [{ key: 'predictions', label: 'Predictions' }],
      },
      {
        id: 'node-export',
        type: 'postprocess.export',
        position: { x: 1120, y: 80 },
        params: { format: 'GeoTIFF' },
        inputBindings: { artifact: 'node-inference:predictions' },
        outputDefs: [{ key: 'package', label: 'Package' }],
      },
    ],
    edges: [
      { id: 'edge-1', source: 'node-source', target: 'node-preprocess' },
      { id: 'edge-2', source: 'node-preprocess', target: 'node-split' },
      { id: 'edge-3', source: 'node-split', target: 'node-inference' },
      { id: 'edge-4', source: 'node-inference', target: 'node-export' },
    ],
  },
  createdAt: '2026-04-03T01:00:00Z',
};

const workflowRuns: WorkflowRunSummary[] = [
  {
    id: 'run-001',
    workflowVersionId: 'wfv-segmentation-demo-v1',
    status: 'running',
    startedAt: '2026-04-03T11:40:00Z',
    submittedBy: 'Platform Admin',
  },
  {
    id: 'run-000',
    workflowVersionId: 'wfv-segmentation-demo-v1',
    status: 'succeeded',
    startedAt: '2026-04-03T05:40:00Z',
    finishedAt: '2026-04-03T06:00:00Z',
    submittedBy: 'Platform Admin',
  },
];

const modelVersions: ModelVersionSummary[] = [
  {
    id: 'modelv-seg-unet-v1',
    modelId: 'model-seg-unet',
    version: '1.0.0',
    framework: 'PyTorch',
    taskType: 'segmentation',
    createdAt: '2026-03-31T10:00:00Z',
  },
];

export const platformMock = {
  workspace,
  datasets,
  datasetVersions,
  workflowCatalog,
  workflowVersion,
  workflowRuns,
  modelVersions,
};
