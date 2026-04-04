from __future__ import annotations

from collections import Counter, defaultdict, deque

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowValidationResult,
)
from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG, supported_node_types


def _definition_map() -> dict[str, WorkflowCatalogItem]:
    return {item.type: item for item in BUILTIN_NODE_CATALOG}


def _find_output_port(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
    handle: str,
) -> WorkflowNodePort | None:
    node_port = next((port for port in node.output_defs if port.key == handle), None)
    definition_outputs = definition.outputs if definition is not None else []
    definition_port = next(
        (port for port in definition_outputs if port.key == handle),
        None,
    )

    if node_port is None:
        return definition_port

    if node_port.data_types:
        return node_port

    return definition_port or node_port


def _split_binding(binding: str) -> tuple[str, str] | None:
    source_node_id, _, source_handle = binding.partition(":")
    if not source_node_id or not source_handle:
        return None
    return source_node_id, source_handle


def _resolve_edge_handles(edge, target_node: WorkflowNode) -> tuple[str | None, str | None]:
    if edge.source_handle and edge.target_handle:
        return edge.source_handle, edge.target_handle

    for target_handle, binding in target_node.input_bindings.items():
        parsed = _split_binding(binding)
        if parsed is None:
            continue
        source_node_id, source_handle = parsed
        if source_node_id == edge.source:
            return edge.source_handle or source_handle, edge.target_handle or target_handle

    return edge.source_handle, edge.target_handle


def _coerce_required_param_missing(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


def validate_workflow_graph(graph: WorkflowGraph) -> WorkflowValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    node_ids = [node.id for node in graph.nodes]
    duplicates = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    for node_id in duplicates:
        errors.append(f"Duplicate node id: {node_id}")

    supported_types = supported_node_types()
    definitions = _definition_map()
    nodes_by_id = {node.id: node for node in graph.nodes}

    for node in graph.nodes:
        if node.type not in supported_types:
            errors.append(f"Unsupported node type: {node.type}")
            continue

        definition = definitions[node.type]
        input_keys = {port.key for port in definition.inputs}
        output_keys = {port.key for port in definition.outputs}
        node_output_keys = {port.key for port in node.output_defs}

        for param in definition.params:
            if param.required and _coerce_required_param_missing(node.params.get(param.key)):
                errors.append(f"Node {node.id} is missing required parameter: {param.key}")

        for target_handle, binding in node.input_bindings.items():
            if target_handle not in input_keys:
                errors.append(f"Node {node.id} references unknown input port: {target_handle}")
                continue
            if _split_binding(binding) is None:
                errors.append(f"Node {node.id} has invalid input binding format: {binding}")

        for port in definition.inputs:
            if port.required and port.key not in node.input_bindings:
                errors.append(f"Node {node.id} is missing required input binding: {port.key}")

        if output_keys != node_output_keys:
            errors.append(f"Node {node.id} output definitions do not match the catalog definition.")

    indegree: dict[str, int] = defaultdict(int)
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.source not in nodes_by_id:
            errors.append(f"Edge {edge.id} references unknown source: {edge.source}")
            continue
        if edge.target not in nodes_by_id:
            errors.append(f"Edge {edge.id} references unknown target: {edge.target}")
            continue

        target_node = nodes_by_id[edge.target]
        target_definition = definitions.get(target_node.type)
        source_definition = definitions.get(nodes_by_id[edge.source].type)
        if target_definition is None or source_definition is None:
            continue

        source_handle, target_handle = _resolve_edge_handles(edge, target_node)
        if not source_handle or not target_handle:
            errors.append(f"Edge {edge.id} must declare compatible source and target handles.")
            continue

        target_port = next(
            (port for port in target_definition.inputs if port.key == target_handle), None
        )
        if target_port is None:
            errors.append(f"Edge {edge.id} references unknown target handle: {target_handle}")
            continue

        source_node = nodes_by_id[edge.source]
        source_port = _find_output_port(source_node, source_definition, source_handle)
        if source_port is None:
            errors.append(f"Edge {edge.id} references unknown source handle: {source_handle}")
            continue

        binding = target_node.input_bindings.get(target_handle)
        expected_binding = f"{edge.source}:{source_handle}"
        if binding != expected_binding:
            errors.append(
                "Edge "
                f"{edge.id} is inconsistent with input binding {target_handle} "
                f"on node {target_node.id}."
            )
            continue

        if not set(source_port.data_types).intersection(target_port.data_types):
            errors.append(
                f"Edge {edge.id} connects incompatible data types: "
                f"{source_node.id}.{source_handle} -> {target_node.id}.{target_handle}"
            )
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

    if graph.nodes and not any(node.type == "source.dataset_version" for node in graph.nodes):
        warnings.append("No dataset version source node is defined.")

    return WorkflowValidationResult(valid=not errors, errors=errors, warnings=warnings)
