from __future__ import annotations

import json

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodeExample,
    WorkflowNodeOutputBehavior,
    WorkflowNodeOutputUsage,
    WorkflowNodePort,
    WorkflowNodeStarterBinding,
    WorkflowParamDefinition,
    WorkflowParamFieldType,
    WorkflowParamOption,
    WorkflowPortContract,
    WorkflowTemplateDefinition,
    WorkflowTemplateSampleBinding,
)
from platform_backend.seed_data import (
    SEED_IMAGE_COLLECTION_DATASET_VERSION_ID,
    SEED_LINEAR_MODEL_VERSION_ID,
    SEED_RANDOM_FOREST_MODEL_VERSION_ID,
    SEED_RASTER_DATASET_VERSION_ID,
    SEED_SEGMENTATION_MODEL_VERSION_ID,
    SEED_SVM_MODEL_VERSION_ID,
    SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID,
    SEED_TABULAR_INPUT_DATASET_VERSION_ID,
    SEED_TABULAR_PREDICTION_DATASET_VERSION_ID,
    SEED_VECTOR_DATASET_VERSION_ID,
)
from platform_backend.workflows.subgraph_runtime import (
    CALL_SUBGRAPH_NODE_TYPE,
    FOR_EACH_INDEX_PORT_KEY,
    FOR_EACH_ITEM_PORT_KEY,
    FOR_EACH_NODE_TYPE,
    SUBGRAPH_INPUT_NODE_TYPE,
    SUBGRAPH_OUTPUT_NODE_TYPE,
)


def _port(
    key: str,
    label: str,
    *data_types: str,
    required: bool = False,
    description: str | None = None,
) -> WorkflowNodePort:
    return WorkflowNodePort(
        key=key,
        label=label,
        description=description,
        data_types=list(data_types),
        required=required,
    )


def _param(
    key: str,
    label: str,
    field_type: WorkflowParamFieldType,
    *,
    description: str | None = None,
    default_value: str | int | float | bool | list[str] | None = None,
    placeholder: str | None = None,
    min: float | None = None,
    max: float | None = None,
    step: float | None = None,
    required: bool = False,
    options: list[tuple[str, str]] | None = None,
) -> WorkflowParamDefinition:
    return WorkflowParamDefinition(
        key=key,
        label=label,
        field_type=field_type,
        description=description,
        default_value=default_value,
        placeholder=placeholder,
        min=min,
        max=max,
        step=step,
        required=required,
        options=[
            WorkflowParamOption(label=option_label, value=option_value)
            for option_value, option_label in (options or [])
        ],
    )


def _starter_binding(
    input_kind: str,
    param_key: str,
    *,
    preset_params: dict[str, object] | None = None,
    auto_create: bool = False,
    priority: int = 0,
) -> WorkflowNodeStarterBinding:
    return WorkflowNodeStarterBinding(
        input_kind=input_kind,
        param_key=param_key,
        preset_params=preset_params or {},
        auto_create=auto_create,
        priority=priority,
    )


def _output_behavior(
    port_key: str,
    *,
    preview_kinds: list[str] | None = None,
    usages: list[WorkflowNodeOutputUsage] | None = None,
) -> WorkflowNodeOutputBehavior:
    return WorkflowNodeOutputBehavior(
        port_key=port_key,
        preview_kinds=preview_kinds or [],
        usages=usages or [],
    )


def _output_usage(target: str, input_kind: str) -> WorkflowNodeOutputUsage:
    return WorkflowNodeOutputUsage(target=target, input_kind=input_kind)


_CONTROL_PAYLOAD_DATA_TYPES = (
    "dataset_version",
    "table",
    "geo_raster",
    "image_collection",
    "feature_collection",
    "mask_raster",
    "mask_collection",
    "scene_collection",
    "scene",
    "tile_set",
    "label_set",
    "annotation_set",
    "prediction_set",
    "sample_set",
    "value",
    "value_list",
    "model_version",
    "model_ref",
    "metrics_report",
    "prediction_mask",
    "prediction_vector",
    "artifact",
    "roi",
)


def _control_payload_port(
    key: str,
    label: str,
    *,
    required: bool = False,
    description: str | None = None,
) -> WorkflowNodePort:
    return _port(
        key,
        label,
        *_CONTROL_PAYLOAD_DATA_TYPES,
        required=required,
        description=description,
    )


def _contract(
    port_key: str,
    summary: str,
    *,
    dataset_kinds: list[str] | None = None,
    file_formats: list[str] | None = None,
    column_requirements: list[str] | None = None,
    sample_columns: list[str] | None = None,
    produced_columns: list[str] | None = None,
    task_types: list[str] | None = None,
    annotation_kinds: list[str] | None = None,
    sample_kinds: list[str] | None = None,
    value_types: list[str] | None = None,
    notes: list[str] | None = None,
) -> WorkflowPortContract:
    return WorkflowPortContract(
        port_key=port_key,
        summary=summary,
        dataset_kinds=dataset_kinds or [],
        file_formats=file_formats or [],
        column_requirements=column_requirements or [],
        sample_columns=sample_columns or [],
        produced_columns=produced_columns or [],
        task_types=task_types or [],
        annotation_kinds=annotation_kinds or [],
        sample_kinds=sample_kinds or [],
        value_types=value_types or [],
        notes=notes or [],
    )


def _example(
    title: str,
    kind: str,
    *,
    port_key: str | None = None,
    columns: list[str] | None = None,
    rows: list[dict[str, object]] | None = None,
    content: str | None = None,
) -> WorkflowNodeExample:
    return WorkflowNodeExample(
        title=title,
        kind=kind,
        port_key=port_key,
        columns=columns or [],
        rows=rows or [],
        content=content,
    )


def _sample_binding(node_id: str, **params: object) -> WorkflowTemplateSampleBinding:
    return WorkflowTemplateSampleBinding(node_id=node_id, params=params)


_STARTER_BINDABLE_FIELD_TYPES: dict[WorkflowParamFieldType, str] = {
    "datasetVersion": "dataset_version",
    "modelVersion": "model_version",
    "spatialRoi": "spatial_roi",
    "geeCredential": "gee_credential",
}


def _primary_data_type(port: WorkflowNodePort) -> str:
    return port.data_types[0] if port.data_types else ""


def _generic_contract_for_port(port: WorkflowNodePort) -> WorkflowPortContract:
    data_type = _primary_data_type(port)
    if data_type == "dataset_version":
        return _contract(port.key, "Dataset version handle referencing a persisted dataset asset.")
    if data_type == "model_version":
        return _contract(port.key, "Model version handle referencing a persisted model asset.")
    if data_type == "model_ref":
        return _contract(
            port.key, "In-memory trained model reference ready for save or evaluation."
        )
    if data_type == "table":
        return _contract(
            port.key, "In-memory table with named columns ready for downstream processing."
        )
    if data_type == "geo_raster":
        return _contract(port.key, "Loaded geospatial raster preserving CRS, extent, and bands.")
    if data_type == "mask_raster":
        return _contract(port.key, "Loaded geospatial mask raster aligned on a raster grid.")
    if data_type == "image_collection":
        return _contract(port.key, "Collection of standard RGB images ready for patch generation.")
    if data_type == "feature_collection":
        return _contract(port.key, "Vector feature collection with geometry and properties.")
    if data_type == "mask_collection":
        return _contract(port.key, "Collection of mask images aligned to source imagery.")
    if data_type == "scene_collection":
        return _contract(
            port.key, "Remote raster scene collection available for filtering and selection."
        )
    if data_type == "scene":
        return _contract(port.key, "Single selected remote raster scene.")
    if data_type == "tile_set":
        return _contract(port.key, "RGB tile set with tile images and tile index metadata.")
    if data_type == "label_set":
        return _contract(port.key, "Label set aligned to an RGB tile grid.")
    if data_type == "annotation_set":
        return _contract(port.key, "Annotation collection aligned to source samples or tiles.")
    if data_type == "prediction_set":
        return _contract(port.key, "Prediction collection aligned to source samples or tiles.")
    if data_type == "sample_set":
        return _contract(
            port.key, "Sample set binding imagery tiles with optional labels and metadata."
        )
    if data_type == "value":
        return _contract(
            port.key, "Single structured value for control-flow or configuration routing."
        )
    if data_type == "value_list":
        return _contract(
            port.key, "Ordered list of structured values for generic iteration or batching."
        )
    if data_type == "metrics_report":
        return _contract(
            port.key, "Metrics report with metric/value rows.", produced_columns=["metric", "value"]
        )
    if data_type == "artifact":
        return _contract(port.key, "Workflow artifact file ready for download or persistence.")
    if data_type == "roi":
        return _contract(port.key, "Workflow ROI geometry in a portable coordinate representation.")
    if data_type == "prediction_mask":
        return _contract(port.key, "Prediction mask output aligned to the workflow raster grid.")
    if data_type == "prediction_vector":
        return _contract(port.key, "Prediction vector output with derived geometries.")
    return _contract(port.key, f"{port.label} semantic payload.")


def _generic_example_for_port(port: WorkflowNodePort, *, title_prefix: str) -> WorkflowNodeExample:
    data_type = _primary_data_type(port)
    title = f"{title_prefix} {port.label}"

    if data_type == "table":
        return _example(
            title,
            "table",
            port_key=port.key,
            columns=["feature_a", "feature_b", "target"],
            rows=[
                {"feature_a": 1.2, "feature_b": 0.8, "target": 9.1},
                {"feature_a": 2.4, "feature_b": 1.1, "target": 12.7},
            ],
        )
    if data_type == "metrics_report":
        return _example(
            title,
            "table",
            port_key=port.key,
            columns=["metric", "value"],
            rows=[
                {"metric": "r2", "value": 0.94},
                {"metric": "rmse", "value": 1.27},
            ],
        )

    payload: object
    if data_type == "dataset_version":
        return _example(
            title, "text", port_key=port.key, content="dataset_version: sample-dataset / v1"
        )
    if data_type == "model_version":
        return _example(
            title, "text", port_key=port.key, content="model_version: sample-model / 1.0.0"
        )
    if data_type == "model_ref":
        payload = {
            "algorithmKey": "linear_regression",
            "featureNames": ["feature_a", "feature_b"],
            "targetColumn": "target",
        }
    elif data_type == "geo_raster":
        payload = {"crs": "EPSG:4326", "bands": ["B4", "B3", "B2"], "width": 4096, "height": 4096}
    elif data_type == "mask_raster":
        payload = {"crs": "EPSG:4326", "bands": ["mask"], "width": 4096, "height": 4096}
    elif data_type == "image_collection":
        payload = {"count": 24, "format": "png", "channels": 3}
    elif data_type == "feature_collection":
        payload = {"geometryType": "Polygon", "featureCount": 128}
    elif data_type == "mask_collection":
        payload = {"count": 24, "format": "png", "channels": 1}
    elif data_type == "scene_collection":
        payload = {"provider": "gee", "collection": "sentinel2_l2a", "count": 12}
    elif data_type == "scene":
        payload = {"sceneId": "sentinel2_l2a/2025-06-18", "cloudCover": 7.8}
    elif data_type == "tile_set":
        payload = {"tileCount": 1024, "imageFormat": "png", "tileWidth": 256, "tileHeight": 256}
    elif data_type == "label_set":
        payload = {
            "taskTypes": ["semantic_segmentation"],
            "annotationKinds": ["mask"],
            "sampleKinds": ["geospatial_tile"],
            "sampleCount": 1024,
            "maskFormat": "png",
        }
    elif data_type == "annotation_set":
        payload = {
            "taskTypes": ["instance_segmentation"],
            "annotationKinds": ["polygon"],
            "sampleKinds": ["geospatial_tile"],
            "sampleCount": 1024,
        }
    elif data_type == "prediction_set":
        payload = {
            "taskType": "semantic_segmentation",
            "taskTypes": ["semantic_segmentation"],
            "annotationKinds": ["mask"],
            "sampleKinds": ["geospatial_tile"],
            "sampleCount": 1024,
        }
    elif data_type == "sample_set":
        payload = {
            "taskTypes": ["image_classification"],
            "annotationKinds": ["class_label"],
            "sampleKinds": ["image_tile"],
            "sampleCount": 1024,
            "hasLabels": True,
        }
    elif data_type == "value":
        payload = {"kind": "value", "value": True, "valueType": "boolean"}
    elif data_type == "value_list":
        payload = {"kind": "value_list", "items": [True, False, True], "count": 3}
    elif data_type == "artifact":
        payload = {"name": "workflow-output.json", "format": "json", "sizeBytes": 2048}
    elif data_type == "roi":
        payload = {"type": "Polygon", "bbox": [116.10, 39.70, 116.65, 40.10]}
    elif data_type == "prediction_mask":
        payload = {"maskCount": 12, "format": "png"}
    elif data_type == "prediction_vector":
        payload = {"geometryType": "Polygon", "featureCount": 48}
    else:
        return _example(title, "text", port_key=port.key, content=f"{port.label} example payload")

    return _example(
        title,
        "json",
        port_key=port.key,
        content=json.dumps(payload, indent=2),
    )


def _generic_config_example(item: WorkflowCatalogItem) -> WorkflowNodeExample:
    config: dict[str, object] = {}
    for field in item.params:
        if field.default_value is not None:
            config[field.key] = field.default_value
        elif field.required:
            config[field.key] = field.placeholder or field.label

    if not config:
        config = {"note": f"{item.label} uses defaults and downstream bindings."}

    return _example("Example configuration", "json", content=json.dumps(config, indent=2))


def _complete_contracts(
    ports: list[WorkflowNodePort],
    contracts: list[WorkflowPortContract],
) -> list[WorkflowPortContract]:
    by_key = {contract.port_key: contract for contract in contracts}
    return [by_key.get(port.key) or _generic_contract_for_port(port) for port in ports]


def _complete_examples(
    ports: list[WorkflowNodePort],
    examples: list[WorkflowNodeExample],
    *,
    empty_fallback: WorkflowNodeExample | None = None,
    title_prefix: str,
) -> list[WorkflowNodeExample]:
    if examples:
        return examples
    if ports:
        return [_generic_example_for_port(port, title_prefix=title_prefix) for port in ports]
    return [empty_fallback] if empty_fallback is not None else []


def _complete_common_errors(item: WorkflowCatalogItem) -> list[str]:
    if item.common_errors:
        return item.common_errors

    messages = [
        f"{port.label} must be connected before running." for port in item.inputs if port.required
    ]
    messages.extend(f"{field.label} is required." for field in item.params if field.required)
    if not messages:
        messages.append(
            f"{item.label} failed because one or more inputs or parameters are invalid."
        )
    return messages


def _complete_starter_bindings(
    params: list[WorkflowParamDefinition],
    bindings: list[WorkflowNodeStarterBinding],
) -> list[WorkflowNodeStarterBinding]:
    def inferred_preset_params(input_kind: str) -> dict[str, object]:
        preset_params: dict[str, object] = {}
        if input_kind == "spatial_roi" and any(field.key == "roiMode" for field in params):
            preset_params["roiMode"] = "saved_roi"
        if input_kind == "gee_credential" and any(
            field.key == "credentialMode" for field in params
        ):
            preset_params["credentialMode"] = "personal"
        return preset_params

    completed = [
        binding.model_copy(
            update={
                "preset_params": {
                    **inferred_preset_params(binding.input_kind),
                    **binding.preset_params,
                }
            }
        )
        for binding in bindings
    ]
    bound_kinds = {binding.input_kind for binding in completed}

    for field in params:
        input_kind = _STARTER_BINDABLE_FIELD_TYPES.get(field.field_type)
        if not input_kind or input_kind in bound_kinds:
            continue
        completed.append(
            _starter_binding(
                input_kind,
                field.key,
                preset_params=inferred_preset_params(input_kind),
            )
        )
        bound_kinds.add(input_kind)

    return completed


def _normalize_catalog_item(item: WorkflowCatalogItem) -> WorkflowCatalogItem:
    return item.model_copy(
        update={
            "input_contracts": _complete_contracts(item.inputs, item.input_contracts),
            "output_contracts": _complete_contracts(item.outputs, item.output_contracts),
            "example_inputs": _complete_examples(
                item.inputs,
                item.example_inputs,
                empty_fallback=_generic_config_example(item),
                title_prefix="Example input",
            ),
            "example_outputs": _complete_examples(
                item.outputs,
                item.example_outputs,
                title_prefix="Example output",
            ),
            "common_errors": _complete_common_errors(item),
            "starter_bindings": _complete_starter_bindings(item.params, item.starter_bindings),
        }
    )


def _source_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="source.dataset_version",
            label="Dataset Version",
            category="source",
            description="Select a dataset version and expose it as a workflow input handle.",
            runtime_kind="source",
            supported_tasks=[
                "tabular_training",
                "tabular_prediction",
                "tabular_validation",
                "custom_api_prediction",
                "geospatial_collection",
                "sample_dataset",
            ],
            tags=["dataset", "version", "input"],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[_param("datasetVersionId", "Dataset Version", "datasetVersion", required=True)],
            starter_bindings=[
                _starter_binding(
                    "dataset_version", "datasetVersionId", auto_create=True, priority=100
                )
            ],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="source.sentinel2_gee_download",
            label="Sentinel-2 GEE Download",
            category="source",
            description=(
                "Query and download a Sentinel-2 scene directly from Google Earth Engine "
                "into a raster dataset version."
            ),
            runtime_kind="source",
            supported_tasks=["geospatial_collection"],
            tags=["sentinel2", "gee", "download", "raster", "boundary", "provider_gee"],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param(
                    "roiMode",
                    "ROI Mode",
                    "select",
                    default_value="bbox",
                    required=True,
                    options=[("bbox", "BBox"), ("saved_roi", "Saved ROI")],
                ),
                _param(
                    "bbox",
                    "BBox",
                    "text",
                    description="Format: minLon,minLat,maxLon,maxLat in EPSG:4326.",
                    placeholder="116.10,39.70,116.65,40.10",
                ),
                _param("roiId", "Saved ROI", "spatialRoi"),
                _param(
                    "startDate", "Start Date", "text", default_value="2025-06-01", required=True
                ),
                _param("endDate", "End Date", "text", default_value="2025-06-30", required=True),
                _param(
                    "maxCloudCover",
                    "Max Cloud Cover",
                    "number",
                    default_value=20,
                    min=0,
                    max=100,
                    step=1,
                    required=True,
                ),
                _param(
                    "bands",
                    "Bands",
                    "multiselect",
                    default_value=["B4", "B3", "B2"],
                    options=[
                        ("B2", "B2"),
                        ("B3", "B3"),
                        ("B4", "B4"),
                        ("B8", "B8"),
                        ("B11", "B11"),
                        ("B12", "B12"),
                    ],
                ),
                _param("scale", "Scale", "number", default_value=10, min=1, step=1, required=True),
                _param(
                    "credentialMode",
                    "Credential Mode",
                    "select",
                    default_value="platform_default",
                    required=True,
                    options=[("platform_default", "Platform Default"), ("personal", "Personal")],
                ),
                _param("personalCredentialId", "Personal Credential", "geeCredential"),
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Sentinel-2 Scene",
                ),
            ],
            output_contracts=[
                _contract(
                    "dataset",
                    (
                        "Raster dataset version in GeoTIFF format for downstream "
                        "geospatial processing."
                    ),
                    dataset_kinds=["raster"],
                    file_formats=["geotiff"],
                )
            ],
            example_outputs=[
                _example(
                    "Sentinel-2 scene dataset",
                    "json",
                    port_key="dataset",
                    content='{"kind":"raster","format":"geotiff","bands":["B4","B3","B2"]}',
                )
            ],
            common_errors=[
                "bbox or roiId must resolve to a valid ROI before download.",
                "A personal credential is required when credentialMode is personal.",
            ],
            starter_bindings=[_starter_binding("spatial_roi", "roiId", priority=90)],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="gee.nee_map_export",
            label="GEE NEE Map Export",
            category="inference",
            description=(
                "Estimate farmland NEE over an ROI in Google Earth Engine and export the "
                "result as a raster dataset version."
            ),
            runtime_kind="export",
            supported_tasks=["geospatial_collection", "sample_dataset", "custom_api_prediction"],
            tags=["gee", "nee", "raster", "boundary", "provider_gee", "export"],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param(
                    "roiMode",
                    "ROI Mode",
                    "select",
                    default_value="bbox",
                    required=True,
                    options=[("bbox", "BBox"), ("saved_roi", "Saved ROI")],
                ),
                _param(
                    "bbox",
                    "BBox",
                    "text",
                    description="Format: minLon,minLat,maxLon,maxLat in EPSG:4326.",
                    placeholder="116.10,39.70,116.65,40.10",
                ),
                _param("roiId", "Saved ROI", "spatialRoi"),
                _param(
                    "satellite",
                    "Satellite",
                    "select",
                    default_value="S2",
                    required=True,
                    options=[
                        ("L4", "Landsat 4 TM"),
                        ("L5", "Landsat 5 TM"),
                        ("L7", "Landsat 7 ETM+"),
                        ("L8", "Landsat 8 OLI/TIRS"),
                        ("L9", "Landsat 9 OLI-2/TIRS-2"),
                        ("S2", "Sentinel-2 MSI"),
                        ("HLSL30", "HLS Landsat OLI"),
                        ("HLSS30", "HLS Sentinel-2 MSI"),
                    ],
                ),
                _param(
                    "startDate", "Start Date", "text", default_value="2026-01-01", required=True
                ),
                _param("endDate", "End Date", "text", default_value="2026-02-01", required=True),
                _param(
                    "trainingPreset",
                    "Training Preset",
                    "select",
                    default_value="auto",
                    required=True,
                    options=[
                        ("auto", "Auto"),
                        ("CHINA", "China"),
                        ("CORN", "Corn"),
                        ("WHEAT", "Wheat"),
                    ],
                ),
                _param(
                    "scaleMeters",
                    "Scale Meters",
                    "number",
                    default_value=30,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "credentialMode",
                    "Credential Mode",
                    "select",
                    default_value="platform_default",
                    required=True,
                    options=[("platform_default", "Platform Default"), ("personal", "Personal")],
                ),
                _param("personalCredentialId", "Personal Credential", "geeCredential"),
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="NEE Map",
                ),
                _param(
                    "croplandMaskAssetId",
                    "Cropland Mask Asset ID",
                    "text",
                    default_value="users/potapovpeter/Global_cropland_2019/Global_cropland_2019_NE",
                    required=True,
                ),
                _param(
                    "chinaTrainingAssetId",
                    "China Training Asset ID",
                    "text",
                    default_value="projects/ee-maywu1/assets/CHINA2024_processed_uppercase_header",
                    required=True,
                ),
                _param(
                    "cornTrainingAssetId",
                    "Corn Training Asset ID",
                    "text",
                    default_value="projects/ee-maywu1/assets/maize_GEE",
                    required=True,
                ),
                _param(
                    "wheatTrainingAssetId",
                    "Wheat Training Asset ID",
                    "text",
                    default_value="projects/ee-maywu1/assets/wheat_GEE",
                    required=True,
                ),
            ],
            output_contracts=[
                _contract(
                    "dataset",
                    "Raster NEE output persisted as a GeoTIFF dataset version.",
                    dataset_kinds=["raster"],
                    file_formats=["geotiff"],
                )
            ],
            example_outputs=[
                _example(
                    "NEE raster dataset",
                    "json",
                    port_key="dataset",
                    content='{"kind":"raster","format":"geotiff","bands":["NEE"]}',
                )
            ],
            common_errors=[
                "bbox or roiId must resolve to a valid ROI before export.",
                "The selected date window must not exceed one year.",
                "The configured training asset IDs must be readable by the active GEE credential.",
            ],
            starter_bindings=[_starter_binding("spatial_roi", "roiId", priority=100)],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="gee.nee_point_timeseries_export",
            label="GEE NEE Point Time Series Export",
            category="inference",
            description=(
                "Evaluate a point-based NEE time series in Google Earth Engine and export "
                "the result as a CSV dataset version."
            ),
            runtime_kind="export",
            supported_tasks=[
                "geospatial_collection",
                "tabular_prediction",
                "tabular_validation",
            ],
            tags=["gee", "nee", "timeseries", "table", "boundary", "provider_gee", "export"],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param("longitude", "Longitude", "number", required=True),
                _param("latitude", "Latitude", "number", required=True),
                _param(
                    "startDate", "Start Date", "text", default_value="2021-09-01", required=True
                ),
                _param("endDate", "End Date", "text", default_value="2022-09-01", required=True),
                _param(
                    "band",
                    "Band",
                    "select",
                    default_value="NEE",
                    required=True,
                    options=[
                        ("NEE", "NEE"),
                        ("AVI", "AVI"),
                        ("BAI", "BAI"),
                        ("BI", "BI"),
                        ("DSWI3", "DSWI3"),
                        ("MBI", "MBI"),
                        ("MLSWI26", "MLSWI26"),
                        ("NLI", "NLI"),
                        ("NSDS", "NSDS"),
                        ("OCVI", "OCVI"),
                        ("RCC", "RCC"),
                    ],
                ),
                _param(
                    "scaleMeters",
                    "Scale Meters",
                    "number",
                    default_value=30,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "bufferMeters",
                    "Buffer Meters",
                    "number",
                    default_value=30,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "credentialMode",
                    "Credential Mode",
                    "select",
                    default_value="platform_default",
                    required=True,
                    options=[("platform_default", "Platform Default"), ("personal", "Personal")],
                ),
                _param("personalCredentialId", "Personal Credential", "geeCredential"),
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="NEE Point Time Series",
                ),
                _param(
                    "croplandMaskAssetId",
                    "Cropland Mask Asset ID",
                    "text",
                    default_value="users/potapovpeter/Global_cropland_2019/Global_cropland_2019_NE",
                    required=True,
                ),
                _param(
                    "chinaTrainingAssetId",
                    "China Training Asset ID",
                    "text",
                    default_value="projects/ee-maywu1/assets/CHINA2024_processed_uppercase_header",
                    required=True,
                ),
            ],
            output_contracts=[
                _contract(
                    "dataset",
                    "Point time-series table persisted as a CSV dataset version.",
                    dataset_kinds=["table"],
                    file_formats=["csv"],
                    produced_columns=["date", "band", "value"],
                )
            ],
            example_outputs=[
                _example(
                    "NEE point time-series CSV",
                    "json",
                    port_key="dataset",
                    content='{"kind":"table","format":"csv","columns":["date","band","value"]}',
                )
            ],
            common_errors=[
                "longitude and latitude must define a valid EPSG:4326 point.",
                (
                    "The configured China training asset must be readable by the active "
                    "GEE credential."
                ),
                "No Landsat imagery matched the selected point and date range.",
            ],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[_output_usage("workflow", "dataset_version")],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="source.model_version",
            label="Model Version",
            category="source",
            description="Select a saved model version and expose it as a workflow input handle.",
            runtime_kind="source",
            supported_tasks=[
                "tabular_prediction",
                "tabular_validation",
                "custom_api_prediction",
                "sample_dataset",
            ],
            tags=["model", "version", "input"],
            outputs=[_port("model", "Model Version", "model_version")],
            params=[_param("modelVersionId", "Model Version", "modelVersion", required=True)],
            starter_bindings=[
                _starter_binding("model_version", "modelVersionId", auto_create=True, priority=100)
            ],
            output_behaviors=[
                _output_behavior(
                    "model",
                    preview_kinds=["model_version"],
                    usages=[_output_usage("workflow", "model_version")],
                )
            ],
        ),
    ]


def _geo_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="geo.define_bbox_roi",
            label="Define BBox ROI",
            category="source",
            description="Define an EPSG:4326 bounding box ROI inside the workflow.",
            runtime_kind="source",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "roi", "bbox"],
            outputs=[_port("roi", "ROI", "roi")],
            params=[
                _param(
                    "bbox",
                    "BBox",
                    "text",
                    description="Format: minLon,minLat,maxLon,maxLat in EPSG:4326.",
                    placeholder="116.10,39.70,116.65,40.10",
                    required=True,
                )
            ],
        ),
        WorkflowCatalogItem(
            type="geo.load_saved_roi",
            label="Load Saved ROI",
            category="source",
            description="Load a saved ROI asset and expose it as a workflow ROI object.",
            runtime_kind="source",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "roi", "saved"],
            outputs=[_port("roi", "ROI", "roi")],
            params=[_param("roiId", "Saved ROI", "spatialRoi", required=True)],
            starter_bindings=[_starter_binding("spatial_roi", "roiId", priority=100)],
        ),
        WorkflowCatalogItem(
            type="geo.query_raster_collection",
            label="Query Raster Collection",
            category="preprocess",
            description=(
                "Query a provider collection over an ROI and materialize a scene collection."
            ),
            runtime_kind="transform",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "query", "scene", "collection", "boundary", "provider_gee"],
            inputs=[_port("roi", "ROI", "roi", required=True)],
            outputs=[_port("collection", "Scene Collection", "scene_collection")],
            params=[
                _param(
                    "provider",
                    "Provider",
                    "select",
                    default_value="gee",
                    required=True,
                    options=[("gee", "Google Earth Engine")],
                ),
                _param(
                    "collection",
                    "Collection",
                    "select",
                    default_value="sentinel2_l2a",
                    required=True,
                    options=[("sentinel2_l2a", "Sentinel-2 L2A")],
                ),
                _param(
                    "startDate", "Start Date", "text", default_value="2025-06-01", required=True
                ),
                _param("endDate", "End Date", "text", default_value="2025-06-30", required=True),
                _param(
                    "bands",
                    "Bands",
                    "multiselect",
                    default_value=["B4", "B3", "B2"],
                    options=[
                        ("B2", "B2"),
                        ("B3", "B3"),
                        ("B4", "B4"),
                        ("B8", "B8"),
                        ("B11", "B11"),
                        ("B12", "B12"),
                    ],
                ),
                _param("scale", "Scale", "number", default_value=10, min=1, step=1, required=True),
                _param("limit", "Limit", "number", default_value=50, min=1, max=200, step=1),
                _param(
                    "credentialMode",
                    "Credential Mode",
                    "select",
                    default_value="platform_default",
                    required=True,
                    options=[("platform_default", "Platform Default"), ("personal", "Personal")],
                ),
                _param("personalCredentialId", "Personal Credential", "geeCredential"),
            ],
        ),
        WorkflowCatalogItem(
            type="geo.filter_scene_collection",
            label="Filter Scene Collection",
            category="preprocess",
            description="Filter a scene collection with JSON comparison rules.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "filter", "scene"],
            inputs=[_port("collection", "Scene Collection", "scene_collection", required=True)],
            outputs=[_port("collection", "Scene Collection", "scene_collection")],
            params=[
                _param(
                    "filtersJson",
                    "Filters JSON",
                    "text",
                    default_value="[]",
                    placeholder='[{"field":"cloud_cover","op":"<=","value":20}]',
                    required=True,
                )
            ],
        ),
        WorkflowCatalogItem(
            type="geo.sort_scene_collection",
            label="Sort Scene Collection",
            category="preprocess",
            description="Sort a scene collection by a metadata field.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "sort", "scene"],
            inputs=[_port("collection", "Scene Collection", "scene_collection", required=True)],
            outputs=[_port("collection", "Scene Collection", "scene_collection")],
            params=[
                _param("field", "Field", "text", default_value="cloud_cover", required=True),
                _param(
                    "order",
                    "Order",
                    "select",
                    default_value="asc",
                    required=True,
                    options=[("asc", "Ascending"), ("desc", "Descending")],
                ),
            ],
        ),
        WorkflowCatalogItem(
            type="geo.select_scene",
            label="Select Scene",
            category="preprocess",
            description="Select one scene from an ordered scene collection.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "select", "scene"],
            inputs=[_port("collection", "Scene Collection", "scene_collection", required=True)],
            outputs=[_port("scene", "Scene", "scene")],
            params=[
                _param(
                    "selectionMode",
                    "Selection Mode",
                    "select",
                    default_value="first",
                    required=True,
                    options=[("first", "First"), ("last", "Last"), ("index", "Index")],
                ),
                _param("index", "Index", "number", default_value=0, min=0, step=1),
            ],
        ),
        WorkflowCatalogItem(
            type="geo.fetch_scene_as_dataset",
            label="Fetch Scene As Dataset",
            category="postprocess",
            description="Fetch a selected scene and persist it as a raster dataset version.",
            runtime_kind="export",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "fetch", "dataset", "raster", "boundary", "provider_gee"],
            inputs=[_port("scene", "Scene", "scene", required=True)],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Fetched Scene",
                )
            ],
            output_contracts=[
                _contract(
                    "dataset",
                    "Raster dataset version in GeoTIFF format fetched from a selected scene.",
                    dataset_kinds=["raster"],
                    file_formats=["geotiff"],
                )
            ],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
    ]


def _load_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="raster.load_georaster",
            label="Load Geo Raster",
            category="preprocess",
            description="Decode a raster dataset version as a geospatial raster object.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection", "sample_dataset", "custom_api_prediction"],
            tags=["raster", "load", "geo"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("raster", "Geo Raster", "geo_raster")],
            input_contracts=[
                _contract(
                    "dataset",
                    "Geospatial raster dataset version in GeoTIFF format.",
                    dataset_kinds=["raster"],
                    file_formats=["geotiff", "tif", "tiff"],
                )
            ],
            output_contracts=[
                _contract(
                    "raster",
                    "Loaded geospatial raster object preserving CRS, extent, and bands.",
                )
            ],
        ),
        WorkflowCatalogItem(
            type="raster.load_mask_raster",
            label="Load Mask Raster",
            category="preprocess",
            description="Decode a raster dataset version as a mask raster object.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["mask", "raster", "load"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("raster", "Mask Raster", "mask_raster")],
            input_contracts=[
                _contract(
                    "dataset",
                    "Geospatial mask raster dataset version in GeoTIFF format.",
                    dataset_kinds=["raster"],
                    file_formats=["geotiff", "tif", "tiff"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="image.load_image_collection",
            label="Load Image Collection",
            category="preprocess",
            description="Decode a dataset version as a normal image file or image collection.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["image", "load", "collection"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("images", "Image Collection", "image_collection")],
            input_contracts=[
                _contract(
                    "dataset",
                    "RGB image dataset version stored as standard image files or archives.",
                    dataset_kinds=["raster"],
                    file_formats=["png", "jpg", "jpeg", "zip"],
                    notes=["Use raster.load_georaster for GeoTIFF geospatial rasters."],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="vector.load_features",
            label="Load Features",
            category="preprocess",
            description="Decode a vector dataset version as a feature collection.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["vector", "load", "features"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("features", "Feature Collection", "feature_collection")],
            input_contracts=[
                _contract(
                    "dataset",
                    "Vector dataset version in GeoJSON format.",
                    dataset_kinds=["vector"],
                    file_formats=["geojson", "json"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="mask.load_mask_collection",
            label="Load Mask Collection",
            category="preprocess",
            description="Decode a dataset version as a normal mask image collection.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["mask", "image", "load"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("masks", "Mask Collection", "mask_collection")],
            input_contracts=[
                _contract(
                    "dataset",
                    "Mask image dataset version stored as PNG/JPEG files or archives.",
                    dataset_kinds=["raster"],
                    file_formats=["png", "jpg", "jpeg", "zip"],
                )
            ],
        ),
    ]


def _sample_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="geo.clip_raster_by_roi",
            label="Clip Raster By ROI",
            category="preprocess",
            description="Clip a geospatial raster with a workflow ROI.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection", "sample_dataset", "custom_api_prediction"],
            tags=["geo", "clip", "raster", "roi"],
            inputs=[
                _port("raster", "Geo Raster", "geo_raster", required=True),
                _port("roi", "ROI", "roi", required=True),
            ],
            outputs=[_port("raster", "Geo Raster", "geo_raster")],
        ),
        WorkflowCatalogItem(
            type="geo.reproject_raster",
            label="Reproject Raster",
            category="preprocess",
            description="Reproject a geospatial raster to a target CRS and optional resolution.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection", "sample_dataset", "custom_api_prediction"],
            tags=["geo", "reproject", "raster"],
            inputs=[_port("raster", "Geo Raster", "geo_raster", required=True)],
            outputs=[_port("raster", "Geo Raster", "geo_raster")],
            params=[
                _param("targetCrs", "Target CRS", "text", default_value="EPSG:3857", required=True),
                _param("resolution", "Resolution", "number", min=0, step=0.01),
                _param(
                    "resampling",
                    "Resampling",
                    "select",
                    default_value="nearest",
                    required=True,
                    options=[("nearest", "Nearest"), ("bilinear", "Bilinear"), ("cubic", "Cubic")],
                ),
            ],
        ),
        WorkflowCatalogItem(
            type="geo.merge_rasters",
            label="Merge Rasters",
            category="preprocess",
            description="Merge two geospatial rasters into one raster mosaic.",
            runtime_kind="transform",
            supported_tasks=["geospatial_collection", "sample_dataset", "custom_api_prediction"],
            tags=["geo", "merge", "raster"],
            inputs=[
                _port("primary", "Primary Raster", "geo_raster", required=True),
                _port("secondary", "Secondary Raster", "geo_raster", required=True),
            ],
            outputs=[_port("raster", "Geo Raster", "geo_raster")],
        ),
        WorkflowCatalogItem(
            type="geo.sample_raster_metadata",
            label="Sample Raster Metadata",
            category="postprocess",
            description="Export a raster metadata summary as a JSON artifact.",
            runtime_kind="export",
            supported_tasks=["geospatial_collection"],
            tags=["geo", "metadata", "raster", "boundary", "persistence"],
            inputs=[_port("raster", "Geo Raster", "geo_raster", required=True)],
            outputs=[_port("artifact", "Artifact", "artifact")],
        ),
        WorkflowCatalogItem(
            type="rgb.patchify_raster",
            label="Patchify Raster",
            category="split",
            description="Cut a geospatial raster into RGB image tiles.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["rgb", "patch", "raster", "tile"],
            inputs=[_port("raster", "Geo Raster", "geo_raster", required=True)],
            outputs=[_port("tiles", "Tile Set", "tile_set")],
            params=[
                _param(
                    "tileWidth",
                    "Tile Width",
                    "number",
                    default_value=256,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "tileHeight",
                    "Tile Height",
                    "number",
                    default_value=256,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "strideX", "Stride X", "number", default_value=256, min=1, step=1, required=True
                ),
                _param(
                    "strideY", "Stride Y", "number", default_value=256, min=1, step=1, required=True
                ),
                _param(
                    "edgePolicy",
                    "Edge Policy",
                    "select",
                    default_value="skip",
                    required=True,
                    options=[("skip", "Skip Partial"), ("pad", "Pad Partial")],
                ),
                _param(
                    "outputImageFormat",
                    "Output Image Format",
                    "select",
                    default_value="png",
                    required=True,
                    options=[("png", "PNG"), ("jpg", "JPG")],
                ),
            ],
            output_contracts=[
                _contract(
                    "tiles",
                    "RGB geospatial tiles aligned to the source raster footprint.",
                    sample_kinds=["geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="rgb.patchify_image_collection",
            label="Patchify Image Collection",
            category="split",
            description="Cut a normal image or image collection into RGB image tiles.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["rgb", "patch", "image", "tile"],
            inputs=[_port("images", "Image Collection", "image_collection", required=True)],
            outputs=[_port("tiles", "Tile Set", "tile_set")],
            params=[
                _param(
                    "tileWidth",
                    "Tile Width",
                    "number",
                    default_value=256,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "tileHeight",
                    "Tile Height",
                    "number",
                    default_value=256,
                    min=1,
                    step=1,
                    required=True,
                ),
                _param(
                    "strideX", "Stride X", "number", default_value=256, min=1, step=1, required=True
                ),
                _param(
                    "strideY", "Stride Y", "number", default_value=256, min=1, step=1, required=True
                ),
                _param(
                    "edgePolicy",
                    "Edge Policy",
                    "select",
                    default_value="skip",
                    required=True,
                    options=[("skip", "Skip Partial"), ("pad", "Pad Partial")],
                ),
                _param(
                    "outputImageFormat",
                    "Output Image Format",
                    "select",
                    default_value="png",
                    required=True,
                    options=[("png", "PNG"), ("jpg", "JPG")],
                ),
            ],
            output_contracts=[
                _contract(
                    "tiles",
                    "RGB image tiles cut from a normal image collection.",
                    sample_kinds=["image_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="label.rasterize_features_to_tiles",
            label="Rasterize Features To Tiles",
            category="preprocess",
            description="Rasterize a feature collection onto an RGB tile grid.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["label", "vector", "rasterize", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("features", "Feature Collection", "feature_collection", required=True),
            ],
            outputs=[_port("labels", "Label Set", "label_set")],
            params=[
                _param(
                    "outputMaskFormat",
                    "Output Mask Format",
                    "select",
                    default_value="png",
                    required=True,
                    options=[("png", "PNG")],
                )
            ],
            output_contracts=[
                _contract(
                    "labels",
                    "Mask labels aligned to the upstream tile grid.",
                    task_types=["semantic_segmentation"],
                    annotation_kinds=["mask"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="label.reproject_mask_raster_to_tiles",
            label="Reproject Mask Raster To Tiles",
            category="preprocess",
            description="Reproject a geospatial mask raster onto an RGB tile grid.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["label", "mask", "raster", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("raster", "Mask Raster", "mask_raster", required=True),
            ],
            outputs=[_port("labels", "Label Set", "label_set")],
            params=[
                _param(
                    "outputMaskFormat",
                    "Output Mask Format",
                    "select",
                    default_value="png",
                    required=True,
                    options=[("png", "PNG")],
                )
            ],
            output_contracts=[
                _contract(
                    "labels",
                    "Mask labels aligned to the upstream tile grid.",
                    task_types=["semantic_segmentation"],
                    annotation_kinds=["mask"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="label.crop_mask_collection_to_tiles",
            label="Crop Mask Collection To Tiles",
            category="preprocess",
            description="Crop a normal mask image collection onto an RGB tile grid.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["label", "mask", "image", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("masks", "Mask Collection", "mask_collection", required=True),
            ],
            outputs=[_port("labels", "Label Set", "label_set")],
            params=[
                _param(
                    "outputMaskFormat",
                    "Output Mask Format",
                    "select",
                    default_value="png",
                    required=True,
                    options=[("png", "PNG")],
                )
            ],
            output_contracts=[
                _contract(
                    "labels",
                    "Mask labels aligned to the upstream tile grid.",
                    task_types=["semantic_segmentation"],
                    annotation_kinds=["mask"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="label.filter_by_coverage",
            label="Filter Labels By Coverage",
            category="preprocess",
            description="Filter aligned labels by empty-mask and coverage thresholds.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["label", "filter", "coverage"],
            inputs=[_port("labels", "Label Set", "label_set", required=True)],
            outputs=[_port("labels", "Label Set", "label_set")],
            params=[
                _param("skipEmptyLabel", "Skip Empty Label", "boolean", default_value=False),
                _param(
                    "minLabelCoverage",
                    "Min Label Coverage",
                    "number",
                    default_value=0,
                    min=0,
                    max=1,
                    step=0.01,
                ),
            ],
            input_contracts=[
                _contract(
                    "labels",
                    "Mask labels aligned to an image or geospatial tile grid.",
                    task_types=["semantic_segmentation"],
                    annotation_kinds=["mask"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
            output_contracts=[
                _contract(
                    "labels",
                    "Filtered mask labels aligned to an image or geospatial tile grid.",
                    task_types=["semantic_segmentation"],
                    annotation_kinds=["mask"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="annotation.project_features_to_tile_classes",
            label="Project Features To Tile Classes",
            category="preprocess",
            description=(
                "Project feature properties onto a tile grid as one class-label "
                "annotation per tile."
            ),
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["annotation", "class", "feature", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("features", "Feature Collection", "feature_collection", required=True),
            ],
            outputs=[_port("annotations", "Annotations", "annotation_set")],
            params=[
                _param(
                    "classProperty",
                    "Class Property",
                    "text",
                    default_value="class",
                    required=True,
                )
            ],
            input_contracts=[
                _contract(
                    "tiles",
                    "RGB tiles representing either image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract("features", "Feature collection with class properties."),
            ],
            output_contracts=[
                _contract(
                    "annotations",
                    "Tile-aligned class label annotations.",
                    task_types=["image_classification"],
                    annotation_kinds=["class_label"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="annotation.project_features_to_tile_bboxes",
            label="Project Features To Tile BBoxes",
            category="preprocess",
            description="Project vector features onto a tile grid as bounding-box annotations.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["annotation", "bbox", "feature", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("features", "Feature Collection", "feature_collection", required=True),
            ],
            outputs=[_port("annotations", "Annotations", "annotation_set")],
            params=[
                _param(
                    "classProperty",
                    "Class Property",
                    "text",
                    default_value="class",
                )
            ],
            input_contracts=[
                _contract(
                    "tiles",
                    "RGB tiles representing either image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract("features", "Feature collection with instance geometries."),
            ],
            output_contracts=[
                _contract(
                    "annotations",
                    "Tile-aligned bounding-box annotations.",
                    task_types=["object_detection"],
                    annotation_kinds=["bbox"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="annotation.project_features_to_tile_polygons",
            label="Project Features To Tile Polygons",
            category="preprocess",
            description="Project vector features onto a tile grid as polygon annotations.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["annotation", "polygon", "feature", "tile"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("features", "Feature Collection", "feature_collection", required=True),
            ],
            outputs=[_port("annotations", "Annotations", "annotation_set")],
            params=[
                _param(
                    "classProperty",
                    "Class Property",
                    "text",
                    default_value="class",
                )
            ],
            input_contracts=[
                _contract(
                    "tiles",
                    "RGB tiles representing either image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract("features", "Feature collection with polygon instance geometries."),
            ],
            output_contracts=[
                _contract(
                    "annotations",
                    "Tile-aligned polygon annotations.",
                    task_types=["instance_segmentation"],
                    annotation_kinds=["polygon"],
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="dataset.build_samples",
            label="Build Samples",
            category="preprocess",
            description="Bind RGB tiles with optional aligned labels into a sample set.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["dataset", "samples", "tiles", "labels"],
            inputs=[
                _port("tiles", "Tile Set", "tile_set", required=True),
                _port("labels", "Labels Or Annotations", "label_set", "annotation_set"),
            ],
            outputs=[_port("samples", "Sample Set", "sample_set")],
            input_contracts=[
                _contract(
                    "tiles",
                    "RGB tiles representing either image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract(
                    "labels",
                    "Optional aligned labels or annotations matching the tile grid.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
            ],
            output_contracts=[
                _contract(
                    "samples",
                    "Sample set built from an RGB tile grid and optional aligned annotations.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="dataset.split_samples",
            label="Split Samples",
            category="split",
            description="Split a sample set into train, validation, and test sample sets.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["dataset", "split", "samples"],
            inputs=[_port("samples", "Sample Set", "sample_set", required=True)],
            outputs=[
                _port("trainSamples", "Train Samples", "sample_set"),
                _port("valSamples", "Val Samples", "sample_set"),
                _port("testSamples", "Test Samples", "sample_set"),
            ],
            params=[
                _param(
                    "strategy",
                    "Strategy",
                    "select",
                    default_value="random",
                    required=True,
                    options=[("random", "Random")],
                ),
                _param("trainRatio", "Train Ratio", "number", default_value=0.8, min=0, step=0.01),
                _param("valRatio", "Val Ratio", "number", default_value=0.1, min=0, step=0.01),
                _param("testRatio", "Test Ratio", "number", default_value=0.1, min=0, step=0.01),
                _param("randomSeed", "Random Seed", "number", default_value=42, step=1),
            ],
            input_contracts=[
                _contract(
                    "samples",
                    "Sample set built from image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
            output_contracts=[
                _contract(
                    "trainSamples",
                    "Training sample split preserving sample semantics.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract(
                    "valSamples",
                    "Validation sample split preserving sample semantics.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract(
                    "testSamples",
                    "Test sample split preserving sample semantics.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
            ],
        ),
        WorkflowCatalogItem(
            type="dataset.build_manifest",
            label="Build Manifest",
            category="preprocess",
            description="Export a sample set manifest without packaging the dataset files.",
            runtime_kind="transform",
            supported_tasks=["sample_dataset"],
            tags=["dataset", "manifest", "samples"],
            inputs=[_port("samples", "Sample Set", "sample_set", required=True)],
            outputs=[_port("artifact", "Artifact", "artifact")],
        ),
        WorkflowCatalogItem(
            type="artifact.package_dataset_bundle",
            label="Package Dataset Bundle",
            category="postprocess",
            description=(
                "Package sample files into a dataset bundle zip with optional "
                "split groups and manifest."
            ),
            runtime_kind="export",
            supported_tasks=["sample_dataset"],
            tags=["artifact", "package", "dataset", "zip", "boundary", "persistence"],
            inputs=[
                _port("samples", "Sample Set", "sample_set"),
                _port("trainSamples", "Train Samples", "sample_set"),
                _port("valSamples", "Val Samples", "sample_set"),
                _port("testSamples", "Test Samples", "sample_set"),
                _port("manifest", "Manifest", "artifact"),
            ],
            outputs=[_port("artifact", "Artifact", "artifact")],
            params=[
                _param("archiveName", "Archive Name", "text", default_value="dataset-bundle.zip")
            ],
        ),
        WorkflowCatalogItem(
            type="export.artifact_to_dataset_version",
            label="Artifact To Dataset Version",
            category="postprocess",
            description="Persist an artifact file as a private dataset version.",
            runtime_kind="export",
            supported_tasks=["sample_dataset", "geospatial_collection"],
            tags=["export", "artifact", "dataset", "boundary", "persistence"],
            inputs=[_port("artifact", "Artifact", "artifact", required=True)],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Workflow Artifact",
                )
            ],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="export.prediction_set_to_dataset_version",
            label="Prediction Set To Dataset Version",
            category="postprocess",
            description="Persist a prediction set as a private dataset version artifact.",
            runtime_kind="export",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["export", "prediction", "dataset", "boundary", "persistence"],
            inputs=[_port("predictions", "Prediction Set", "prediction_set", required=True)],
            outputs=[_port("dataset", "Dataset Version", "dataset_version")],
            params=[
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Workflow Predictions",
                )
            ],
            input_contracts=[
                _contract(
                    "predictions",
                    "Prediction set associated with an image-tile or geospatial-tile sample grid.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
            output_behaviors=[
                _output_behavior(
                    "dataset",
                    preview_kinds=["dataset_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("spatial", "asset_version"),
                    ],
                )
            ],
        ),
    ]


def _tabular_predict_alias_node(
    node_type: str,
    label: str,
    *,
    algorithm_tag: str,
    extra_params: list[WorkflowParamDefinition] | None = None,
) -> WorkflowCatalogItem:
    return WorkflowCatalogItem(
        type=node_type,
        label=label,
        category="inference",
        description=(
            "Convenience alias for the generic regression prediction node with "
            "algorithm-specific defaults."
        ),
        runtime_kind="inference",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["table", "prediction", "regression", algorithm_tag, "convenience"],
        inputs=[
            _port("model", "Model Version", "model_version"),
            _port("table", "Input Table", "table", required=True),
        ],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param("modelVersionId", "Model Version", "modelVersion"),
            _param("predictionColumn", "Prediction Column", "text", default_value="prediction"),
            _param("roundDigits", "Round Digits", "number", default_value=4, min=0, step=1),
            _param("clipMin", "Clip Min", "number"),
            _param("clipMax", "Clip Max", "number"),
            *(extra_params or []),
        ],
        output_contracts=[
            _contract(
                "table",
                "Prediction table with the configured prediction column appended.",
                produced_columns=["feature_a", "feature_b", "prediction"],
            )
        ],
    )


def _tabular_train_alias_node(
    node_type: str,
    label: str,
    *,
    algorithm_tag: str,
    extra_params: list[WorkflowParamDefinition] | None = None,
) -> WorkflowCatalogItem:
    return WorkflowCatalogItem(
        type=node_type,
        label=label,
        category="inference",
        description=(
            "Convenience alias for the generic regression training node with "
            "algorithm-specific parameters."
        ),
        runtime_kind="inference",
        supported_tasks=["tabular_training"],
        tags=["table", "training", "regression", algorithm_tag, "convenience"],
        inputs=[
            _port("trainTable", "Train Table", "table", required=True),
            _port("testTable", "Test Table", "table"),
        ],
        outputs=[
            _port("model", "Trained Model", "model_ref"),
            _port("report", "Training Metrics", "metrics_report"),
        ],
        params=[
            _param(
                "featureColumns",
                "Feature Columns",
                "text",
                placeholder="feature_a, feature_b",
                required=True,
            ),
            _param("targetColumn", "Target Column", "text", default_value="target", required=True),
            *(extra_params or []),
        ],
    )


def _control_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="control.boolean_literal",
            label="Boolean Literal",
            category="control",
            description="Emit a boolean control value.",
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "value", "boolean", "primitive"],
            inputs=[],
            outputs=[_port("value", "Value", "value")],
            params=[_param("value", "Value", "boolean", default_value=True, required=True)],
            output_contracts=[
                _contract("value", "Boolean control value.", value_types=["boolean"])
            ],
        ),
        WorkflowCatalogItem(
            type="control.list_literal",
            label="List Literal",
            category="control",
            description="Emit an ordered list of structured values from JSON.",
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "value_list", "list", "primitive"],
            inputs=[],
            outputs=[_port("items", "Items", "value_list")],
            params=[
                _param(
                    "itemsJson",
                    "Items JSON",
                    "text",
                    default_value="[]",
                    placeholder='["tile-a", "tile-b"]',
                    required=True,
                )
            ],
            output_contracts=[
                _contract(
                    "items",
                    "Ordered list of structured values.",
                    value_types=["array"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="control.compare",
            label="Compare Values",
            category="control",
            description="Compare two values and emit a boolean result.",
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "compare", "boolean", "primitive"],
            inputs=[
                _port("left", "Left Value", "value", required=True),
                _port("right", "Right Value", "value"),
            ],
            outputs=[_port("result", "Result", "value")],
            params=[
                _param(
                    "operator",
                    "Operator",
                    "select",
                    default_value="eq",
                    required=True,
                    options=[
                        ("eq", "Equals"),
                        ("ne", "Not Equal"),
                        ("gt", "Greater Than"),
                        ("gte", "Greater Or Equal"),
                        ("lt", "Less Than"),
                        ("lte", "Less Or Equal"),
                        ("contains", "Contains"),
                    ],
                ),
                _param(
                    "rightValueJson",
                    "Right Value JSON",
                    "text",
                    default_value="true",
                    placeholder='42 or "label" or {"threshold": 0.5}',
                ),
            ],
            output_contracts=[
                _contract("result", "Boolean comparison result.", value_types=["boolean"])
            ],
        ),
        WorkflowCatalogItem(
            type="control.not",
            label="Boolean Not",
            category="control",
            description="Invert a boolean control value.",
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "boolean", "not", "primitive"],
            inputs=[_port("value", "Value", "value", required=True)],
            outputs=[_port("result", "Result", "value")],
            input_contracts=[_contract("value", "Boolean control value.", value_types=["boolean"])],
            output_contracts=[
                _contract("result", "Inverted boolean control value.", value_types=["boolean"])
            ],
        ),
        WorkflowCatalogItem(
            type="control.guard",
            label="Guard Payload",
            category="control",
            description=(
                "Pass a payload through only when the boolean condition is true; "
                "otherwise skip the branch."
            ),
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "guard", "branch", "primitive"],
            inputs=[
                _port("enabled", "Enabled", "value", required=True),
                _control_payload_port("payload", "Payload", required=True),
            ],
            outputs=[_control_payload_port("payload", "Payload")],
            input_contracts=[
                _contract(
                    "enabled",
                    "Boolean control value deciding whether the payload branch remains active.",
                    value_types=["boolean"],
                )
            ],
            output_behaviors=[
                _output_behavior(
                    "payload",
                    preview_kinds=["dataset_version", "model_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("workflow", "model_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="control.coalesce",
            label="Coalesce Payload",
            category="control",
            description=(
                "Return the first active payload, allowing branches to merge "
                "back into one downstream path."
            ),
            runtime_kind="transform",
            supported_tasks=["control_flow", "generic_control"],
            tags=["control", "merge", "branch", "primitive"],
            inputs=[
                _control_payload_port("primary", "Primary Payload", required=True),
                _control_payload_port("fallback", "Fallback Payload"),
            ],
            outputs=[_control_payload_port("output", "Output")],
            output_behaviors=[
                _output_behavior(
                    "output",
                    preview_kinds=["dataset_version", "model_version"],
                    usages=[
                        _output_usage("workflow", "dataset_version"),
                        _output_usage("workflow", "model_version"),
                    ],
                )
            ],
        ),
        WorkflowCatalogItem(
            type=CALL_SUBGRAPH_NODE_TYPE,
            label="Call Subgraph",
            category="control",
            description=(
                "Execute a nested acyclic subgraph whose external interface is "
                "declared by subgraph boundary nodes."
            ),
            runtime_kind="transform",
            supported_tasks=[
                "control_flow",
                "generic_control",
                "tabular_training",
                "sample_dataset",
                "custom_api_prediction",
                "geospatial_collection",
            ],
            tags=["control", "subgraph", "structural", "primitive"],
            inputs=[],
            outputs=[],
            params=[],
            common_errors=[
                (
                    "Subgraph boundary ports must be declared with "
                    "workflow.subgraph_input and workflow.subgraph_output nodes."
                ),
                ("Subgraph input and output port keys must be unique within the nested graph."),
                "The nested subgraph must remain acyclic and semantically valid.",
            ],
        ),
        WorkflowCatalogItem(
            type=FOR_EACH_NODE_TYPE,
            label="For Each",
            category="control",
            description=(
                "Execute a nested acyclic loop body once for each item in an "
                "ordered list and aggregate each body output into a value_list."
            ),
            runtime_kind="transform",
            supported_tasks=[
                "control_flow",
                "generic_control",
                "tabular_training",
                "sample_dataset",
                "custom_api_prediction",
                "geospatial_collection",
            ],
            tags=["control", "loop", "subgraph", "structural", "primitive"],
            inputs=[_port("items", "Items", "value_list", required=True)],
            outputs=[],
            params=[],
            input_contracts=[
                _contract(
                    "items",
                    "Ordered list of values to iterate over.",
                    value_types=["array"],
                )
            ],
            common_errors=[
                (
                    "Loop body ports must be declared with "
                    "workflow.subgraph_input and workflow.subgraph_output nodes."
                ),
                (
                    "Reserved workflow.subgraph_input keys `item` and `index` "
                    "are injected on each iteration and must not be bound from "
                    "the outer graph."
                ),
                "Each declared loop body output is aggregated into a value_list on the outer node.",
            ],
        ),
        WorkflowCatalogItem(
            type=SUBGRAPH_INPUT_NODE_TYPE,
            label="Subgraph Input",
            category="control",
            description=(
                "Declare one external input port for a nested subgraph and "
                "expose it inside the subgraph body."
            ),
            runtime_kind="source",
            supported_tasks=[
                "control_flow",
                "generic_control",
                "tabular_training",
                "sample_dataset",
                "custom_api_prediction",
                "geospatial_collection",
            ],
            tags=["control", "subgraph", "boundary", "structural", "primitive"],
            inputs=[],
            outputs=[],
            params=[],
            common_errors=[
                (
                    "Subgraph input nodes are valid only inside a structural "
                    "subgraph body such as workflow.call_subgraph or "
                    "control.for_each."
                ),
                (
                    "Each subgraph input node must declare exactly one output "
                    "port through its dynamic interface."
                ),
            ],
        ),
        WorkflowCatalogItem(
            type=SUBGRAPH_OUTPUT_NODE_TYPE,
            label="Subgraph Output",
            category="control",
            description=(
                "Declare one external output port for a nested subgraph and "
                "bind it to an internal upstream value."
            ),
            runtime_kind="export",
            supported_tasks=[
                "control_flow",
                "generic_control",
                "tabular_training",
                "sample_dataset",
                "custom_api_prediction",
                "geospatial_collection",
            ],
            tags=["control", "subgraph", "boundary", "structural", "primitive"],
            inputs=[],
            outputs=[],
            params=[],
            common_errors=[
                (
                    "Subgraph output nodes are valid only inside a structural "
                    "subgraph body such as workflow.call_subgraph or "
                    "control.for_each."
                ),
                (
                    "Each subgraph output node must declare exactly one input "
                    "port through its dynamic interface and bind it to an "
                    "internal source."
                ),
            ],
        ),
    ]


def _tabular_nodes() -> list[WorkflowCatalogItem]:
    return [
        WorkflowCatalogItem(
            type="table.load_csv",
            label="Load CSV Table",
            category="preprocess",
            description="Decode a CSV dataset version into an in-memory table.",
            runtime_kind="transform",
            supported_tasks=[
                "tabular_training",
                "tabular_prediction",
                "tabular_validation",
                "custom_api_prediction",
            ],
            tags=["table", "csv", "load"],
            inputs=[_port("dataset", "Dataset Version", "dataset_version", required=True)],
            outputs=[_port("table", "Table", "table")],
            params=[
                _param(
                    "delimiter",
                    "Delimiter",
                    "select",
                    default_value=",",
                    required=True,
                    options=[(",", "Comma"), (";", "Semicolon"), ("\t", "Tab")],
                )
            ],
            input_contracts=[
                _contract(
                    "dataset",
                    "Tabular dataset version stored as a CSV file.",
                    dataset_kinds=["table"],
                    file_formats=["csv"],
                    sample_columns=["feature_a", "feature_b", "target"],
                )
            ],
            output_contracts=[
                _contract(
                    "table",
                    (
                        "In-memory table with named columns ready for split, "
                        "train, and validation steps."
                    ),
                    sample_columns=["feature_a", "feature_b", "target"],
                    produced_columns=["feature_a", "feature_b", "target"],
                )
            ],
            example_inputs=[
                _example(
                    "CSV training data",
                    "table",
                    port_key="dataset",
                    columns=["feature_a", "feature_b", "target"],
                    rows=[
                        {"feature_a": 1.2, "feature_b": 0.8, "target": 9.1},
                        {"feature_a": 2.4, "feature_b": 1.1, "target": 12.7},
                    ],
                )
            ],
            example_outputs=[
                _example(
                    "Loaded table preview",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b", "target"],
                    rows=[
                        {"feature_a": 1.2, "feature_b": 0.8, "target": 9.1},
                        {"feature_a": 2.4, "feature_b": 1.1, "target": 12.7},
                    ],
                )
            ],
            common_errors=[
                "Selected dataset must be a table dataset stored as CSV.",
                "Delimiter must match the CSV file content.",
            ],
        ),
        WorkflowCatalogItem(
            type="table.train_test_split",
            label="Train/Test Split",
            category="split",
            description="Split a table into train and test tables.",
            runtime_kind="transform",
            supported_tasks=["tabular_training"],
            tags=["table", "split", "train", "test"],
            inputs=[_port("table", "Input Table", "table", required=True)],
            outputs=[
                _port("trainTable", "Train Table", "table"),
                _port("testTable", "Test Table", "table"),
            ],
            params=[
                _param(
                    "testSize",
                    "Test Size",
                    "number",
                    default_value=0.2,
                    min=0.05,
                    max=0.95,
                    step=0.05,
                    required=True,
                ),
                _param("shuffle", "Shuffle", "boolean", default_value=True),
                _param("randomState", "Random State", "number", default_value=42, step=1),
            ],
        ),
        WorkflowCatalogItem(
            type="tabular.train_regression_model",
            label="Train Regression Model",
            category="inference",
            description="Train a regression model with a chosen algorithm from a table.",
            runtime_kind="inference",
            supported_tasks=["tabular_training"],
            tags=["table", "training", "regression", "model"],
            inputs=[
                _port("trainTable", "Train Table", "table", required=True),
                _port("testTable", "Test Table", "table"),
            ],
            outputs=[
                _port("model", "Trained Model", "model_ref"),
                _port("report", "Training Metrics", "metrics_report"),
            ],
            params=[
                _param(
                    "algorithm",
                    "Algorithm",
                    "select",
                    default_value="linear_regression",
                    required=True,
                    options=[
                        ("linear_regression", "Linear Regression"),
                        ("svm_regression", "SVM Regression"),
                        ("random_forest_regression", "Random Forest Regression"),
                    ],
                ),
                _param(
                    "featureColumns",
                    "Feature Columns",
                    "text",
                    placeholder="feature_a, feature_b",
                    required=True,
                ),
                _param(
                    "targetColumn", "Target Column", "text", default_value="target", required=True
                ),
                _param(
                    "hyperparametersJson",
                    "Hyperparameters JSON",
                    "text",
                    default_value="{}",
                    placeholder='{"n_estimators": 100}',
                ),
            ],
        ),
        _tabular_train_alias_node(
            "tabular.linear_regression_train",
            "Linear Regression Train",
            algorithm_tag="linear_regression",
            extra_params=[
                _param("fitIntercept", "Fit Intercept", "boolean", default_value=True),
                _param("positive", "Positive Coefficients", "boolean", default_value=False),
            ],
        ),
        _tabular_train_alias_node(
            "tabular.svm_regression_train",
            "SVM Regression Train",
            algorithm_tag="svm_regression",
            extra_params=[
                _param(
                    "kernel",
                    "Kernel",
                    "select",
                    default_value="rbf",
                    required=True,
                    options=[
                        ("linear", "Linear"),
                        ("rbf", "RBF"),
                        ("poly", "Polynomial"),
                        ("sigmoid", "Sigmoid"),
                    ],
                ),
                _param("c", "C", "number", default_value=1.0, min=0.0001),
                _param("epsilon", "Epsilon", "number", default_value=0.1, min=0),
                _param("gamma", "Gamma", "text", default_value="scale"),
                _param("cacheSize", "Cache Size", "number", default_value=200, min=1),
            ],
        ),
        _tabular_train_alias_node(
            "tabular.random_forest_regression_train",
            "Random Forest Regression Train",
            algorithm_tag="random_forest_regression",
            extra_params=[
                _param("nEstimators", "N Estimators", "number", default_value=100, min=1, step=1),
                _param("maxDepth", "Max Depth", "number", min=1, step=1),
                _param(
                    "minSamplesSplit", "Min Samples Split", "number", default_value=2, min=2, step=1
                ),
                _param(
                    "minSamplesLeaf", "Min Samples Leaf", "number", default_value=1, min=1, step=1
                ),
                _param("nJobs", "N Jobs", "number", default_value=1, min=1, step=1),
            ],
        ),
        WorkflowCatalogItem(
            type="tabular.predict_model",
            label="Predict Model",
            category="inference",
            description="Run a saved tabular model against a table and append predictions.",
            runtime_kind="inference",
            supported_tasks=["tabular_prediction", "tabular_validation"],
            tags=["table", "prediction", "regression", "model"],
            inputs=[
                _port("model", "Model Version", "model_version"),
                _port("table", "Input Table", "table", required=True),
            ],
            outputs=[_port("table", "Prediction Table", "table")],
            params=[
                _param("modelVersionId", "Model Version", "modelVersion"),
                _param("predictionColumn", "Prediction Column", "text", default_value="prediction"),
                _param(
                    "runtimeParametersJson",
                    "Runtime Parameters JSON",
                    "text",
                    default_value="{}",
                    placeholder='{"roundDigits": 4}',
                ),
            ],
            output_contracts=[
                _contract(
                    "table",
                    (
                        "Prediction or enriched table. prediction_values appends "
                        "the configured prediction column; table_rows merges "
                        "returned row objects into the input rows."
                    ),
                    produced_columns=["feature_a", "feature_b", "prediction"],
                )
            ],
        ),
        _tabular_predict_alias_node(
            "tabular.linear_regression_predict",
            "Linear Regression Predict",
            algorithm_tag="linear_regression",
        ),
        _tabular_predict_alias_node(
            "tabular.svm_regression_predict",
            "SVM Regression Predict",
            algorithm_tag="svm_regression",
            extra_params=[_param("cacheSize", "Cache Size", "number", default_value=200, min=1)],
        ),
        _tabular_predict_alias_node(
            "tabular.random_forest_regression_predict",
            "Random Forest Regression Predict",
            algorithm_tag="random_forest_regression",
            extra_params=[_param("nJobs", "N Jobs", "number", default_value=1, min=1, step=1)],
        ),
        WorkflowCatalogItem(
            type="custom.api_predict",
            label="Custom API Predict",
            category="inference",
            description=(
                "Send a table to an external HTTP API model and merge the prediction result back."
            ),
            runtime_kind="inference",
            supported_tasks=["custom_api_prediction"],
            tags=["table", "prediction", "custom", "api", "boundary", "provider_http_api"],
            inputs=[
                _port("model", "Custom Model", "model_version"),
                _port("table", "Input Table", "table", required=True),
            ],
            outputs=[_port("table", "Prediction Table", "table")],
            params=[
                _param("modelVersionId", "Custom Model", "modelVersion"),
                _param("predictionColumn", "Prediction Column", "text", default_value="prediction"),
                _param(
                    "callParametersJson",
                    "Call Parameters JSON",
                    "text",
                    default_value="{}",
                    placeholder='{"threshold": 0.5}',
                ),
            ],
            output_contracts=[
                _contract(
                    "table",
                    "Prediction table with the configured prediction column appended.",
                    produced_columns=["feature_a", "feature_b", "prediction"],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="custom.api_train_samples",
            label="Custom API Train Samples",
            category="inference",
            description=(
                "Send training samples to an external HTTP API and persist the "
                "returned model as a reusable custom API model version."
            ),
            runtime_kind="inference",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["samples", "training", "custom", "api", "boundary", "provider_http_api"],
            inputs=[
                _port("trainSamples", "Train Samples", "sample_set", required=True),
                _port("validationSamples", "Validation Samples", "sample_set"),
            ],
            outputs=[
                _port("model", "Custom Model", "model_version"),
                _port("artifact", "Artifact", "artifact"),
            ],
            params=[
                _param(
                    "taskType",
                    "Task Type",
                    "select",
                    required=True,
                    options=[
                        ("image_classification", "Image Classification"),
                        ("semantic_segmentation", "Semantic Segmentation"),
                        ("instance_segmentation", "Instance Segmentation"),
                        ("object_detection", "Object Detection"),
                    ],
                ),
                _param(
                    "outputModelName", "Output Model Name", "text", default_value="Custom API Model"
                ),
                _param("outputModelVersion", "Output Model Version", "text", default_value="1.0.0"),
                _param("predictionEndpointUrl", "Prediction Endpoint URL", "text", required=True),
                _param("trainingEndpointUrl", "Training Endpoint URL", "text"),
                _param(
                    "authType",
                    "Auth Type",
                    "select",
                    default_value="none",
                    required=True,
                    options=[("none", "None"), ("bearer", "Bearer"), ("header", "Custom Header")],
                ),
                _param("authToken", "Auth Token", "text"),
                _param("authHeaderName", "Auth Header Name", "text"),
                _param(
                    "timeoutSeconds", "Timeout Seconds", "number", default_value=45, min=1, step=1
                ),
                _param(
                    "responseMode",
                    "Response Mode",
                    "select",
                    default_value="prediction_values",
                    required=True,
                    options=[
                        ("prediction_values", "Prediction Values"),
                        ("prediction_masks", "Prediction Masks"),
                        ("prediction_vectors", "Prediction Vectors"),
                    ],
                ),
                _param(
                    "defaultPredictionColumn",
                    "Default Prediction Column",
                    "text",
                    default_value="prediction",
                ),
                _param(
                    "callParametersJson",
                    "Call Parameters JSON",
                    "text",
                    default_value="{}",
                    placeholder='{"threshold": 0.5}',
                ),
            ],
            input_contracts=[
                _contract(
                    "trainSamples",
                    "Labeled training sample set built from image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
                _contract(
                    "validationSamples",
                    (
                        "Optional labeled validation sample set aligned to the "
                        "same task semantics as the training samples."
                    ),
                    sample_kinds=["image_tile", "geospatial_tile"],
                ),
            ],
            output_behaviors=[
                _output_behavior(
                    "model",
                    preview_kinds=["model_version"],
                    usages=[_output_usage("workflow", "model_version")],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="custom.api_predict_samples",
            label="Custom API Predict Samples",
            category="inference",
            description=(
                "Send a sample set to an external HTTP API model and return a prediction set."
            ),
            runtime_kind="inference",
            supported_tasks=["sample_dataset", "custom_api_prediction"],
            tags=["samples", "prediction", "custom", "api", "boundary", "provider_http_api"],
            inputs=[
                _port("model", "Custom Model", "model_version"),
                _port("samples", "Sample Set", "sample_set", required=True),
            ],
            outputs=[_port("predictions", "Prediction Set", "prediction_set")],
            params=[
                _param("modelVersionId", "Custom Model", "modelVersion"),
                _param(
                    "callParametersJson",
                    "Call Parameters JSON",
                    "text",
                    default_value="{}",
                    placeholder='{"threshold": 0.5}',
                ),
            ],
            input_contracts=[
                _contract(
                    "samples",
                    "Sample set built from image tiles or geospatial tiles.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
            output_contracts=[
                _contract(
                    "predictions",
                    "Prediction set preserving the upstream sample grid semantics.",
                    sample_kinds=["image_tile", "geospatial_tile"],
                )
            ],
            starter_bindings=[_starter_binding("model_version", "modelVersionId")],
        ),
        WorkflowCatalogItem(
            type="metrics.validate_regression",
            label="Regression Validation",
            category="postprocess",
            description=(
                "Compare prediction and ground-truth tables and compute regression metrics."
            ),
            runtime_kind="transform",
            supported_tasks=["tabular_validation"],
            tags=["validation", "metrics", "regression"],
            inputs=[
                _port("predictionTable", "Prediction Table", "table", required=True),
                _port("groundTruthTable", "Ground Truth Table", "table", required=True),
            ],
            outputs=[_port("report", "Metrics Report", "metrics_report")],
            params=[
                _param(
                    "predictionColumn",
                    "Prediction Column",
                    "text",
                    default_value="prediction",
                    required=True,
                ),
                _param(
                    "groundTruthColumn",
                    "Ground Truth Column",
                    "text",
                    default_value="target",
                    required=True,
                ),
                _param(
                    "metrics",
                    "Metrics",
                    "multiselect",
                    default_value=["r2", "rmse", "mae"],
                    options=[
                        ("r2", "R2"),
                        ("rmse", "RMSE"),
                        ("mae", "MAE"),
                        ("mse", "MSE"),
                        ("mape", "MAPE"),
                    ],
                ),
            ],
            input_contracts=[
                _contract(
                    "predictionTable",
                    "Prediction table containing the configured prediction column.",
                    column_requirements=["prediction"],
                    sample_columns=["feature_a", "feature_b", "prediction"],
                ),
                _contract(
                    "groundTruthTable",
                    "Ground-truth table containing the configured target column.",
                    column_requirements=["target"],
                    sample_columns=["feature_a", "feature_b", "target"],
                ),
            ],
            output_contracts=[
                _contract(
                    "report",
                    "Regression metrics report with metric/value rows.",
                    produced_columns=["metric", "value"],
                )
            ],
            example_outputs=[
                _example(
                    "Regression metrics preview",
                    "table",
                    port_key="report",
                    columns=["metric", "value"],
                    rows=[
                        {"metric": "r2", "value": 0.94},
                        {"metric": "rmse", "value": 1.27},
                        {"metric": "mae", "value": 0.83},
                    ],
                )
            ],
            common_errors=[
                "predictionColumn must exist on the prediction table.",
                "groundTruthColumn must exist on the ground-truth table.",
            ],
        ),
        WorkflowCatalogItem(
            type="model.save_trained_model",
            label="Save Trained Model",
            category="postprocess",
            description="Persist a trained model into private model assets.",
            runtime_kind="export",
            supported_tasks=["tabular_training"],
            tags=["model", "save", "asset", "boundary", "persistence"],
            inputs=[_port("model", "Trained Model", "model_ref", required=True)],
            outputs=[
                _port("model", "Model Version", "model_version"),
                _port("artifact", "Artifact", "artifact"),
            ],
            params=[
                _param("saveToPlatform", "Save To Platform", "boolean", default_value=True),
                _param(
                    "outputModelName", "Output Model Name", "text", default_value="Trained Model"
                ),
                _param("outputModelVersion", "Output Model Version", "text", default_value="1.0.0"),
            ],
            output_behaviors=[
                _output_behavior(
                    "model",
                    preview_kinds=["model_version"],
                    usages=[_output_usage("workflow", "model_version")],
                )
            ],
        ),
        WorkflowCatalogItem(
            type="export.table",
            label="Export Table",
            category="postprocess",
            description=(
                "Write the current table to CSV and optionally persist it back to the platform."
            ),
            runtime_kind="export",
            supported_tasks=["tabular_prediction", "tabular_validation"],
            tags=["export", "table", "csv", "boundary", "persistence"],
            inputs=[_port("input", "Table Input", "table", required=True)],
            outputs=[_port("artifact", "Artifact", "artifact")],
            params=[
                _param("saveToPlatform", "Save To Platform", "boolean", default_value=True),
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Prediction Output",
                ),
            ],
        ),
        WorkflowCatalogItem(
            type="export.metrics",
            label="Export Metrics",
            category="postprocess",
            description=(
                "Write a metrics report to JSON or CSV and optionally persist "
                "it back to the platform."
            ),
            runtime_kind="export",
            supported_tasks=["tabular_validation"],
            tags=["export", "metrics", "report", "boundary", "persistence"],
            inputs=[_port("input", "Metrics Input", "metrics_report", required=True)],
            outputs=[_port("artifact", "Artifact", "artifact")],
            params=[
                _param("saveToPlatform", "Save To Platform", "boolean", default_value=True),
                _param(
                    "outputDatasetName",
                    "Output Dataset Name",
                    "text",
                    default_value="Validation Metrics",
                ),
                _param(
                    "format",
                    "Format",
                    "select",
                    default_value="json",
                    required=True,
                    options=[("json", "JSON"), ("csv", "CSV")],
                ),
            ],
        ),
    ]


BUILTIN_NODE_CATALOG: list[WorkflowCatalogItem] = [
    _normalize_catalog_item(item)
    for item in [
        *_source_nodes(),
        *_geo_nodes(),
        *_load_nodes(),
        *_sample_nodes(),
        *_control_nodes(),
        *_tabular_nodes(),
    ]
]


BUILTIN_NODE_DEFINITIONS: dict[str, WorkflowCatalogItem] = {
    item.type: item for item in BUILTIN_NODE_CATALOG
}


def catalog_definition(node_type: str) -> WorkflowCatalogItem:
    try:
        return BUILTIN_NODE_DEFINITIONS[node_type]
    except KeyError as exc:
        raise LookupError(f"Workflow node type is not defined: {node_type}") from exc


def supported_node_types() -> set[str]:
    return set(BUILTIN_NODE_DEFINITIONS)


def _node_default_params(definition: WorkflowCatalogItem) -> dict[str, object]:
    defaults: dict[str, object] = {}
    for field in definition.params:
        if field.default_value is not None:
            defaults[field.key] = field.default_value
    return defaults


def _node(
    node_id: str,
    node_type: str,
    x: float,
    y: float,
    *,
    params: dict[str, object] | None = None,
    input_bindings: dict[str, str] | None = None,
) -> WorkflowNode:
    definition = BUILTIN_NODE_DEFINITIONS[node_type]
    return WorkflowNode(
        id=node_id,
        type=node_type,
        position={"x": x, "y": y},
        params={**_node_default_params(definition), **(params or {})},
        input_bindings=input_bindings or {},
        output_defs=[port.model_copy(deep=True) for port in definition.outputs],
    )


BUILTIN_WORKFLOW_TEMPLATES: list[WorkflowTemplateDefinition] = [
    WorkflowTemplateDefinition(
        id="sentinel2.single_scene_download",
        label="Sentinel-2 Single Scene Download",
        description="Download a Sentinel-2 scene into a private raster dataset version.",
        tags=["sentinel2", "gee", "download", "raster"],
        supported_tasks=["geospatial_collection"],
        graph=WorkflowGraph(
            nodes=[
                _node(
                    "sentinel-source",
                    "source.sentinel2_gee_download",
                    80,
                    160,
                    params={
                        "roiMode": "bbox",
                        "bbox": "116.10,39.70,116.65,40.10",
                        "startDate": "2025-06-01",
                        "endDate": "2025-06-30",
                        "maxCloudCover": 20,
                        "bands": ["B4", "B3", "B2"],
                        "scale": 10,
                        "credentialMode": "platform_default",
                        "outputDatasetName": "Sentinel-2 Scene",
                    },
                )
            ],
            edges=[],
        ),
    ),
    WorkflowTemplateDefinition(
        id="geo.query_fetch_scene",
        label="Query And Fetch Scene",
        description=(
            "Define an ROI, query a raster collection, select a scene, and fetch it as a dataset."
        ),
        tags=["geo", "scene", "fetch"],
        supported_tasks=["geospatial_collection"],
        graph=WorkflowGraph(
            nodes=[
                _node(
                    "roi",
                    "geo.define_bbox_roi",
                    80,
                    160,
                    params={"bbox": "116.10,39.70,116.65,40.10"},
                ),
                _node(
                    "query",
                    "geo.query_raster_collection",
                    320,
                    160,
                    input_bindings={"roi": "roi:roi"},
                ),
                _node(
                    "filter",
                    "geo.filter_scene_collection",
                    580,
                    160,
                    input_bindings={"collection": "query:collection"},
                    params={"filtersJson": '[{"field":"cloud_cover","op":"<=","value":20}]'},
                ),
                _node(
                    "sort",
                    "geo.sort_scene_collection",
                    860,
                    160,
                    input_bindings={"collection": "filter:collection"},
                    params={"field": "cloud_cover", "order": "asc"},
                ),
                _node(
                    "select",
                    "geo.select_scene",
                    1120,
                    160,
                    input_bindings={"collection": "sort:collection"},
                    params={"selectionMode": "first", "index": 0},
                ),
                _node(
                    "fetch",
                    "geo.fetch_scene_as_dataset",
                    1380,
                    160,
                    input_bindings={"scene": "select:scene"},
                    params={"outputDatasetName": "Queried Scene"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1", source="roi", target="query", source_handle="roi", target_handle="roi"
                ),
                WorkflowEdge(
                    id="e2",
                    source="query",
                    target="filter",
                    source_handle="collection",
                    target_handle="collection",
                ),
                WorkflowEdge(
                    id="e3",
                    source="filter",
                    target="sort",
                    source_handle="collection",
                    target_handle="collection",
                ),
                WorkflowEdge(
                    id="e4",
                    source="sort",
                    target="select",
                    source_handle="collection",
                    target_handle="collection",
                ),
                WorkflowEdge(
                    id="e5",
                    source="select",
                    target="fetch",
                    source_handle="scene",
                    target_handle="scene",
                ),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="sample.geo_raster_with_vector_labels",
        label="Geo Raster Samples With Vector Labels",
        description=(
            "Load a geo raster and vector labels, patchify them, split "
            "samples, and package a dataset bundle."
        ),
        tags=["sample", "raster", "vector", "dataset"],
        supported_tasks=["sample_dataset"],
        graph=WorkflowGraph(
            nodes=[
                _node("image-source", "source.dataset_version", 80, 100),
                _node("label-source", "source.dataset_version", 80, 320),
                _node(
                    "load-raster",
                    "raster.load_georaster",
                    300,
                    100,
                    input_bindings={"dataset": "image-source:dataset"},
                ),
                _node(
                    "patchify",
                    "rgb.patchify_raster",
                    540,
                    100,
                    input_bindings={"raster": "load-raster:raster"},
                ),
                _node(
                    "load-features",
                    "vector.load_features",
                    300,
                    320,
                    input_bindings={"dataset": "label-source:dataset"},
                ),
                _node(
                    "rasterize-labels",
                    "label.rasterize_features_to_tiles",
                    800,
                    220,
                    input_bindings={
                        "tiles": "patchify:tiles",
                        "features": "load-features:features",
                    },
                ),
                _node(
                    "filter-labels",
                    "label.filter_by_coverage",
                    1060,
                    220,
                    input_bindings={"labels": "rasterize-labels:labels"},
                    params={"skipEmptyLabel": False, "minLabelCoverage": 0},
                ),
                _node(
                    "build-samples",
                    "dataset.build_samples",
                    1320,
                    180,
                    input_bindings={"tiles": "patchify:tiles", "labels": "filter-labels:labels"},
                ),
                _node(
                    "split-samples",
                    "dataset.split_samples",
                    1580,
                    180,
                    input_bindings={"samples": "build-samples:samples"},
                ),
                _node(
                    "package",
                    "artifact.package_dataset_bundle",
                    1840,
                    180,
                    input_bindings={
                        "trainSamples": "split-samples:trainSamples",
                        "valSamples": "split-samples:valSamples",
                        "testSamples": "split-samples:testSamples",
                    },
                ),
                _node(
                    "save-artifact",
                    "export.artifact_to_dataset_version",
                    2100,
                    180,
                    input_bindings={"artifact": "package:artifact"},
                    params={"outputDatasetName": "Geo Raster Sample Dataset"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="image-source",
                    target="load-raster",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-raster",
                    target="patchify",
                    source_handle="raster",
                    target_handle="raster",
                ),
                WorkflowEdge(
                    id="e3",
                    source="label-source",
                    target="load-features",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="patchify",
                    target="rasterize-labels",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e5",
                    source="load-features",
                    target="rasterize-labels",
                    source_handle="features",
                    target_handle="features",
                ),
                WorkflowEdge(
                    id="e6",
                    source="rasterize-labels",
                    target="filter-labels",
                    source_handle="labels",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e7",
                    source="patchify",
                    target="build-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e8",
                    source="filter-labels",
                    target="build-samples",
                    source_handle="labels",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e9",
                    source="build-samples",
                    target="split-samples",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e10",
                    source="split-samples",
                    target="package",
                    source_handle="trainSamples",
                    target_handle="trainSamples",
                ),
                WorkflowEdge(
                    id="e11",
                    source="split-samples",
                    target="package",
                    source_handle="valSamples",
                    target_handle="valSamples",
                ),
                WorkflowEdge(
                    id="e12",
                    source="split-samples",
                    target="package",
                    source_handle="testSamples",
                    target_handle="testSamples",
                ),
                WorkflowEdge(
                    id="e13",
                    source="package",
                    target="save-artifact",
                    source_handle="artifact",
                    target_handle="artifact",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("image-source", datasetVersionId=SEED_RASTER_DATASET_VERSION_ID),
            _sample_binding("label-source", datasetVersionId=SEED_VECTOR_DATASET_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="sample.image_collection_tiles",
        label="Image Collection Patch Dataset",
        description=(
            "Load normal RGB images, cut them into tiles, and package them as a dataset bundle."
        ),
        tags=["sample", "image", "patch", "dataset"],
        supported_tasks=["sample_dataset"],
        graph=WorkflowGraph(
            nodes=[
                _node("image-source", "source.dataset_version", 80, 160),
                _node(
                    "load-images",
                    "image.load_image_collection",
                    300,
                    160,
                    input_bindings={"dataset": "image-source:dataset"},
                ),
                _node(
                    "patchify",
                    "rgb.patchify_image_collection",
                    560,
                    160,
                    input_bindings={"images": "load-images:images"},
                ),
                _node(
                    "build-samples",
                    "dataset.build_samples",
                    820,
                    160,
                    input_bindings={"tiles": "patchify:tiles"},
                ),
                _node(
                    "package",
                    "artifact.package_dataset_bundle",
                    1080,
                    160,
                    input_bindings={"samples": "build-samples:samples"},
                ),
                _node(
                    "save-artifact",
                    "export.artifact_to_dataset_version",
                    1340,
                    160,
                    input_bindings={"artifact": "package:artifact"},
                    params={"outputDatasetName": "Image Tile Dataset"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="image-source",
                    target="load-images",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-images",
                    target="patchify",
                    source_handle="images",
                    target_handle="images",
                ),
                WorkflowEdge(
                    id="e3",
                    source="patchify",
                    target="build-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e4",
                    source="build-samples",
                    target="package",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e5",
                    source="package",
                    target="save-artifact",
                    source_handle="artifact",
                    target_handle="artifact",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "image-source", datasetVersionId=SEED_IMAGE_COLLECTION_DATASET_VERSION_ID
            ),
        ],
    ),
    WorkflowTemplateDefinition(
        id="sample.image_classification_from_features",
        label="Image Classification Samples From Features",
        description=(
            "Load RGB images, patchify them, project feature class labels to "
            "tiles, and package a classification sample dataset."
        ),
        tags=["sample", "image", "classification", "dataset"],
        supported_tasks=["sample_dataset"],
        graph=WorkflowGraph(
            nodes=[
                _node("image-source", "source.dataset_version", 80, 120),
                _node("label-source", "source.dataset_version", 80, 340),
                _node(
                    "load-images",
                    "image.load_image_collection",
                    320,
                    120,
                    input_bindings={"dataset": "image-source:dataset"},
                ),
                _node(
                    "patchify",
                    "rgb.patchify_image_collection",
                    580,
                    120,
                    input_bindings={"images": "load-images:images"},
                ),
                _node(
                    "load-features",
                    "vector.load_features",
                    320,
                    340,
                    input_bindings={"dataset": "label-source:dataset"},
                ),
                _node(
                    "annotate",
                    "annotation.project_features_to_tile_classes",
                    860,
                    240,
                    input_bindings={
                        "tiles": "patchify:tiles",
                        "features": "load-features:features",
                    },
                    params={"classProperty": "class"},
                ),
                _node(
                    "build-samples",
                    "dataset.build_samples",
                    1140,
                    180,
                    input_bindings={"tiles": "patchify:tiles", "labels": "annotate:annotations"},
                ),
                _node(
                    "split-samples",
                    "dataset.split_samples",
                    1400,
                    180,
                    input_bindings={"samples": "build-samples:samples"},
                ),
                _node(
                    "package",
                    "artifact.package_dataset_bundle",
                    1660,
                    180,
                    input_bindings={
                        "trainSamples": "split-samples:trainSamples",
                        "valSamples": "split-samples:valSamples",
                        "testSamples": "split-samples:testSamples",
                    },
                ),
                _node(
                    "save-artifact",
                    "export.artifact_to_dataset_version",
                    1920,
                    180,
                    input_bindings={"artifact": "package:artifact"},
                    params={"outputDatasetName": "Image Classification Sample Dataset"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="image-source",
                    target="load-images",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-images",
                    target="patchify",
                    source_handle="images",
                    target_handle="images",
                ),
                WorkflowEdge(
                    id="e3",
                    source="label-source",
                    target="load-features",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="patchify",
                    target="annotate",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e5",
                    source="load-features",
                    target="annotate",
                    source_handle="features",
                    target_handle="features",
                ),
                WorkflowEdge(
                    id="e6",
                    source="patchify",
                    target="build-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e7",
                    source="annotate",
                    target="build-samples",
                    source_handle="annotations",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e8",
                    source="build-samples",
                    target="split-samples",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e9",
                    source="split-samples",
                    target="package",
                    source_handle="trainSamples",
                    target_handle="trainSamples",
                ),
                WorkflowEdge(
                    id="e10",
                    source="split-samples",
                    target="package",
                    source_handle="valSamples",
                    target_handle="valSamples",
                ),
                WorkflowEdge(
                    id="e11",
                    source="split-samples",
                    target="package",
                    source_handle="testSamples",
                    target_handle="testSamples",
                ),
                WorkflowEdge(
                    id="e12",
                    source="package",
                    target="save-artifact",
                    source_handle="artifact",
                    target_handle="artifact",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "image-source", datasetVersionId=SEED_IMAGE_COLLECTION_DATASET_VERSION_ID
            ),
            _sample_binding("label-source", datasetVersionId=SEED_VECTOR_DATASET_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="sample.instance_polygons_from_features",
        label="Instance Polygon Samples From Features",
        description=(
            "Load RGB images, patchify them, project feature polygons to "
            "tiles, and package an instance-segmentation sample dataset."
        ),
        tags=["sample", "image", "instance", "dataset"],
        supported_tasks=["sample_dataset"],
        graph=WorkflowGraph(
            nodes=[
                _node("image-source", "source.dataset_version", 80, 120),
                _node("label-source", "source.dataset_version", 80, 340),
                _node(
                    "load-images",
                    "image.load_image_collection",
                    320,
                    120,
                    input_bindings={"dataset": "image-source:dataset"},
                ),
                _node(
                    "patchify",
                    "rgb.patchify_image_collection",
                    580,
                    120,
                    input_bindings={"images": "load-images:images"},
                ),
                _node(
                    "load-features",
                    "vector.load_features",
                    320,
                    340,
                    input_bindings={"dataset": "label-source:dataset"},
                ),
                _node(
                    "annotate",
                    "annotation.project_features_to_tile_polygons",
                    860,
                    240,
                    input_bindings={
                        "tiles": "patchify:tiles",
                        "features": "load-features:features",
                    },
                    params={"classProperty": "class"},
                ),
                _node(
                    "build-samples",
                    "dataset.build_samples",
                    1140,
                    180,
                    input_bindings={"tiles": "patchify:tiles", "labels": "annotate:annotations"},
                ),
                _node(
                    "split-samples",
                    "dataset.split_samples",
                    1400,
                    180,
                    input_bindings={"samples": "build-samples:samples"},
                ),
                _node(
                    "package",
                    "artifact.package_dataset_bundle",
                    1660,
                    180,
                    input_bindings={
                        "trainSamples": "split-samples:trainSamples",
                        "valSamples": "split-samples:valSamples",
                        "testSamples": "split-samples:testSamples",
                    },
                ),
                _node(
                    "save-artifact",
                    "export.artifact_to_dataset_version",
                    1920,
                    180,
                    input_bindings={"artifact": "package:artifact"},
                    params={"outputDatasetName": "Instance Polygon Sample Dataset"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="image-source",
                    target="load-images",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-images",
                    target="patchify",
                    source_handle="images",
                    target_handle="images",
                ),
                WorkflowEdge(
                    id="e3",
                    source="label-source",
                    target="load-features",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="patchify",
                    target="annotate",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e5",
                    source="load-features",
                    target="annotate",
                    source_handle="features",
                    target_handle="features",
                ),
                WorkflowEdge(
                    id="e6",
                    source="patchify",
                    target="build-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e7",
                    source="annotate",
                    target="build-samples",
                    source_handle="annotations",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e8",
                    source="build-samples",
                    target="split-samples",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e9",
                    source="split-samples",
                    target="package",
                    source_handle="trainSamples",
                    target_handle="trainSamples",
                ),
                WorkflowEdge(
                    id="e10",
                    source="split-samples",
                    target="package",
                    source_handle="valSamples",
                    target_handle="valSamples",
                ),
                WorkflowEdge(
                    id="e11",
                    source="split-samples",
                    target="package",
                    source_handle="testSamples",
                    target_handle="testSamples",
                ),
                WorkflowEdge(
                    id="e12",
                    source="package",
                    target="save-artifact",
                    source_handle="artifact",
                    target_handle="artifact",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "image-source", datasetVersionId=SEED_IMAGE_COLLECTION_DATASET_VERSION_ID
            ),
            _sample_binding("label-source", datasetVersionId=SEED_VECTOR_DATASET_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="custom_api.semantic_segmentation_train_predict",
        label="Custom API Semantic Segmentation Train And Predict",
        description=(
            "Build segmentation samples, train a reusable custom API model, "
            "then run prediction on a separate raster dataset and export the "
            "predictions."
        ),
        tags=["custom_api", "training", "prediction", "segmentation"],
        supported_tasks=["sample_dataset", "custom_api_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("train-image-source", "source.dataset_version", 80, 100),
                _node("label-source", "source.dataset_version", 80, 320),
                _node("infer-image-source", "source.dataset_version", 80, 620),
                _node(
                    "load-train-raster",
                    "raster.load_georaster",
                    320,
                    100,
                    input_bindings={"dataset": "train-image-source:dataset"},
                ),
                _node(
                    "patchify-train",
                    "rgb.patchify_raster",
                    580,
                    100,
                    input_bindings={"raster": "load-train-raster:raster"},
                ),
                _node(
                    "load-features",
                    "vector.load_features",
                    320,
                    320,
                    input_bindings={"dataset": "label-source:dataset"},
                ),
                _node(
                    "rasterize-labels",
                    "label.rasterize_features_to_tiles",
                    860,
                    220,
                    input_bindings={
                        "tiles": "patchify-train:tiles",
                        "features": "load-features:features",
                    },
                ),
                _node(
                    "filter-labels",
                    "label.filter_by_coverage",
                    1120,
                    220,
                    input_bindings={"labels": "rasterize-labels:labels"},
                    params={"skipEmptyLabel": False, "minLabelCoverage": 0},
                ),
                _node(
                    "build-train-samples",
                    "dataset.build_samples",
                    1380,
                    180,
                    input_bindings={
                        "tiles": "patchify-train:tiles",
                        "labels": "filter-labels:labels",
                    },
                ),
                _node(
                    "split-samples",
                    "dataset.split_samples",
                    1640,
                    180,
                    input_bindings={"samples": "build-train-samples:samples"},
                ),
                _node(
                    "train-model",
                    "custom.api_train_samples",
                    1920,
                    180,
                    input_bindings={
                        "trainSamples": "split-samples:trainSamples",
                        "validationSamples": "split-samples:valSamples",
                    },
                    params={
                        "taskType": "semantic_segmentation",
                        "outputModelName": "Custom API Segmentation Model",
                        "outputModelVersion": "1.0.0",
                        "predictionEndpointUrl": "https://example.com/predict",
                        "trainingEndpointUrl": "https://example.com/train",
                        "authType": "header",
                        "authToken": "secret-token",
                        "authHeaderName": "X-API-Key",
                        "timeoutSeconds": 45,
                        "responseMode": "prediction_masks",
                        "defaultPredictionColumn": "prediction",
                        "callParametersJson": '{"threshold": 0.5}',
                    },
                ),
                _node(
                    "load-infer-raster",
                    "raster.load_georaster",
                    320,
                    620,
                    input_bindings={"dataset": "infer-image-source:dataset"},
                ),
                _node(
                    "patchify-infer",
                    "rgb.patchify_raster",
                    580,
                    620,
                    input_bindings={"raster": "load-infer-raster:raster"},
                ),
                _node(
                    "build-infer-samples",
                    "dataset.build_samples",
                    860,
                    620,
                    input_bindings={"tiles": "patchify-infer:tiles"},
                ),
                _node(
                    "predict",
                    "custom.api_predict_samples",
                    2180,
                    400,
                    input_bindings={
                        "model": "train-model:model",
                        "samples": "build-infer-samples:samples",
                    },
                    params={"callParametersJson": '{"threshold": 0.5}'},
                ),
                _node(
                    "export-predictions",
                    "export.prediction_set_to_dataset_version",
                    2440,
                    400,
                    input_bindings={"predictions": "predict:predictions"},
                    params={"outputDatasetName": "Segmentation Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="train-image-source",
                    target="load-train-raster",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-train-raster",
                    target="patchify-train",
                    source_handle="raster",
                    target_handle="raster",
                ),
                WorkflowEdge(
                    id="e3",
                    source="label-source",
                    target="load-features",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="patchify-train",
                    target="rasterize-labels",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e5",
                    source="load-features",
                    target="rasterize-labels",
                    source_handle="features",
                    target_handle="features",
                ),
                WorkflowEdge(
                    id="e6",
                    source="rasterize-labels",
                    target="filter-labels",
                    source_handle="labels",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e7",
                    source="patchify-train",
                    target="build-train-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e8",
                    source="filter-labels",
                    target="build-train-samples",
                    source_handle="labels",
                    target_handle="labels",
                ),
                WorkflowEdge(
                    id="e9",
                    source="build-train-samples",
                    target="split-samples",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e10",
                    source="split-samples",
                    target="train-model",
                    source_handle="trainSamples",
                    target_handle="trainSamples",
                ),
                WorkflowEdge(
                    id="e11",
                    source="split-samples",
                    target="train-model",
                    source_handle="valSamples",
                    target_handle="validationSamples",
                ),
                WorkflowEdge(
                    id="e12",
                    source="infer-image-source",
                    target="load-infer-raster",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e13",
                    source="load-infer-raster",
                    target="patchify-infer",
                    source_handle="raster",
                    target_handle="raster",
                ),
                WorkflowEdge(
                    id="e14",
                    source="patchify-infer",
                    target="build-infer-samples",
                    source_handle="tiles",
                    target_handle="tiles",
                ),
                WorkflowEdge(
                    id="e15",
                    source="train-model",
                    target="predict",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e16",
                    source="build-infer-samples",
                    target="predict",
                    source_handle="samples",
                    target_handle="samples",
                ),
                WorkflowEdge(
                    id="e17",
                    source="predict",
                    target="export-predictions",
                    source_handle="predictions",
                    target_handle="predictions",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("train-image-source", datasetVersionId=SEED_RASTER_DATASET_VERSION_ID),
            _sample_binding("label-source", datasetVersionId=SEED_VECTOR_DATASET_VERSION_ID),
            _sample_binding("infer-image-source", datasetVersionId=SEED_RASTER_DATASET_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="control.conditional_table_source",
        label="Conditional Table Source",
        description=(
            "Use compare, not, guard, and coalesce primitives to choose one of "
            "two table datasets before loading and exporting the selected "
            "table."
        ),
        tags=["control", "branch", "tabular"],
        supported_tasks=["control_flow", "generic_control", "tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("flag", "control.boolean_literal", 80, 160, params={"value": True}),
                _node(
                    "is-primary",
                    "control.compare",
                    320,
                    160,
                    input_bindings={"left": "flag:value"},
                    params={"operator": "eq", "rightValueJson": "true"},
                ),
                _node(
                    "is-fallback",
                    "control.not",
                    560,
                    280,
                    input_bindings={"value": "is-primary:result"},
                ),
                _node("primary-source", "source.dataset_version", 80, 20),
                _node("fallback-source", "source.dataset_version", 80, 380),
                _node(
                    "primary-guard",
                    "control.guard",
                    820,
                    20,
                    input_bindings={
                        "enabled": "is-primary:result",
                        "payload": "primary-source:dataset",
                    },
                ),
                _node(
                    "fallback-guard",
                    "control.guard",
                    820,
                    380,
                    input_bindings={
                        "enabled": "is-fallback:result",
                        "payload": "fallback-source:dataset",
                    },
                ),
                _node(
                    "selected-source",
                    "control.coalesce",
                    1080,
                    200,
                    input_bindings={
                        "primary": "primary-guard:payload",
                        "fallback": "fallback-guard:payload",
                    },
                ),
                _node(
                    "load-table",
                    "table.load_csv",
                    1340,
                    200,
                    input_bindings={"dataset": "selected-source:output"},
                ),
                _node(
                    "export-table",
                    "export.table",
                    1600,
                    200,
                    input_bindings={"input": "load-table:table"},
                    params={"outputDatasetName": "Conditionally Selected Table"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="flag",
                    target="is-primary",
                    source_handle="value",
                    target_handle="left",
                ),
                WorkflowEdge(
                    id="e2",
                    source="is-primary",
                    target="is-fallback",
                    source_handle="result",
                    target_handle="value",
                ),
                WorkflowEdge(
                    id="e3",
                    source="primary-source",
                    target="primary-guard",
                    source_handle="dataset",
                    target_handle="payload",
                ),
                WorkflowEdge(
                    id="e4",
                    source="is-primary",
                    target="primary-guard",
                    source_handle="result",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e5",
                    source="fallback-source",
                    target="fallback-guard",
                    source_handle="dataset",
                    target_handle="payload",
                ),
                WorkflowEdge(
                    id="e6",
                    source="is-fallback",
                    target="fallback-guard",
                    source_handle="result",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e7",
                    source="primary-guard",
                    target="selected-source",
                    source_handle="payload",
                    target_handle="primary",
                ),
                WorkflowEdge(
                    id="e8",
                    source="fallback-guard",
                    target="selected-source",
                    source_handle="payload",
                    target_handle="fallback",
                ),
                WorkflowEdge(
                    id="e9",
                    source="selected-source",
                    target="load-table",
                    source_handle="output",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e10",
                    source="load-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "primary-source", datasetVersionId=SEED_TABULAR_INPUT_DATASET_VERSION_ID
            ),
            _sample_binding(
                "fallback-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
        ],
    ),
    WorkflowTemplateDefinition(
        id="control.subgraph_table_gate",
        label="Subgraph Table Gate",
        description=(
            "Wrap a guarded dataset branch inside workflow.call_subgraph, then "
            "load and export the selected table through the derived subgraph "
            "interface."
        ),
        tags=["control", "subgraph", "tabular"],
        supported_tasks=["control_flow", "generic_control", "tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("enabled", "control.boolean_literal", 80, 180, params={"value": True}),
                _node("table-source", "source.dataset_version", 80, 360),
                WorkflowNode(
                    id="branch",
                    type=CALL_SUBGRAPH_NODE_TYPE,
                    position={"x": 340, "y": 240},
                    params={},
                    input_bindings={
                        "enabled": "enabled:value",
                        "dataset": "table-source:dataset",
                    },
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-enabled",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[_port("enabled", "Enabled", "value", required=True)],
                                output_contracts=[
                                    _contract(
                                        "enabled",
                                        "Boolean enable flag for the guarded branch.",
                                        value_types=["boolean"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-dataset",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 260},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "dataset",
                                        "Dataset version handle entering the subgraph branch.",
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                            _node(
                                "guard",
                                "control.guard",
                                320,
                                180,
                                input_bindings={
                                    "enabled": "sub-enabled:enabled",
                                    "payload": "sub-dataset:dataset",
                                },
                            ),
                            WorkflowNode(
                                id="sub-output",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 620, "y": 180},
                                params={},
                                input_bindings={"dataset": "guard:payload"},
                                input_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                input_contracts=[
                                    _contract(
                                        "dataset",
                                        (
                                            "Dataset version handle emitted by "
                                            "the guarded subgraph branch."
                                        ),
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-enabled",
                                target="guard",
                                source_handle="enabled",
                                target_handle="enabled",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-dataset",
                                target="guard",
                                source_handle="dataset",
                                target_handle="payload",
                            ),
                            WorkflowEdge(
                                id="se3",
                                source="guard",
                                target="sub-output",
                                source_handle="payload",
                                target_handle="dataset",
                            ),
                        ],
                    ),
                ),
                _node(
                    "load-table",
                    "table.load_csv",
                    700,
                    240,
                    input_bindings={"dataset": "branch:dataset"},
                ),
                _node(
                    "export-table",
                    "export.table",
                    960,
                    240,
                    input_bindings={"input": "load-table:table"},
                    params={"outputDatasetName": "Subgraph Gated Table"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="enabled",
                    target="branch",
                    source_handle="value",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e2",
                    source="table-source",
                    target="branch",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e3",
                    source="branch",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="load-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("table-source", datasetVersionId=SEED_TABULAR_INPUT_DATASET_VERSION_ID)
        ],
    ),
    WorkflowTemplateDefinition(
        id="control.for_each_collect_values",
        label="For Each Collect Values",
        description=(
            "Iterate over a JSON value list with control.for_each and inspect "
            "the aggregated item and index outputs from the loop body."
        ),
        tags=["control", "loop", "value_list"],
        supported_tasks=["control_flow", "generic_control"],
        graph=WorkflowGraph(
            nodes=[
                _node(
                    "items",
                    "control.list_literal",
                    80,
                    220,
                    params={"itemsJson": '["tile-a", "tile-b", {"tile": "tile-c"}]'},
                ),
                WorkflowNode(
                    id="loop",
                    type=FOR_EACH_NODE_TYPE,
                    position={"x": 360, "y": 140},
                    params={},
                    input_bindings={"items": "items:items"},
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-item",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port(FOR_EACH_ITEM_PORT_KEY, "Item", "value", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        FOR_EACH_ITEM_PORT_KEY,
                                        "Current loop item.",
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-index",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 240},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port(FOR_EACH_INDEX_PORT_KEY, "Index", "value", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        FOR_EACH_INDEX_PORT_KEY,
                                        "Zero-based loop index.",
                                        value_types=["number"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="out-item",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 360, "y": 80},
                                params={},
                                input_bindings={"item": f"sub-item:{FOR_EACH_ITEM_PORT_KEY}"},
                                input_defs=[_port("item", "Item", "value", required=True)],
                                input_contracts=[
                                    _contract(
                                        "item",
                                        "Current loop item emitted by the body.",
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="out-index",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 360, "y": 240},
                                params={},
                                input_bindings={"index": f"sub-index:{FOR_EACH_INDEX_PORT_KEY}"},
                                input_defs=[_port("index", "Index", "value", required=True)],
                                input_contracts=[
                                    _contract(
                                        "index",
                                        "Zero-based loop index emitted by the body.",
                                        value_types=["number"],
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-item",
                                target="out-item",
                                source_handle=FOR_EACH_ITEM_PORT_KEY,
                                target_handle="item",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-index",
                                target="out-index",
                                source_handle=FOR_EACH_INDEX_PORT_KEY,
                                target_handle="index",
                            ),
                        ],
                    ),
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="items",
                    target="loop",
                    source_handle="items",
                    target_handle="items",
                )
            ],
        ),
        sample_bindings=[],
    ),
    WorkflowTemplateDefinition(
        id="control.if_else_table_subgraphs",
        label="If Else Table Subgraphs",
        description=(
            "Use two workflow.call_subgraph branches to model a strict if/else "
            "table selection before loading and exporting the chosen table."
        ),
        tags=["control", "branch", "subgraph", "tabular"],
        supported_tasks=["control_flow", "generic_control", "tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("flag", "control.boolean_literal", 80, 220, params={"value": True}),
                _node(
                    "is-fallback", "control.not", 320, 360, input_bindings={"value": "flag:value"}
                ),
                _node("primary-source", "source.dataset_version", 80, 80),
                _node("fallback-source", "source.dataset_version", 80, 520),
                WorkflowNode(
                    id="then-branch",
                    type=CALL_SUBGRAPH_NODE_TYPE,
                    position={"x": 560, "y": 120},
                    params={},
                    input_bindings={
                        "enabled": "flag:value",
                        "dataset": "primary-source:dataset",
                    },
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-enabled",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[_port("enabled", "Enabled", "value", required=True)],
                                output_contracts=[
                                    _contract(
                                        "enabled",
                                        "Boolean condition enabling the branch.",
                                        value_types=["boolean"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-dataset",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 240},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "dataset",
                                        "Table dataset entering the branch.",
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                            _node(
                                "guard",
                                "control.guard",
                                320,
                                160,
                                input_bindings={
                                    "enabled": "sub-enabled:enabled",
                                    "payload": "sub-dataset:dataset",
                                },
                            ),
                            WorkflowNode(
                                id="sub-output",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 620, "y": 160},
                                params={},
                                input_bindings={"dataset": "guard:payload"},
                                input_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                input_contracts=[
                                    _contract(
                                        "dataset",
                                        "Selected table dataset emitted by the branch.",
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-enabled",
                                target="guard",
                                source_handle="enabled",
                                target_handle="enabled",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-dataset",
                                target="guard",
                                source_handle="dataset",
                                target_handle="payload",
                            ),
                            WorkflowEdge(
                                id="se3",
                                source="guard",
                                target="sub-output",
                                source_handle="payload",
                                target_handle="dataset",
                            ),
                        ],
                    ),
                ),
                WorkflowNode(
                    id="else-branch",
                    type=CALL_SUBGRAPH_NODE_TYPE,
                    position={"x": 560, "y": 420},
                    params={},
                    input_bindings={
                        "enabled": "is-fallback:result",
                        "dataset": "fallback-source:dataset",
                    },
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-enabled",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[_port("enabled", "Enabled", "value", required=True)],
                                output_contracts=[
                                    _contract(
                                        "enabled",
                                        "Boolean condition enabling the branch.",
                                        value_types=["boolean"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-dataset",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 240},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "dataset",
                                        "Table dataset entering the branch.",
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                            _node(
                                "guard",
                                "control.guard",
                                320,
                                160,
                                input_bindings={
                                    "enabled": "sub-enabled:enabled",
                                    "payload": "sub-dataset:dataset",
                                },
                            ),
                            WorkflowNode(
                                id="sub-output",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 620, "y": 160},
                                params={},
                                input_bindings={"dataset": "guard:payload"},
                                input_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                input_contracts=[
                                    _contract(
                                        "dataset",
                                        "Selected table dataset emitted by the branch.",
                                        dataset_kinds=["table"],
                                        file_formats=["csv"],
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-enabled",
                                target="guard",
                                source_handle="enabled",
                                target_handle="enabled",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-dataset",
                                target="guard",
                                source_handle="dataset",
                                target_handle="payload",
                            ),
                            WorkflowEdge(
                                id="se3",
                                source="guard",
                                target="sub-output",
                                source_handle="payload",
                                target_handle="dataset",
                            ),
                        ],
                    ),
                ),
                _node(
                    "selected-dataset",
                    "control.coalesce",
                    1040,
                    300,
                    input_bindings={
                        "primary": "then-branch:dataset",
                        "fallback": "else-branch:dataset",
                    },
                ),
                _node(
                    "load-table",
                    "table.load_csv",
                    1300,
                    300,
                    input_bindings={"dataset": "selected-dataset:output"},
                ),
                _node(
                    "export-table",
                    "export.table",
                    1560,
                    300,
                    input_bindings={"input": "load-table:table"},
                    params={"outputDatasetName": "If Else Selected Table"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="flag",
                    target="is-fallback",
                    source_handle="value",
                    target_handle="value",
                ),
                WorkflowEdge(
                    id="e2",
                    source="flag",
                    target="then-branch",
                    source_handle="value",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e3",
                    source="primary-source",
                    target="then-branch",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="is-fallback",
                    target="else-branch",
                    source_handle="result",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e5",
                    source="fallback-source",
                    target="else-branch",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e6",
                    source="then-branch",
                    target="selected-dataset",
                    source_handle="dataset",
                    target_handle="primary",
                ),
                WorkflowEdge(
                    id="e7",
                    source="else-branch",
                    target="selected-dataset",
                    source_handle="dataset",
                    target_handle="fallback",
                ),
                WorkflowEdge(
                    id="e8",
                    source="selected-dataset",
                    target="load-table",
                    source_handle="output",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e9",
                    source="load-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "primary-source", datasetVersionId=SEED_TABULAR_INPUT_DATASET_VERSION_ID
            ),
            _sample_binding(
                "fallback-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
        ],
    ),
    WorkflowTemplateDefinition(
        id="control.if_else_sample_prediction_subgraphs",
        label="If Else Sample Prediction Subgraphs",
        description=(
            "Choose between two raster-to-prediction subgraphs, then merge the "
            "selected exported prediction dataset handle."
        ),
        tags=["control", "branch", "subgraph", "samples", "prediction"],
        supported_tasks=[
            "control_flow",
            "generic_control",
            "custom_api_prediction",
            "sample_dataset",
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("flag", "control.boolean_literal", 80, 320, params={"value": True}),
                _node(
                    "is-fallback", "control.not", 320, 460, input_bindings={"value": "flag:value"}
                ),
                _node("primary-source", "source.dataset_version", 80, 80),
                _node("fallback-source", "source.dataset_version", 80, 620),
                _node("model-source", "source.model_version", 80, 820),
                WorkflowNode(
                    id="then-branch",
                    type=CALL_SUBGRAPH_NODE_TYPE,
                    position={"x": 560, "y": 120},
                    params={},
                    input_bindings={
                        "enabled": "flag:value",
                        "dataset": "primary-source:dataset",
                        "model": "model-source:model",
                    },
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-enabled",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[_port("enabled", "Enabled", "value", required=True)],
                                output_contracts=[
                                    _contract(
                                        "enabled",
                                        "Boolean condition enabling the branch.",
                                        value_types=["boolean"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-dataset",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 260},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "dataset",
                                        "Raster dataset entering the branch.",
                                        dataset_kinds=["raster"],
                                        file_formats=["tif", "tiff"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-model",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 440},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("model", "Model", "model_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "model",
                                        "Custom API model version used for prediction.",
                                    )
                                ],
                            ),
                            _node(
                                "guard",
                                "control.guard",
                                280,
                                160,
                                input_bindings={
                                    "enabled": "sub-enabled:enabled",
                                    "payload": "sub-dataset:dataset",
                                },
                            ),
                            _node(
                                "load-raster",
                                "raster.load_georaster",
                                520,
                                160,
                                input_bindings={"dataset": "guard:payload"},
                            ),
                            _node(
                                "patchify",
                                "rgb.patchify_raster",
                                780,
                                160,
                                input_bindings={"raster": "load-raster:raster"},
                                params={
                                    "tileWidth": 256,
                                    "tileHeight": 256,
                                    "strideX": 256,
                                    "strideY": 256,
                                    "edgePolicy": "pad",
                                    "outputImageFormat": "png",
                                },
                            ),
                            _node(
                                "build-samples",
                                "dataset.build_samples",
                                1040,
                                160,
                                input_bindings={"tiles": "patchify:tiles"},
                            ),
                            _node(
                                "predict",
                                "custom.api_predict_samples",
                                1300,
                                160,
                                input_bindings={
                                    "samples": "build-samples:samples",
                                    "model": "sub-model:model",
                                },
                                params={"callParametersJson": "{}"},
                            ),
                            _node(
                                "export-predictions",
                                "export.prediction_set_to_dataset_version",
                                1560,
                                160,
                                input_bindings={"predictions": "predict:predictions"},
                                params={"outputDatasetName": "Primary Branch Predictions"},
                            ),
                            WorkflowNode(
                                id="sub-output",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 1840, "y": 160},
                                params={},
                                input_bindings={"dataset": "export-predictions:dataset"},
                                input_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                input_contracts=[
                                    _contract(
                                        "dataset",
                                        "Prediction dataset emitted by the active branch.",
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-enabled",
                                target="guard",
                                source_handle="enabled",
                                target_handle="enabled",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-dataset",
                                target="guard",
                                source_handle="dataset",
                                target_handle="payload",
                            ),
                            WorkflowEdge(
                                id="se3",
                                source="guard",
                                target="load-raster",
                                source_handle="payload",
                                target_handle="dataset",
                            ),
                            WorkflowEdge(
                                id="se4",
                                source="load-raster",
                                target="patchify",
                                source_handle="raster",
                                target_handle="raster",
                            ),
                            WorkflowEdge(
                                id="se5",
                                source="patchify",
                                target="build-samples",
                                source_handle="tiles",
                                target_handle="tiles",
                            ),
                            WorkflowEdge(
                                id="se6",
                                source="build-samples",
                                target="predict",
                                source_handle="samples",
                                target_handle="samples",
                            ),
                            WorkflowEdge(
                                id="se7",
                                source="sub-model",
                                target="predict",
                                source_handle="model",
                                target_handle="model",
                            ),
                            WorkflowEdge(
                                id="se8",
                                source="predict",
                                target="export-predictions",
                                source_handle="predictions",
                                target_handle="predictions",
                            ),
                            WorkflowEdge(
                                id="se9",
                                source="export-predictions",
                                target="sub-output",
                                source_handle="dataset",
                                target_handle="dataset",
                            ),
                        ],
                    ),
                ),
                WorkflowNode(
                    id="else-branch",
                    type=CALL_SUBGRAPH_NODE_TYPE,
                    position={"x": 560, "y": 500},
                    params={},
                    input_bindings={
                        "enabled": "is-fallback:result",
                        "dataset": "fallback-source:dataset",
                        "model": "model-source:model",
                    },
                    subgraph=WorkflowGraph(
                        nodes=[
                            WorkflowNode(
                                id="sub-enabled",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 80},
                                params={},
                                input_bindings={},
                                output_defs=[_port("enabled", "Enabled", "value", required=True)],
                                output_contracts=[
                                    _contract(
                                        "enabled",
                                        "Boolean condition enabling the branch.",
                                        value_types=["boolean"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-dataset",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 260},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "dataset",
                                        "Raster dataset entering the branch.",
                                        dataset_kinds=["raster"],
                                        file_formats=["tif", "tiff"],
                                    )
                                ],
                            ),
                            WorkflowNode(
                                id="sub-model",
                                type=SUBGRAPH_INPUT_NODE_TYPE,
                                position={"x": 40, "y": 440},
                                params={},
                                input_bindings={},
                                output_defs=[
                                    _port("model", "Model", "model_version", required=True)
                                ],
                                output_contracts=[
                                    _contract(
                                        "model",
                                        "Custom API model version used for prediction.",
                                    )
                                ],
                            ),
                            _node(
                                "guard",
                                "control.guard",
                                280,
                                160,
                                input_bindings={
                                    "enabled": "sub-enabled:enabled",
                                    "payload": "sub-dataset:dataset",
                                },
                            ),
                            _node(
                                "load-raster",
                                "raster.load_georaster",
                                520,
                                160,
                                input_bindings={"dataset": "guard:payload"},
                            ),
                            _node(
                                "patchify",
                                "rgb.patchify_raster",
                                780,
                                160,
                                input_bindings={"raster": "load-raster:raster"},
                                params={
                                    "tileWidth": 256,
                                    "tileHeight": 256,
                                    "strideX": 256,
                                    "strideY": 256,
                                    "edgePolicy": "pad",
                                    "outputImageFormat": "png",
                                },
                            ),
                            _node(
                                "build-samples",
                                "dataset.build_samples",
                                1040,
                                160,
                                input_bindings={"tiles": "patchify:tiles"},
                            ),
                            _node(
                                "predict",
                                "custom.api_predict_samples",
                                1300,
                                160,
                                input_bindings={
                                    "samples": "build-samples:samples",
                                    "model": "sub-model:model",
                                },
                                params={"callParametersJson": "{}"},
                            ),
                            _node(
                                "export-predictions",
                                "export.prediction_set_to_dataset_version",
                                1560,
                                160,
                                input_bindings={"predictions": "predict:predictions"},
                                params={"outputDatasetName": "Fallback Branch Predictions"},
                            ),
                            WorkflowNode(
                                id="sub-output",
                                type=SUBGRAPH_OUTPUT_NODE_TYPE,
                                position={"x": 1840, "y": 160},
                                params={},
                                input_bindings={"dataset": "export-predictions:dataset"},
                                input_defs=[
                                    _port("dataset", "Dataset", "dataset_version", required=True)
                                ],
                                input_contracts=[
                                    _contract(
                                        "dataset",
                                        "Prediction dataset emitted by the active branch.",
                                    )
                                ],
                            ),
                        ],
                        edges=[
                            WorkflowEdge(
                                id="se1",
                                source="sub-enabled",
                                target="guard",
                                source_handle="enabled",
                                target_handle="enabled",
                            ),
                            WorkflowEdge(
                                id="se2",
                                source="sub-dataset",
                                target="guard",
                                source_handle="dataset",
                                target_handle="payload",
                            ),
                            WorkflowEdge(
                                id="se3",
                                source="guard",
                                target="load-raster",
                                source_handle="payload",
                                target_handle="dataset",
                            ),
                            WorkflowEdge(
                                id="se4",
                                source="load-raster",
                                target="patchify",
                                source_handle="raster",
                                target_handle="raster",
                            ),
                            WorkflowEdge(
                                id="se5",
                                source="patchify",
                                target="build-samples",
                                source_handle="tiles",
                                target_handle="tiles",
                            ),
                            WorkflowEdge(
                                id="se6",
                                source="build-samples",
                                target="predict",
                                source_handle="samples",
                                target_handle="samples",
                            ),
                            WorkflowEdge(
                                id="se7",
                                source="sub-model",
                                target="predict",
                                source_handle="model",
                                target_handle="model",
                            ),
                            WorkflowEdge(
                                id="se8",
                                source="predict",
                                target="export-predictions",
                                source_handle="predictions",
                                target_handle="predictions",
                            ),
                            WorkflowEdge(
                                id="se9",
                                source="export-predictions",
                                target="sub-output",
                                source_handle="dataset",
                                target_handle="dataset",
                            ),
                        ],
                    ),
                ),
                _node(
                    "selected-dataset",
                    "control.coalesce",
                    1520,
                    320,
                    input_bindings={
                        "primary": "then-branch:dataset",
                        "fallback": "else-branch:dataset",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="flag",
                    target="is-fallback",
                    source_handle="value",
                    target_handle="value",
                ),
                WorkflowEdge(
                    id="e2",
                    source="flag",
                    target="then-branch",
                    source_handle="value",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e3",
                    source="primary-source",
                    target="then-branch",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e4",
                    source="model-source",
                    target="then-branch",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e5",
                    source="is-fallback",
                    target="else-branch",
                    source_handle="result",
                    target_handle="enabled",
                ),
                WorkflowEdge(
                    id="e6",
                    source="fallback-source",
                    target="else-branch",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e7",
                    source="model-source",
                    target="else-branch",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e8",
                    source="then-branch",
                    target="selected-dataset",
                    source_handle="dataset",
                    target_handle="primary",
                ),
                WorkflowEdge(
                    id="e9",
                    source="else-branch",
                    target="selected-dataset",
                    source_handle="dataset",
                    target_handle="fallback",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("primary-source", datasetVersionId=SEED_RASTER_DATASET_VERSION_ID),
            _sample_binding("fallback-source", datasetVersionId=SEED_RASTER_DATASET_VERSION_ID),
            _sample_binding("model-source", modelVersionId=SEED_SEGMENTATION_MODEL_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.linear_regression_training",
        label="Linear Regression Training",
        description=(
            "Load a CSV table, split it, train a linear regression model, and "
            "save the trained model."
        ),
        tags=["tabular", "training", "linear_regression"],
        supported_tasks=["tabular_training"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "split-table",
                    "table.train_test_split",
                    540,
                    180,
                    input_bindings={"table": "load-table:table"},
                ),
                _node(
                    "train-model",
                    "tabular.train_regression_model",
                    800,
                    180,
                    input_bindings={
                        "trainTable": "split-table:trainTable",
                        "testTable": "split-table:testTable",
                    },
                    params={
                        "algorithm": "linear_regression",
                        "featureColumns": "feature_a, feature_b",
                        "targetColumn": "target",
                        "hyperparametersJson": '{"fitIntercept": true, "positive": false}',
                    },
                ),
                _node(
                    "save-model",
                    "model.save_trained_model",
                    1080,
                    180,
                    input_bindings={"model": "train-model:model"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-table",
                    target="split-table",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e3",
                    source="split-table",
                    target="train-model",
                    source_handle="trainTable",
                    target_handle="trainTable",
                ),
                WorkflowEdge(
                    id="e4",
                    source="split-table",
                    target="train-model",
                    source_handle="testTable",
                    target_handle="testTable",
                ),
                WorkflowEdge(
                    id="e5",
                    source="train-model",
                    target="save-model",
                    source_handle="model",
                    target_handle="model",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("table-source", datasetVersionId=SEED_TABULAR_INPUT_DATASET_VERSION_ID)
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.prediction",
        label="Linear Regression Prediction",
        description=(
            "Load a CSV table, run a linear regression model, and export prediction output."
        ),
        tags=["tabular", "prediction", "linear_regression"],
        supported_tasks=["tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node("model-source", "source.model_version", 80, 360),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "predict",
                    "tabular.predict_model",
                    560,
                    180,
                    input_bindings={"model": "model-source:model", "table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "runtimeParametersJson": '{"roundDigits": 4}',
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    840,
                    180,
                    input_bindings={"input": "predict:table"},
                    params={"outputDatasetName": "Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="model-source",
                    target="predict",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e3",
                    source="load-table",
                    target="predict",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e4",
                    source="predict",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "table-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
            _sample_binding("model-source", modelVersionId=SEED_LINEAR_MODEL_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.svm_prediction",
        label="SVM Regression Prediction",
        description="Load a CSV table, run an SVM regression model, and export prediction output.",
        tags=["tabular", "prediction", "svm_regression"],
        supported_tasks=["tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node("model-source", "source.model_version", 80, 360),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "predict",
                    "tabular.predict_model",
                    560,
                    180,
                    input_bindings={"model": "model-source:model", "table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "runtimeParametersJson": '{"roundDigits": 4, "cacheSize": 200}',
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    840,
                    180,
                    input_bindings={"input": "predict:table"},
                    params={"outputDatasetName": "Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="model-source",
                    target="predict",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e3",
                    source="load-table",
                    target="predict",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e4",
                    source="predict",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "table-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
            _sample_binding("model-source", modelVersionId=SEED_SVM_MODEL_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.random_forest_prediction",
        label="Random Forest Prediction",
        description=(
            "Load a CSV table, run a random forest regression model, and export prediction output."
        ),
        tags=["tabular", "prediction", "random_forest_regression"],
        supported_tasks=["tabular_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node("model-source", "source.model_version", 80, 360),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "predict",
                    "tabular.predict_model",
                    560,
                    180,
                    input_bindings={"model": "model-source:model", "table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "runtimeParametersJson": '{"roundDigits": 4, "nJobs": 1}',
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    840,
                    180,
                    input_bindings={"input": "predict:table"},
                    params={"outputDatasetName": "Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="model-source",
                    target="predict",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e3",
                    source="load-table",
                    target="predict",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e4",
                    source="predict",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "table-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
            _sample_binding("model-source", modelVersionId=SEED_RANDOM_FOREST_MODEL_VERSION_ID),
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.validation",
        label="Regression Validation",
        description=(
            "Load prediction and ground-truth CSV tables, compute regression "
            "metrics, and export the report."
        ),
        tags=["tabular", "validation", "metrics"],
        supported_tasks=["tabular_validation"],
        graph=WorkflowGraph(
            nodes=[
                _node("prediction-source", "source.dataset_version", 80, 120),
                _node("ground-truth-source", "source.dataset_version", 80, 320),
                _node(
                    "load-prediction",
                    "table.load_csv",
                    320,
                    120,
                    input_bindings={"dataset": "prediction-source:dataset"},
                ),
                _node(
                    "load-ground-truth",
                    "table.load_csv",
                    320,
                    320,
                    input_bindings={"dataset": "ground-truth-source:dataset"},
                ),
                _node(
                    "validate",
                    "metrics.validate_regression",
                    620,
                    220,
                    input_bindings={
                        "predictionTable": "load-prediction:table",
                        "groundTruthTable": "load-ground-truth:table",
                    },
                    params={
                        "predictionColumn": "prediction",
                        "groundTruthColumn": "target",
                        "metrics": ["r2", "rmse", "mae"],
                    },
                ),
                _node(
                    "export-metrics",
                    "export.metrics",
                    920,
                    220,
                    input_bindings={"input": "validate:report"},
                    params={"outputDatasetName": "Validation Metrics", "format": "json"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="prediction-source",
                    target="load-prediction",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="ground-truth-source",
                    target="load-ground-truth",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e3",
                    source="load-prediction",
                    target="validate",
                    source_handle="table",
                    target_handle="predictionTable",
                ),
                WorkflowEdge(
                    id="e4",
                    source="load-ground-truth",
                    target="validate",
                    source_handle="table",
                    target_handle="groundTruthTable",
                ),
                WorkflowEdge(
                    id="e5",
                    source="validate",
                    target="export-metrics",
                    source_handle="report",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "prediction-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            ),
            _sample_binding(
                "ground-truth-source", datasetVersionId=SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID
            ),
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.custom_api_prediction",
        label="Custom API Prediction",
        description="Load a CSV table, call a custom API model, and export prediction output.",
        tags=["tabular", "prediction", "custom_api"],
        supported_tasks=["custom_api_prediction"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "predict",
                    "custom.api_predict",
                    560,
                    180,
                    input_bindings={"table": "load-table:table"},
                    params={"predictionColumn": "prediction", "callParametersJson": "{}"},
                ),
                _node(
                    "export-table",
                    "export.table",
                    840,
                    180,
                    input_bindings={"input": "predict:table"},
                    params={"outputDatasetName": "Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-table",
                    target="predict",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e3",
                    source="predict",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding(
                "table-source", datasetVersionId=SEED_TABULAR_PREDICTION_DATASET_VERSION_ID
            )
        ],
    ),
    WorkflowTemplateDefinition(
        id="tabular.train_validate_regression",
        label="Tabular Train And Validate",
        description=(
            "Load a CSV table, split it, train a regression model, validate, and export outputs."
        ),
        tags=["tabular", "training", "validation"],
        supported_tasks=["tabular_training", "tabular_validation"],
        graph=WorkflowGraph(
            nodes=[
                _node("table-source", "source.dataset_version", 80, 180),
                _node(
                    "load-table",
                    "table.load_csv",
                    300,
                    180,
                    input_bindings={"dataset": "table-source:dataset"},
                ),
                _node(
                    "split-table",
                    "table.train_test_split",
                    540,
                    180,
                    input_bindings={"table": "load-table:table"},
                ),
                _node(
                    "train-model",
                    "tabular.train_regression_model",
                    800,
                    140,
                    input_bindings={
                        "trainTable": "split-table:trainTable",
                        "testTable": "split-table:testTable",
                    },
                    params={
                        "algorithm": "linear_regression",
                        "featureColumns": "feature_a, feature_b",
                        "targetColumn": "target",
                        "hyperparametersJson": "{}",
                    },
                ),
                _node(
                    "save-model",
                    "model.save_trained_model",
                    1080,
                    80,
                    input_bindings={"model": "train-model:model"},
                ),
                _node(
                    "predict",
                    "tabular.predict_model",
                    1080,
                    240,
                    input_bindings={"model": "save-model:model", "table": "split-table:testTable"},
                    params={"predictionColumn": "prediction", "runtimeParametersJson": "{}"},
                ),
                _node(
                    "validate",
                    "metrics.validate_regression",
                    1360,
                    240,
                    input_bindings={
                        "predictionTable": "predict:table",
                        "groundTruthTable": "split-table:testTable",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="e1",
                    source="table-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="e2",
                    source="load-table",
                    target="split-table",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e3",
                    source="split-table",
                    target="train-model",
                    source_handle="trainTable",
                    target_handle="trainTable",
                ),
                WorkflowEdge(
                    id="e4",
                    source="split-table",
                    target="train-model",
                    source_handle="testTable",
                    target_handle="testTable",
                ),
                WorkflowEdge(
                    id="e5",
                    source="train-model",
                    target="save-model",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e6",
                    source="save-model",
                    target="predict",
                    source_handle="model",
                    target_handle="model",
                ),
                WorkflowEdge(
                    id="e7",
                    source="split-table",
                    target="predict",
                    source_handle="testTable",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="e8",
                    source="predict",
                    target="validate",
                    source_handle="table",
                    target_handle="predictionTable",
                ),
                WorkflowEdge(
                    id="e9",
                    source="split-table",
                    target="validate",
                    source_handle="testTable",
                    target_handle="groundTruthTable",
                ),
            ],
        ),
        sample_bindings=[
            _sample_binding("table-source", datasetVersionId=SEED_TABULAR_INPUT_DATASET_VERSION_ID)
        ],
    ),
]


def workflow_templates() -> list[WorkflowTemplateDefinition]:
    return BUILTIN_WORKFLOW_TEMPLATES
