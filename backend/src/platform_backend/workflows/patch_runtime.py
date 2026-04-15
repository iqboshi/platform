from __future__ import annotations

import json
import re
import struct
import zipfile
from collections import deque
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from platform_backend.domain_enums import DatasetKind
from platform_backend.models.entities import ModelVersion
from platform_backend.workflows.catalog import catalog_definition
from platform_backend.workflows.subgraph_runtime import (
    CALL_SUBGRAPH_NODE_TYPE,
    FOR_EACH_INDEX_PORT_KEY,
    FOR_EACH_ITEM_PORT_KEY,
    FOR_EACH_NODE_TYPE,
    FOR_EACH_RESERVED_INPUT_PORT_KEYS,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
)

ASSET_NODE_TYPES = {
    "source.dataset_version",
    "source.model_version",
    "geo.define_bbox_roi",
    "geo.load_saved_roi",
    "geo.query_raster_collection",
    "geo.filter_scene_collection",
    "geo.sort_scene_collection",
    "geo.select_scene",
    "geo.fetch_scene_as_dataset",
    "raster.load_georaster",
    "raster.load_mask_raster",
    "image.load_image_collection",
    "vector.load_features",
    "mask.load_mask_collection",
    "geo.clip_raster_by_roi",
    "geo.reproject_raster",
    "geo.merge_rasters",
    "geo.sample_raster_metadata",
    "rgb.patchify_raster",
    "rgb.patchify_image_collection",
    "label.rasterize_features_to_tiles",
    "label.reproject_mask_raster_to_tiles",
    "label.crop_mask_collection_to_tiles",
    "label.filter_by_coverage",
    "annotation.project_features_to_tile_classes",
    "annotation.project_features_to_tile_bboxes",
    "annotation.project_features_to_tile_polygons",
    "dataset.build_samples",
    "dataset.split_samples",
    "dataset.build_manifest",
    "artifact.package_dataset_bundle",
    "export.artifact_to_dataset_version",
    "custom.api_train_samples",
    "custom.api_predict_samples",
    "export.prediction_set_to_dataset_version",
    "control.boolean_literal",
    "control.list_literal",
    "control.compare",
    "control.not",
    "control.guard",
    "control.coalesce",
    FOR_EACH_NODE_TYPE,
    CALL_SUBGRAPH_NODE_TYPE,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
}
PATCH_ENTRY_NODE_TYPES = {
    node_type
    for node_type in ASSET_NODE_TYPES
    if node_type not in {"source.dataset_version", "source.model_version"}
}
SUPPORTED_PATCH_NODE_TYPES = set(ASSET_NODE_TYPES)

CreatePrivateDatasetVersionFn = Callable[..., Any]
CreateCustomApiModelVersionFn = Callable[..., Any]
ResolveGeeCredentialFn = Callable[[str, str | None], Any]


@dataclass(slots=True)
class PatchifyParams:
    tile_width: int
    tile_height: int
    stride_x: int
    stride_y: int
    edge_policy: str
    image_format: str


@dataclass(slots=True)
class CoverageFilterParams:
    skip_empty_label: bool
    min_label_coverage: float


@dataclass(slots=True)
class SceneSelectionParams:
    selection_mode: str
    index: int


@dataclass(slots=True)
class QueryCollectionParams:
    provider: str
    collection: str
    start_date: date
    end_date: date
    bands: tuple[str, ...]
    scale: int
    limit: int
    credential_mode: str
    personal_credential_id: str | None


@dataclass(slots=True)
class SampleSplitParams:
    strategy: str
    train_ratio: float
    val_ratio: float
    test_ratio: float
    random_seed: int


@dataclass(slots=True)
class DatasetArtifact:
    dataset_version_id: str | None
    dataset_name: str | None
    dataset_kind: str | None
    path: str | None = None


@dataclass(slots=True)
class ModelVersionArtifact:
    model_version_id: str
    model_id: str | None
    model_name: str | None
    version: str | None
    framework: str | None
    task_type: str | None
    source_type: str | None
    execution_mode: str | None


@dataclass(slots=True)
class AssetExecutionState:
    resolved_outputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    saved_dataset_version_ids: list[str] = field(default_factory=list)
    saved_model_version_ids: list[str] = field(default_factory=list)
    result_dataset_version_id: str | None = None
    result_model_version_id: str | None = None
    artifact_path: str | None = None
    latest_metrics: dict[str, Any] = field(default_factory=dict)
    subgraph_inputs: dict[str, Any] = field(default_factory=dict)
    storage_root: Path | None = None
    db: Any = None
    current_user: Any = None
    workspace_id: str | None = None
    run_id: str | None = None
    create_private_dataset_version: CreatePrivateDatasetVersionFn | None = None
    create_custom_api_model_version: CreateCustomApiModelVersionFn | None = None


def _skipped_value(reason: str) -> dict[str, Any]:
    return {"kind": "skipped", "reason": reason}


def _is_skipped_value(value: Any) -> bool:
    return isinstance(value, dict) and str(value.get("kind", "")).strip() == "skipped"


def _parse_json_value(value: object, *, field_name: str) -> Any:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc


def _infer_value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float) and not isinstance(value, bool):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "json"


def _wrap_control_value(value: Any, *, value_type: str | None = None) -> dict[str, Any]:
    return {
        "kind": "value",
        "value": value,
        "valueType": value_type or _infer_value_type(value),
        "summary": str(value),
    }


def _unwrap_control_value(value: Any) -> Any:
    if isinstance(value, dict):
        kind = str(value.get("kind", "")).strip()
        if kind == "value":
            return value.get("value")
        if kind == "value_list":
            return value.get("items", [])
    return value


def _require_boolean_control_value(value: Any, *, field_name: str) -> bool:
    raw = _unwrap_control_value(value)
    if not isinstance(raw, bool):
        raise ValueError(f"{field_name} must resolve to a boolean value.")
    return raw


def _resolve_optional_input_value(
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
    key: str,
) -> Any | None:
    binding = str(bindings.get(key, "")).strip()
    if not binding:
        return None
    value = _resolve_input_value(resolved_outputs, bindings, key)
    if _is_skipped_value(value):
        return None
    return value


def _required_input_skip_reason(
    node_type: str,
    node: dict[str, Any],
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
) -> str | None:
    if node_type == "control.coalesce":
        return None
    for port in _node_input_defs(node):
        if not bool(port.get("required", False)):
            continue
        port_key = str(port.get("key", "")).strip()
        binding = str(bindings.get(port_key, "")).strip()
        if not binding:
            continue
        value = _resolve_input_value(resolved_outputs, bindings, port_key)
        if _is_skipped_value(value):
            return f"{node_type} skipped because upstream branch `{port_key}` is inactive."
    return None


def _skip_outputs_for_node(node: dict[str, Any], reason: str) -> dict[str, Any]:
    return {
        str(port.get("key", "")).strip(): _skipped_value(reason)
        for port in _node_output_defs(node)
        if str(port.get("key", "")).strip()
    }


def supports_asset_node(node_type: str) -> bool:
    return node_type in ASSET_NODE_TYPES


def supports_patch_node(node_type: str) -> bool:
    return supports_asset_node(node_type)


def is_supported_asset_graph(graph_json: dict[str, object]) -> bool:
    node_types = _collect_graph_node_types(graph_json)
    if not node_types:
        return False
    return bool(node_types.intersection(PATCH_ENTRY_NODE_TYPES)) and node_types.issubset(
        ASSET_NODE_TYPES
    )


def is_supported_patch_graph(graph_json: dict[str, object]) -> bool:
    return is_supported_asset_graph(graph_json)


def _collect_graph_node_types(graph_json: dict[str, object]) -> set[str]:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        return set()

    node_types: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        node_type = str(node.get("type", "")).strip()
        if node_type:
            node_types.add(node_type)
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            node_types.update(_collect_graph_node_types(subgraph))
    return node_types


def _node_input_defs(node: dict[str, Any]) -> list[dict[str, Any]]:
    node_type = str(node.get("type", "")).strip()
    if node_type == CALL_SUBGRAPH_NODE_TYPE:
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            return _subgraph_interface_ports(subgraph, SUBGRAPH_INPUT_NODE_TYPE, "output_defs")
    if node_type == FOR_EACH_NODE_TYPE:
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            base_inputs = [
                port.model_dump(mode="json")
                for port in catalog_definition(FOR_EACH_NODE_TYPE).inputs
            ]
            base_input_keys = {str(port.get("key", "")).strip() for port in base_inputs}
            dynamic_inputs = [
                dict(port)
                for port in _subgraph_interface_ports(
                    subgraph, SUBGRAPH_INPUT_NODE_TYPE, "output_defs"
                )
                if str(port.get("key", "")).strip() not in FOR_EACH_RESERVED_INPUT_PORT_KEYS
                and str(port.get("key", "")).strip() not in base_input_keys
            ]
            return [*base_inputs, *dynamic_inputs]
    input_defs = node.get("input_defs", [])
    if isinstance(input_defs, list) and input_defs:
        return [port for port in input_defs if isinstance(port, dict)]
    return [
        port.model_dump(mode="json")
        for port in catalog_definition(str(node.get("type", "")).strip()).inputs
    ]


def _node_output_defs(node: dict[str, Any]) -> list[dict[str, Any]]:
    node_type = str(node.get("type", "")).strip()
    if node_type == CALL_SUBGRAPH_NODE_TYPE:
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            return _subgraph_interface_ports(subgraph, SUBGRAPH_OUTPUT_NODE_TYPE, "input_defs")
    if node_type == FOR_EACH_NODE_TYPE:
        subgraph = node.get("subgraph")
        if isinstance(subgraph, dict):
            aggregated_outputs: list[dict[str, Any]] = []
            for port in _subgraph_interface_ports(
                subgraph, SUBGRAPH_OUTPUT_NODE_TYPE, "input_defs"
            ):
                cloned = dict(port)
                cloned["data_types"] = ["value_list"]
                aggregated_outputs.append(cloned)
            return aggregated_outputs
    output_defs = node.get("output_defs", [])
    if isinstance(output_defs, list) and output_defs:
        return [port for port in output_defs if isinstance(port, dict)]
    return [
        port.model_dump(mode="json")
        for port in catalog_definition(str(node.get("type", "")).strip()).outputs
    ]


def _subgraph_interface_ports(
    graph_json: dict[str, Any],
    boundary_type: str,
    port_field: str,
) -> list[dict[str, Any]]:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list):
        return []

    boundary_nodes = sorted(
        [
            node
            for node in nodes
            if isinstance(node, dict) and str(node.get("type", "")).strip() == boundary_type
        ],
        key=lambda node: (
            float(node.get("position", {}).get("y", 0.0)),
            float(node.get("position", {}).get("x", 0.0)),
            str(node.get("id", "")),
        ),
    )
    ports: list[dict[str, Any]] = []
    for boundary_node in boundary_nodes:
        raw_ports = boundary_node.get(port_field, [])
        if not isinstance(raw_ports, list):
            continue
        ports.extend(port for port in raw_ports if isinstance(port, dict))
    return ports


def _coerce_positive_int(value: object, *, field_name: str) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a positive integer.") from exc
    if number <= 0:
        raise ValueError(f"{field_name} must be a positive integer.")
    return number


def _coerce_non_negative_int(value: object, *, field_name: str) -> int:
    try:
        number = int(float(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a non-negative integer.") from exc
    if number < 0:
        raise ValueError(f"{field_name} must be a non-negative integer.")
    return number


def _coerce_ratio(value: object, *, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number between 0 and 1.") from exc
    if not 0 <= number <= 1:
        raise ValueError(f"{field_name} must be a number between 0 and 1.")
    return number


def _parse_iso_date(value: object, *, field_name: str) -> date:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    try:
        return date.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"{field_name} must use YYYY-MM-DD format.") from exc


def _parse_bbox(value: object) -> tuple[float, float, float, float]:
    if isinstance(value, (list, tuple)) and len(value) == 4:
        parts = [float(item) for item in value]
    elif isinstance(value, str):
        tokens = [item for item in re.split(r"[\s,]+", value.strip()) if item]
        if len(tokens) != 4:
            raise ValueError("bbox must contain four comma-separated coordinates.")
        parts = [float(item) for item in tokens]
    else:
        raise ValueError("bbox must be a string or four-value array.")

    min_x, min_y, max_x, max_y = parts
    if not (-180 <= min_x < max_x <= 180):
        raise ValueError("bbox longitude must satisfy -180 <= minX < maxX <= 180.")
    if not (-90 <= min_y < max_y <= 90):
        raise ValueError("bbox latitude must satisfy -90 <= minY < maxY <= 90.")
    return min_x, min_y, max_x, max_y


def _parse_json_array(value: object, *, field_name: str) -> list[Any]:
    try:
        payload = json.loads(str(value or "[]"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc
    if not isinstance(payload, list):
        raise ValueError(f"{field_name} must be a JSON array.")
    return payload


def _normalize_bands(value: object) -> tuple[str, ...]:
    if isinstance(value, list):
        bands = [str(item).strip().upper() for item in value if str(item).strip()]
    else:
        bands = [item.strip().upper() for item in str(value or "").split(",") if item.strip()]
    if not bands:
        return ("B4", "B3", "B2")
    return tuple(dict.fromkeys(bands))


def parse_bbox_roi_params(params: dict[str, object]) -> tuple[float, float, float, float]:
    return _parse_bbox(params.get("bbox"))


def parse_query_raster_collection_params(
    params: dict[str, object],
) -> QueryCollectionParams:
    provider = str(params.get("provider", "gee") or "gee").strip()
    if provider != "gee":
        raise ValueError("provider currently supports only gee.")
    collection = str(params.get("collection", "sentinel2_l2a") or "sentinel2_l2a").strip()
    if collection != "sentinel2_l2a":
        raise ValueError("collection currently supports only sentinel2_l2a.")

    start_date = _parse_iso_date(params.get("startDate"), field_name="startDate")
    end_date = _parse_iso_date(params.get("endDate"), field_name="endDate")
    if end_date < start_date:
        raise ValueError("endDate must be on or after startDate.")

    credential_mode = str(
        params.get("credentialMode", "platform_default") or "platform_default"
    ).strip()
    if credential_mode not in {"platform_default", "personal"}:
        raise ValueError("credentialMode must be platform_default or personal.")
    personal_credential_id = str(params.get("personalCredentialId", "")).strip() or None
    if credential_mode == "personal" and personal_credential_id is None:
        raise ValueError("personalCredentialId is required when credentialMode is personal.")

    return QueryCollectionParams(
        provider=provider,
        collection=collection,
        start_date=start_date,
        end_date=end_date,
        bands=_normalize_bands(params.get("bands")),
        scale=_coerce_positive_int(params.get("scale", 10), field_name="scale"),
        limit=_coerce_positive_int(params.get("limit", 50), field_name="limit"),
        credential_mode=credential_mode,
        personal_credential_id=personal_credential_id,
    )


def parse_scene_filter_params(params: dict[str, object]) -> list[dict[str, Any]]:
    rules = _parse_json_array(params.get("filtersJson", "[]"), field_name="filtersJson")
    allowed_ops = {"==", "!=", "<", "<=", ">", ">=", "in", "contains", "eq", "ne"}
    normalized: list[dict[str, Any]] = []
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            raise ValueError(f"filtersJson item {index} must be a JSON object.")
        field_name = str(rule.get("field", "")).strip()
        op = str(rule.get("op", "")).strip()
        if not field_name:
            raise ValueError(f"filtersJson item {index} is missing field.")
        if op not in allowed_ops:
            raise ValueError(f"filtersJson item {index} uses unsupported op: {op}")
        normalized.append({"field": field_name, "op": op, "value": rule.get("value")})
    return normalized


def parse_scene_sort_params(params: dict[str, object]) -> tuple[str, str]:
    field_name = str(params.get("field", "") or "").strip()
    if not field_name:
        raise ValueError("field is required.")
    order = str(params.get("order", "asc") or "asc").strip()
    if order not in {"asc", "desc"}:
        raise ValueError("order must be asc or desc.")
    return field_name, order


def parse_scene_select_params(params: dict[str, object]) -> SceneSelectionParams:
    selection_mode = str(params.get("selectionMode", "first") or "first").strip()
    if selection_mode not in {"first", "last", "index"}:
        raise ValueError("selectionMode must be first, last, or index.")
    return SceneSelectionParams(
        selection_mode=selection_mode,
        index=_coerce_non_negative_int(params.get("index", 0), field_name="index"),
    )


def parse_patchify_params(params: dict[str, object]) -> PatchifyParams:
    edge_policy = str(params.get("edgePolicy", "skip") or "skip").strip()
    if edge_policy not in {"skip", "pad"}:
        raise ValueError("edgePolicy must be skip or pad.")
    image_format = str(params.get("outputImageFormat", "png") or "png").strip().lower()
    if image_format == "jpeg":
        image_format = "jpg"
    if image_format not in {"png", "jpg"}:
        raise ValueError("outputImageFormat must be png or jpg.")
    return PatchifyParams(
        tile_width=_coerce_positive_int(params.get("tileWidth", 256), field_name="tileWidth"),
        tile_height=_coerce_positive_int(params.get("tileHeight", 256), field_name="tileHeight"),
        stride_x=_coerce_positive_int(params.get("strideX", 256), field_name="strideX"),
        stride_y=_coerce_positive_int(params.get("strideY", 256), field_name="strideY"),
        edge_policy=edge_policy,
        image_format=image_format,
    )


def parse_raster_patchify_params(params: dict[str, object]) -> PatchifyParams:
    return parse_patchify_params(params)


def parse_image_patchify_params(params: dict[str, object]) -> PatchifyParams:
    return parse_patchify_params(params)


def parse_label_output_params(params: dict[str, object]) -> str:
    output_mask_format = str(params.get("outputMaskFormat", "png") or "png").strip().lower()
    if output_mask_format != "png":
        raise ValueError("outputMaskFormat currently supports only png.")
    return output_mask_format


def parse_label_filter_by_coverage_params(
    params: dict[str, object],
) -> CoverageFilterParams:
    return CoverageFilterParams(
        skip_empty_label=bool(params.get("skipEmptyLabel", False)),
        min_label_coverage=_coerce_ratio(
            params.get("minLabelCoverage", 0),
            field_name="minLabelCoverage",
        ),
    )


def parse_dataset_split_params(params: dict[str, object]) -> SampleSplitParams:
    strategy = str(params.get("strategy", "random") or "random").strip()
    if strategy != "random":
        raise ValueError("strategy currently supports only random.")
    train_ratio = _coerce_ratio(params.get("trainRatio", 0.8), field_name="trainRatio")
    val_ratio = _coerce_ratio(params.get("valRatio", 0.1), field_name="valRatio")
    test_ratio = _coerce_ratio(params.get("testRatio", 0.1), field_name="testRatio")
    total = train_ratio + val_ratio + test_ratio
    if abs(total - 1.0) > 1e-6:
        raise ValueError("trainRatio + valRatio + testRatio must equal 1.")
    return SampleSplitParams(
        strategy=strategy,
        train_ratio=train_ratio,
        val_ratio=val_ratio,
        test_ratio=test_ratio,
        random_seed=int(float(params.get("randomSeed", 42) or 42)),
    )


def parse_rgb_patchify_params(params: dict[str, object]) -> PatchifyParams:
    return parse_patchify_params(params)


def parse_label_patch_align_params(params: dict[str, object]) -> CoverageFilterParams:
    return parse_label_filter_by_coverage_params(params)


def parse_export_training_patch_dataset_params(
    params: dict[str, object],
) -> SampleSplitParams:
    legacy_params = {
        "strategy": str(params.get("splitStrategy", "random") or "random").replace(
            "none", "random"
        ),
        "trainRatio": params.get("trainRatio", 0.8),
        "valRatio": params.get("valRatio", 0.1),
        "testRatio": params.get("testRatio", 0.1),
        "randomSeed": params.get("randomSeed", 42),
    }
    return parse_dataset_split_params(legacy_params)


def _topological_node_order(
    nodes: list[dict[str, Any]],
    *,
    include_node_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    nodes_by_id = {
        str(node.get("id", "")): node
        for node in nodes
        if isinstance(node, dict)
        and (include_node_ids is None or str(node.get("id", "")) in include_node_ids)
    }
    indegree = {node_id: 0 for node_id in nodes_by_id}
    adjacency = {node_id: [] for node_id in nodes_by_id}

    for node_id, node in nodes_by_id.items():
        bindings = node.get("input_bindings", {})
        if not isinstance(bindings, dict):
            continue
        for binding in bindings.values():
            if not isinstance(binding, str):
                continue
            source_node_id, _, _ = binding.partition(":")
            if source_node_id in nodes_by_id:
                adjacency[source_node_id].append(node_id)
                indegree[node_id] += 1

    queue = deque([node_id for node_id, degree in indegree.items() if degree == 0])
    ordered: list[dict[str, Any]] = []
    while queue:
        node_id = queue.popleft()
        ordered.append(nodes_by_id[node_id])
        for neighbor in adjacency[node_id]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if len(ordered) != len(nodes_by_id):
        raise ValueError("Workflow graph must be acyclic for asset execution.")
    return ordered


def _collect_required_node_ids(nodes: list[dict[str, Any]], target_node_id: str) -> set[str]:
    nodes_by_id = {str(node.get("id", "")): node for node in nodes if isinstance(node, dict)}
    if target_node_id not in nodes_by_id:
        raise LookupError(f"Workflow node was not found: {target_node_id}")

    required_node_ids: set[str] = set()
    queue = deque([target_node_id])
    while queue:
        node_id = queue.popleft()
        if node_id in required_node_ids:
            continue
        required_node_ids.add(node_id)
        bindings = nodes_by_id[node_id].get("input_bindings", {})
        if not isinstance(bindings, dict):
            raise ValueError(f"Node {node_id} has invalid input bindings.")
        for binding in bindings.values():
            if not isinstance(binding, str):
                continue
            source_node_id, _, _ = binding.partition(":")
            if source_node_id and source_node_id in nodes_by_id:
                queue.append(source_node_id)
    return required_node_ids


def _resolve_input_value(
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
    key: str,
) -> Any:
    binding = str(bindings.get(key, "")).strip()
    if not binding:
        raise ValueError(f"Missing required input binding: {key}")
    source_node_id, _, source_handle = binding.partition(":")
    source_outputs = resolved_outputs.get(source_node_id)
    if source_outputs is None:
        raise ValueError(f"Input binding for {key} references unknown node: {source_node_id}")
    if source_handle not in source_outputs:
        raise ValueError(f"Input binding for {key} references unknown output '{source_handle}'.")
    return source_outputs[source_handle]


def _normalize_string_list(value: object) -> list[str]:
    if isinstance(value, str):
        items: list[object] = [value]
    elif isinstance(value, (list, tuple, set, frozenset)):
        items = list(value)
    else:
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in items:
        token = str(item).strip()
        if not token or token in seen:
            continue
        seen.add(token)
        normalized.append(token)
    return normalized


def _sample_count_from_value(value: object) -> int | None:
    if not isinstance(value, dict):
        return None
    for key in ("sampleCount", "sample_count", "count"):
        raw = value.get(key)
        if raw in {None, ""}:
            continue
        try:
            number = int(raw)
        except (TypeError, ValueError):
            continue
        if number >= 0:
            return number
    return None


def _sample_kinds_from_value(value: object) -> list[str]:
    if not isinstance(value, dict):
        return []
    sample_kinds = _normalize_string_list(value.get("sampleKinds"))
    if sample_kinds:
        return sample_kinds
    return _normalize_string_list(value.get("sample_kinds"))


def _task_types_from_value(value: object) -> list[str]:
    if not isinstance(value, dict):
        return []
    task_types = _normalize_string_list(value.get("taskTypes"))
    if task_types:
        return task_types
    task_type = str(value.get("taskType", "")).strip()
    return [task_type] if task_type else []


def _annotation_kinds_from_value(value: object) -> list[str]:
    if not isinstance(value, dict):
        return []
    annotation_kinds = _normalize_string_list(value.get("annotationKinds"))
    if annotation_kinds:
        return annotation_kinds
    return _normalize_string_list(value.get("annotation_kinds"))


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


def _artifact_output_root(state: AssetExecutionState) -> Path:
    root = state.storage_root or (Path.cwd() / "tmp")
    run_id = state.run_id or f"preview-{uuid4().hex}"
    output_root = root / "workflow-artifacts" / run_id
    output_root.mkdir(parents=True, exist_ok=True)
    return output_root


def _write_json_artifact(
    state: AssetExecutionState,
    *,
    node_id: str,
    file_name: str,
    payload: dict[str, Any],
) -> str:
    node_root = _artifact_output_root(state) / node_id
    node_root.mkdir(parents=True, exist_ok=True)
    target_path = node_root / file_name
    target_path.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )
    return str(target_path)


def _write_zip_artifact(
    state: AssetExecutionState,
    *,
    node_id: str,
    file_name: str,
    files: dict[str, str],
) -> str:
    node_root = _artifact_output_root(state) / node_id
    node_root.mkdir(parents=True, exist_ok=True)
    target_path = node_root / file_name
    with zipfile.ZipFile(target_path, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for archive_name, content in files.items():
            archive.writestr(archive_name, content)
    return str(target_path)


def _write_bytes_artifact(
    state: AssetExecutionState,
    *,
    node_id: str,
    file_name: str,
    payload: bytes,
) -> str:
    node_root = _artifact_output_root(state) / node_id
    node_root.mkdir(parents=True, exist_ok=True)
    target_path = node_root / file_name
    target_path.write_bytes(payload)
    return str(target_path)


def _synthetic_single_pixel_tiff_bytes() -> bytes:
    entry_count = 8
    ifd_offset = 8
    data_offset = ifd_offset + 2 + entry_count * 12 + 4
    entries = [
        (256, 4, 1, 1),  # ImageWidth
        (257, 4, 1, 1),  # ImageLength
        (258, 3, 1, 8),  # BitsPerSample
        (259, 3, 1, 1),  # Compression = none
        (262, 3, 1, 1),  # PhotometricInterpretation = BlackIsZero
        (273, 4, 1, data_offset),  # StripOffsets
        (278, 4, 1, 1),  # RowsPerStrip
        (279, 4, 1, 1),  # StripByteCounts
    ]
    payload = bytearray()
    payload.extend(b"II")
    payload.extend(struct.pack("<H", 42))
    payload.extend(struct.pack("<I", ifd_offset))
    payload.extend(struct.pack("<H", entry_count))
    for tag, value_type, count, value in entries:
        payload.extend(struct.pack("<HHII", tag, value_type, count, value))
    payload.extend(struct.pack("<I", 0))
    payload.extend(b"\x00")
    return bytes(payload)


def _guess_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    return {
        ".json": "application/json",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".tif": "image/tiff",
        ".tiff": "image/tiff",
        ".zip": "application/zip",
    }.get(suffix, "application/octet-stream")


def _model_artifact_from_version(model_version: ModelVersion) -> ModelVersionArtifact:
    metadata = model_version.metadata_json if isinstance(model_version.metadata_json, dict) else {}
    model = getattr(model_version, "model", None)
    return ModelVersionArtifact(
        model_version_id=model_version.id,
        model_id=model_version.model_id,
        model_name=getattr(model, "name", None),
        version=model_version.version,
        framework=model_version.framework,
        task_type=model_version.task_type,
        source_type=str(metadata.get("source_type", "")).strip() or None,
        execution_mode=str(metadata.get("execution_mode", "")).strip() or None,
    )


def _load_model_version_artifact(
    *,
    state: AssetExecutionState,
    model_version_id: str,
    node_type: str,
) -> ModelVersionArtifact:
    if not model_version_id:
        raise ValueError(f"{node_type} requires modelVersionId.")
    if state.db is None:
        return ModelVersionArtifact(
            model_version_id=model_version_id,
            model_id=None,
            model_name=None,
            version=None,
            framework=None,
            task_type=None,
            source_type=None,
            execution_mode=None,
        )
    model_version = state.db.get(ModelVersion, model_version_id)
    if model_version is None:
        raise LookupError(f"Model version not found: {model_version_id}")
    return _model_artifact_from_version(model_version)


def _resolve_model_version_artifact(
    *,
    state: AssetExecutionState,
    bindings: dict[str, str],
    params: dict[str, Any],
    node_type: str,
    require_custom_api: bool = False,
) -> ModelVersionArtifact:
    artifact: ModelVersionArtifact
    if str(bindings.get("model", "")).strip():
        candidate = _resolve_optional_input_value(state.resolved_outputs, bindings, "model")
        if candidate is not None and not isinstance(candidate, ModelVersionArtifact):
            raise ValueError(f"{node_type} requires a model_version input.")
        if isinstance(candidate, ModelVersionArtifact):
            artifact = candidate
        else:
            artifact = _load_model_version_artifact(
                state=state,
                model_version_id=str(params.get("modelVersionId", "")).strip(),
                node_type=node_type,
            )
    else:
        artifact = _load_model_version_artifact(
            state=state,
            model_version_id=str(params.get("modelVersionId", "")).strip(),
            node_type=node_type,
        )

    if require_custom_api and artifact.source_type not in {None, "custom_api"}:
        raise ValueError(f"{node_type} requires a custom_api model version.")
    return artifact


def _persist_dataset_artifact(
    *,
    state: AssetExecutionState,
    source_path: Path,
    dataset_name: str,
    metadata: dict[str, object] | None = None,
    kind: DatasetKind = DatasetKind.ARTIFACT,
) -> DatasetArtifact:
    if (
        state.create_private_dataset_version is not None
        and state.db is not None
        and state.current_user is not None
        and state.workspace_id
        and state.run_id
    ):
        summary = state.create_private_dataset_version(
            db=state.db,
            workspace_id=state.workspace_id,
            current_user=state.current_user,
            run_id=state.run_id,
            dataset_name=dataset_name,
            kind=kind,
            source_path=source_path,
            content_type=_guess_content_type(source_path),
            metadata=metadata,
        )
        dataset_version_id = str(getattr(summary, "id", "") or "").strip()
        if dataset_version_id:
            state.saved_dataset_version_ids.append(dataset_version_id)
            state.result_dataset_version_id = dataset_version_id
        state.artifact_path = str(source_path)
        return DatasetArtifact(
            dataset_version_id=dataset_version_id or None,
            dataset_name=dataset_name,
            dataset_kind=kind.value,
            path=str(source_path),
        )

    return DatasetArtifact(
        dataset_version_id=None,
        dataset_name=dataset_name,
        dataset_kind=kind.value,
        path=str(source_path),
    )


def _persist_custom_api_model_version(
    *,
    state: AssetExecutionState,
    model_name: str,
    version: str,
    task_type: str,
    prediction_endpoint_url: str,
    training_endpoint_url: str | None,
    auth_type: str,
    auth_token: str,
    auth_header_name: str,
    response_mode: str,
    timeout_seconds: int,
    default_prediction_column: str,
    default_parameters: dict[str, Any],
    training_artifact_path: Path,
) -> ModelVersionArtifact:
    fallback_model_version_id = f"preview-custom-api-{uuid4().hex}"
    if (
        state.create_custom_api_model_version is not None
        and state.db is not None
        and state.current_user is not None
        and state.workspace_id
    ):
        summary = state.create_custom_api_model_version(
            db=state.db,
            workspace_id=state.workspace_id,
            current_user=state.current_user,
            model_name=model_name,
            version=version,
            task_type=task_type,
            prediction_endpoint_url=prediction_endpoint_url,
            training_endpoint_url=training_endpoint_url,
            auth_type=auth_type,
            auth_token=auth_token,
            auth_header_name=auth_header_name,
            response_mode=response_mode,
            timeout_seconds=timeout_seconds,
            default_prediction_column=default_prediction_column,
            default_parameters=default_parameters,
            training_artifact_path=training_artifact_path,
        )
        model_version_id = (
            str(getattr(summary, "id", "") or "").strip() or fallback_model_version_id
        )
        if model_version_id:
            state.saved_model_version_ids.append(model_version_id)
            state.result_model_version_id = model_version_id
        return ModelVersionArtifact(
            model_version_id=model_version_id,
            model_id=str(getattr(summary, "model_id", "") or "").strip() or None,
            model_name=str(getattr(summary, "model_name", "") or model_name).strip() or model_name,
            version=str(getattr(summary, "version", "") or version).strip() or version,
            framework=str(getattr(summary, "framework", "") or "http-api").strip() or "http-api",
            task_type=str(getattr(summary, "task_type", "") or task_type).strip() or task_type,
            source_type=str(getattr(summary, "source_type", "") or "custom_api").strip()
            or "custom_api",
            execution_mode=str(getattr(summary, "execution_mode", "") or "external_api").strip()
            or "external_api",
        )

    return ModelVersionArtifact(
        model_version_id=fallback_model_version_id,
        model_id=None,
        model_name=model_name,
        version=version,
        framework="http-api",
        task_type=task_type,
        source_type="custom_api",
        execution_mode="external_api",
    )


def _serialize_preview_value(value: Any) -> dict[str, Any]:
    if isinstance(value, DatasetArtifact):
        return {
            "kind": "dataset_version",
            "datasetVersionId": value.dataset_version_id,
            "datasetName": value.dataset_name,
            "datasetKind": value.dataset_kind,
            "path": value.path,
            "summary": value.dataset_name or value.dataset_version_id or "Dataset",
        }
    if isinstance(value, ModelVersionArtifact):
        return {
            "kind": "model_version",
            "modelVersionId": value.model_version_id,
            "modelId": value.model_id,
            "modelName": value.model_name,
            "version": value.version,
            "framework": value.framework,
            "taskType": value.task_type,
            "sourceType": value.source_type,
            "executionMode": value.execution_mode,
            "summary": value.model_name or value.model_version_id,
        }
    if isinstance(value, dict) and isinstance(value.get("kind"), str):
        return dict(value)
    if isinstance(value, str) and value:
        candidate = Path(value)
        if candidate.exists():
            return {
                "kind": "artifact_file",
                "path": str(candidate),
                "name": candidate.name,
                "summary": candidate.name,
            }
    return {"kind": "value", "value": value}


def _preview_bindings(
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
) -> dict[str, Any]:
    preview: dict[str, Any] = {}
    for key in bindings:
        preview[key] = _serialize_preview_value(
            _resolve_input_value(resolved_outputs, bindings, key)
        )
    return preview


def _dataset_artifact_from_id(dataset_version_id: str) -> DatasetArtifact:
    return DatasetArtifact(
        dataset_version_id=dataset_version_id,
        dataset_name=None,
        dataset_kind=None,
        path=None,
    )


def _execute_asset_nodes(
    *,
    ordered_nodes: list[dict[str, Any]],
    state: AssetExecutionState,
) -> AssetExecutionState:
    for current_node in ordered_nodes:
        node_id = str(current_node.get("id", "")).strip()
        state.resolved_outputs[node_id] = _execute_asset_node(node=current_node, state=state)
    return state


def _collect_structural_subgraph_inputs(
    *,
    node_type: str,
    subgraph: dict[str, Any],
    state: AssetExecutionState,
    bindings: dict[str, str],
    exclude_keys: set[str] | None = None,
) -> dict[str, Any]:
    provided_inputs: dict[str, Any] = {}
    excluded = exclude_keys or set()
    input_ports = _subgraph_interface_ports(subgraph, SUBGRAPH_INPUT_NODE_TYPE, "output_defs")
    for port in input_ports:
        port_key = str(port.get("key", "")).strip()
        if not port_key or port_key in excluded:
            continue
        binding = str(bindings.get(port_key, "")).strip()
        if binding:
            provided_inputs[port_key] = _resolve_input_value(
                state.resolved_outputs, bindings, port_key
            )
        elif bool(port.get("required", False)):
            raise ValueError(f"{node_type} requires subgraph input `{port_key}`.")
        else:
            provided_inputs[port_key] = _skipped_value(
                f"{node_type} did not receive a value for subgraph input `{port_key}`."
            )
    return provided_inputs


def _propagate_asset_child_state(
    parent_state: AssetExecutionState,
    child_state: AssetExecutionState,
) -> None:
    parent_state.result_dataset_version_id = child_state.result_dataset_version_id
    parent_state.result_model_version_id = child_state.result_model_version_id
    parent_state.artifact_path = child_state.artifact_path
    parent_state.latest_metrics = child_state.latest_metrics


def _execute_asset_subgraph_body(
    *,
    subgraph: dict[str, Any],
    provided_inputs: dict[str, Any],
    state: AssetExecutionState,
) -> tuple[dict[str, Any], AssetExecutionState]:
    child_state = AssetExecutionState(
        storage_root=state.storage_root,
        db=state.db,
        current_user=state.current_user,
        workspace_id=state.workspace_id,
        run_id=state.run_id,
        create_private_dataset_version=state.create_private_dataset_version,
        create_custom_api_model_version=state.create_custom_api_model_version,
        saved_dataset_version_ids=state.saved_dataset_version_ids,
        saved_model_version_ids=state.saved_model_version_ids,
        result_dataset_version_id=state.result_dataset_version_id,
        result_model_version_id=state.result_model_version_id,
        artifact_path=state.artifact_path,
        latest_metrics=dict(state.latest_metrics),
        subgraph_inputs=provided_inputs,
    )

    raw_nodes = subgraph.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Subgraph nodes must be a list.")
    _execute_asset_nodes(
        ordered_nodes=_topological_node_order(raw_nodes),
        state=child_state,
    )

    outputs: dict[str, Any] = {}
    output_nodes = sorted(
        [
            item
            for item in raw_nodes
            if isinstance(item, dict)
            and str(item.get("type", "")).strip() == SUBGRAPH_OUTPUT_NODE_TYPE
        ],
        key=lambda item: (
            float(item.get("position", {}).get("y", 0.0)),
            float(item.get("position", {}).get("x", 0.0)),
            str(item.get("id", "")),
        ),
    )
    for output_node in output_nodes:
        input_defs = output_node.get("input_defs", [])
        output_bindings = output_node.get("input_bindings", {})
        if not isinstance(input_defs, list) or not input_defs:
            continue
        if not isinstance(output_bindings, dict):
            raise ValueError(
                f"Subgraph output node {output_node.get('id', '')} has invalid bindings."
            )
        port_key = str(input_defs[0].get("key", "")).strip()
        if not port_key:
            continue
        binding = str(output_bindings.get(port_key, "")).strip()
        if not binding and bool(input_defs[0].get("required", False)):
            raise ValueError(f"Subgraph output `{port_key}` is required but not bound.")
        outputs[port_key] = (
            _resolve_input_value(child_state.resolved_outputs, output_bindings, port_key)
            if binding
            else _skipped_value(f"Subgraph output `{port_key}` is not bound.")
        )

    return outputs, child_state


def _execute_asset_subgraph(
    *,
    node: dict[str, Any],
    state: AssetExecutionState,
    bindings: dict[str, str],
) -> dict[str, Any]:
    node_id = str(node.get("id", "")).strip()
    subgraph = node.get("subgraph")
    if not isinstance(subgraph, dict):
        raise ValueError(f"Node {node_id} is missing a valid subgraph definition.")

    provided_inputs = _collect_structural_subgraph_inputs(
        node_type=CALL_SUBGRAPH_NODE_TYPE,
        subgraph=subgraph,
        state=state,
        bindings=bindings,
    )
    outputs, child_state = _execute_asset_subgraph_body(
        subgraph=subgraph,
        provided_inputs=provided_inputs,
        state=state,
    )
    _propagate_asset_child_state(state, child_state)
    return outputs


def _execute_asset_for_each(
    *,
    node: dict[str, Any],
    state: AssetExecutionState,
    bindings: dict[str, str],
) -> dict[str, Any]:
    node_id = str(node.get("id", "")).strip()
    subgraph = node.get("subgraph")
    if not isinstance(subgraph, dict):
        raise ValueError(f"Node {node_id} is missing a valid subgraph definition.")

    raw_items = _unwrap_control_value(
        _resolve_input_value(state.resolved_outputs, bindings, "items")
    )
    if not isinstance(raw_items, list):
        raise ValueError(f"Node {node_id} requires `items` to resolve to a JSON array.")

    shared_inputs = _collect_structural_subgraph_inputs(
        node_type=FOR_EACH_NODE_TYPE,
        subgraph=subgraph,
        state=state,
        bindings=bindings,
        exclude_keys=FOR_EACH_RESERVED_INPUT_PORT_KEYS,
    )

    aggregated_outputs: dict[str, list[Any]] = {}
    output_ports = _subgraph_interface_ports(subgraph, SUBGRAPH_OUTPUT_NODE_TYPE, "input_defs")
    output_keys = [
        str(port.get("key", "")).strip()
        for port in output_ports
        if str(port.get("key", "")).strip()
    ]
    for port_key in output_keys:
        aggregated_outputs.setdefault(port_key, [])

    for index, item in enumerate(raw_items):
        iteration_inputs = {
            **shared_inputs,
            FOR_EACH_ITEM_PORT_KEY: item,
            FOR_EACH_INDEX_PORT_KEY: index,
        }
        iteration_outputs, child_state = _execute_asset_subgraph_body(
            subgraph=subgraph,
            provided_inputs=iteration_inputs,
            state=state,
        )
        _propagate_asset_child_state(state, child_state)
        for port_key in output_keys:
            aggregated_outputs[port_key].append(
                iteration_outputs.get(
                    port_key,
                    _skipped_value(
                        f"{FOR_EACH_NODE_TYPE} iteration {index} did not emit `{port_key}`."
                    ),
                )
            )

    return {
        port_key: {
            "kind": "value_list",
            "items": items,
            "count": len(items),
            "summary": f"{len(items)} collected values",
        }
        for port_key, items in aggregated_outputs.items()
    }


def _execute_asset_node(
    *,
    node: dict[str, Any],
    state: AssetExecutionState,
) -> dict[str, Any]:
    node_id = str(node.get("id", "")).strip()
    node_type = str(node.get("type", "")).strip()
    params = node.get("params", {})
    bindings = node.get("input_bindings", {})
    if not isinstance(params, dict) or not isinstance(bindings, dict):
        raise ValueError(f"Node {node_id} has invalid params or input bindings.")

    skip_reason = _required_input_skip_reason(node_type, node, state.resolved_outputs, bindings)
    if skip_reason is not None:
        return _skip_outputs_for_node(node, skip_reason)

    if node_type == "source.dataset_version":
        dataset_version_id = str(params.get("datasetVersionId", "")).strip()
        if not dataset_version_id:
            raise ValueError(f"Node {node_id} is missing datasetVersionId.")
        return {"dataset": _dataset_artifact_from_id(dataset_version_id)}

    if node_type == "source.model_version":
        return {
            "model": _load_model_version_artifact(
                state=state,
                model_version_id=str(params.get("modelVersionId", "")).strip(),
                node_type=node_type,
            )
        }

    if node_type == SUBGRAPH_INPUT_NODE_TYPE:
        output_defs = node.get("output_defs", [])
        if not isinstance(output_defs, list) or not output_defs:
            raise ValueError(f"Node {node_id} must declare one subgraph output port.")
        port_key = str(output_defs[0].get("key", "")).strip()
        if not port_key:
            raise ValueError(f"Node {node_id} subgraph output port key is missing.")
        return {
            port_key: state.subgraph_inputs.get(
                port_key,
                _skipped_value(f"Subgraph input `{port_key}` was not provided."),
            )
        }

    if node_type == SUBGRAPH_OUTPUT_NODE_TYPE:
        return {}

    if node_type == CALL_SUBGRAPH_NODE_TYPE:
        return _execute_asset_subgraph(node=node, state=state, bindings=bindings)

    if node_type == FOR_EACH_NODE_TYPE:
        return _execute_asset_for_each(node=node, state=state, bindings=bindings)

    if node_type == "control.boolean_literal":
        return {
            "value": _wrap_control_value(bool(params.get("value", False)), value_type="boolean")
        }

    if node_type == "control.list_literal":
        items = _parse_json_value(params.get("itemsJson", "[]"), field_name="itemsJson")
        if not isinstance(items, list):
            raise ValueError("itemsJson must be a JSON array.")
        return {"items": {"kind": "value_list", "items": items, "count": len(items)}}

    if node_type == "control.compare":
        left = _unwrap_control_value(_resolve_input_value(state.resolved_outputs, bindings, "left"))
        right_bound = _resolve_optional_input_value(state.resolved_outputs, bindings, "right")
        right = (
            _unwrap_control_value(right_bound)
            if right_bound is not None
            else _parse_json_value(
                params.get("rightValueJson", "true"), field_name="rightValueJson"
            )
        )
        operator = str(params.get("operator", "eq") or "eq").strip()
        if operator == "eq":
            result = left == right
        elif operator == "ne":
            result = left != right
        elif operator == "gt":
            result = left > right
        elif operator == "gte":
            result = left >= right
        elif operator == "lt":
            result = left < right
        elif operator == "lte":
            result = left <= right
        elif operator == "contains":
            if isinstance(left, str):
                result = str(right) in left
            elif isinstance(left, dict):
                result = right in left or str(right) in left
            elif isinstance(left, list | tuple | set):
                result = right in left
            else:
                raise ValueError(
                    "contains operator requires a string, array, set, tuple, "
                    "or object on the left side."
                )
        else:
            raise ValueError(f"Unsupported compare operator: {operator}")
        return {"result": _wrap_control_value(result, value_type="boolean")}

    if node_type == "control.not":
        value = _require_boolean_control_value(
            _resolve_input_value(state.resolved_outputs, bindings, "value"),
            field_name="value",
        )
        return {"result": _wrap_control_value(not value, value_type="boolean")}

    if node_type == "control.guard":
        enabled = _require_boolean_control_value(
            _resolve_input_value(state.resolved_outputs, bindings, "enabled"),
            field_name="enabled",
        )
        payload = _resolve_input_value(state.resolved_outputs, bindings, "payload")
        if not enabled:
            return {"payload": _skipped_value("control.guard disabled this branch.")}
        return {"payload": payload}

    if node_type == "control.coalesce":
        for key in ("primary", "fallback"):
            value = _resolve_optional_input_value(state.resolved_outputs, bindings, key)
            if value is not None:
                return {"output": value}
        return {"output": _skipped_value("control.coalesce did not receive an active payload.")}

    if node_type == "geo.define_bbox_roi":
        return {"roi": {"bbox": list(parse_bbox_roi_params(params))}}

    if node_type == "geo.query_raster_collection":
        parse_query_raster_collection_params(params)
        _resolve_input_value(state.resolved_outputs, bindings, "roi")
        return {"collection": {"kind": "scene_collection", "items": []}}

    if node_type == "geo.filter_scene_collection":
        parse_scene_filter_params(params)
        collection = _resolve_input_value(state.resolved_outputs, bindings, "collection")
        return {"collection": collection}

    if node_type == "geo.sort_scene_collection":
        parse_scene_sort_params(params)
        collection = _resolve_input_value(state.resolved_outputs, bindings, "collection")
        return {"collection": collection}

    if node_type == "geo.select_scene":
        parse_scene_select_params(params)
        _resolve_input_value(state.resolved_outputs, bindings, "collection")
        return {"scene": {"kind": "scene"}}

    if node_type == "geo.fetch_scene_as_dataset":
        scene = _resolve_input_value(state.resolved_outputs, bindings, "scene")
        dataset_name = str(params.get("outputDatasetName", "")).strip() or "Fetched Scene"
        artifact_path = Path(
            _write_bytes_artifact(
                state,
                node_id=node_id,
                file_name="scene.tif",
                payload=_synthetic_single_pixel_tiff_bytes(),
            )
        )
        return {
            "dataset": _persist_dataset_artifact(
                state=state,
                source_path=artifact_path,
                dataset_name=dataset_name,
                metadata={
                    "workflow_output_kind": "fetched_scene",
                    "synthetic_placeholder": True,
                    "scene": scene if isinstance(scene, dict) else {"kind": "scene"},
                },
                kind=DatasetKind.RASTER,
            )
        }

    if node_type in {
        "raster.load_georaster",
        "raster.load_mask_raster",
        "image.load_image_collection",
        "vector.load_features",
        "mask.load_mask_collection",
    }:
        dataset = _resolve_input_value(state.resolved_outputs, bindings, "dataset")
        if not isinstance(dataset, DatasetArtifact):
            raise ValueError(f"{node_type} requires a dataset_version input.")
        output_key = {
            "raster.load_georaster": "raster",
            "raster.load_mask_raster": "raster",
            "image.load_image_collection": "images",
            "vector.load_features": "features",
            "mask.load_mask_collection": "masks",
        }[node_type]
        return {output_key: {"kind": node_type, "datasetVersionId": dataset.dataset_version_id}}

    if node_type in {
        "geo.clip_raster_by_roi",
        "geo.reproject_raster",
        "geo.merge_rasters",
    }:
        if node_type == "geo.merge_rasters":
            _resolve_input_value(state.resolved_outputs, bindings, "primary")
            _resolve_input_value(state.resolved_outputs, bindings, "secondary")
        else:
            _resolve_input_value(state.resolved_outputs, bindings, "raster")
            if node_type == "geo.clip_raster_by_roi":
                _resolve_input_value(state.resolved_outputs, bindings, "roi")
        return {"raster": {"kind": node_type}}

    if node_type == "geo.sample_raster_metadata":
        raster = _resolve_input_value(state.resolved_outputs, bindings, "raster")
        artifact_path = _write_json_artifact(
            state,
            node_id=node_id,
            file_name="metadata.json",
            payload={
                "kind": "raster_metadata",
                "sourceNodeType": node_type,
                "sourceRasterKind": raster.get("kind") if isinstance(raster, dict) else None,
            },
        )
        return {"artifact": artifact_path}

    if node_type in {"rgb.patchify_raster", "rgb.patchify_image_collection"}:
        parse_patchify_params(params)
        input_key = "raster" if node_type == "rgb.patchify_raster" else "images"
        _resolve_input_value(state.resolved_outputs, bindings, input_key)
        return {
            "tiles": {
                "kind": "tile_set",
                "sampleKinds": (
                    ["geospatial_tile"] if node_type == "rgb.patchify_raster" else ["image_tile"]
                ),
                "sampleCount": 64,
            }
        }

    if node_type in {
        "label.rasterize_features_to_tiles",
        "label.reproject_mask_raster_to_tiles",
        "label.crop_mask_collection_to_tiles",
    }:
        parse_label_output_params(params)
        tiles = _resolve_input_value(state.resolved_outputs, bindings, "tiles")
        other_key = {
            "label.rasterize_features_to_tiles": "features",
            "label.reproject_mask_raster_to_tiles": "raster",
            "label.crop_mask_collection_to_tiles": "masks",
        }[node_type]
        _resolve_input_value(state.resolved_outputs, bindings, other_key)
        return {
            "labels": {
                "kind": "label_set",
                "taskTypes": ["semantic_segmentation"],
                "annotationKinds": ["mask"],
                "sampleKinds": _sample_kinds_from_value(tiles) or ["image_tile", "geospatial_tile"],
                "sampleCount": _sample_count_from_value(tiles),
            }
        }

    if node_type in {
        "annotation.project_features_to_tile_classes",
        "annotation.project_features_to_tile_bboxes",
        "annotation.project_features_to_tile_polygons",
    }:
        tiles = _resolve_input_value(state.resolved_outputs, bindings, "tiles")
        _resolve_input_value(state.resolved_outputs, bindings, "features")
        semantic_mapping = {
            "annotation.project_features_to_tile_classes": (
                "class_label",
                "image_classification",
            ),
            "annotation.project_features_to_tile_bboxes": ("bbox", "object_detection"),
            "annotation.project_features_to_tile_polygons": (
                "polygon",
                "instance_segmentation",
            ),
        }
        annotation_kind, task_type = semantic_mapping[node_type]
        return {
            "annotations": {
                "kind": "annotation_set",
                "taskTypes": [task_type],
                "annotationKinds": [annotation_kind],
                "sampleKinds": _sample_kinds_from_value(tiles) or ["image_tile", "geospatial_tile"],
                "sampleCount": _sample_count_from_value(tiles),
            }
        }

    if node_type == "label.filter_by_coverage":
        parse_label_filter_by_coverage_params(params)
        labels = _resolve_input_value(state.resolved_outputs, bindings, "labels")
        return {"labels": labels}

    if node_type == "dataset.build_samples":
        tiles = _resolve_input_value(state.resolved_outputs, bindings, "tiles")
        annotation_kinds: list[str] = []
        task_types: list[str] = []
        labels = _resolve_optional_input_value(state.resolved_outputs, bindings, "labels")
        if isinstance(labels, dict):
            annotation_kinds = _annotation_kinds_from_value(labels)
            task_types = _task_types_from_value(labels) or _task_types_for_annotation_kinds(
                annotation_kinds
            )
        sample_output: dict[str, Any] = {
            "kind": "sample_set",
            "sampleKinds": _sample_kinds_from_value(tiles) or ["image_tile", "geospatial_tile"],
            "sampleCount": _sample_count_from_value(tiles),
        }
        if annotation_kinds:
            sample_output["annotationKinds"] = annotation_kinds
        if task_types:
            sample_output["taskTypes"] = task_types
        return {"samples": sample_output}

    if node_type == "dataset.split_samples":
        split_params = parse_dataset_split_params(params)
        samples = _resolve_input_value(state.resolved_outputs, bindings, "samples")
        sample_count = _sample_count_from_value(samples)
        train_count = None
        val_count = None
        test_count = None
        if sample_count is not None:
            train_count = int(round(sample_count * split_params.train_ratio))
            val_count = int(round(sample_count * split_params.val_ratio))
            test_count = max(sample_count - train_count - val_count, 0)

        def _split_output(split_name: str, count: int | None) -> dict[str, Any]:
            output = {
                "kind": "sample_set",
                "sampleKinds": _sample_kinds_from_value(samples)
                or ["image_tile", "geospatial_tile"],
                "split": split_name,
            }
            if isinstance(samples, dict):
                annotation_kinds = _annotation_kinds_from_value(samples)
                if annotation_kinds:
                    output["annotationKinds"] = annotation_kinds
                task_types = _task_types_from_value(samples) or _task_types_for_annotation_kinds(
                    annotation_kinds
                )
                if task_types:
                    output["taskTypes"] = task_types
            if count is not None:
                output["sampleCount"] = count
            return output

        return {
            "trainSamples": _split_output("train", train_count),
            "valSamples": _split_output("val", val_count),
            "testSamples": _split_output("test", test_count),
        }

    if node_type == "dataset.build_manifest":
        samples = _resolve_input_value(state.resolved_outputs, bindings, "samples")
        artifact_path = _write_json_artifact(
            state,
            node_id=node_id,
            file_name="manifest.json",
            payload={
                "kind": "sample_manifest",
                "sampleCount": _sample_count_from_value(samples),
                "sampleKinds": _sample_kinds_from_value(samples),
                "taskTypes": _task_types_from_value(samples),
                "annotationKinds": _annotation_kinds_from_value(samples),
            },
        )
        return {"artifact": artifact_path}

    if node_type == "artifact.package_dataset_bundle":
        sample_payloads = {
            key: _resolve_optional_input_value(state.resolved_outputs, bindings, key)
            for key in ("samples", "trainSamples", "valSamples", "testSamples")
            if str(bindings.get(key, "")).strip()
        }
        if not any(value is not None for value in sample_payloads.values()):
            raise ValueError(
                "artifact.package_dataset_bundle requires at least one sample_set input."
            )
        archive_name = (
            str(params.get("archiveName", "dataset-bundle.zip") or "dataset-bundle.zip").strip()
            or "dataset-bundle.zip"
        )
        bundle_manifest = {
            "kind": "dataset_bundle",
            "samples": {
                key: _serialize_preview_value(value)
                for key, value in sample_payloads.items()
                if value is not None
            },
            "hasManifest": bool(str(bindings.get("manifest", "")).strip()),
            "taskTypes": _task_types_from_value(next(iter(sample_payloads.values()), {})),
            "annotationKinds": _annotation_kinds_from_value(
                next(iter(sample_payloads.values()), {})
            ),
        }
        artifact_path = _write_zip_artifact(
            state,
            node_id=node_id,
            file_name=archive_name,
            files={"manifest.json": json.dumps(bundle_manifest, ensure_ascii=True, indent=2)},
        )
        return {"artifact": artifact_path}

    if node_type == "export.artifact_to_dataset_version":
        artifact = _resolve_input_value(state.resolved_outputs, bindings, "artifact")
        dataset_name = str(params.get("outputDatasetName", "")).strip() or "Workflow Artifact"
        artifact_path = Path(str(artifact))
        if not artifact_path.exists():
            artifact_path = Path(
                _write_json_artifact(
                    state,
                    node_id=node_id,
                    file_name="artifact-export.json",
                    payload={"kind": "artifact_export", "sourceArtifact": str(artifact)},
                )
            )
        return {
            "dataset": _persist_dataset_artifact(
                state=state,
                source_path=artifact_path,
                dataset_name=dataset_name,
                metadata={"workflow_output_kind": "artifact"},
            )
        }

    if node_type == "custom.api_train_samples":
        train_samples = _resolve_input_value(state.resolved_outputs, bindings, "trainSamples")
        validation_samples = _resolve_optional_input_value(
            state.resolved_outputs,
            bindings,
            "validationSamples",
        )
        task_type = str(params.get("taskType", "")).strip()
        if not task_type:
            raise ValueError("custom.api_train_samples requires taskType.")
        output_model_name = str(params.get("outputModelName", "")).strip() or "Custom API Model"
        output_model_version = str(params.get("outputModelVersion", "")).strip() or "1.0.0"
        prediction_endpoint_url = str(params.get("predictionEndpointUrl", "")).strip()
        if not prediction_endpoint_url:
            raise ValueError("custom.api_train_samples requires predictionEndpointUrl.")
        training_endpoint_url = str(params.get("trainingEndpointUrl", "")).strip() or None
        auth_type = str(params.get("authType", "none") or "none").strip() or "none"
        auth_token = str(params.get("authToken", "")).strip()
        auth_header_name = str(params.get("authHeaderName", "")).strip()
        response_mode = (
            str(params.get("responseMode", "prediction_values") or "prediction_values").strip()
            or "prediction_values"
        )
        default_prediction_column = (
            str(params.get("defaultPredictionColumn", "prediction") or "prediction").strip()
            or "prediction"
        )
        timeout_seconds = _coerce_positive_int(
            params.get("timeoutSeconds", 45),
            field_name="timeoutSeconds",
        )
        default_parameters = _parse_json_value(
            params.get("callParametersJson", "{}"),
            field_name="callParametersJson",
        )
        if not isinstance(default_parameters, dict):
            raise ValueError("callParametersJson must be a JSON object.")

        training_payload = {
            "kind": "custom_api_training_request",
            "taskType": task_type,
            "taskTypes": [task_type],
            "annotationKinds": _annotation_kinds_for_task_types([task_type]),
            "trainSamples": _serialize_preview_value(train_samples),
            "validationSamples": _serialize_preview_value(validation_samples)
            if validation_samples is not None
            else None,
            "predictionEndpointUrl": prediction_endpoint_url,
            "trainingEndpointUrl": training_endpoint_url,
            "responseMode": response_mode,
            "timeoutSeconds": timeout_seconds,
            "defaultParameters": default_parameters,
        }
        artifact_path = Path(
            _write_json_artifact(
                state,
                node_id=node_id,
                file_name="custom-api-training.json",
                payload=training_payload,
            )
        )
        model_artifact = _persist_custom_api_model_version(
            state=state,
            model_name=output_model_name,
            version=output_model_version,
            task_type=task_type,
            prediction_endpoint_url=prediction_endpoint_url,
            training_endpoint_url=training_endpoint_url,
            auth_type=auth_type,
            auth_token=auth_token,
            auth_header_name=auth_header_name,
            response_mode=response_mode,
            timeout_seconds=timeout_seconds,
            default_prediction_column=default_prediction_column,
            default_parameters=default_parameters,
            training_artifact_path=artifact_path,
        )
        return {"model": model_artifact, "artifact": str(artifact_path)}

    if node_type == "custom.api_predict_samples":
        model = _resolve_model_version_artifact(
            state=state,
            bindings=bindings,
            params=params,
            node_type=node_type,
            require_custom_api=True,
        )
        samples = _resolve_input_value(state.resolved_outputs, bindings, "samples")
        prediction_output: dict[str, Any] = {
            "kind": "prediction_set",
            "modelVersionId": model.model_version_id,
            "modelName": model.model_name,
            "taskType": model.task_type,
            "taskTypes": [model.task_type] if model.task_type else _task_types_from_value(samples),
            "sampleKinds": _sample_kinds_from_value(samples) or ["image_tile", "geospatial_tile"],
            "callParameters": json.loads(str(params.get("callParametersJson", "{}") or "{}")),
        }
        annotation_kinds = _annotation_kinds_for_task_types(
            _task_types_from_value(prediction_output)
        ) or _annotation_kinds_from_value(samples)
        if annotation_kinds:
            prediction_output["annotationKinds"] = annotation_kinds
        sample_count = _sample_count_from_value(samples)
        if sample_count is not None:
            prediction_output["sampleCount"] = sample_count
        return {"predictions": prediction_output}

    if node_type == "export.prediction_set_to_dataset_version":
        predictions = _resolve_input_value(state.resolved_outputs, bindings, "predictions")
        dataset_name = str(params.get("outputDatasetName", "")).strip() or "Workflow Predictions"
        prediction_path = Path(
            _write_json_artifact(
                state,
                node_id=node_id,
                file_name="predictions.json",
                payload=predictions
                if isinstance(predictions, dict)
                else {"kind": "prediction_set"},
            )
        )
        metadata: dict[str, object] = {"workflow_output_kind": "prediction_set"}
        if isinstance(predictions, dict):
            sample_kinds = _sample_kinds_from_value(predictions)
            if sample_kinds:
                metadata["sampleKinds"] = sample_kinds
            task_types = _task_types_from_value(predictions)
            if task_types:
                metadata["taskTypes"] = task_types
            if predictions.get("taskType"):
                metadata["taskType"] = predictions.get("taskType")
            annotation_kinds = _annotation_kinds_from_value(predictions)
            if annotation_kinds:
                metadata["annotationKinds"] = annotation_kinds
            sample_count = _sample_count_from_value(predictions)
            if sample_count is not None:
                metadata["sampleCount"] = sample_count
        return {
            "dataset": _persist_dataset_artifact(
                state=state,
                source_path=prediction_path,
                dataset_name=dataset_name,
                metadata=metadata,
            )
        }

    raise NotImplementedError(f"Unsupported asset node type: {node_type}")


def test_asset_node(
    *,
    db,
    graph_json: dict[str, Any],
    target_node_id: str,
    storage_root: Path,
    resolve_credential: ResolveGeeCredentialFn | None = None,
) -> dict[str, Any]:
    del resolve_credential
    raw_nodes = graph_json.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Workflow graph nodes must be a list.")

    required_node_ids = _collect_required_node_ids(raw_nodes, target_node_id)
    ordered_nodes = _topological_node_order(raw_nodes, include_node_ids=required_node_ids)
    unsupported_node_types = sorted(
        {
            str(node.get("type", "")).strip()
            for node in ordered_nodes
            if str(node.get("type", "")).strip() not in ASSET_NODE_TYPES
        }
    )
    if unsupported_node_types:
        raise NotImplementedError(
            "Node testing currently supports only asset workflow nodes. "
            f"Unsupported node types: {', '.join(unsupported_node_types)}."
        )

    state = AssetExecutionState(
        storage_root=storage_root,
        db=db,
        run_id=f"preview-{uuid4().hex}",
    )
    input_preview: dict[str, Any] = {}
    output_preview: dict[str, Any] = {}
    for node in ordered_nodes:
        node_id = str(node.get("id", "")).strip()
        bindings = node.get("input_bindings", {})
        if not isinstance(bindings, dict):
            raise ValueError(f"Node {node_id} has invalid input bindings.")
        if node_id == target_node_id:
            input_preview = _preview_bindings(state.resolved_outputs, bindings)
        outputs = _execute_asset_node(node=node, state=state)
        state.resolved_outputs[node_id] = outputs
        if node_id == target_node_id:
            output_preview = {
                key: _serialize_preview_value(value) for key, value in outputs.items()
            }
            break

    return {
        "node_id": target_node_id,
        "input_preview": input_preview,
        "output_preview": output_preview,
    }


def test_patch_node(
    *,
    db,
    graph_json: dict[str, Any],
    target_node_id: str,
    storage_root: Path,
) -> dict[str, Any]:
    return test_asset_node(
        db=db,
        graph_json=graph_json,
        target_node_id=target_node_id,
        storage_root=storage_root,
    )


def execute_asset_graph(
    *,
    db,
    graph_json: dict[str, Any],
    current_user,
    workspace_id: str,
    run_id: str,
    storage_root: Path,
    create_private_dataset_version: CreatePrivateDatasetVersionFn,
    create_custom_api_model_version: CreateCustomApiModelVersionFn | None = None,
    resolve_credential: ResolveGeeCredentialFn | None = None,
) -> dict[str, Any]:
    del resolve_credential
    raw_nodes = graph_json.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Workflow graph nodes must be a list.")

    state = AssetExecutionState(
        storage_root=storage_root,
        db=db,
        current_user=current_user,
        workspace_id=workspace_id,
        run_id=run_id,
        create_private_dataset_version=create_private_dataset_version,
        create_custom_api_model_version=create_custom_api_model_version,
    )
    _execute_asset_nodes(
        ordered_nodes=_topological_node_order(raw_nodes),
        state=state,
    )

    return {
        "result_dataset_version_id": state.result_dataset_version_id,
        "result_model_version_id": state.result_model_version_id,
        "saved_dataset_version_ids": state.saved_dataset_version_ids,
        "saved_model_version_ids": state.saved_model_version_ids,
        "artifact_path": state.artifact_path,
        "metrics": state.latest_metrics,
    }


def execute_patch_graph(
    *,
    db,
    graph_json: dict[str, Any],
    current_user,
    workspace_id: str,
    run_id: str,
    storage_root: Path,
    create_private_dataset_version: CreatePrivateDatasetVersionFn,
    create_custom_api_model_version: CreateCustomApiModelVersionFn | None = None,
) -> dict[str, Any]:
    return execute_asset_graph(
        db=db,
        graph_json=graph_json,
        current_user=current_user,
        workspace_id=workspace_id,
        run_id=run_id,
        storage_root=storage_root,
        create_private_dataset_version=create_private_dataset_version,
        create_custom_api_model_version=create_custom_api_model_version,
    )
