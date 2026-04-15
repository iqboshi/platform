from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_SRC = REPO_ROOT / "backend" / "src"
FRONTEND_MOCK_PATH = REPO_ROOT / "apps" / "web" / "src" / "mocks" / "platform.ts"

sys.path.insert(0, str(BACKEND_SRC))

from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG, BUILTIN_WORKFLOW_TEMPLATES  # noqa: E402


REUSABLE_OUTPUT_TYPES = {"dataset_version", "model_version"}
STARTER_PARAM_FIELD_TYPES = {
    "datasetVersion": "dataset_version",
    "modelVersion": "model_version",
}
PREVIEW_KIND_COMPATIBILITY = {
    "dataset_version": {"dataset_version"},
    "model_version": {"model_version"},
}
BOUNDARY_TAG = "boundary"
CONVENIENCE_TAG = "convenience"
LEGACY_TAG = "legacy"
PROVIDER_TAG_PREFIX = "provider_"


@dataclass(slots=True)
class MockNodeMetadata:
    node_type: str
    starter_binding_count: int
    output_behavior_count: int


def _extract_array_body(source: str, marker: str) -> str:
    marker_index = source.find(marker)
    if marker_index < 0:
        raise ValueError(f"Unable to find marker: {marker}")

    assignment_index = source.find("=", marker_index)
    if assignment_index < 0:
        raise ValueError(f"Unable to find assignment for marker: {marker}")

    array_start = source.find("[", assignment_index)
    if array_start < 0:
        raise ValueError(f"Unable to find array start for marker: {marker}")

    depth = 0
    string_delimiter: str | None = None
    escape = False

    for index in range(array_start, len(source)):
        char = source[index]
        if string_delimiter is not None:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == string_delimiter:
                string_delimiter = None
            continue

        if char in ("'", '"', "`"):
            string_delimiter = char
            continue

        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[array_start + 1 : index]

    raise ValueError(f"Unable to find array end for marker: {marker}")


def _extract_named_array_body(source: str, property_name: str) -> str | None:
    property_match = re.search(rf"\b{re.escape(property_name)}\s*:", source)
    if property_match is None:
        return None

    array_start = source.find("[", property_match.end())
    if array_start < 0:
        return None

    depth = 0
    string_delimiter: str | None = None
    escape = False

    for index in range(array_start, len(source)):
        char = source[index]
        if string_delimiter is not None:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == string_delimiter:
                string_delimiter = None
            continue

        if char in ("'", '"', "`"):
            string_delimiter = char
            continue

        if char == "[":
            depth += 1
        elif char == "]":
            depth -= 1
            if depth == 0:
                return source[array_start + 1 : index]

    return None


def _extract_top_level_object_blocks(array_body: str) -> list[str]:
    blocks: list[str] = []
    depth = 0
    block_start: int | None = None
    string_delimiter: str | None = None
    escape = False

    for index, char in enumerate(array_body):
        if string_delimiter is not None:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == string_delimiter:
                string_delimiter = None
            continue

        if char in ("'", '"', "`"):
            string_delimiter = char
            continue

        if char == "{":
            if depth == 0:
                block_start = index
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0 and block_start is not None:
                blocks.append(array_body[block_start : index + 1])
                block_start = None

    return blocks


def parse_mock_catalog(path: Path) -> dict[str, MockNodeMetadata]:
    source = path.read_text(encoding="utf-8")
    array_body = _extract_array_body(source, "const workflowCatalog")
    metadata: dict[str, MockNodeMetadata] = {}

    for block in _extract_top_level_object_blocks(array_body):
        node_type_match = re.search(r"\btype:\s*'([^']+)'", block)
        if node_type_match is None:
            continue

        node_type = node_type_match.group(1)
        starter_bindings_body = _extract_named_array_body(block, "starterBindings") or ""
        output_behaviors_body = _extract_named_array_body(block, "outputBehaviors") or ""
        metadata[node_type] = MockNodeMetadata(
            node_type=node_type,
            starter_binding_count=len(
                re.findall(r"\binputKind:\s*'[^']+'|\bstarter\s*\(", starter_bindings_body)
            ),
            output_behavior_count=len(
                re.findall(r"\bportKey:\s*'[^']+'|\bbehavior\s*\(", output_behaviors_body)
            ),
        )

    return metadata


def _validate_port_collection(
    node_type: str,
    collection_name: str,
    items: list[object],
) -> list[str]:
    errors: list[str] = []
    seen_keys: set[str] = set()

    for item in items:
        key = getattr(item, "key")
        label = getattr(item, "label")
        if not key:
            errors.append(f"{node_type}: {collection_name} contains an empty key")
            continue
        if key in seen_keys:
            errors.append(f"{node_type}: duplicate {collection_name} key `{key}`")
        seen_keys.add(key)
        if not label:
            errors.append(f"{node_type}: {collection_name} `{key}` is missing a label")

    return errors


def _validate_contract_coverage(
    node_type: str,
    port_collection_name: str,
    ports: list[object],
    contracts: list[object],
) -> list[str]:
    errors: list[str] = []
    port_keys = {getattr(port, "key") for port in ports}
    contract_keys = [getattr(contract, "port_key") for contract in contracts]

    if len(contract_keys) != len(set(contract_keys)):
        errors.append(f"{node_type}: duplicate {port_collection_name} contract keys")

    if port_keys != set(contract_keys):
        errors.append(
            f"{node_type}: {port_collection_name} contracts must cover exactly these ports: "
            f"{sorted(port_keys)}"
        )

    return errors


def validate_catalog_item(item: object) -> list[str]:
    errors: list[str] = []
    node_type = getattr(item, "type")
    tags = {str(tag) for tag in getattr(item, "tags")}
    allows_dynamic_interface = "structural" in tags

    if not getattr(item, "label").strip():
        errors.append(f"{node_type}: missing label")
    if not getattr(item, "description").strip():
        errors.append(f"{node_type}: missing description")
    if not getattr(item, "supported_tasks"):
        errors.append(f"{node_type}: supported_tasks must not be empty")
    if not getattr(item, "tags"):
        errors.append(f"{node_type}: tags must not be empty")
    if not getattr(item, "outputs") and not allows_dynamic_interface:
        errors.append(f"{node_type}: outputs must not be empty")
    if not getattr(item, "example_inputs"):
        errors.append(f"{node_type}: example_inputs must not be empty")
    if not getattr(item, "example_outputs") and not allows_dynamic_interface:
        errors.append(f"{node_type}: example_outputs must not be empty")
    if not getattr(item, "common_errors"):
        errors.append(f"{node_type}: common_errors must not be empty")

    inputs = list(getattr(item, "inputs"))
    outputs = list(getattr(item, "outputs"))
    params = list(getattr(item, "params"))
    input_contracts = list(getattr(item, "input_contracts"))
    output_contracts = list(getattr(item, "output_contracts"))
    starter_bindings = list(getattr(item, "starter_bindings"))
    output_behaviors = list(getattr(item, "output_behaviors"))

    errors.extend(_validate_port_collection(node_type, "input", inputs))
    errors.extend(_validate_port_collection(node_type, "output", outputs))

    param_keys: set[str] = set()
    for param in params:
        if not param.key:
            errors.append(f"{node_type}: params contains an empty key")
            continue
        if param.key in param_keys:
            errors.append(f"{node_type}: duplicate param key `{param.key}`")
        param_keys.add(param.key)
        if not param.label:
            errors.append(f"{node_type}: param `{param.key}` is missing a label")

    errors.extend(_validate_contract_coverage(node_type, "input", inputs, input_contracts))
    errors.extend(_validate_contract_coverage(node_type, "output", outputs, output_contracts))

    starter_input_kinds: set[str] = set()
    for binding in starter_bindings:
        if binding.param_key not in param_keys:
            errors.append(
                f"{node_type}: starter binding `{binding.input_kind}` references "
                f"missing param `{binding.param_key}`"
            )
        if binding.input_kind in starter_input_kinds:
            errors.append(f"{node_type}: duplicate starter binding for `{binding.input_kind}`")
        starter_input_kinds.add(binding.input_kind)
        if binding.auto_create and binding.priority <= 0:
            errors.append(
                f"{node_type}: auto_create starter binding `{binding.input_kind}` "
                "must use a positive priority"
            )

    for param in params:
        expected_input_kind = STARTER_PARAM_FIELD_TYPES.get(param.field_type)
        if expected_input_kind and expected_input_kind not in starter_input_kinds:
            errors.append(
                f"{node_type}: param `{param.key}` uses field type `{param.field_type}` "
                f"but no starter binding exists for `{expected_input_kind}`"
            )

    output_port_map = {port.key: port for port in outputs}
    behavior_port_keys: set[str] = set()
    for behavior in output_behaviors:
        if behavior.port_key not in output_port_map:
            errors.append(
                f"{node_type}: output behavior references missing port `{behavior.port_key}`"
            )
            continue

        if behavior.port_key in behavior_port_keys:
            errors.append(f"{node_type}: duplicate output behavior for `{behavior.port_key}`")
        behavior_port_keys.add(behavior.port_key)

        if not behavior.preview_kinds:
            errors.append(f"{node_type}: output behavior `{behavior.port_key}` has no preview kinds")
        if not behavior.usages:
            errors.append(f"{node_type}: output behavior `{behavior.port_key}` has no usages")

        output_port = output_port_map[behavior.port_key]
        output_data_types = set(output_port.data_types)
        for preview_kind in behavior.preview_kinds:
            compatible_types = PREVIEW_KIND_COMPATIBILITY.get(preview_kind)
            if compatible_types and not (output_data_types & compatible_types):
                errors.append(
                    f"{node_type}: output behavior `{behavior.port_key}` uses preview kind "
                    f"`{preview_kind}` but port data types are {sorted(output_data_types)}"
                )

        for usage in behavior.usages:
            if usage.target == "spatial" and usage.input_kind != "asset_version":
                errors.append(
                    f"{node_type}: spatial output usage for `{behavior.port_key}` must use "
                    "`asset_version`"
                )
            if usage.target == "workflow" and usage.input_kind == "asset_version":
                errors.append(
                    f"{node_type}: workflow output usage for `{behavior.port_key}` cannot use "
                    "`asset_version`"
                )

    for output_port in outputs:
        if set(output_port.data_types) & REUSABLE_OUTPUT_TYPES and output_port.key not in behavior_port_keys:
            errors.append(
                f"{node_type}: reusable output port `{output_port.key}` must declare output_behaviors"
            )

    return errors


def validate_node_tag_taxonomy(item: object) -> list[str]:
    node_type = getattr(item, "type")
    tags = {str(tag) for tag in getattr(item, "tags")}
    description = str(getattr(item, "description", "")).lower()
    errors: list[str] = []

    provider_tags = sorted(tag for tag in tags if tag.startswith(PROVIDER_TAG_PREFIX))
    if provider_tags and BOUNDARY_TAG not in tags:
        errors.append(
            f"{node_type}: provider tags {provider_tags} require the `{BOUNDARY_TAG}` tag"
        )

    if BOUNDARY_TAG in tags and CONVENIENCE_TAG in tags:
        errors.append(
            f"{node_type}: `{BOUNDARY_TAG}` and `{CONVENIENCE_TAG}` tags must not coexist"
        )

    if CONVENIENCE_TAG in tags and provider_tags:
        errors.append(
            f"{node_type}: convenience nodes must not also declare provider tags {provider_tags}"
        )

    if CONVENIENCE_TAG in tags and "convenience" not in description and "alias" not in description:
        errors.append(
            f"{node_type}: convenience nodes should state that they are convenience aliases in the description"
        )

    if LEGACY_TAG in tags and "legacy" not in description:
        errors.append(
            f"{node_type}: legacy nodes should state that they are legacy in the description"
        )

    return errors


def validate_templates_avoid_convenience_nodes(items: list[object]) -> list[str]:
    errors: list[str] = []
    convenience_types = {
        getattr(item, "type")
        for item in items
        if CONVENIENCE_TAG in {str(tag) for tag in getattr(item, "tags")}
    }

    for template in BUILTIN_WORKFLOW_TEMPLATES:
        used_convenience_types = sorted(
            {node.type for node in template.graph.nodes if node.type in convenience_types}
        )
        if used_convenience_types:
            errors.append(
                f"template `{template.id}` uses convenience nodes {used_convenience_types}; "
                "prefer primitive nodes in built-in templates"
            )

    return errors


def validate_mock_parity(items: list[object], mock_catalog: dict[str, MockNodeMetadata]) -> list[str]:
    errors: list[str] = []
    backend_types = {getattr(item, "type") for item in items}
    mock_types = set(mock_catalog)

    missing_from_mock = sorted(backend_types - mock_types)
    extra_in_mock = sorted(mock_types - backend_types)

    for node_type in missing_from_mock:
        errors.append(f"mock catalog is missing node type `{node_type}`")
    for node_type in extra_in_mock:
        errors.append(f"mock catalog contains unknown node type `{node_type}`")

    for item in items:
        node_type = getattr(item, "type")
        mock_item = mock_catalog.get(node_type)
        if mock_item is None:
            continue

        starter_binding_count = len(getattr(item, "starter_bindings"))
        output_behavior_count = len(getattr(item, "output_behaviors"))
        if starter_binding_count != mock_item.starter_binding_count:
            errors.append(
                f"mock catalog `{node_type}` starter binding count mismatch: "
                f"backend={starter_binding_count}, mock={mock_item.starter_binding_count}"
            )
        if output_behavior_count != mock_item.output_behavior_count:
            errors.append(
                f"mock catalog `{node_type}` output behavior count mismatch: "
                f"backend={output_behavior_count}, mock={mock_item.output_behavior_count}"
            )

    return errors


def collect_validation_errors() -> list[str]:
    errors: list[str] = []
    mock_catalog = parse_mock_catalog(FRONTEND_MOCK_PATH)

    seen_node_types: set[str] = set()
    for item in BUILTIN_NODE_CATALOG:
        if item.type in seen_node_types:
            errors.append(f"duplicate backend catalog node type `{item.type}`")
        seen_node_types.add(item.type)
        errors.extend(validate_catalog_item(item))
        errors.extend(validate_node_tag_taxonomy(item))

    errors.extend(validate_templates_avoid_convenience_nodes(BUILTIN_NODE_CATALOG))
    errors.extend(validate_mock_parity(BUILTIN_NODE_CATALOG, mock_catalog))
    return errors


def main() -> int:
    errors = collect_validation_errors()
    if errors:
        print("Workflow node validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Workflow node validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
