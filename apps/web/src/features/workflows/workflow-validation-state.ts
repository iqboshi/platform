import type {
  WorkflowNodeCatalogItem,
  WorkflowValidationIssue,
  WorkflowValidationResult,
  WorkflowVersionDetail,
} from '@platform/types';

import {
  analyzeWorkflowGraph,
  type WorkflowEditorContext,
  type WorkflowGraphAnalysis,
  type WorkflowNodeAnalysis,
} from './workflow-contracts';

function workflowIssueKey(issue: WorkflowValidationIssue): string {
  return [
    issue.severity,
    issue.code,
    issue.nodeId ?? '',
    issue.portKey ?? '',
    issue.paramKey ?? '',
    issue.message,
  ].join('::');
}

function dedupeWorkflowIssues(issues: WorkflowValidationIssue[]): WorkflowValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = workflowIssueKey(issue);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function stateRank(state: WorkflowNodeAnalysis['state']): number {
  if (state === 'schema_mismatch') {
    return 3;
  }
  if (state === 'invalid_params') {
    return 2;
  }
  if (state === 'missing_inputs') {
    return 1;
  }
  return 0;
}

function stateFromIssue(issue: WorkflowValidationIssue): WorkflowNodeAnalysis['state'] {
  if (issue.code === 'missing_required_input_binding') {
    return 'missing_inputs';
  }
  if (
    issue.paramKey ||
    [
      'missing_required_param',
      'unknown_dataset_version',
      'unknown_model_version',
      'unknown_spatial_roi',
      'unknown_gee_credential',
      'invalid_bbox',
      'invalid_date_range',
      'reversed_date_range',
      'invalid_json_param',
      'invalid_positive_number',
      'invalid_compare_operator',
      'invalid_split_ratio',
      'missing_model_reference',
      'missing_subgraph',
      'duplicate_subgraph_input_port',
      'duplicate_subgraph_output_port',
      'subgraph_boundary_outside_subgraph',
      'for_each_input_key_conflict',
      'for_each_item_port_type_mismatch',
      'for_each_index_port_type_mismatch',
      'for_each_index_contract_mismatch',
    ].includes(issue.code)
  ) {
    return 'invalid_params';
  }
  return 'schema_mismatch';
}

function mergeNodeAnalysis(
  baseAnalysis: WorkflowNodeAnalysis,
  issues: WorkflowValidationIssue[],
): WorkflowNodeAnalysis {
  const errorIssues = issues.filter((issue) => issue.severity === 'error');
  if (!errorIssues.length) {
    return baseAnalysis;
  }

  const state = errorIssues
    .map((issue) => stateFromIssue(issue))
    .sort((left, right) => stateRank(right) - stateRank(left))[0] ?? baseAnalysis.state;

  return {
    state,
    tone: state === 'missing_inputs' ? 'gold' : 'red',
    summary: errorIssues[0]?.message ?? baseAnalysis.summary,
    issues: dedupeWorkflowIssues([...baseAnalysis.issues, ...issues]),
  };
}

export interface EffectiveWorkflowValidationState {
  currentGraphSignature: string;
  liveGraphAnalysis: WorkflowGraphAnalysis;
  validationIssuesAreFresh: boolean;
  combinedIssues: WorkflowValidationIssue[];
  issuesByNodeId: Record<string, WorkflowValidationIssue[]>;
  analysisByNodeId: Record<string, WorkflowNodeAnalysis>;
  hasErrors: boolean;
}

export function getEffectiveWorkflowValidationState(options: {
  definitions: WorkflowNodeCatalogItem[];
  workflowVersion: WorkflowVersionDetail;
  context: WorkflowEditorContext;
  validationResult?: WorkflowValidationResult | null;
  validationGraphSignature?: string | null;
  insideSubgraph?: boolean;
}): EffectiveWorkflowValidationState {
  const {
    definitions,
    workflowVersion,
    context,
    validationResult,
    validationGraphSignature,
    insideSubgraph = false,
  } = options;

  const currentGraphSignature = JSON.stringify(workflowVersion.graph);
  const liveGraphAnalysis = analyzeWorkflowGraph(definitions, workflowVersion, context, {
    insideSubgraph,
  });
  const validationIssuesAreFresh = Boolean(
    validationResult && validationGraphSignature === currentGraphSignature,
  );
  const combinedIssues = dedupeWorkflowIssues([
    ...liveGraphAnalysis.issues,
    ...(validationIssuesAreFresh ? validationResult?.issues ?? [] : []),
  ]).sort((left, right) => {
    if (left.severity !== right.severity) {
      return left.severity === 'error' ? -1 : 1;
    }
    return workflowIssueKey(left).localeCompare(workflowIssueKey(right));
  });

  const issuesByNodeId = combinedIssues.reduce<Record<string, WorkflowValidationIssue[]>>(
    (accumulator, issue) => {
      if (!issue.nodeId) {
        return accumulator;
      }
      accumulator[issue.nodeId] = [...(accumulator[issue.nodeId] ?? []), issue];
      return accumulator;
    },
    {},
  );

  const analysisByNodeId = Object.fromEntries(
    workflowVersion.graph.nodes.map((node) => {
      const baseAnalysis = liveGraphAnalysis.byNodeId[node.id] ?? {
        state: 'ready',
        tone: 'green',
        summary: node.type,
        issues: [],
      };
      return [node.id, mergeNodeAnalysis(baseAnalysis, issuesByNodeId[node.id] ?? [])];
    }),
  );

  return {
    currentGraphSignature,
    liveGraphAnalysis,
    validationIssuesAreFresh,
    combinedIssues,
    issuesByNodeId,
    analysisByNodeId,
    hasErrors: combinedIssues.some((issue) => issue.severity === 'error'),
  };
}
