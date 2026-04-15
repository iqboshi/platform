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

type WorkflowStarterAttachFailureReason = 'no_compatible_target' | 'ambiguous_existing_target';

interface WorkflowStarterAttachResult {
  workflowVersion: WorkflowVersionDetail;
  applied: boolean;
  createdStarter: boolean;
  failureReason?: WorkflowStarterAttachFailureReason;
  matchedNodeIds?: string[];
}

interface WorkflowStarterAttachOptions {
  targetNodeId?: string;
}

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
  definition: WorkflowNodeCatalogItem,
  binding: WorkflowNodeStarterBinding,
  resourceId: string,
): Record<string, unknown> {
  const derivedPresetParams: Record<string, unknown> = {};
  if (
    binding.inputKind === 'spatial_roi' &&
    definition.params.some((field) => field.key === 'roiMode')
  ) {
    derivedPresetParams.roiMode = 'saved_roi';
  }
  if (
    binding.inputKind === 'gee_credential' &&
    definition.params.some((field) => field.key === 'credentialMode')
  ) {
    derivedPresetParams.credentialMode = 'personal';
  }
  return {
    ...derivedPresetParams,
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
      ...bindingPatch(definition, binding, resourceId),
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
  options: WorkflowStarterAttachOptions = {},
): WorkflowStarterAttachResult {
  const targetNodeId = typeof options.targetNodeId === 'string' && options.targetNodeId.trim()
    ? options.targetNodeId
    : undefined;
  const existingMatches = workflowVersion.graph.nodes.flatMap((node) => {
    if (targetNodeId && node.id !== targetNodeId) {
      return [];
    }
    const definition = getWorkflowDefinitionByType(definitions, node.type);
    const binding = starterBindingForInput(definition, inputKind);
    if (!definition || !binding) {
      return [];
    }
    return [{ node, definition, binding }] as const;
  });

  if (existingMatches.length > 1) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
      failureReason: 'ambiguous_existing_target',
      matchedNodeIds: existingMatches.map((item) => item.node.id),
    };
  }

  const existingMatch = existingMatches[0];
  if (existingMatch) {
    const { node, definition, binding } = existingMatch;
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
                    ...bindingPatch(definition, binding, resourceId),
                  },
                }
              : item,
          ),
        },
      },
      applied: true,
      createdStarter: false,
      matchedNodeIds: [node.id],
    };
  }

  if (targetNodeId) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
      failureReason: 'no_compatible_target',
    };
  }

  const starter = selectAutoCreateStarter(definitions, inputKind);
  if (!starter) {
    return {
      workflowVersion,
      applied: false,
      createdStarter: false,
      failureReason: 'no_compatible_target',
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
  options: WorkflowStarterAttachOptions = {},
): WorkflowStarterAttachResult {
  return attachWorkflowStarterInput(
    workflowVersion,
    'dataset_version',
    datasetVersionId,
    definitions,
    editorContext,
    options,
  );
}

export function attachSavedRoiToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  roiId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
  options: WorkflowStarterAttachOptions = {},
): WorkflowStarterAttachResult {
  return attachWorkflowStarterInput(
    workflowVersion,
    'spatial_roi',
    roiId,
    definitions,
    editorContext,
    options,
  );
}

export function attachModelVersionToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  modelVersionId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
  options: WorkflowStarterAttachOptions = {},
): WorkflowStarterAttachResult {
  return attachWorkflowStarterInput(
    workflowVersion,
    'model_version',
    modelVersionId,
    definitions,
    editorContext,
    options,
  );
}

export function attachGeeCredentialToWorkflow(
  workflowVersion: WorkflowVersionDetail,
  geeCredentialId: string,
  definitions: WorkflowNodeCatalogItem[],
  editorContext: WorkflowEditorContext,
  options: WorkflowStarterAttachOptions = {},
): WorkflowStarterAttachResult {
  return attachWorkflowStarterInput(
    workflowVersion,
    'gee_credential',
    geeCredentialId,
    definitions,
    editorContext,
    options,
  );
}
