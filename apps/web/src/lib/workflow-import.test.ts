import { describe, expect, it } from 'vitest';

import { parseImportedWorkflowGraph } from './workflow-import';

describe('parseImportedWorkflowGraph', () => {
  it('accepts backend-downloaded snake_case workflow JSON', () => {
    const graph = parseImportedWorkflowGraph(
      JSON.stringify({
        nodes: [
          {
            id: 'source-node',
            type: 'source.dataset_version',
            position: { x: 20, y: 40 },
            params: { datasetVersionId: 'dataset-version-1' },
            input_bindings: {},
            output_defs: [
              {
                key: 'dataset',
                label: 'Dataset',
                data_types: ['dataset_version'],
                required: true,
              },
            ],
          },
          {
            id: 'load-node',
            type: 'table.load_csv',
            position: { x: 260, y: 40 },
            params: { delimiter: ',' },
            input_bindings: { dataset: 'source-node:dataset' },
            output_defs: [
              {
                key: 'table',
                label: 'Table',
                data_types: ['table'],
              },
            ],
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'source-node',
            target: 'load-node',
            source_handle: 'dataset',
            target_handle: 'dataset',
          },
        ],
        metadata: {
          owner_user_id: 'user-1',
          owner_display_name: 'User 1',
        },
      }),
    );

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].outputDefs[0].dataTypes).toEqual(['dataset_version']);
    expect(graph.nodes[1].inputBindings).toEqual({ dataset: 'source-node:dataset' });
    expect(graph.edges[0].sourceHandle).toBe('dataset');
    expect(graph.edges[0].targetHandle).toBe('dataset');
  });

  it('accepts full workflow version payloads with nested graph', () => {
    const graph = parseImportedWorkflowGraph(
      JSON.stringify({
        id: 'workflow-version-1',
        graph: {
          nodes: [],
          edges: [],
        },
      }),
    );

    expect(graph).toEqual({ nodes: [], edges: [] });
  });
});
