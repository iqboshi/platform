import type {
  DatasetSummary,
  DatasetVersionSummary,
  WorkflowTemplateDefinition,
  WorkflowVersionDetail,
} from '@platform/types';
import { describe, expect, it } from 'vitest';

import { platformMock } from '@/mocks/platform';

import {
  instantiateTemplateGraph,
  resolveParameterOptions,
  type WorkflowEditorContext,
  type WorkflowNodeDefinition,
} from './node-registry';

function getDefinition(type: string): WorkflowNodeDefinition {
  const definition = platformMock.workflowCatalog.find((item) => item.type === type);
  if (!definition) {
    throw new Error(`Workflow definition not found: ${type}`);
  }
  return definition;
}

function createEditorContext(
  datasetVersions: DatasetVersionSummary[],
  datasets: DatasetSummary[],
): WorkflowEditorContext {
  return {
    datasets,
    datasetVersions,
    geeCredentials: [],
    modelVersions: [],
    spatialRois: [],
  };
}

function createTableTemplate(
  sourceParams: Record<string, unknown> = {},
  sampleBindings: WorkflowTemplateDefinition['sampleBindings'] = [],
): WorkflowTemplateDefinition {
  const sourceDefinition = getDefinition('source.dataset_version');
  const loadDefinition = getDefinition('table.load_csv');

  return {
    id: 'template-table',
    label: 'Template Table',
    description: 'Template for dataset source behavior tests.',
    tags: ['test'],
    supportedTasks: ['tabular_prediction'],
    sampleBindings,
    graph: {
      nodes: [
        {
          id: 'table-source',
          type: 'source.dataset_version',
          position: { x: 80, y: 180 },
          params: sourceParams,
          inputBindings: {},
          outputDefs: sourceDefinition.outputs,
        },
        {
          id: 'load-table',
          type: 'table.load_csv',
          position: { x: 300, y: 180 },
          params: {},
          inputBindings: { dataset: 'table-source:dataset' },
          outputDefs: loadDefinition.outputs,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'table-source',
          target: 'load-table',
          sourceHandle: 'dataset',
          targetHandle: 'dataset',
        },
      ],
    },
  };
}

function createWorkflowVersion(sourceParams: Record<string, unknown> = {}): WorkflowVersionDetail {
  const sourceDefinition = getDefinition('source.dataset_version');
  const loadDefinition = getDefinition('table.load_csv');

  return {
    id: 'workflow-version-1',
    workflowId: 'workflow-1',
    version: 1,
    createdAt: '2026-04-16T00:00:00Z',
    graph: {
      nodes: [
        {
          id: 'table-source',
          type: 'source.dataset_version',
          position: { x: 80, y: 180 },
          params: sourceParams,
          inputBindings: {},
          outputDefs: sourceDefinition.outputs,
        },
        {
          id: 'load-table',
          type: 'table.load_csv',
          position: { x: 300, y: 180 },
          params: {},
          inputBindings: { dataset: 'table-source:dataset' },
          inputDefs: loadDefinition.inputs,
          inputContracts: loadDefinition.inputContracts,
          outputDefs: loadDefinition.outputs,
          outputContracts: loadDefinition.outputContracts,
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'table-source',
          target: 'load-table',
          sourceHandle: 'dataset',
          targetHandle: 'dataset',
        },
      ],
    },
  };
}

describe('node-registry dataset source behavior', () => {
  const datasets: DatasetSummary[] = [
    {
      id: 'dataset-table',
      workspaceId: 'workspace-1',
      name: 'Table Dataset',
      kind: 'table',
      status: 'ready',
      updatedAt: '2026-04-16T00:00:00Z',
    },
    {
      id: 'dataset-raster',
      workspaceId: 'workspace-1',
      name: 'Raster Dataset',
      kind: 'raster',
      status: 'ready',
      updatedAt: '2026-04-16T00:00:00Z',
    },
  ];

  const datasetVersions: DatasetVersionSummary[] = [
    {
      id: 'table-v1',
      datasetId: 'dataset-table',
      version: 1,
      status: 'ready',
      assetPath: 'storage/table.csv',
      metadata: {
        columns: ['feature_a', 'feature_b', 'target'],
      },
      createdAt: '2026-04-16T00:00:00Z',
    },
    {
      id: 'raster-v1',
      datasetId: 'dataset-raster',
      version: 1,
      status: 'ready',
      assetPath: 'storage/raster.tif',
      metadata: {
        contentType: 'image/tiff',
      },
      createdAt: '2026-04-16T00:00:00Z',
    },
  ];

  const context = createEditorContext(datasetVersions, datasets);
  const definitions = platformMock.workflowCatalog;
  const sourceDefinition = getDefinition('source.dataset_version');
  const datasetField = sourceDefinition.params.find((item) => item.key === 'datasetVersionId');

  if (!datasetField) {
    throw new Error('source.dataset_version.datasetVersionId parameter is missing');
  }

  it('does not infer a dataset binding when inserting a blank template', () => {
    const template = createTableTemplate();

    const graph = instantiateTemplateGraph(template, definitions, context, { x: 0, y: 0 });
    const sourceNode = graph.nodes.find((node) => node.type === 'source.dataset_version');

    expect(sourceNode?.params.datasetVersionId).toBe('');
  });

  it('applies template sample bindings only when requested explicitly', () => {
    const template = createTableTemplate({}, [
      {
        nodeId: 'table-source',
        params: { datasetVersionId: 'table-v1' },
      },
    ]);

    const graph = instantiateTemplateGraph(template, definitions, context, { x: 0, y: 0 }, {
      useSampleBindings: true,
    });
    const sourceNode = graph.nodes.find((node) => node.type === 'source.dataset_version');

    expect(sourceNode?.params.datasetVersionId).toBe('table-v1');
  });

  it('clears template-embedded asset bindings during blank insertion', () => {
    const template = createTableTemplate({ datasetVersionId: 'seed-tabular-input-dsv' });

    const graph = instantiateTemplateGraph(template, definitions, context, { x: 0, y: 0 });
    const sourceNode = graph.nodes.find((node) => node.type === 'source.dataset_version');

    expect(sourceNode?.params.datasetVersionId).toBe('');
  });

  it('shows all dataset versions in source options and leaves compatibility to validation', () => {
    const workflowVersion = createWorkflowVersion();

    const result = resolveParameterOptions(datasetField, context, {
      nodeId: 'table-source',
      nodeType: 'source.dataset_version',
      workflowVersion,
      definitions,
    });

    expect(result.options.map((item) => item.value)).toEqual(['table-v1', 'raster-v1']);
  });
});
