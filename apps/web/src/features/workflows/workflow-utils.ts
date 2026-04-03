import type { WorkflowNodeCatalogItem, WorkflowVersionDetail } from '@platform/types';

export interface WorkflowStats {
  nodeCount: number;
  edgeCount: number;
  categoryCount: number;
}

export function buildWorkflowStats(
  catalog: WorkflowNodeCatalogItem[],
  workflowVersion: WorkflowVersionDetail,
): WorkflowStats {
  const categorySet = new Set(
    workflowVersion.graph.nodes
      .map((node) => catalog.find((item) => item.type === node.type)?.category)
      .filter(Boolean),
  );

  return {
    nodeCount: workflowVersion.graph.nodes.length,
    edgeCount: workflowVersion.graph.edges.length,
    categoryCount: categorySet.size,
  };
}
