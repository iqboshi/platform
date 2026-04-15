from __future__ import annotations

import json
from collections import Counter, defaultdict, deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from platform_backend.models.entities import Dataset, DatasetVersion
from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowPortContract,
    WorkflowValidationIssue,
    WorkflowValidationResult,
)
from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG, supported_node_types
from platform_backend.workflows.patch_runtime import (
    parse_bbox_roi_params,
    parse_dataset_split_params,
    parse_image_patchify_params,
    parse_label_filter_by_coverage_params,
    parse_label_output_params,
    parse_query_raster_collection_params,
    parse_raster_patchify_params,
    parse_scene_filter_params,
    parse_scene_select_params,
    parse_scene_sort_params,
)
from platform_backend.workflows.subgraph_runtime import (
    CALL_SUBGRAPH_NODE_TYPE,
    FOR_EACH_INDEX_PORT_KEY,
    FOR_EACH_ITEM_PORT_KEY,
    FOR_EACH_NODE_TYPE,
    FOR_EACH_RESERVED_INPUT_PORT_KEYS,
    STRUCTURAL_SUBGRAPH_NODE_TYPES,
    SUBGRAPH_BOUNDARY_NODE_TYPES,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
    derive_subgraph_inputs,
    derive_subgraph_outputs,
    effective_input_contracts,
    effective_node_inputs,
    effective_node_outputs,
    effective_output_contracts,
)


@dataclass(frozen=True)
class WorkflowDatasetSemantics:
    dataset_kind: str | None
    original_file_name: str = ""
    content_type: str = ""
    task_types: frozenset[str] = field(default_factory=frozenset)
    annotation_kinds: frozenset[str] = field(default_factory=frozenset)
    sample_kinds: frozenset[str] = field(default_factory=frozenset)
    value_types: frozenset[str] = field(default_factory=frozenset)
    metadata: dict[str, object] = field(default_factory=dict)


DatasetSemanticsResolver = Callable[[str], WorkflowDatasetSemantics | None]


def _issue(
    code: str,
    message: str,
    *,
    severity: str = "error",
    node_id: str | None = None,
    port_key: str | None = None,
    param_key: str | None = None,
    expected: str | None = None,
    actual: str | None = None,
    suggestion: str | None = None,
) -> WorkflowValidationIssue:
    return WorkflowValidationIssue(
        code=code,
        severity=severity,
        message=message,
        node_id=node_id,
        port_key=port_key,
        param_key=param_key,
        expected=expected,
        actual=actual,
        suggestion=suggestion,
    )


def _result_from_issues(issues: list[WorkflowValidationIssue]) -> WorkflowValidationResult:
    errors = [issue.message for issue in issues if issue.severity == "error"]
    warnings = [issue.message for issue in issues if issue.severity == "warning"]
    return WorkflowValidationResult(
        valid=not errors,
        errors=errors,
        warnings=warnings,
        issues=issues,
    )


def resolve_dataset_semantics_from_db(
    db: Session,
    dataset_version_id: str,
) -> WorkflowDatasetSemantics | None:
    version = db.get(DatasetVersion, dataset_version_id)
    if version is None:
        return None

    dataset = db.get(Dataset, version.dataset_id)
    if dataset is None:
        return None

    metadata = version.metadata_json if isinstance(version.metadata_json, dict) else {}
    original_file_name = str(
        metadata.get("original_file_name")
        or metadata.get("originalFileName")
        or version.original_file_name
        or Path(version.asset_path).name
    ).strip()
    content_type = str(
        metadata.get("content_type") or metadata.get("contentType") or version.content_type or ""
    ).strip()
    dataset_kind = dataset.kind.value if hasattr(dataset.kind, "value") else str(dataset.kind)
    return WorkflowDatasetSemantics(
        dataset_kind=dataset_kind,
        original_file_name=original_file_name,
        content_type=content_type,
        task_types=frozenset(
            _metadata_semantic_tokens(
                metadata,
                "taskType",
                "task_type",
                "taskTypes",
                "task_types",
            )
        ),
        annotation_kinds=frozenset(
            _metadata_semantic_tokens(
                metadata,
                "annotationKind",
                "annotation_kind",
                "annotationKinds",
                "annotation_kinds",
            )
        ),
        sample_kinds=frozenset(
            _metadata_semantic_tokens(
                metadata,
                "sampleKind",
                "sample_kind",
                "sampleKinds",
                "sample_kinds",
            )
        ),
        value_types=frozenset(
            _metadata_semantic_tokens(
                metadata,
                "valueType",
                "value_type",
                "valueTypes",
                "value_types",
            )
        ),
        metadata=metadata,
    )


def _definition_map() -> dict[str, WorkflowCatalogItem]:
    return {item.type: item for item in BUILTIN_NODE_CATALOG}


def _find_output_port(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
    handle: str,
) -> WorkflowNodePort | None:
    return next(
        (port for port in effective_node_outputs(node, definition) if port.key == handle),
        None,
    )


def _find_input_port(
    node: WorkflowNode,
    definition: WorkflowCatalogItem | None,
    handle: str,
) -> WorkflowNodePort | None:
    return next(
        (port for port in effective_node_inputs(node, definition) if port.key == handle),
        None,
    )


def _find_port_contract(
    contracts: list[WorkflowPortContract],
    port_key: str,
) -> WorkflowPortContract | None:
    return next((contract for contract in contracts if contract.port_key == port_key), None)


def _clone_contract(contract: WorkflowPortContract) -> WorkflowPortContract:
    return WorkflowPortContract.model_validate(contract.model_dump(mode="json"))


_TABULAR_PREDICT_NODE_TYPES = {
    "tabular.predict_model",
    "tabular.linear_regression_predict",
    "tabular.svm_regression_predict",
    "tabular.random_forest_regression_predict",
    "custom.api_predict",
}


def _ordered_unique_tokens(values: list[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for value in values:
        token = str(value).strip()
        if not token or token in seen:
            continue
        seen.add(token)
        ordered.append(token)
    return ordered


def _task_types_for_annotation_kinds(annotation_kinds: list[str]) -> list[str]:
    mapping = {
        "class_label": "image_classification",
        "mask": "semantic_segmentation",
        "bbox": "object_detection",
        "polygon": "instance_segmentation",
    }
    task_types: list[str] = []
    seen: set[str] = set()
    for annotation_kind in annotation_kinds:
        task_type = mapping.get(str(annotation_kind).strip())
        if task_type and task_type not in seen:
            seen.add(task_type)
            task_types.append(task_type)
    return task_types


def _annotation_kinds_for_task_types(task_types: list[str]) -> list[str]:
    mapping = {
        "image_classification": "class_label",
        "semantic_segmentation": "mask",
        "instance_segmentation": "polygon",
        "object_detection": "bbox",
    }
    annotation_kinds: list[str] = []
    seen: set[str] = set()
    for task_type in task_types:
        annotation_kind = mapping.get(str(task_type).strip())
        if annotation_kind and annotation_kind not in seen:
            seen.add(annotation_kind)
            annotation_kinds.append(annotation_kind)
    return annotation_kinds


def _ports_match(left: list[WorkflowNodePort], right: list[WorkflowNodePort]) -> bool:
    return [port.model_dump(mode="json") for port in left] == [
        port.model_dump(mode="json") for port in right
    ]


def _contracts_match(
    left: list[WorkflowPortContract],
    right: list[WorkflowPortContract],
) -> bool:
    return [contract.model_dump(mode="json") for contract in left] == [
        contract.model_dump(mode="json") for contract in right
    ]


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


def _missing_required_param(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    return False


def _parse_json_object_param(value: object, *, field_name: str) -> None:
    text = str(value or "{}").strip() or "{}"
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc
    if not isinstance(payload, dict):
        raise ValueError(f"{field_name} must be a JSON object.")


def _parse_json_value_param(value: object, *, field_name: str) -> object:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc


def _normalize_format_token(value: str) -> str:
    return value.strip().lower().lstrip(".")


def _normalize_semantic_token(value: str) -> str:
    return value.strip().lower().replace("-", "_").replace(" ", "_")


def _canonical_format_tokens(value: str) -> set[str]:
    token = _normalize_format_token(value)
    if not token:
        return set()

    candidates = {token}
    if "/" in token:
        candidates.add(token.split("/", 1)[1])

    expanded: set[str] = set()
    for candidate in candidates:
        normalized = candidate.removeprefix("x-")
        if normalized in {"jpg", "jpeg"} or "jpeg" in normalized:
            expanded.update({"jpg", "jpeg"})
        elif (
            normalized in {"tif", "tiff", "geotiff"}
            or "tiff" in normalized
            or "geotiff" in normalized
        ):
            expanded.update({"geotiff", "tif", "tiff"})
        elif normalized == "csv" or "csv" in normalized:
            expanded.add("csv")
        elif normalized == "geojson" or "geo+json" in normalized:
            expanded.update({"geojson", "json"})
        elif normalized == "json" or normalized.endswith("/json") or normalized.endswith("+json"):
            expanded.add("json")
        elif normalized == "png" or "png" in normalized:
            expanded.add("png")
        elif normalized in {"zip", "x-zip-compressed"} or "zip" in normalized:
            expanded.add("zip")
        else:
            expanded.add(normalized)

    return expanded


def _semantic_tokens_from_value(value: object) -> set[str]:
    items: list[object]
    if value is None:
        return set()
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return set()
        items = [part for part in stripped.split(",")] if "," in stripped else [stripped]
    elif isinstance(value, (list, tuple, set, frozenset)):
        items = list(value)
    else:
        items = [value]

    tokens: set[str] = set()
    for item in items:
        token = _normalize_semantic_token(str(item))
        if token:
            tokens.add(token)
    return tokens


def _metadata_semantic_tokens(metadata: dict[str, object], *keys: str) -> set[str]:
    tokens: set[str] = set()
    for key in keys:
        tokens.update(_semantic_tokens_from_value(metadata.get(key)))
    return tokens


def _normalize_semantic_values(values: list[str]) -> set[str]:
    tokens: set[str] = set()
    for value in values:
        token = _normalize_semantic_token(value)
        if token:
            tokens.add(token)
    return tokens


def _semantic_mismatch_reason(
    *,
    actual: set[str],
    expected: list[str],
    label: str,
) -> str | None:
    normalized_expected = _normalize_semantic_values(expected)
    if not normalized_expected:
        return None
    expected_display = ", ".join(expected)
    if not actual:
        return f"{label} metadata is missing; expected one of {expected_display}"
    if actual.intersection(normalized_expected):
        return None
    return f"{label} {', '.join(sorted(actual))} does not satisfy {expected_display}"


def _contract_semantic_mismatch_reason(
    *,
    source_values: list[str],
    target_values: list[str],
    label: str,
) -> str | None:
    normalized_target = _normalize_semantic_values(target_values)
    if not normalized_target:
        return None

    normalized_source = _normalize_semantic_values(source_values)
    target_display = ", ".join(target_values)
    if not normalized_source:
        return f"{label} are not declared by the upstream contract; expected {target_display}"
    if normalized_source.intersection(normalized_target):
        return None
    return f"{label} {', '.join(source_values)} do not satisfy {target_display}"


def _metadata_columns(metadata: dict[str, object]) -> set[str]:
    raw_columns = metadata.get("columns")
    if not isinstance(raw_columns, list):
        return set()
    return {str(column).strip() for column in raw_columns if str(column).strip()}


def _dataset_format_tokens(semantics: WorkflowDatasetSemantics) -> set[str]:
    tokens: set[str] = set()
    if semantics.original_file_name:
        suffix = Path(semantics.original_file_name).suffix
        if suffix:
            tokens.update(_canonical_format_tokens(suffix))

    if semantics.content_type:
        tokens.update(_canonical_format_tokens(semantics.content_type))

    for key in (
        "format",
        "file_format",
        "fileFormat",
        "content_type",
        "contentType",
        "original_file_name",
        "originalFileName",
    ):
        value = semantics.metadata.get(key)
        if isinstance(value, str) and value.strip():
            tokens.update(_canonical_format_tokens(value))

    return tokens


def _contract_format_tokens(contract: WorkflowPortContract) -> set[str]:
    tokens: set[str] = set()
    for file_format in contract.file_formats:
        tokens.update(_canonical_format_tokens(file_format))
    return tokens


def _describe_dataset_semantics(semantics: WorkflowDatasetSemantics) -> str:
    dataset_kind = semantics.dataset_kind or "unknown"
    file_formats = sorted(_dataset_format_tokens(semantics))
    if file_formats:
        return f"{dataset_kind} dataset ({', '.join(file_formats)})"
    return f"{dataset_kind} dataset"


def _dataset_contract_mismatch_reasons(
    semantics: WorkflowDatasetSemantics,
    contract: WorkflowPortContract,
) -> list[str]:
    reasons: list[str] = []

    if contract.dataset_kinds:
        if not semantics.dataset_kind:
            reasons.append(
                "dataset kind is missing; expected one of " + ", ".join(contract.dataset_kinds)
            )
        elif semantics.dataset_kind not in contract.dataset_kinds:
            reasons.append(
                "dataset kind "
                f"{semantics.dataset_kind} is not one of {', '.join(contract.dataset_kinds)}"
            )

    required_formats = _contract_format_tokens(contract)
    available_formats = _dataset_format_tokens(semantics)
    if required_formats:
        if not available_formats:
            reasons.append(
                "file format metadata is missing; expected one of "
                + ", ".join(sorted(required_formats))
            )
        elif not available_formats.intersection(required_formats):
            reasons.append(
                "file format "
                f"{', '.join(sorted(available_formats))} is not compatible with "
                f"{', '.join(sorted(required_formats))}"
            )

    available_columns = _metadata_columns(semantics.metadata)
    if contract.column_requirements:
        if not available_columns:
            reasons.append(
                "column metadata is missing; expected columns: "
                + ", ".join(sorted(contract.column_requirements))
            )
        else:
            missing_columns = [
                column for column in contract.column_requirements if column not in available_columns
            ]
            if missing_columns:
                reasons.append("missing required columns: " + ", ".join(sorted(missing_columns)))

    task_type_reason = _semantic_mismatch_reason(
        actual=set(semantics.task_types),
        expected=contract.task_types,
        label="task types",
    )
    if task_type_reason:
        reasons.append(task_type_reason)

    annotation_kind_reason = _semantic_mismatch_reason(
        actual=set(semantics.annotation_kinds),
        expected=contract.annotation_kinds,
        label="annotation kinds",
    )
    if annotation_kind_reason:
        reasons.append(annotation_kind_reason)

    sample_kind_reason = _semantic_mismatch_reason(
        actual=set(semantics.sample_kinds),
        expected=contract.sample_kinds,
        label="sample kinds",
    )
    if sample_kind_reason:
        reasons.append(sample_kind_reason)

    value_type_reason = _semantic_mismatch_reason(
        actual=set(semantics.value_types),
        expected=contract.value_types,
        label="value types",
    )
    if value_type_reason:
        reasons.append(value_type_reason)

    return reasons


def _contract_mismatch_reasons(
    source_contract: WorkflowPortContract,
    target_contract: WorkflowPortContract,
) -> list[str]:
    reasons: list[str] = []

    if target_contract.dataset_kinds:
        if not source_contract.dataset_kinds:
            reasons.append(
                "dataset kinds are not declared by the upstream contract; expected "
                + ", ".join(target_contract.dataset_kinds)
            )
        elif not set(source_contract.dataset_kinds).intersection(target_contract.dataset_kinds):
            reasons.append(
                "dataset kinds "
                f"{', '.join(source_contract.dataset_kinds)} do not satisfy "
                f"{', '.join(target_contract.dataset_kinds)}"
            )

    source_formats = _contract_format_tokens(source_contract)
    target_formats = _contract_format_tokens(target_contract)
    if target_formats:
        if not source_formats:
            reasons.append(
                "file formats are not declared by the upstream contract; expected "
                + ", ".join(sorted(target_formats))
            )
        elif not source_formats.intersection(target_formats):
            reasons.append(
                "file formats "
                f"{', '.join(sorted(source_formats))} do not satisfy "
                f"{', '.join(sorted(target_formats))}"
            )

    if target_contract.column_requirements:
        if not source_contract.produced_columns:
            reasons.append(
                "upstream contract does not declare produced columns; expected "
                + ", ".join(sorted(target_contract.column_requirements))
            )
        else:
            missing_columns = [
                column
                for column in target_contract.column_requirements
                if column not in source_contract.produced_columns
            ]
            if missing_columns:
                reasons.append(
                    "output columns do not include: " + ", ".join(sorted(missing_columns))
                )

    task_type_reason = _contract_semantic_mismatch_reason(
        source_values=source_contract.task_types,
        target_values=target_contract.task_types,
        label="task types",
    )
    if task_type_reason:
        reasons.append(task_type_reason)

    annotation_kind_reason = _contract_semantic_mismatch_reason(
        source_values=source_contract.annotation_kinds,
        target_values=target_contract.annotation_kinds,
        label="annotation kinds",
    )
    if annotation_kind_reason:
        reasons.append(annotation_kind_reason)

    sample_kind_reason = _contract_semantic_mismatch_reason(
        source_values=source_contract.sample_kinds,
        target_values=target_contract.sample_kinds,
        label="sample kinds",
    )
    if sample_kind_reason:
        reasons.append(sample_kind_reason)

    value_type_reason = _contract_semantic_mismatch_reason(
        source_values=source_contract.value_types,
        target_values=target_contract.value_types,
        label="value types",
    )
    if value_type_reason:
        reasons.append(value_type_reason)

    return reasons


def _resolve_effective_output_sources(
    *,
    source_node: WorkflowNode,
    source_handle: str,
    nodes_by_id: dict[str, WorkflowNode],
    definitions: dict[str, WorkflowCatalogItem],
    visited: set[tuple[str, str]] | None = None,
) -> list[tuple[WorkflowNode, str, WorkflowNodePort, WorkflowCatalogItem]]:
    token = (source_node.id, source_handle)
    if visited is not None and token in visited:
        return []

    definition = definitions.get(source_node.type)
    if definition is None:
        return []

    next_visited = set(visited or set())
    next_visited.add(token)

    if source_node.type == "control.guard" and source_handle == "payload":
        parsed = _split_binding(source_node.input_bindings.get("payload", ""))
        if parsed is None:
            return []
        upstream_node = nodes_by_id.get(parsed[0])
        if upstream_node is None:
            return []
        return _resolve_effective_output_sources(
            source_node=upstream_node,
            source_handle=parsed[1],
            nodes_by_id=nodes_by_id,
            definitions=definitions,
            visited=next_visited,
        )

    if source_node.type == "control.coalesce" and source_handle == "output":
        resolved: list[tuple[WorkflowNode, str, WorkflowNodePort, WorkflowCatalogItem]] = []
        seen: set[tuple[str, str]] = set()
        for input_key in ("primary", "fallback"):
            parsed = _split_binding(source_node.input_bindings.get(input_key, ""))
            if parsed is None:
                continue
            upstream_node = nodes_by_id.get(parsed[0])
            if upstream_node is None:
                continue
            for item in _resolve_effective_output_sources(
                source_node=upstream_node,
                source_handle=parsed[1],
                nodes_by_id=nodes_by_id,
                definitions=definitions,
                visited=next_visited,
            ):
                dedupe_token = (item[0].id, item[1])
                if dedupe_token in seen:
                    continue
                seen.add(dedupe_token)
                resolved.append(item)
        return resolved

    port = _find_output_port(source_node, definition, source_handle)
    if port is None:
        return []
    return [(source_node, source_handle, port, definition)]


def _effective_input_contract_for_validation(
    node: WorkflowNode,
    port_key: str,
    definition: WorkflowCatalogItem,
) -> WorkflowPortContract | None:
    base_contract = _find_port_contract(effective_input_contracts(node, definition), port_key)
    if base_contract is None:
        return None

    if node.type == "custom.api_train_samples" and port_key in {
        "trainSamples",
        "validationSamples",
    }:
        task_type = str(node.params.get("taskType", "")).strip()
        if not task_type:
            return _clone_contract(base_contract)
        return base_contract.model_copy(
            update={
                "summary": (
                    "Labeled sample set matching the configured training task semantics."
                    if port_key == "trainSamples"
                    else (
                        "Optional labeled sample set matching the configured "
                        "training task semantics."
                    )
                ),
                "task_types": [task_type],
                "annotation_kinds": _annotation_kinds_for_task_types([task_type]),
            }
        )

    if node.type == "metrics.validate_regression" and port_key in {
        "predictionTable",
        "groundTruthTable",
    }:
        configured_column = str(
            node.params.get(
                "predictionColumn" if port_key == "predictionTable" else "groundTruthColumn",
                "prediction" if port_key == "predictionTable" else "target",
            )
            or ""
        ).strip() or ("prediction" if port_key == "predictionTable" else "target")
        sample_columns = _ordered_unique_tokens(
            [*list(base_contract.sample_columns), configured_column]
        )
        return base_contract.model_copy(
            update={
                "summary": (
                    "Prediction table containing the configured prediction column."
                    if port_key == "predictionTable"
                    else "Ground-truth table containing the configured target column."
                ),
                "column_requirements": [configured_column],
                "sample_columns": sample_columns,
            }
        )

    return _clone_contract(base_contract)


def _bound_input_contract_for_validation(
    node: WorkflowNode,
    input_key: str,
    nodes_by_id: dict[str, WorkflowNode],
    definitions: dict[str, WorkflowCatalogItem],
    *,
    dataset_semantics_resolver: DatasetSemanticsResolver | None = None,
    dataset_semantics_cache: dict[str, WorkflowDatasetSemantics | None] | None = None,
    visited: set[tuple[str, str]] | None = None,
) -> WorkflowPortContract | None:
    binding = str(node.input_bindings.get(input_key, "")).strip()
    if not binding:
        return None
    parsed = _split_binding(binding)
    if parsed is None:
        return None
    source_node = nodes_by_id.get(parsed[0])
    if source_node is None:
        return None
    source_definition = definitions.get(source_node.type)
    if source_definition is None:
        return None
    return _effective_output_contract_for_validation(
        source_node,
        parsed[1],
        source_definition,
        nodes_by_id,
        definitions,
        dataset_semantics_resolver=dataset_semantics_resolver,
        dataset_semantics_cache=dataset_semantics_cache,
        visited=visited,
    )


def _bound_input_columns_for_validation(
    node: WorkflowNode,
    input_key: str,
    nodes_by_id: dict[str, WorkflowNode],
    definitions: dict[str, WorkflowCatalogItem],
    *,
    dataset_semantics_resolver: DatasetSemanticsResolver | None = None,
    dataset_semantics_cache: dict[str, WorkflowDatasetSemantics | None] | None = None,
    visited: set[tuple[str, str]] | None = None,
) -> list[str]:
    binding = str(node.input_bindings.get(input_key, "")).strip()
    if not binding:
        return []
    parsed = _split_binding(binding)
    if parsed is None:
        return []
    source_node = nodes_by_id.get(parsed[0])
    if source_node is None:
        return []

    if source_node.type == "source.dataset_version" and dataset_semantics_resolver is not None:
        dataset_version_id = str(source_node.params.get("datasetVersionId", "")).strip()
        if dataset_version_id:
            if (
                dataset_semantics_cache is not None
                and dataset_version_id not in dataset_semantics_cache
            ):
                dataset_semantics_cache[dataset_version_id] = dataset_semantics_resolver(
                    dataset_version_id
                )
            semantics = (
                dataset_semantics_cache.get(dataset_version_id)
                if dataset_semantics_cache is not None
                else dataset_semantics_resolver(dataset_version_id)
            )
            if semantics is not None:
                return _ordered_unique_tokens(list(_metadata_columns(semantics.metadata)))

    contract = _bound_input_contract_for_validation(
        node,
        input_key,
        nodes_by_id,
        definitions,
        dataset_semantics_resolver=dataset_semantics_resolver,
        dataset_semantics_cache=dataset_semantics_cache,
        visited=visited,
    )
    if contract is None:
        return []
    return _ordered_unique_tokens(
        [*list(contract.produced_columns), *list(contract.sample_columns)]
    )


def _effective_output_contract_for_validation(
    node: WorkflowNode,
    port_key: str,
    definition: WorkflowCatalogItem,
    nodes_by_id: dict[str, WorkflowNode],
    definitions: dict[str, WorkflowCatalogItem],
    *,
    dataset_semantics_resolver: DatasetSemanticsResolver | None = None,
    dataset_semantics_cache: dict[str, WorkflowDatasetSemantics | None] | None = None,
    visited: set[tuple[str, str]] | None = None,
) -> WorkflowPortContract | None:
    base_contract = _find_port_contract(effective_output_contracts(node, definition), port_key)
    if base_contract is None:
        return None

    token = (node.id, port_key)
    if visited is not None and token in visited:
        return _clone_contract(base_contract)
    next_visited = set(visited or set())
    next_visited.add(token)

    if node.type == "dataset.build_samples" and port_key == "samples":
        tiles_contract = _bound_input_contract_for_validation(
            node,
            "tiles",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        labels_contract = _bound_input_contract_for_validation(
            node,
            "labels",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        sample_kinds = (
            list(tiles_contract.sample_kinds)
            if tiles_contract is not None and tiles_contract.sample_kinds
            else list(base_contract.sample_kinds)
        )
        annotation_kinds = (
            list(labels_contract.annotation_kinds)
            if labels_contract is not None and labels_contract.annotation_kinds
            else []
        )
        task_types = (
            list(labels_contract.task_types)
            if labels_contract is not None and labels_contract.task_types
            else _task_types_for_annotation_kinds(annotation_kinds)
        )
        return base_contract.model_copy(
            update={
                "summary": (
                    "Sample set built from an RGB tile grid and optional aligned annotations."
                ),
                "sample_kinds": sample_kinds,
                "annotation_kinds": annotation_kinds,
                "task_types": task_types,
            }
        )

    if node.type == "dataset.split_samples" and port_key in {
        "trainSamples",
        "valSamples",
        "testSamples",
    }:
        samples_contract = _bound_input_contract_for_validation(
            node,
            "samples",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        if samples_contract is None:
            return _clone_contract(base_contract)
        return base_contract.model_copy(
            update={
                "summary": {
                    "trainSamples": "Training sample split preserving upstream sample semantics.",
                    "valSamples": "Validation sample split preserving upstream sample semantics.",
                    "testSamples": "Test sample split preserving upstream sample semantics.",
                }[port_key],
                "sample_kinds": list(samples_contract.sample_kinds),
                "annotation_kinds": list(samples_contract.annotation_kinds),
                "task_types": list(samples_contract.task_types),
            }
        )

    if node.type == "custom.api_predict_samples" and port_key == "predictions":
        samples_contract = _bound_input_contract_for_validation(
            node,
            "samples",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        if samples_contract is None:
            return _clone_contract(base_contract)
        task_types = list(samples_contract.task_types)
        annotation_kinds = _annotation_kinds_for_task_types(task_types) or list(
            samples_contract.annotation_kinds
        )
        return base_contract.model_copy(
            update={
                "summary": "Prediction set preserving the upstream sample grid and task semantics.",
                "sample_kinds": list(samples_contract.sample_kinds),
                "annotation_kinds": annotation_kinds,
                "task_types": task_types,
            }
        )

    if node.type == "table.load_csv" and port_key == "table":
        produced_columns = _bound_input_columns_for_validation(
            node,
            "dataset",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        if not produced_columns:
            return _clone_contract(base_contract)
        return base_contract.model_copy(
            update={
                "summary": "In-memory table decoded from the bound CSV dataset version.",
                "sample_columns": produced_columns,
                "produced_columns": produced_columns,
            }
        )

    if node.type == "table.train_test_split" and port_key in {"trainTable", "testTable"}:
        produced_columns = _bound_input_columns_for_validation(
            node,
            "table",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        if not produced_columns:
            return _clone_contract(base_contract)
        return base_contract.model_copy(
            update={
                "summary": (
                    "Training table split preserving the upstream table schema."
                    if port_key == "trainTable"
                    else "Test table split preserving the upstream table schema."
                ),
                "sample_columns": produced_columns,
                "produced_columns": produced_columns,
            }
        )

    if node.type in _TABULAR_PREDICT_NODE_TYPES and port_key == "table":
        upstream_columns = _bound_input_columns_for_validation(
            node,
            "table",
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
            visited=next_visited,
        )
        prediction_column = (
            str(node.params.get("predictionColumn", "") or "").strip() or "prediction"
        )
        produced_columns = _ordered_unique_tokens([*upstream_columns, prediction_column])
        if not produced_columns:
            return _clone_contract(base_contract)
        return base_contract.model_copy(
            update={
                "summary": (
                    "Prediction table preserving upstream columns and "
                    "appending the configured prediction column."
                ),
                "sample_columns": produced_columns,
                "produced_columns": produced_columns,
            }
        )

    return _clone_contract(base_contract)


def _validate_dataset_semantics_for_edge(
    edge_id: str,
    source_node: WorkflowNode,
    source_handle: str,
    source_port: WorkflowNodePort,
    source_definition: WorkflowCatalogItem,
    target_node_id: str,
    target_handle: str,
    target_port: WorkflowNodePort,
    target_definition: WorkflowCatalogItem,
    nodes_by_id: dict[str, WorkflowNode],
    definitions: dict[str, WorkflowCatalogItem],
    dataset_semantics_resolver: DatasetSemanticsResolver | None,
    dataset_semantics_cache: dict[str, WorkflowDatasetSemantics | None],
) -> WorkflowValidationIssue | None:
    target_contract = _effective_input_contract_for_validation(
        nodes_by_id[target_node_id],
        target_handle,
        target_definition,
    )
    if target_contract is None:
        return None

    effective_sources = _resolve_effective_output_sources(
        source_node=source_node,
        source_handle=source_handle,
        nodes_by_id=nodes_by_id,
        definitions=definitions,
    ) or [(source_node, source_handle, source_port, source_definition)]

    for effective_node, effective_handle, effective_port, effective_definition in effective_sources:
        source_label = f"{effective_node.id}.{effective_handle}"
        if (
            "dataset_version" in effective_port.data_types
            and "dataset_version" in target_port.data_types
            and effective_node.type == "source.dataset_version"
        ):
            dataset_version_id = str(effective_node.params.get("datasetVersionId", "")).strip()
            if not dataset_version_id or dataset_semantics_resolver is None:
                continue

            if dataset_version_id not in dataset_semantics_cache:
                dataset_semantics_cache[dataset_version_id] = dataset_semantics_resolver(
                    dataset_version_id
                )
            semantics = dataset_semantics_cache[dataset_version_id]
            if semantics is None:
                return _issue(
                    "unknown_dataset_version",
                    f"Edge {edge_id} references unknown dataset version: {dataset_version_id}",
                    node_id=target_node_id,
                    port_key=target_handle,
                    actual=dataset_version_id,
                    suggestion=(
                        "Choose a dataset version that still exists in the current workspace scope."
                    ),
                )

            reasons = _dataset_contract_mismatch_reasons(semantics, target_contract)
            if reasons:
                return _issue(
                    "dataset_semantic_mismatch",
                    f"Edge {edge_id} expects {target_contract.summary} but dataset version "
                    f"{dataset_version_id} from {source_label} is "
                    f"{_describe_dataset_semantics(semantics)}. "
                    f"Details: {'; '.join(reasons)}.",
                    node_id=target_node_id,
                    port_key=target_handle,
                    expected=target_contract.summary,
                    actual=_describe_dataset_semantics(semantics),
                    suggestion=(
                        "Select a compatible dataset version or connect this "
                        "input to a compatible upstream node."
                    ),
                )
            continue

        source_contract = _effective_output_contract_for_validation(
            effective_node,
            effective_handle,
            effective_definition,
            nodes_by_id,
            definitions,
            dataset_semantics_resolver=dataset_semantics_resolver,
            dataset_semantics_cache=dataset_semantics_cache,
        )
        if source_contract is None:
            continue

        reasons = _contract_mismatch_reasons(source_contract, target_contract)
        if reasons:
            return _issue(
                "edge_contract_mismatch",
                f"Edge {edge_id} expects {target_contract.summary} but "
                f"{source_label} produces {source_contract.summary}. "
                f"Details: {'; '.join(reasons)}.",
                node_id=target_node_id,
                port_key=target_handle,
                expected=target_contract.summary,
                actual=source_contract.summary,
                suggestion=(
                    "Replace the upstream node or insert a compatible transform before this input."
                ),
            )

    return None


def _validate_boundary_node_interface(
    node: WorkflowNode,
) -> list[str]:
    messages: list[str] = []
    if node.type == SUBGRAPH_INPUT_NODE_TYPE:
        if node.input_defs:
            messages.append("workflow.subgraph_input must not declare input ports.")
        if len(node.output_defs) != 1:
            messages.append("workflow.subgraph_input must declare exactly one output port.")
        if node.input_bindings:
            messages.append("workflow.subgraph_input must not declare upstream input bindings.")
        if any(
            contract.port_key not in {port.key for port in node.output_defs}
            for contract in node.output_contracts
        ):
            messages.append(
                "workflow.subgraph_input output contracts must match its output port key."
            )
    elif node.type == SUBGRAPH_OUTPUT_NODE_TYPE:
        if len(node.input_defs) != 1:
            messages.append("workflow.subgraph_output must declare exactly one input port.")
        if node.output_defs:
            messages.append("workflow.subgraph_output must not declare output ports.")
        input_keys = {port.key for port in node.input_defs}
        if any(contract.port_key not in input_keys for contract in node.input_contracts):
            messages.append(
                "workflow.subgraph_output input contracts must match its input port key."
            )
    return messages


def _validate_subgraph_interface(
    node: WorkflowNode,
    definition: WorkflowCatalogItem,
) -> list[WorkflowValidationIssue]:
    issues: list[WorkflowValidationIssue] = []
    if node.type not in STRUCTURAL_SUBGRAPH_NODE_TYPES:
        return issues
    if node.subgraph is None:
        issues.append(
            _issue(
                "missing_subgraph",
                f"Node {node.id} is missing a nested subgraph definition.",
                node_id=node.id,
                suggestion="Open the subgraph editor and add boundary nodes plus inner body nodes.",
            )
        )
        return issues

    derived_inputs = derive_subgraph_inputs(node.subgraph)
    derived_outputs = derive_subgraph_outputs(node.subgraph)

    input_keys = [item.port.key for item in derived_inputs]
    output_keys = [item.port.key for item in derived_outputs]
    duplicate_input_keys = [key for key, count in Counter(input_keys).items() if count > 1]
    duplicate_output_keys = [key for key, count in Counter(output_keys).items() if count > 1]
    for key in duplicate_input_keys:
        issues.append(
            _issue(
                "duplicate_subgraph_input_port",
                f"Node {node.id} subgraph declares duplicate input port key: {key}",
                node_id=node.id,
                port_key=key,
            )
        )
    for key in duplicate_output_keys:
        issues.append(
            _issue(
                "duplicate_subgraph_output_port",
                f"Node {node.id} subgraph declares duplicate output port key: {key}",
                node_id=node.id,
                port_key=key,
            )
        )

    if node.type == FOR_EACH_NODE_TYPE:
        static_input_keys = {port.key for port in definition.inputs}
        conflicting_keys = sorted(
            {
                item.port.key
                for item in derived_inputs
                if item.port.key in static_input_keys
                and item.port.key not in FOR_EACH_RESERVED_INPUT_PORT_KEYS
            }
        )
        for key in conflicting_keys:
            issues.append(
                _issue(
                    "for_each_input_key_conflict",
                    f"Node {node.id} subgraph input `{key}` conflicts with a "
                    "reserved outer input key.",
                    node_id=node.id,
                    port_key=key,
                    suggestion="Rename the nested subgraph input port to a non-conflicting key.",
                )
            )

        reserved_inputs = {
            item.port.key: item
            for item in derived_inputs
            if item.port.key in FOR_EACH_RESERVED_INPUT_PORT_KEYS
        }
        loop_item_port = reserved_inputs.get(FOR_EACH_ITEM_PORT_KEY)
        if loop_item_port is not None and loop_item_port.port.data_types != ["value"]:
            issues.append(
                _issue(
                    "for_each_item_port_type_mismatch",
                    f"Node {node.id} reserved loop input "
                    f"`{FOR_EACH_ITEM_PORT_KEY}` must use the `value` data type.",
                    node_id=node.id,
                    port_key=FOR_EACH_ITEM_PORT_KEY,
                )
            )

        loop_index_port = reserved_inputs.get(FOR_EACH_INDEX_PORT_KEY)
        if loop_index_port is not None:
            if loop_index_port.port.data_types != ["value"]:
                issues.append(
                    _issue(
                        "for_each_index_port_type_mismatch",
                        f"Node {node.id} reserved loop input "
                        f"`{FOR_EACH_INDEX_PORT_KEY}` must use the `value` data type.",
                        node_id=node.id,
                        port_key=FOR_EACH_INDEX_PORT_KEY,
                    )
                )
            loop_index_contract = loop_index_port.contract
            if loop_index_contract is not None and "number" not in loop_index_contract.value_types:
                issues.append(
                    _issue(
                        "for_each_index_contract_mismatch",
                        f"Node {node.id} reserved loop input "
                        f"`{FOR_EACH_INDEX_PORT_KEY}` should declare number semantics.",
                        node_id=node.id,
                        port_key=FOR_EACH_INDEX_PORT_KEY,
                    )
                )

    expected_inputs = effective_node_inputs(node, definition)
    expected_outputs = effective_node_outputs(node, definition)
    expected_input_contracts = effective_input_contracts(node, definition)
    expected_output_contracts = effective_output_contracts(node, definition)

    if node.input_defs and not _ports_match(node.input_defs, expected_inputs):
        issues.append(
            _issue(
                "subgraph_input_interface_out_of_sync",
                f"Node {node.id} input ports are out of sync with its nested "
                "subgraph boundary nodes.",
                node_id=node.id,
                suggestion="Resave the workflow after syncing the subgraph interface.",
            )
        )
    if node.output_defs and not _ports_match(node.output_defs, expected_outputs):
        issues.append(
            _issue(
                "subgraph_output_interface_out_of_sync",
                f"Node {node.id} output ports are out of sync with its nested "
                "subgraph boundary nodes.",
                node_id=node.id,
                suggestion="Resave the workflow after syncing the subgraph interface.",
            )
        )
    if node.input_contracts and not _contracts_match(
        node.input_contracts, expected_input_contracts
    ):
        issues.append(
            _issue(
                "subgraph_input_contracts_out_of_sync",
                f"Node {node.id} input contracts are out of sync with its nested "
                "subgraph boundary nodes.",
                node_id=node.id,
            )
        )
    if node.output_contracts and not _contracts_match(
        node.output_contracts, expected_output_contracts
    ):
        issues.append(
            _issue(
                "subgraph_output_contracts_out_of_sync",
                f"Node {node.id} output contracts are out of sync with its nested "
                "subgraph boundary nodes.",
                node_id=node.id,
            )
        )

    return issues


def _nested_issue_for_parent(
    parent_node_id: str,
    issue: WorkflowValidationIssue,
) -> WorkflowValidationIssue:
    location = issue.node_id or issue.port_key or issue.param_key or "graph"
    return _issue(
        f"subgraph_{issue.code}",
        f"Subgraph issue at {location}: {issue.message}",
        severity=issue.severity,
        node_id=parent_node_id,
        suggestion=issue.suggestion,
        expected=issue.expected,
        actual=issue.actual,
    )


def _graph_has_runtime_source(graph: WorkflowGraph) -> bool:
    for node in graph.nodes:
        if node.type.startswith("source.") or node.type.startswith("geo."):
            return True
        if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES and node.subgraph is not None:
            if _graph_has_runtime_source(node.subgraph):
                return True
    return False


def _validate_node_params(node: WorkflowNode) -> None:
    params = node.params

    if node.type == "control.list_literal":
        payload = _parse_json_value_param(params.get("itemsJson", "[]"), field_name="itemsJson")
        if not isinstance(payload, list):
            raise ValueError("itemsJson must be a JSON array.")
        return

    if node.type == "control.compare":
        operator = str(params.get("operator", "eq") or "eq").strip()
        if operator not in {"eq", "ne", "gt", "gte", "lt", "lte", "contains"}:
            raise ValueError("operator must be one of eq, ne, gt, gte, lt, lte, contains.")
        if params.get("rightValueJson") not in {None, ""}:
            _parse_json_value_param(
                params.get("rightValueJson", "true"), field_name="rightValueJson"
            )
        return

    if node.type == "geo.define_bbox_roi":
        parse_bbox_roi_params(params)
        return

    if node.type == "geo.query_raster_collection":
        parse_query_raster_collection_params(params)
        return

    if node.type == "geo.filter_scene_collection":
        parse_scene_filter_params(params)
        return

    if node.type == "geo.sort_scene_collection":
        parse_scene_sort_params(params)
        return

    if node.type == "geo.select_scene":
        parse_scene_select_params(params)
        return

    if node.type == "rgb.patchify_raster":
        parse_raster_patchify_params(params)
        return

    if node.type == "rgb.patchify_image_collection":
        parse_image_patchify_params(params)
        return

    if node.type in {
        "label.rasterize_features_to_tiles",
        "label.reproject_mask_raster_to_tiles",
        "label.crop_mask_collection_to_tiles",
    }:
        parse_label_output_params(params)
        return

    if node.type == "label.filter_by_coverage":
        parse_label_filter_by_coverage_params(params)
        return

    if node.type == "dataset.split_samples":
        parse_dataset_split_params(params)
        return

    if node.type == "table.train_test_split":
        test_size = float(params.get("testSize", 0.2) or 0.2)
        if not 0 < test_size < 1:
            raise ValueError("testSize must be between 0 and 1.")
        if params.get("randomState") not in {None, ""}:
            int(float(params.get("randomState", 42) or 42))
        return

    if node.type == "tabular.train_regression_model":
        algorithm = str(params.get("algorithm", "") or "").strip()
        if algorithm not in {
            "linear_regression",
            "svm_regression",
            "random_forest_regression",
        }:
            raise ValueError("algorithm must be a supported regression algorithm.")
        _parse_json_object_param(
            params.get("hyperparametersJson", "{}"),
            field_name="hyperparametersJson",
        )
        return

    if node.type == "tabular.predict_model":
        if params.get("runtimeParametersJson") not in {None, ""}:
            _parse_json_object_param(
                params.get("runtimeParametersJson", "{}"),
                field_name="runtimeParametersJson",
            )
        return

    if node.type in {"custom.api_predict", "custom.api_predict_samples"}:
        if params.get("callParametersJson") not in {None, ""}:
            _parse_json_object_param(
                params.get("callParametersJson", "{}"),
                field_name="callParametersJson",
            )
        return


def validate_workflow_graph(
    graph: WorkflowGraph,
    *,
    dataset_semantics_resolver: DatasetSemanticsResolver | None = None,
    _inside_subgraph: bool = False,
) -> WorkflowValidationResult:
    issues: list[WorkflowValidationIssue] = []

    node_ids = [node.id for node in graph.nodes]
    duplicates = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    for node_id in duplicates:
        issues.append(
            _issue(
                "duplicate_node_id",
                f"Duplicate node id: {node_id}",
                node_id=node_id,
                suggestion="Rename one of the duplicated nodes before saving the workflow.",
            )
        )

    definitions = _definition_map()
    supported_types = supported_node_types()
    nodes_by_id = {node.id: node for node in graph.nodes}
    dataset_semantics_cache: dict[str, WorkflowDatasetSemantics | None] = {}

    for node in graph.nodes:
        if node.type not in supported_types:
            issues.append(
                _issue(
                    "unsupported_node_type",
                    f"Unsupported node type: {node.type}",
                    node_id=node.id,
                    actual=node.type,
                )
            )
            continue

        definition = definitions[node.type]
        effective_inputs = effective_node_inputs(node, definition)
        effective_outputs = effective_node_outputs(node, definition)
        input_keys = {port.key for port in effective_inputs}
        output_keys = {port.key for port in effective_outputs}
        node_output_keys = {port.key for port in node.output_defs}

        if node.type in SUBGRAPH_BOUNDARY_NODE_TYPES and not _inside_subgraph:
            issues.append(
                _issue(
                    "subgraph_boundary_outside_subgraph",
                    f"Node {node.id} of type {node.type} is valid only inside a nested subgraph.",
                    node_id=node.id,
                )
            )

        for message in _validate_boundary_node_interface(node):
            issues.append(
                _issue(
                    "invalid_subgraph_boundary_interface",
                    f"Node {node.id} has invalid boundary interface: {message}",
                    node_id=node.id,
                )
            )

        if node.type in STRUCTURAL_SUBGRAPH_NODE_TYPES:
            issues.extend(_validate_subgraph_interface(node, definition))
            if node.subgraph is not None:
                nested_result = validate_workflow_graph(
                    node.subgraph,
                    dataset_semantics_resolver=dataset_semantics_resolver,
                    _inside_subgraph=True,
                )
                issues.extend(
                    _nested_issue_for_parent(node.id, nested_issue)
                    for nested_issue in nested_result.issues
                )

        for param in definition.params:
            if param.required and _missing_required_param(node.params.get(param.key)):
                issues.append(
                    _issue(
                        "missing_required_param",
                        f"Node {node.id} is missing required parameter: {param.key}",
                        node_id=node.id,
                        param_key=param.key,
                        expected=param.label,
                        suggestion=(
                            "Fill in the required parameter before validating "
                            "or running the workflow."
                        ),
                    )
                )

        try:
            _validate_node_params(node)
        except ValueError as exc:
            issues.append(
                _issue(
                    "invalid_node_params",
                    f"Node {node.id} has invalid parameters: {exc}",
                    node_id=node.id,
                    suggestion="Review the node parameter values and correct the invalid field.",
                )
            )

        for target_handle, binding in node.input_bindings.items():
            if target_handle not in input_keys:
                issues.append(
                    _issue(
                        "unknown_input_port",
                        f"Node {node.id} references unknown input port: {target_handle}",
                        node_id=node.id,
                        port_key=target_handle,
                    )
                )
                continue
            if _split_binding(binding) is None:
                issues.append(
                    _issue(
                        "invalid_input_binding",
                        f"Node {node.id} has invalid input binding format: {binding}",
                        node_id=node.id,
                        port_key=target_handle,
                        actual=binding,
                    )
                )

        for port in effective_inputs:
            if port.required and port.key not in node.input_bindings:
                issues.append(
                    _issue(
                        "missing_required_input_binding",
                        f"Node {node.id} is missing required input binding: {port.key}",
                        node_id=node.id,
                        port_key=port.key,
                        expected=port.label,
                        suggestion=(
                            "Connect a compatible upstream output to this required input port."
                        ),
                    )
                )

        if (
            node.type
            not in {
                CALL_SUBGRAPH_NODE_TYPE,
                FOR_EACH_NODE_TYPE,
                SUBGRAPH_INPUT_NODE_TYPE,
                SUBGRAPH_OUTPUT_NODE_TYPE,
            }
            and node.output_defs
            and output_keys != node_output_keys
        ):
            issues.append(
                _issue(
                    "output_definition_mismatch",
                    f"Node {node.id} output definitions do not match the catalog definition.",
                    node_id=node.id,
                    suggestion=(
                        "Reload the node from the catalog or recreate it to "
                        "restore the expected output ports."
                    ),
                )
            )
        if (
            node.type
            not in {
                CALL_SUBGRAPH_NODE_TYPE,
                FOR_EACH_NODE_TYPE,
                SUBGRAPH_INPUT_NODE_TYPE,
                SUBGRAPH_OUTPUT_NODE_TYPE,
            }
            and node.input_defs
            and not _ports_match(node.input_defs, definition.inputs)
        ):
            issues.append(
                _issue(
                    "input_definition_mismatch",
                    f"Node {node.id} input definitions do not match the catalog definition.",
                    node_id=node.id,
                )
            )

    indegree: dict[str, int] = defaultdict(int)
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in graph.edges:
        if edge.source not in nodes_by_id:
            issues.append(
                _issue(
                    "unknown_edge_source",
                    f"Edge {edge.id} references unknown source: {edge.source}",
                    actual=edge.source,
                )
            )
            continue
        if edge.target not in nodes_by_id:
            issues.append(
                _issue(
                    "unknown_edge_target",
                    f"Edge {edge.id} references unknown target: {edge.target}",
                    actual=edge.target,
                )
            )
            continue

        target_node = nodes_by_id[edge.target]
        target_definition = definitions.get(target_node.type)
        source_definition = definitions.get(nodes_by_id[edge.source].type)
        if target_definition is None or source_definition is None:
            continue

        source_handle, target_handle = _resolve_edge_handles(edge, target_node)
        if not source_handle or not target_handle:
            issues.append(
                _issue(
                    "missing_edge_handles",
                    f"Edge {edge.id} must declare compatible source and target handles.",
                    node_id=target_node.id,
                )
            )
            continue

        target_port = _find_input_port(target_node, target_definition, target_handle)
        if target_port is None:
            issues.append(
                _issue(
                    "unknown_target_handle",
                    f"Edge {edge.id} references unknown target handle: {target_handle}",
                    node_id=target_node.id,
                    port_key=target_handle,
                )
            )
            continue

        source_node = nodes_by_id[edge.source]
        source_port = _find_output_port(source_node, source_definition, source_handle)
        if source_port is None:
            issues.append(
                _issue(
                    "unknown_source_handle",
                    f"Edge {edge.id} references unknown source handle: {source_handle}",
                    node_id=source_node.id,
                    port_key=source_handle,
                )
            )
            continue

        binding = target_node.input_bindings.get(target_handle)
        expected_binding = f"{edge.source}:{source_handle}"
        if binding != expected_binding:
            issues.append(
                _issue(
                    "edge_binding_mismatch",
                    "Edge "
                    f"{edge.id} is inconsistent with input binding {target_handle} "
                    f"on node {target_node.id}.",
                    node_id=target_node.id,
                    port_key=target_handle,
                    expected=expected_binding,
                    actual=binding,
                )
            )
            continue

        if not set(source_port.data_types).intersection(target_port.data_types):
            issues.append(
                _issue(
                    "incompatible_edge_data_types",
                    f"Edge {edge.id} connects incompatible data types: "
                    f"{source_node.id}.{source_handle} -> {target_node.id}.{target_handle}",
                    node_id=target_node.id,
                    port_key=target_handle,
                    expected=", ".join(target_port.data_types),
                    actual=", ".join(source_port.data_types),
                    suggestion=(
                        "Connect a compatible output port or insert a transform "
                        "node between these steps."
                    ),
                )
            )
            continue

        semantic_error = _validate_dataset_semantics_for_edge(
            edge.id,
            source_node,
            source_handle,
            source_port,
            source_definition,
            target_node.id,
            target_handle,
            target_port,
            target_definition,
            nodes_by_id,
            definitions,
            dataset_semantics_resolver,
            dataset_semantics_cache,
        )
        if semantic_error is not None:
            issues.append(semantic_error)
            continue

        adjacency[edge.source].append(edge.target)
        indegree[edge.target] += 1
        indegree.setdefault(edge.source, 0)

    if any(issue.severity == "error" for issue in issues):
        return _result_from_issues(issues)

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
        issues.append(
            _issue(
                "workflow_cycle_detected",
                "Workflow graph must be acyclic.",
            )
        )

    if graph.nodes and not _inside_subgraph and not _graph_has_runtime_source(graph):
        issues.append(
            _issue(
                "missing_source_runtime",
                "No source runtime node is defined.",
                severity="warning",
                suggestion=(
                    "Add a dataset, model, ROI, or remote source node before running the workflow."
                ),
            )
        )

    return _result_from_issues(issues)
