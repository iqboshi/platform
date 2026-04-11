import type { WorkflowNodeCatalogItem, WorkflowVersionDetail } from '@platform/types';

import { describe, expect, it } from 'vitest';

import type { WorkflowEditorContext } from './node-registry';
import {
  attachDatasetVersionToWorkflow,
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
    expect(result.workflowVersion.graph.nodes).toHaveLength(1);
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
    expect(result.workflowVersion.graph.nodes).toHaveLength(1);
    expect(result.workflowVersion.graph.nodes[0]?.type).toBe('source.sentinel2_gee_download');
    expect(result.workflowVersion.graph.nodes[0]?.params.roiMode).toBe('saved_roi');
    expect(result.workflowVersion.graph.nodes[0]?.params.roiId).toBe('roi-1');
  });

  it('reuses an existing Sentinel node before appending a new one', () => {
    const workflowVersion: WorkflowVersionDetail = {
      ...baseWorkflowVersion,
      graph: {
        nodes: [
          {
            id: 'sentinel-source',
            type: 'source.sentinel2_gee_download',
            position: { x: 80, y: 120 },
            params: { roiMode: 'manual_bbox', bbox: '1,2,3,4' },
            inputBindings: {},
            outputDefs: definitions[1]!.outputs,
          },
        ],
        edges: [],
      },
    };

    const result = attachSavedRoiToWorkflow(
      workflowVersion,
      'roi-2',
      definitions,
      editorContext,
    );

    expect(result.applied).toBe(true);
    expect(result.createdStarter).toBe(false);
    expect(result.workflowVersion.graph.nodes).toHaveLength(1);
    expect(result.workflowVersion.graph.nodes[0]?.params.roiMode).toBe('saved_roi');
    expect(result.workflowVersion.graph.nodes[0]?.params.roiId).toBe('roi-2');
  });
});
