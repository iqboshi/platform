import type {
  DatasetSummary,
  DatasetVersionSummary,
  ModelVersionSummary,
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
    type: 'tabular.linear_regression_predict',
    label: 'Linear Regression Predict',
    category: 'inference',
    description: 'Run a linear regression model against CSV rows and append predictions.',
    runtimeKind: 'inference',
    supportedTasks: ['tabular_prediction', 'tabular_validation'],
    tags: ['table', 'prediction', 'regression', 'linear'],
    inputs: [{ key: 'table', label: 'Input Table', dataTypes: ['table'], required: true }],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
      { key: 'clipMin', label: 'Clip Minimum', fieldType: 'text' },
      { key: 'clipMax', label: 'Clip Maximum', fieldType: 'text' },
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
    inputs: [{ key: 'table', label: 'Input Table', dataTypes: ['table'], required: true }],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
      { key: 'cacheSize', label: 'Cache Size (MB)', fieldType: 'number', defaultValue: 200 },
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
    inputs: [{ key: 'table', label: 'Input Table', dataTypes: ['table'], required: true }],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [
      { key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion', required: true },
      { key: 'predictionColumn', label: 'Prediction Column', fieldType: 'text', defaultValue: 'prediction', required: true },
      { key: 'roundDigits', label: 'Round Digits', fieldType: 'number', defaultValue: 4 },
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

export const platformMock = {
  workspace,
  datasets,
  datasetVersions,
  workflowCatalog,
  workflowTemplates,
  workflowVersion,
  workflowRuns,
  modelVersions,
};
