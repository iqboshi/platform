import type {
  WorkflowNodeCatalogItem,
  WorkflowNodeStarterBinding,
  WorkflowStarterInputKind,
  WorkflowVersionDetail,
} from '@platform/types';

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

function bindingPatch(
  binding: WorkflowNodeStarterBinding,
  resourceId: string,
): Record<string, unknown> {
  return {
    ...(binding.presetParams ?? {}),
    [binding.paramKey]: resourceId,
  };
}

function starterBindingForInput(
  definition: WorkflowNodeCatalogItem | undefined,
  inputKind: WorkflowStarterInputKind,
): WorkflowNodeStarterBinding | undefined {
  return definition?.starterBindings?.find((item) => item.inputKind === inputKind);
}

function appendStarterNode(
  workflowVersion: WorkflowVersionDetail,
  definition: WorkflowNodeCatalogItem,
  binding: WorkflowNodeStarterBinding,
  resourceId: string,
  editorContext: WorkflowEditorContext,
): WorkflowVersionDetail {
  const position = nextStarterNodePosition(workflowVersion);
  const nextNode = {
    id: createNodeId(definition.type.replace(/\./g, '-')),
    type: definition.type,
    position,
    params: {
      ...createDefaultParams(definition, editorContext),
      ...bindingPatch(binding, resourceId),
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

function selectAutoCreateStarter(
  definitions: WorkflowNodeCatalogItem[],
  inputKind: WorkflowStarterInputKind,
): { definition: WorkflowNodeCatalogItem; binding: WorkflowNodeStarterBinding } | null {
  const candidates = definitions
    .map((definition) => {
      const binding = starterBindingForInput(definition, inputKind);
      return binding?.autoCreate ? { definition, binding } : null;
    })
    .filter(
      (
        item,
      ): item is { definition: WorkflowNodeCatalogItem; binding: WorkflowNodeStarterBinding } =>
        item !== null,
    )
    .sort((left, right) => (right.binding.priority ?? 0) - (left.binding.priority ?? 0));

  return candidates[0] ?? null;
}

export function attachWorkflowStarterInput(
  workflowVersion: WorkflowVersionDetail,
  inputKind: WorkflowStarterInputKind,
  resourceId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  for (const node of workflowVersion.graph.nodes) {
    const definition = getWorkflowDefinitionByType(definitions, node.type);
    const binding = starterBindingForInput(definition, inputKind);
    if (!binding) {
      continue;
    }

    return {
      workflowVersion: {
        ...workflowVersion,
        graph: {
          ...workflowVersion.graph,
          nodes: workflowVersion.graph.nodes.map((item) =>
            item.id === node.id
              ? {
                  ...item,
                  params: {
                    ...item.params,
                    ...bindingPatch(binding, resourceId),
                  },
                }
              : item,
          ),
        },
      },
      applied: true,
      createdStarter: false,
    };
  }

  const starter = selectAutoCreateStarter(definitions, inputKind);
  if (!starter) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
    };
  }

  return {
    workflowVersion: appendStarterNode(
      workflowVersion,
      starter.definition,
      starter.binding,
      resourceId,
      editorContext,
    ),
    applied: true,
    createdStarter: true,
  };
}

export function attachDatasetVersionToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  datasetVersionId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  return attachWorkflowStarterInput(
    workflowVersion,
    'dataset_version',
    datasetVersionId,
    definitions,
    editorContext,
  );
}

export function attachSavedRoiToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  roiId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  return attachWorkflowStarterInput(
    workflowVersion,
    'spatial_roi',
    roiId,
    definitions,
    editorContext,
  );
}

export function attachModelVersionToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  modelVersionId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  return attachWorkflowStarterInput(
    workflowVersion,
    'model_version',
    modelVersionId,
    definitions,
    editorContext,
  );
}

export function attachGeeCredentialToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  geeCredentialId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
): { workflowVersion: WorkflowVersionDetail; applied: boolean; createdStarter: boolean } {
  return attachWorkflowStarterInput(
    workflowVersion,
    'gee_credential',
    geeCredentialId,
    definitions,
    editorContext,
  );
}
