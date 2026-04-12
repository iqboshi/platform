import type { WorkflowNodeCatalogItem, WorkflowVersionDetail } from '@platform/types';

import { describe, expect, it } from 'vitest';

import type { WorkflowEditorContext } from './node-registry';
import {
  attachDatasetVersionToWorkflow,
  attachGeeCredentialToWorkflow,
  attachModelVersionToWorkflow,
  attachSavedRoiToWorkflow,
} from './draft-handoff';

const baseWorkflowVersion: WorkflowVersionDetail = {
  id: 'wf-version-1',
  workflowId: 'workflow-1',
  version: 1,
  graph: {
    nodes: [],
    edges: [],
  },
  createdAt: '2026-04-11T00:00:00Z',
};

const definitions: WorkflowNodeCatalogItem[] = [
  {
    type: 'source.dataset_version',
    label: 'Dataset Version',
    category: 'source',
    description: 'Dataset source',
    runtimeKind: 'source',
    supportedTasks: [],
    tags: [],
    inputs: [],
    outputs: [{ key: 'dataset', label: 'Dataset', dataTypes: ['dataset_version'] }],
    params: [{ key: 'datasetVersionId', label: 'Dataset Version', fieldType: 'datasetVersion' }],
    starterBindings: [
      {
        inputKind: 'dataset_version',
        paramKey: 'datasetVersionId',
        autoCreate: true,
        priority: 100,
      },
    ],
  },
  {
    type: 'source.model_version',
    label: 'Model Version',
    category: 'source',
    description: 'Model source',
    runtimeKind: 'source',
    supportedTasks: [],
    tags: [],
    inputs: [],
    outputs: [{ key: 'model', label: 'Model', dataTypes: ['model_version'] }],
    params: [{ key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion' }],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: true,
        priority: 100,
      },
    ],
  },
  {
    type: 'source.sentinel2_gee_download',
    label: 'Sentinel Download',
    category: 'source',
    description: 'Sentinel source',
    runtimeKind: 'source',
    supportedTasks: [],
    tags: [],
    inputs: [],
    outputs: [{ key: 'dataset', label: 'Dataset', dataTypes: ['dataset_version'] }],
    params: [
      {
        key: 'roiMode',
        label: 'ROI Mode',
        fieldType: 'select',
        defaultValue: 'manual_bbox',
      },
      {
        key: 'roiId',
        label: 'ROI',
        fieldType: 'select',
      },
      {
        key: 'credentialMode',
        label: 'Credential Mode',
        fieldType: 'select',
        defaultValue: 'platform_default',
      },
      {
        key: 'personalCredentialId',
        label: 'Credential',
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
  },
  {
    type: 'tabular.linear_regression_predict',
    label: 'Linear Regression Predict',
    category: 'inference',
    description: 'Predict node',
    runtimeKind: 'inference',
    supportedTasks: [],
    tags: [],
    inputs: [
      { key: 'model', label: 'Model', dataTypes: ['model_version'] },
      { key: 'table', label: 'Table', dataTypes: ['table'], required: true },
    ],
    outputs: [{ key: 'table', label: 'Prediction Table', dataTypes: ['table'] }],
    params: [{ key: 'modelVersionId', label: 'Model Version', fieldType: 'modelVersion' }],
    starterBindings: [
      {
        inputKind: 'model_version',
        paramKey: 'modelVersionId',
        autoCreate: false,
        priority: 20,
      },
    ],
  },
];

const editorContext: WorkflowEditorContext = {
  datasets: [],
  datasetVersions: [],
  geeCredentials: [],
  modelVersions: [],
  spatialRois: [],
};

describe('draft handoff helpers', () => {
  it('appends a dataset source node when the draft has no compatible node', () => {
    const result = attachDatasetVersionToWorkflow(
      baseWorkflowVersion,
      'dataset-version-1',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(true);
    expect(result.workflowVersion.graph.nodes).toHaveLength(1);
    expect(result.workflowVersion.graph.nodes[0]?.type).toBe('source.dataset_version');
    expect(result.workflowVersion.graph.nodes[0]?.params.datasetVersionId).toBe('dataset-version-1');
  });

  it('reuses the first existing dataset-compatible node before creating a new one', () => {
    const workflowVersion: WorkflowVersionDetail = {
      ...baseWorkflowVersion,
      graph: {
        nodes: [
          {
            id: 'dataset-source',
            type: 'source.dataset_version',
            position: { x: 20, y: 40 },
            params: { datasetVersionId: 'old-version' },
            inputBindings: {},
            outputDefs: definitions[0]!.outputs,
          },
        ],
        edges: [],
      },
    };

    const result = attachDatasetVersionToWorkflow(
      workflowVersion,
      'dataset-version-2',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(false);
    expect(result.workflowVersion.graph.nodes[0]?.params.datasetVersionId).toBe('dataset-version-2');
  });

  it('appends a Sentinel source node when the draft has no saved ROI node', () => {
    const result = attachSavedRoiToWorkflow(
      baseWorkflowVersion,
      'roi-1',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(true);
    expect(result.workflowVersion.graph.nodes[0]?.type).toBe('source.sentinel2_gee_download');
    expect(result.workflowVersion.graph.nodes[0]?.params.roiMode).toBe('saved_roi');
    expect(result.workflowVersion.graph.nodes[0]?.params.roiId).toBe('roi-1');
  });

  it('reuses an existing Sentinel node for gee credential handoff', () => {
    const workflowVersion: WorkflowVersionDetail = {
      ...baseWorkflowVersion,
      graph: {
        nodes: [
          {
            id: 'sentinel-source',
            type: 'source.sentinel2_gee_download',
            position: { x: 80, y: 120 },
            params: { credentialMode: 'platform_default' },
            inputBindings: {},
            outputDefs: definitions[2]!.outputs,
          },
        ],
        edges: [],
      },
    };

    const result = attachGeeCredentialToWorkflow(
      workflowVersion,
      'gee-credential-2',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(false);
    expect(result.workflowVersion.graph.nodes[0]?.params.credentialMode).toBe('personal');
    expect(result.workflowVersion.graph.nodes[0]?.params.personalCredentialId).toBe('gee-credential-2');
  });

  it('binds a model version to an existing compatible node before creating a source node', () => {
    const workflowVersion: WorkflowVersionDetail = {
      ...baseWorkflowVersion,
      graph: {
        nodes: [
          {
            id: 'predict-node',
            type: 'tabular.linear_regression_predict',
            position: { x: 20, y: 40 },
            params: { modelVersionId: 'old-model' },
            inputBindings: {},
            outputDefs: definitions[3]!.outputs,
          },
        ],
        edges: [],
      },
    };

    const result = attachModelVersionToWorkflow(
      workflowVersion,
      'model-version-2',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(false);
    expect(result.workflowVersion.graph.nodes[0]?.params.modelVersionId).toBe('model-version-2');
  });

  it('creates a model source starter when no compatible model target exists', () => {
    const result = attachModelVersionToWorkflow(
      baseWorkflowVersion,
      'model-version-3',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(true);
    expect(result.workflowVersion.graph.nodes[0]?.type).toBe('source.model_version');
    expect(result.workflowVersion.graph.nodes[0]?.params.modelVersionId).toBe('model-version-3');
  });
});
