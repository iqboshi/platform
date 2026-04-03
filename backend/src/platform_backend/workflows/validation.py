from __future__ import annotations

from collections import Counter, defaultdict, deque

from platform_backend.schemas.workflow import WorkflowGraph, WorkflowValidationResult
from platform_backend.workflows.catalog import supported_node_types


def validate_workflow_graph(graph: WorkflowGraph) -> WorkflowValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    node_ids = [node.id for node in graph.nodes]
    duplicates = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    for node_id in duplicates:
        errors.append(f"Duplicate node id: {node_id}")

    supported_types = supported_node_types()
    nodes_by_id = {node.id: node for node in graph.nodes}
    for node in graph.nodes:
        if node.type not in supported_types:
            errors.append(f"Unsupported node type: {node.type}")

    indegree: dict[str, int] = defaultdict(int)
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.source not in nodes_by_id:
            errors.append(f"Edge {edge.id} references unknown source: {edge.source}")
            continue
        if edge.target not in nodes_by_id:
            errors.append(f"Edge {edge.id} references unknown target: {edge.target}")
            continue
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] += 1
        indegree.setdefault(edge.source, 0)

    if errors:
        return WorkflowValidationResult(valid=False, errors=errors, warnings=warnings)

    queue = deque([node.id for node in graph.nodes if indegree.get(node.id, 0) == 0])
    visited = 0
    while queue:
        node_id = queue.popleft()
        visited += 1
        for neighbor in adjacency[node_id]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if visited != len(graph.nodes):
        errors.append("Workflow graph must be acyclic.")

    if graph.nodes and not any(node.type == "source.dataset" for node in graph.nodes):
        warnings.append("No dataset source node is defined.")

    return WorkflowValidationResult(valid=not errors, errors=errors, warnings=warnings)
