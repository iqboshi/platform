import type { WorkflowNodeCatalogItem, WorkflowVersionDetail } from '@platform/types';

import {
  createDefaultParams,
  getWorkflowDefinitionByType,
  type WorkflowEditorContext,
} from './node-registry';

function createNodeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function nextStarterNodePosition(workflowVersion: WorkflowVersionDetail): { x: number; y: number } {
  if (!workflowVersion.graph.nodes.length) {
    return { x: 120, y: 160 };
  }

  const minX = Math.min(...workflowVersion.graph.nodes.map((node) => node.position.x));
  const minY = Math.min(...workflowVersion.graph.nodes.map((node) => node.position.y));
  return {
    x: minX - 280,
    y: minY,
  };
}

function appendStarterNode(
  workflowVersion: WorkflowVersionDetail,
  nodeType: string,
  params: Record<string, unknown>,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): WorkflowVersionDetail | null {
  const definition = getWorkflowDefinitionByType(definitions, nodeType);
  if (!definition) {
    return null;
  }

  const position = nextStarterNodePosition(workflowVersion);
  const nextNode = {
    id: createNodeId(nodeType.replace(/\./g, '-')),
    type: nodeType,
    position,
    params: {
      ...createDefaultParams(definition, editorContext),
      ...params,
    },
    inputBindings: {},
    outputDefs: definition.outputs,
  };

  return {
    ...workflowVersion,
    graph: {
      nodes: [...workflowVersion.graph.nodes, nextNode],
      edges: workflowVersion.graph.edges,
    },
  };
}

export function applySavedRoiToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  roiId: string,
): { workflowVersion: WorkflowVersionDetail; applied: boolean } {
  let applied = false;
  const nextNodes = workflowVersion.graph.nodes.map((node) => {
    if (node.type !== 'source.sentinel2_gee_download') {
      return node;
    }

    applied = true;
    return {
      ...node,
      params: {
        ...node.params,
        roiMode: 'saved_roi',
        roiId,
      },
    };
  });

  return {
    workflowVersion: applied
      ? {
          ...workflowVersion,
          graph: {
            ...workflowVersion.graph,
            nodes: nextNodes,
          },
        }
      : workflowVersion,
    applied,
  };
}

export function applyDatasetVersionToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  datasetVersionId: string,
): { workflowVersion: WorkflowVersionDetail; applied: boolean } {
  let applied = false;
  let consumed = false;

  const nextNodes = workflowVersion.graph.nodes.map((node) => {
    const canBindDatasetVersion =
      node.type === 'source.dataset_version' ||
      Object.prototype.hasOwnProperty.call(node.params, 'datasetVersionId');
    if (!canBindDatasetVersion || consumed) {
      return node;
    }

    consumed = true;
    applied = true;
    return {
      ...node,
      params: {
        ...node.params,
        datasetVersionId,
      },
    };
  });

  return {
    workflowVersion: applied
      ? {
          ...workflowVersion,
          graph: {
            ...workflowVersion.graph,
            nodes: nextNodes,
          },
        }
      : workflowVersion,
    applied,
  };
}

export function attachDatasetVersionToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  datasetVersionId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  const linkedDatasetResult = applyDatasetVersionToWorkflow(workflowVersion, datasetVersionId);
  if (linkedDatasetResult.applied) {
    return {
      workflowVersion: linkedDatasetResult.workflowVersion,
      applied: true,
      createdStarter: false,
    };
  }

  const starterWorkflow = appendStarterNode(
    workflowVersion,
    'source.dataset_version',
    { datasetVersionId },
    definitions,
    editorContext,
  );
  if (!starterWorkflow) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
    };
  }

  return {
    workflowVersion: starterWorkflow,
    applied: true,
    createdStarter: true,
  };
}

export function attachSavedRoiToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  roiId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  const linkedRoiResult = applySavedRoiToWorkflow(workflowVersion, roiId);
  if (linkedRoiResult.applied) {
    return {
      workflowVersion: linkedRoiResult.workflowVersion,
      applied: true,
      createdStarter: false,
    };
  }

  const starterWorkflow = appendStarterNode(
    workflowVersion,
    'source.sentinel2_gee_download',
    {
      roiMode: 'saved_roi',
      roiId,
    },
    definitions,
    editorContext,
  );
  if (!starterWorkflow) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
    };
  }

  return {
    workflowVersion: starterWorkflow,
    applied: true,
    createdStarter: true,
  };
}
