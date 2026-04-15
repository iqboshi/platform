from __future__ import annotations

from dataclasses import dataclass

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowPortContract,
)

CALL_SUBGRAPH_NODE_TYPE = "workflow.call_subgraph"
FOR_EACH_NODE_TYPE = "control.for_each"
SUBGRAPH_INPUT_NODE_TYPE = "workflow.subgraph_input"
SUBGRAPH_OUTPUT_NODE_TYPE = "workflow.subgraph_output"
STRUCTURAL_SUBGRAPH_NODE_TYPES = {
    CALL_SUBGRAPH_NODE_TYPE,
    FOR_EACH_NODE_TYPE,
}
SUBGRAPH_BOUNDARY_NODE_TYPES = {
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
}
FOR_EACH_ITEM_PORT_KEY = "item"
FOR_EACH_INDEX_PORT_KEY = "index"
FOR_EACH_RESERVED_INPUT_PORT_KEYS = {
    FOR_EACH_ITEM_PORT_KEY,
    FOR_EACH_INDEX_PORT_KEY,
}
DYNAMIC_INTERFACE_NODE_TYPES = {
    *STRUCTURAL_SUBGRAPH_NODE_TYPES,
    *SUBGRAPH_BOUNDARY_NODE_TYPES,
}


@dataclass(frozen=True, slots=True)
class WorkflowInterfacePort:
    node_id: str
    port: WorkflowNodePort
    contract: WorkflowPortContract | None = None


def clone_port(port: WorkflowNodePort) -> WorkflowNodePort:
    return WorkflowNodePort.model_validate(port.model_dump(mode="json"))


def clone_contract(contract: WorkflowPortContract) -> WorkflowPortContract:
    return WorkflowPortContract.model_validate(contract.model_dump(mode="json"))


def _merge_port_overrides(
    node_ports: list[WorkflowNodePort],
    definition_ports: list[WorkflowNodePort],
) -> list[WorkflowNodePort]:
    definition_by_key = {port.key: port for port in definition_ports}
    merged: list[WorkflowNodePort] = []
    for node_port in node_ports:
        if node_port.data_types:
            merged.append(clone_port(node_port))
            continue
        definition_port = definition_by_key.get(node_port.key)
        merged.append(clone_port(definition_port or node_port))
    return merged


def _structural_input_interface(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
) -> list[WorkflowInterfacePort]:
    if node.subgraph is None:
        return []

    if node.type == CALL_SUBGRAPH_NODE_TYPE:
        return derive_subgraph_inputs(node.subgraph)

    if node.type != FOR_EACH_NODE_TYPE:
        return []

    definition_input_keys = {
        port.key for port in (definition.inputs if definition is not None else [])
    }
    return [
        item
        for item in derive_subgraph_inputs(node.subgraph)
        if item.port.key not in FOR_EACH_RESERVED_INPUT_PORT_KEYS
        and item.port.key not in definition_input_keys
    ]


def _structural_output_interface(
    node: WorkflowNode,
) -> list[WorkflowInterfacePort]:
    if node.subgraph is None:
        return []

    if node.type == CALL_SUBGRAPH_NODE_TYPE:
        return derive_subgraph_outputs(node.subgraph)

    if node.type != FOR_EACH_NODE_TYPE:
        return []

    aggregated_outputs: list[WorkflowInterfacePort] = []
    for item in derive_subgraph_outputs(node.subgraph):
        port = clone_port(item.port)
        port.data_types = ["value_list"]

        contract = clone_contract(item.contract) if item.contract is not None else None
        if contract is not None:
            base_summary = contract.summary.strip()
            contract.summary = (
                "Aggregated list of per-iteration outputs."
                if not base_summary
                else f"Aggregated list of per-iteration outputs whose items satisfy: {base_summary}"
            )
            contract.notes = [
                *contract.notes,
                f"Produced by {FOR_EACH_NODE_TYPE} from nested output `{item.port.key}`.",
            ]

        aggregated_outputs.append(
            WorkflowInterfacePort(
                node_id=item.node_id,
                port=port,
                contract=contract,
            )
        )

    return aggregated_outputs


def effective_node_inputs(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
) -> list[WorkflowNodePort]:
    if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES and node.subgraph is not None:
        structural_inputs = _structural_input_interface(node, definition)
        if node.type == FOR_EACH_NODE_TYPE:
            static_inputs = [
                clone_port(port) for port in (definition.inputs if definition is not None else [])
            ]
            return static_inputs + [clone_port(item.port) for item in structural_inputs]
        return [clone_port(item.port) for item in structural_inputs]
    if node.input_defs:
        return _merge_port_overrides(
            node.input_defs, definition.inputs if definition is not None else []
        )
    if definition is None:
        return []
    return [clone_port(port) for port in definition.inputs]


def effective_node_outputs(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
) -> list[WorkflowNodePort]:
    if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES and node.subgraph is not None:
        return [clone_port(item.port) for item in _structural_output_interface(node)]
    if node.output_defs:
        return _merge_port_overrides(
            node.output_defs, definition.outputs if definition is not None else []
        )
    if definition is None:
        return []
    return [clone_port(port) for port in definition.outputs]


def effective_input_contracts(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
) -> list[WorkflowPortContract]:
    if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES and node.subgraph is not None:
        structural_contracts = [
            clone_contract(item.contract)
            for item in _structural_input_interface(node, definition)
            if item.contract is not None
        ]
        if node.type == FOR_EACH_NODE_TYPE:
            return [
                *[
                    clone_contract(contract)
                    for contract in (definition.input_contracts if definition is not None else [])
                ],
                *structural_contracts,
            ]
        return structural_contracts
    if node.input_contracts:
        return [clone_contract(contract) for contract in node.input_contracts]
    if definition is None:
        return []
    return [clone_contract(contract) for contract in definition.input_contracts]


def effective_output_contracts(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
) -> list[WorkflowPortContract]:
    if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES and node.subgraph is not None:
        return [
            clone_contract(item.contract)
            for item in _structural_output_interface(node)
            if item.contract is not None
        ]
    if node.output_contracts:
        return [clone_contract(contract) for contract in node.output_contracts]
    if definition is None:
        return []
    return [clone_contract(contract) for contract in definition.output_contracts]


def derive_subgraph_inputs(subgraph: WorkflowGraph) -> list[WorkflowInterfacePort]:
    return _derive_subgraph_boundary_ports(subgraph, node_type=SUBGRAPH_INPUT_NODE_TYPE)


def derive_subgraph_outputs(subgraph: WorkflowGraph) -> list[WorkflowInterfacePort]:
    return _derive_subgraph_boundary_ports(subgraph, node_type=SUBGRAPH_OUTPUT_NODE_TYPE)


def _derive_subgraph_boundary_ports(
    subgraph: WorkflowGraph,
    *,
    node_type: str,
) -> list[WorkflowInterfacePort]:
    interface_ports: list[WorkflowInterfacePort] = []
    for node in _ordered_subgraph_boundary_nodes(subgraph, node_type=node_type):
        ports = node.output_defs if node_type == SUBGRAPH_INPUT_NODE_TYPE else node.input_defs
        contracts = (
            node.output_contracts if node_type == SUBGRAPH_INPUT_NODE_TYPE else node.input_contracts
        )
        contracts_by_key = {contract.port_key: contract for contract in contracts}
        for port in ports:
            interface_ports.append(
                WorkflowInterfacePort(
                    node_id=node.id,
                    port=clone_port(port),
                    contract=clone_contract(contracts_by_key[port.key])
                    if port.key in contracts_by_key
                    else None,
                )
            )
    return interface_ports


def _ordered_subgraph_boundary_nodes(
    subgraph: WorkflowGraph,
    *,
    node_type: str,
) -> list[WorkflowNode]:
    return sorted(
        [node for node in subgraph.nodes if node.type == node_type],
        key=lambda node: (
            float(node.position.get("y", 0.0)),
            float(node.position.get("x", 0.0)),
            node.id,
        ),
    )
