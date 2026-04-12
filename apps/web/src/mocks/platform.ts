import type {
  DashboardConfig,
  DatasetSummary,
  DatasetVersionSummary,
  FeedbackTicketSummary,
  FeedbackTicketSummaryCounts,
  GeeCredentialSummary,
  ModelVersionSummary,
  ProductAssetSummary,
  WorkspaceSummary,
  WorkflowNodeCatalogItem,
  WorkflowRunSummary,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
} from '@platform/types';

const workspace: WorkspaceSummary = {
  id: 'ws-earth-lab',
  name: 'Earth Observation Lab',
  slug: 'earth-observation-lab',
  description: 'Tabular datasets, workflow execution, and model inference for the internal team.',
  memberCount: 7,
};

const datasets: DatasetSummary[] = [
  {
    id: 'dataset-tabular-input',
    workspaceId: 'ws-earth-lab',
    name: 'Sample Tabular Input',
    kind: 'table',
    status: 'ready',
    updatedAt: '2026-04-03T11:00:00Z',
  },
  {
    id: 'dataset-tabular-prediction',
    workspaceId: 'ws-earth-lab',
    name: 'Sample Prediction Output',
    kind: 'table',
    status: 'ready',
    updatedAt: '2026-04-03T10:30:00Z',
  },
  {
    id: 'dataset-tabular-ground-truth',
    workspaceId: 'ws-earth-lab',
    name: 'Sample Ground Truth',
    kind: 'table',
    status: 'ready',
    updatedAt: '2026-04-03T10:00:00Z',
  },
];

const datasetVersions: DatasetVersionSummary[] = [
  {
    id: 'dsv-tabular-input-v1',
    datasetId: 'dataset-tabular-input',
    version: 1,
    status: 'ready',
    assetPath: 'storage/mock/sample-tabular-input.csv',
    previewUrl: '/api/v1/dataset-versions/dsv-tabular-input-v1/download',
    metadata: {
      columns: ['feature_a', 'feature_b', 'target'],
      rowCount: 4,
    },
    createdAt: '2026-04-01T12:00:00Z',
  },
  {
    id: 'dsv-tabular-prediction-v1',
    datasetId: 'dataset-tabular-prediction',
    version: 1,
    status: 'ready',
    assetPath: 'storage/mock/sample-prediction-output.csv',
    previewUrl: '/api/v1/dataset-versions/dsv-tabular-prediction-v1/download',
    metadata: {
      columns: ['feature_a', 'prediction'],
      rowCount: 4,
    },
    createdAt: '2026-04-01T13:00:00Z',
  },
  {
    id: 'dsv-tabular-ground-truth-v1',
    datasetId: 'dataset-tabular-ground-truth',
    version: 1,
    status: 'ready',
    assetPath: 'storage/mock/sample-ground-truth.csv',
    previewUrl: '/api/v1/dataset-versions/dsv-tabular-ground-truth-v1/download',
    metadata: {
      columns: ['feature_a', 'target'],
      rowCount: 4,
    },
    createdAt: '2026-04-01T14:00:00Z',
  },
];

const workflowCatalog: WorkflowNodeCatalogItem[] = [
  {
    type: 'source.dataset_version',
    label: 'Dataset Version',
    category: 'source',
    description: 'Select a dataset version and expose it to downstream table nodes.',
    runtimeKind: 'source',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['dataset', 'version', 'input'],
    inputs: [],
    outputs: [{ key: 'dataset', label: 'Dataset Version', dataTypes: ['dataset_version'] }],
    params: [
      {
        key: 'datasetVersionId',
        label: 'Dataset Version',
        fieldType: 'datasetVersion',
        required: true,
      },
    ],
    starterBindings: [
      {
        inputKind: 'dataset_version',
        paramKey: 'datasetVersionId',
        autoCreate: true,
        priority: 100,
      },
    ],
    outputBehaviors: [
      {
        portKey: 'dataset',
        previewKinds: ['dataset_version'],
        usages: [
          { target: 'workflow', inputKind: 'dataset_version' },
          { target: 'spatial', inputKind: 'asset_version' },
        ],
      },
    ],
  },
  {
    type: 'source.model_version',
    label: 'Model Version',
    category: 'source',
    description: 'Select a saved model version and expose it as a reusable workflow input.',
    runtimeKind: 'source',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['model', 'version', 'input'],
    inputs: [],
    outputs: [{ key: 'model', label: 'Model Version', dataTypes: ['model_version'] }],
    params: [
      {
        key: 'modelVersionId',
        label: 'Model Version',
        fieldType: 'modelVersion',
        required: true,
      },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: true,
        priority: 100,
      },
    ],
    outputBehaviors: [
      {
        portKey: 'model',
        previewKinds: ['model_version'],
        usages: [{ target: 'workflow', inputKind: 'model_version' }],
      },
    ],
  },
  {
    type: 'source.sentinel2_gee_download',
    label: 'Sentinel-2 Download',
    category: 'source',
    description: 'Download one Sentinel-2 L2A scene from Google Earth Engine by manual bbox or saved ROI.',
    runtimeKind: 'source',
    supportedTasks: ['sentinel_download'],
    tags: ['sentinel', 'gee', 'download', 'raster'],
    inputs: [],
    outputs: [{ key: 'dataset', label: 'Raster Dataset', dataTypes: ['dataset_version'] }],
    params: [
      {
        key: 'roiMode',
        label: 'ROI Mode',
        fieldType: 'select',
        defaultValue: 'manual_bbox',
        options: [
          { value: 'manual_bbox', label: 'Manual BBox' },
          { value: 'saved_roi', label: 'Saved ROI' },
        ],
      },
      {
        key: 'roiId',
        label: 'Saved ROI',
        fieldType: 'select',
      },
      {
        key: 'bbox',
        label: 'BBox',
        fieldType: 'text',
      },
      {
        key: 'startDate',
        label: 'Start Date',
        fieldType: 'text',
        defaultValue: '2025-06-01',
      },
      {
        key: 'endDate',
        label: 'End Date',
        fieldType: 'text',
        defaultValue: '2025-06-30',
      },
      {
        key: 'maxCloudCover',
        label: 'Max Cloud Cover (%)',
        fieldType: 'number',
        defaultValue: 20,
      },
      {
        key: 'bands',
        label: 'Bands',
        fieldType: 'multiselect',
        defaultValue: ['B4', 'B3', 'B2'],
      },
      {
        key: 'scale',
        label: 'Scale',
        fieldType: 'number',
        defaultValue: 10,
      },
      {
        key: 'credentialMode',
        label: 'Credential Mode',
        fieldType: 'select',
        defaultValue: 'platform_default',
        options: [
          { value: 'platform_default', label: 'Platform Default' },
          { value: 'personal', label: 'Personal' },
        ],
      },
      {
        key: 'personalCredentialId',
        label: 'Personal Credential',
        fieldType: 'select',
      },
    ],
    starterBindings: [
      {
        inputKind: 'spatial_roi',
        paramKey: 'roiId',
        presetParams: { roiMode: 'saved_roi' },
        autoCreate: true,
        priority: 100,
      },
      {
        inputKind: 'gee_credential',
        paramKey: 'personalCredentialId',
        presetParams: { credentialMode: 'personal' },
        autoCreate: true,
        priority: 90,
      },
    ],
    outputBehaviors: [
      {
        portKey: 'dataset',
        previewKinds: ['dataset_version'],
        usages: [
          { target: 'workflow', inputKind: 'dataset_version' },
          { target: 'spatial', inputKind: 'asset_version' },
        ],
      },
    ],
  },
  {
    type: 'table.load_csv',
    label: 'Load CSV Table',
    category: 'source',
    description: 'Load a CSV dataset version into an in-memory tabular dataset.',
    runtimeKind: 'transform',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'csv', 'load'],
    inputs: [{ key: 'dataset', label: 'Dataset Version', dataTypes: ['dataset_version'], required: true }],
    outputs: [{ key: 'table', label: 'Table', dataTypes: ['table'] }],
    params: [
      {
        key: 'delimiter',
        label: 'Delimiter',
        fieldType: 'select',
        defaultValue: ',',
        required: true,
        options: [
          { value: ',', label: 'Comma' },
          { value: ';', label: 'Semicolon' },
          { value: '\\t', label: 'Tab' },
        ],
      },
    ],
  },
  {
    type: 'table.train_test_split',
    label: 'Train/Test Split',
    category: 'preprocess',
    description: 'Split a tabular dataset into train and test tables.',
    runtimeKind: 'transform',
    supportedTasks: ['tabular_training'],
    tags: ['table', 'split', 'train', 'test'],
    inputs: [{ key: 'table', label: 'Input Table', dataTypes: ['table'], required: true }],
    outputs: [
      { key: 'trainTable', label: 'Train Table', dataTypes: ['table'] },
      { key: 'testTable', label: 'Test Table', dataTypes: ['table'] },
    ],
    params: [
      { key: 'testSize', label: 'Test Size', fieldType: 'number', defaultValue: 0.2, required: true },
      { key: 'shuffle', label: 'Shuffle', fieldType: 'boolean', defaultValue: true },
      { key: 'randomState', label: 'Random State', fieldType: 'number', defaultValue: 42 },
    ],
  },
  {
    type: 'tabular.linear_regression_predict',
    label: 'Linear Regression Predict',
    category: 'inference',
    description: 'Run a linear regression model against CSV rows and append predictions.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'prediction', 'regression', 'linear'],
    inputs: [
      { key: 'model', label: 'Model Version', dataTypes: ['model_version'] },
      { key: 'table', label: 'Input Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
      { key: 'clipMin', label: 'Clip Minimum', fieldType: 'text' },
      { key: 'clipMax', label: 'Clip Maximum', fieldType: 'text' },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
  {
    type: 'tabular.predict',
    label: 'Legacy Tabular Prediction',
    category: 'inference',
    description: 'Legacy generic tabular prediction node kept for backward compatibility.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'prediction', 'regression', 'legacy'],
    inputs: [
      { key: 'model', label: 'Model Version', dataTypes: ['model_version'] },
      { key: 'table', label: 'Input Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'runtimeParametersJson', label: 'Runtime Parameters JSON', fieldType: 'text', defaultValue: '{}' },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
  {
    type: 'tabular.svm_regression_predict',
    label: 'SVM Regression Predict',
    category: 'inference',
    description: 'Run an SVR model against CSV rows and append predictions.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'prediction', 'regression', 'svm'],
    inputs: [
      { key: 'model', label: 'Model Version', dataTypes: ['model_version'] },
      { key: 'table', label: 'Input Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
      { key: 'cacheSize', label: 'Cache Size (MB)', fieldType: 'number', defaultValue: 200 },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
  {
    type: 'tabular.linear_regression_train',
    label: 'Linear Regression Train',
    category: 'inference',
    description: 'Train a linear regression model from a CSV table.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_training'],
    tags: ['table', 'training', 'regression', 'linear'],
    inputs: [
      { key: 'trainTable', label: 'Train Table', dataTypes: ['table'], required: true },
      { key: 'testTable', label: 'Test Table', dataTypes: ['table'] },
    ],
    outputs: [
      { key: 'model', label: 'Trained Model', dataTypes: ['model_ref'] },
      { key: 'report', label: 'Training Metrics', dataTypes: ['metrics_report'] },
    ],
    params: [
      { key: 'featureColumns', label: 'Feature Columns', fieldType: 'text', required: true },
      { key: 'targetColumn', label: 'Target Column', fieldType: 'text', defaultValue: 'target', required: true },
      { key: 'fitIntercept', label: 'Fit Intercept', fieldType: 'boolean', defaultValue: true },
      { key: 'positive', label: 'Positive Coefficients', fieldType: 'boolean', defaultValue: false },
    ],
  },
  {
    type: 'tabular.random_forest_regression_predict',
    label: 'Random Forest Predict',
    category: 'inference',
    description: 'Run a random forest regressor against CSV rows and append predictions.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'prediction', 'regression', 'random-forest'],
    inputs: [
      { key: 'model', label: 'Model Version', dataTypes: ['model_version'] },
      { key: 'table', label: 'Input Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
      { key: 'nJobs', label: 'Parallel Jobs', fieldType: 'number', defaultValue: 1 },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
  {
    type: 'tabular.svm_regression_train',
    label: 'SVM Regression Train',
    category: 'inference',
    description: 'Train an SVR model from a CSV table.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_training'],
    tags: ['table', 'training', 'regression', 'svm'],
    inputs: [
      { key: 'trainTable', label: 'Train Table', dataTypes: ['table'], required: true },
      { key: 'testTable', label: 'Test Table', dataTypes: ['table'] },
    ],
    outputs: [
      { key: 'model', label: 'Trained Model', dataTypes: ['model_ref'] },
      { key: 'report', label: 'Training Metrics', dataTypes: ['metrics_report'] },
    ],
    params: [
      { key: 'featureColumns', label: 'Feature Columns', fieldType: 'text', required: true },
      { key: 'targetColumn', label: 'Target Column', fieldType: 'text', defaultValue: 'target', required: true },
      {
        key: 'kernel',
        label: 'Kernel',
        fieldType: 'select',
        defaultValue: 'rbf',
        required: true,
        options: [
          { value: 'rbf', label: 'RBF' },
          { value: 'linear', label: 'Linear' },
          { value: 'poly', label: 'Poly' },
          { value: 'sigmoid', label: 'Sigmoid' },
        ],
      },
      { key: 'c', label: 'C', fieldType: 'number', defaultValue: 1.0 },
      { key: 'epsilon', label: 'Epsilon', fieldType: 'number', defaultValue: 0.1 },
      { key: 'gamma', label: 'Gamma', fieldType: 'text', defaultValue: 'scale' },
      { key: 'cacheSize', label: 'Cache Size (MB)', fieldType: 'number', defaultValue: 200 },
    ],
  },
  {
    type: 'tabular.random_forest_regression_train',
    label: 'Random Forest Train',
    category: 'inference',
    description: 'Train a random forest regressor from a CSV table.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_training'],
    tags: ['table', 'training', 'regression', 'random-forest'],
    inputs: [
      { key: 'trainTable', label: 'Train Table', dataTypes: ['table'], required: true },
      { key: 'testTable', label: 'Test Table', dataTypes: ['table'] },
    ],
    outputs: [
      { key: 'model', label: 'Trained Model', dataTypes: ['model_ref'] },
      { key: 'report', label: 'Training Metrics', dataTypes: ['metrics_report'] },
    ],
    params: [
      { key: 'featureColumns', label: 'Feature Columns', fieldType: 'text', required: true },
      { key: 'targetColumn', label: 'Target Column', fieldType: 'text', defaultValue: 'target', required: true },
      { key: 'nEstimators', label: 'Trees', fieldType: 'number', defaultValue: 100 },
      { key: 'maxDepth', label: 'Max Depth', fieldType: 'text' },
      { key: 'minSamplesSplit', label: 'Min Samples Split', fieldType: 'number', defaultValue: 2 },
      { key: 'minSamplesLeaf', label: 'Min Samples Leaf', fieldType: 'number', defaultValue: 1 },
      { key: 'randomState', label: 'Random State', fieldType: 'number', defaultValue: 42 },
      { key: 'nJobs', label: 'Parallel Jobs', fieldType: 'number', defaultValue: 1 },
    ],
  },
  {
    type: 'metrics.validate_regression',
    label: 'Regression Validation',
    category: 'postprocess',
    description: 'Compare prediction and ground-truth tables and compute regression metrics.',
    runtimeKind: 'transform',
    supportedTasks: ['tabular_validation'],
    tags: ['validation', 'metrics', 'regression'],
    inputs: [
      { key: 'predictionTable', label: 'Prediction Table', dataTypes: ['table'], required: true },
      { key: 'groundTruthTable', label: 'Ground Truth Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'report', label: 'Metrics Report', dataTypes: ['metrics_report'] }],
    params: [
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'groundTruthColumn', label: 'Ground Truth Column', fieldType: 'text', defaultValue: 'target', required: true },
      {
        key: 'metrics',
        label: 'Metrics',
        fieldType: 'multiselect',
        defaultValue: ['r2', 'mae', 'rmse'],
        required: true,
        options: [
          { value: 'r2', label: 'R2' },
          { value: 'mae', label: 'MAE' },
          { value: 'mse', label: 'MSE' },
          { value: 'rmse', label: 'RMSE' },
          { value: 'mape', label: 'MAPE' },
        ],
      },
    ],
  },
  {
    type: 'model.save_trained_model',
    label: 'Save Trained Model',
    category: 'postprocess',
    description: 'Persist a trained model into your private model assets.',
    runtimeKind: 'export',
    supportedTasks: ['tabular_training'],
    tags: ['model', 'save', 'asset'],
    inputs: [{ key: 'model', label: 'Trained Model', dataTypes: ['model_ref'], required: true }],
    outputs: [
      { key: 'model', label: 'Model', dataTypes: ['model_ref'] },
      { key: 'artifact', label: 'Artifact', dataTypes: ['artifact'] },
    ],
    params: [
      { key: 'saveToPlatform', label: 'Save To Platform', fieldType: 'boolean', defaultValue: true },
      { key: 'outputModelName', label: 'Model Name', fieldType: 'text', defaultValue: 'Trained Model' },
      { key: 'outputModelVersion', label: 'Model Version', fieldType: 'text', defaultValue: '1.0.0' },
    ],
  },
  {
    type: 'export.table',
    label: 'Export Prediction Table',
    category: 'postprocess',
    description: 'Write the current table to CSV and optionally save it back to the platform.',
    runtimeKind: 'export',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['export', 'table', 'csv'],
    inputs: [{ key: 'input', label: 'Table Input', dataTypes: ['table'], required: true }],
    outputs: [{ key: 'artifact', label: 'Artifact', dataTypes: ['artifact'] }],
    params: [
      { key: 'saveToPlatform', label: 'Save To Platform', fieldType: 'boolean', defaultValue: true },
      { key: 'outputDatasetName', label: 'Output Dataset Name', fieldType: 'text', defaultValue: 'Prediction Output' },
    ],
  },
  {
    type: 'custom.api_predict',
    label: 'Custom API Predict',
    category: 'inference',
    description: 'Send a table to an external HTTP API model and merge the prediction result back.',
    runtimeKind: 'inference',
    supportedTasks: ['custom_api_prediction'],
    tags: ['table', 'prediction', 'custom', 'api'],
    inputs: [
      { key: 'model', label: 'Custom Model', dataTypes: ['model_version'] },
      { key: 'table', label: 'Input Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Custom Model', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction' },
      { key: 'callParametersJson', label: 'Call Parameters JSON', fieldType: 'text', defaultValue: '{}' },
    ],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
  {
    type: 'export.metrics',
    label: 'Export Metrics Report',
    category: 'postprocess',
    description: 'Write metrics to JSON or CSV and optionally save the artifact to the platform.',
    runtimeKind: 'export',
    supportedTasks: ['tabular_validation'],
    tags: ['export', 'metrics', 'report'],
    inputs: [{ key: 'input', label: 'Metrics Input', dataTypes: ['metrics_report'], required: true }],
    outputs: [{ key: 'artifact', label: 'Artifact', dataTypes: ['artifact'] }],
    params: [
      { key: 'saveToPlatform', label: 'Save To Platform', fieldType: 'boolean', defaultValue: true },
      { key: 'outputDatasetName', label: 'Output Dataset Name', fieldType: 'text', defaultValue: 'Validation Metrics' },
      {
        key: 'format',
        label: 'Format',
        fieldType: 'select',
        defaultValue: 'json',
        required: true,
        options: [
          { value: 'json', label: 'JSON' },
          { value: 'csv', label: 'CSV' },
        ],
      },
    ],
  },
];

const workflowVersion: WorkflowVersionDetail = {
  id: 'wfv-tabular-demo-v1',
  workflowId: 'wf-tabular-demo',
  version: 1,
  graph: {
    nodes: [
      {
        id: 'dataset-source',
        type: 'source.dataset_version',
        position: { x: 0, y: 160 },
        params: { datasetVersionId: 'dsv-tabular-input-v1' },
        inputBindings: {},
        outputDefs: [{ key: 'dataset', label: 'Dataset Version', dataTypes: ['dataset_version'] }],
      },
      {
        id: 'load-table',
        type: 'table.load_csv',
        position: { x: 260, y: 160 },
        params: { delimiter: ',' },
        inputBindings: { dataset: 'dataset-source:dataset' },
        outputDefs: [{ key: 'table', label: 'Table', dataTypes: ['table'] }],
      },
      {
        id: 'predict-table',
        type: 'tabular.linear_regression_predict',
        position: { x: 560, y: 160 },
        params: {
          modelVersionId: 'modelv-linear-v1',
          predictionColumn: 'prediction',
          roundDigits: 4,
        },
        inputBindings: { table: 'load-table:table' },
        outputDefs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
      },
      {
        id: 'export-table',
        type: 'export.table',
        position: { x: 860, y: 160 },
        params: {
          saveToPlatform: true,
          outputDatasetName: 'Prediction Output',
        },
        inputBindings: { input: 'predict-table:table' },
        outputDefs: [{ key: 'artifact', label: 'Artifact', dataTypes: ['artifact'] }],
      },
    ],
    edges: [
      { id: 'edge-1', source: 'dataset-source', target: 'load-table', sourceHandle: 'dataset', targetHandle: 'dataset' },
      { id: 'edge-2', source: 'load-table', target: 'predict-table', sourceHandle: 'table', targetHandle: 'table' },
      { id: 'edge-3', source: 'predict-table', target: 'export-table', sourceHandle: 'table', targetHandle: 'input' },
    ],
  },
  createdAt: '2026-04-03T01:00:00Z',
};

const workflowTemplates: WorkflowTemplateDefinition[] = [
  {
    id: 'tabular.prediction',
    label: 'CSV Linear Regression Pipeline',
    description: 'Load a CSV dataset, run linear regression prediction, and export the result table.',
    tags: ['tabular', 'prediction', 'csv', 'linear'],
    supportedTasks: ['tabular_prediction'],
    sampleBindings: [
      { nodeId: 'dataset-source', params: { datasetVersionId: 'dsv-tabular-input-v1' } },
      { nodeId: 'predict-table', params: { modelVersionId: 'modelv-linear-v1' } },
    ],
    graph: workflowVersion.graph,
  },
  {
    id: 'tabular.svm_prediction',
    label: 'CSV SVM Regression Pipeline',
    description: 'Load a CSV dataset, run SVM regression prediction, and export the result table.',
    tags: ['tabular', 'prediction', 'csv', 'svm'],
    supportedTasks: ['tabular_prediction'],
    sampleBindings: [
      { nodeId: 'dataset-source', params: { datasetVersionId: 'dsv-tabular-input-v1' } },
      { nodeId: 'predict-table', params: { modelVersionId: 'modelv-svm-v1' } },
    ],
    graph: {
      ...workflowVersion.graph,
      nodes: workflowVersion.graph.nodes.map((node) =>
        node.id === 'predict-table'
          ? {
              ...node,
              type: 'tabular.svm_regression_predict',
              params: {
                modelVersionId: 'modelv-svm-v1',
                predictionColumn: 'prediction',
                roundDigits: 4,
                cacheSize: 200,
              },
            }
          : node,
      ),
    },
  },
  {
    id: 'tabular.random_forest_prediction',
    label: 'CSV Random Forest Pipeline',
    description: 'Load a CSV dataset, run random forest prediction, and export the result table.',
    tags: ['tabular', 'prediction', 'csv', 'random-forest'],
    supportedTasks: ['tabular_prediction'],
    sampleBindings: [
      { nodeId: 'dataset-source', params: { datasetVersionId: 'dsv-tabular-input-v1' } },
      { nodeId: 'predict-table', params: { modelVersionId: 'modelv-rf-v1' } },
    ],
    graph: {
      ...workflowVersion.graph,
      nodes: workflowVersion.graph.nodes.map((node) =>
        node.id === 'predict-table'
          ? {
              ...node,
              type: 'tabular.random_forest_regression_predict',
              params: {
                modelVersionId: 'modelv-rf-v1',
                predictionColumn: 'prediction',
                roundDigits: 4,
                nJobs: 1,
              },
            }
          : node,
      ),
    },
  },
  {
    id: 'tabular.validation',
    label: 'CSV Validation Pipeline',
    description: 'Compare a prediction table and a ground-truth CSV table, then export metrics.',
    tags: ['tabular', 'validation', 'metrics'],
    supportedTasks: ['tabular_validation'],
    sampleBindings: [
      { nodeId: 'prediction-dataset', params: { datasetVersionId: 'dsv-tabular-prediction-v1' } },
      { nodeId: 'ground-truth-dataset', params: { datasetVersionId: 'dsv-tabular-ground-truth-v1' } },
    ],
    graph: {
      nodes: [
        {
          id: 'prediction-dataset',
          type: 'source.dataset_version',
          position: { x: 0, y: 120 },
          params: { datasetVersionId: 'dsv-tabular-prediction-v1' },
          inputBindings: {},
          outputDefs: [{ key: 'dataset', label: 'Dataset Version', dataTypes: ['dataset_version'] }],
        },
        {
          id: 'ground-truth-dataset',
          type: 'source.dataset_version',
          position: { x: 0, y: 340 },
          params: { datasetVersionId: 'dsv-tabular-ground-truth-v1' },
          inputBindings: {},
          outputDefs: [{ key: 'dataset', label: 'Dataset Version', dataTypes: ['dataset_version'] }],
        },
        {
          id: 'load-prediction-table',
          type: 'table.load_csv',
          position: { x: 260, y: 120 },
          params: { delimiter: ',' },
          inputBindings: { dataset: 'prediction-dataset:dataset' },
          outputDefs: [{ key: 'table', label: 'Table', dataTypes: ['table'] }],
        },
        {
          id: 'load-ground-truth-table',
          type: 'table.load_csv',
          position: { x: 260, y: 340 },
          params: { delimiter: ',' },
          inputBindings: { dataset: 'ground-truth-dataset:dataset' },
          outputDefs: [{ key: 'table', label: 'Table', dataTypes: ['table'] }],
        },
        {
          id: 'validate-regression',
          type: 'metrics.validate_regression',
          position: { x: 580, y: 220 },
          params: {
            predictionColumn: 'prediction',
            groundTruthColumn: 'target',
            metrics: ['r2', 'mae', 'rmse'],
          },
          inputBindings: {
            predictionTable: 'load-prediction-table:table',
            groundTruthTable: 'load-ground-truth-table:table',
          },
          outputDefs: [{ key: 'report', label: 'Metrics Report', dataTypes: ['metrics_report'] }],
        },
        {
          id: 'export-metrics',
          type: 'export.metrics',
          position: { x: 900, y: 220 },
          params: {
            saveToPlatform: true,
            outputDatasetName: 'Validation Metrics',
            format: 'json',
          },
          inputBindings: { input: 'validate-regression:report' },
          outputDefs: [{ key: 'artifact', label: 'Artifact', dataTypes: ['artifact'] }],
        },
      ],
      edges: [
        { id: 'edge-v-1', source: 'prediction-dataset', target: 'load-prediction-table', sourceHandle: 'dataset', targetHandle: 'dataset' },
        { id: 'edge-v-2', source: 'ground-truth-dataset', target: 'load-ground-truth-table', sourceHandle: 'dataset', targetHandle: 'dataset' },
        { id: 'edge-v-3', source: 'load-prediction-table', target: 'validate-regression', sourceHandle: 'table', targetHandle: 'predictionTable' },
        { id: 'edge-v-4', source: 'load-ground-truth-table', target: 'validate-regression', sourceHandle: 'table', targetHandle: 'groundTruthTable' },
        { id: 'edge-v-5', source: 'validate-regression', target: 'export-metrics', sourceHandle: 'report', targetHandle: 'input' },
      ],
    },
  },
];

const workflowRuns: WorkflowRunSummary[] = [
  {
    id: 'run-001',
    workflowVersionId: 'wfv-tabular-demo-v1',
    status: 'succeeded',
    startedAt: '2026-04-03T11:40:00Z',
    finishedAt: '2026-04-03T11:41:00Z',
    submittedBy: 'Platform Admin',
  },
];

const modelVersions: ModelVersionSummary[] = [
  {
    id: 'modelv-linear-v1',
    modelId: 'model-linear',
    modelName: 'Sample Linear Regression',
    algorithmKey: 'linear_regression',
    version: '1.0.0',
    framework: 'json',
    taskType: 'regression',
    createdAt: '2026-03-31T10:00:00Z',
  },
  {
    id: 'modelv-svm-v1',
    modelId: 'model-svm',
    modelName: 'Sample SVM Regression',
    algorithmKey: 'svm_regression',
    version: '1.0.0',
    framework: 'scikit-learn',
    taskType: 'regression',
    createdAt: '2026-03-31T11:00:00Z',
  },
  {
    id: 'modelv-rf-v1',
    modelId: 'model-rf',
    modelName: 'Sample Random Forest Regression',
    algorithmKey: 'random_forest_regression',
    version: '1.0.0',
    framework: 'scikit-learn',
    taskType: 'regression',
    createdAt: '2026-03-31T12:00:00Z',
  },
];

const geeCredentials: GeeCredentialSummary[] = [];
const products: ProductAssetSummary[] = [];

const dashboardConfig: DashboardConfig = {
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
  ],
  announcements: [
    {
      id: 'portal-upgrade',
      titleZh: '总览页升级为运营门户',
      titleEn: 'Overview Upgraded to an Operations Portal',
      summaryZh: '首页现在聚合了功能介绍、更新公告和反馈入口。',
      summaryEn:
        'The homepage now combines product highlights, release notes, and feedback entry points.',
      contentZh: '这是一个用于本地演示的首页公告示例。',
      contentEn: 'This is a sample dashboard announcement used by the local mock data.',
      tagZh: '平台更新',
      tagEn: 'Platform Update',
      publishedAt: '2026-04-05',
      pinned: true,
      published: true,
    },
  ],
};

const feedbackTickets: FeedbackTicketSummary[] = [
  {
    id: 'ticket-001',
    workspaceId: 'ws-earth-lab',
    createdBy: 'user-member',
    createdByDisplayName: 'Team Member',
    title: '希望增加批量下载提示',
    category: 'feature_request',
    priority: 'medium',
    status: 'in_progress',
    content: '下载较大结果时，希望在首页就能看到更明确的提示。',
    contact: 'member@platform.local',
    adminReply: '已纳入下一轮可用性优化。',
    createdAt: '2026-04-04T10:00:00Z',
    updatedAt: '2026-04-05T08:30:00Z',
  },
];

const feedbackSummary: FeedbackTicketSummaryCounts = {
  myOpenCount: 0,
  myActiveCount: 1,
  adminOpenCount: 1,
  adminInProgressCount: 1,
};

export const platformMock = {
  workspace,
  datasets,
  datasetVersions,
  geeCredentials,
  workflowCatalog,
  workflowTemplates,
  workflowVersion,
  workflowRuns,
  products,
  modelVersions,
  dashboardConfig,
  feedbackTickets,
  feedbackSummary,
};
