from platform_backend.seed_data import (
    SEED_IMAGE_COLLECTION_DATASET_VERSION_ID,
    SEED_RASTER_DATASET_VERSION_ID,
    SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID,
    SEED_TABULAR_INPUT_DATASET_VERSION_ID,
    SEED_TABULAR_PREDICTION_DATASET_VERSION_ID,
    SEED_VECTOR_DATASET_VERSION_ID,
)
from platform_backend.schemas.workflow import (
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowPortContract,
)
from platform_backend.workflows import gee_runtime, patch_runtime, tabular_runtime
from platform_backend.workflows.catalog import BUILTIN_NODE_CATALOG, BUILTIN_WORKFLOW_TEMPLATES
from platform_backend.workflows.validation import (
    WorkflowDatasetSemantics,
    _contract_mismatch_reasons,
    _dataset_contract_mismatch_reasons,
    validate_workflow_graph,
)


def _port(key: str, label: str, *data_types: str) -> WorkflowNodePort:
    return WorkflowNodePort(key=key, label=label, data_types=list(data_types))


def _seed_dataset_semantics(dataset_version_id: str) -> WorkflowDatasetSemantics | None:
    mapping = {
        SEED_RASTER_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="raster",
            original_file_name="seed-raster.tif",
            content_type="image/tiff",
        ),
        SEED_IMAGE_COLLECTION_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="raster",
            original_file_name="seed-image-collection.zip",
            content_type="application/zip",
            sample_kinds=frozenset({"image_tile"}),
            metadata={"format": "zip", "sampleKind": "image_tile"},
        ),
        SEED_VECTOR_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="vector",
            original_file_name="seed-labels.geojson",
            content_type="application/geo+json",
        ),
        SEED_TABULAR_INPUT_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="table",
            original_file_name="seed-input.csv",
            content_type="text/csv",
            metadata={"columns": ["feature_a", "feature_b", "target"]},
        ),
        SEED_TABULAR_PREDICTION_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="table",
            original_file_name="seed-prediction.csv",
            content_type="text/csv",
            metadata={"columns": ["feature_a", "feature_b", "prediction"]},
        ),
        SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID: WorkflowDatasetSemantics(
            dataset_kind="table",
            original_file_name="seed-ground-truth.csv",
            content_type="text/csv",
            metadata={"columns": ["feature_a", "feature_b", "target"]},
        ),
    }
    return mapping.get(dataset_version_id)


def _graph_with_template_sample_bindings(template_id: str) -> WorkflowGraph:
    template = next(item for item in BUILTIN_WORKFLOW_TEMPLATES if item.id == template_id)
    graph = WorkflowGraph.model_validate(template.graph.model_dump(mode="json"))
    bindings_by_node_id = {binding.node_id: binding.params for binding in template.sample_bindings}
    for node in graph.nodes:
        binding_params = bindings_by_node_id.get(node.id)
        if binding_params:
            node.params = {**node.params, **binding_params}
    return graph


def _has_unbound_dataset_sources(graph: WorkflowGraph) -> bool:
    for node in graph.nodes:
        if node.type != "source.dataset_version":
            continue
        dataset_version_id = str(node.params.get("datasetVersionId", "")).strip()
        if not dataset_version_id:
            return True
    return False


def test_cycle_detection() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="a",
                type="geo.filter_scene_collection",
                position={"x": 0, "y": 0},
                params={"filtersJson": "[]"},
                input_bindings={"collection": "b:collection"},
                output_defs=[_port("collection", "Scene Collection", "scene_collection")],
            ),
            WorkflowNode(
                id="b",
                type="geo.sort_scene_collection",
                position={"x": 1, "y": 1},
                params={"field": "cloud_cover", "order": "asc"},
                input_bindings={"collection": "a:collection"},
                output_defs=[_port("collection", "Scene Collection", "scene_collection")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="a",
                target="b",
                source_handle="collection",
                target_handle="collection",
            ),
            WorkflowEdge(
                id="e2",
                source="b",
                target="a",
                source_handle="collection",
                target_handle="collection",
            ),
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert "acyclic" in result.errors[0]


def test_valid_sample_graph_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-rgb-geo-raster-v1"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-raster",
                type="raster.load_georaster",
                position={"x": 200, "y": 0},
                params={},
                input_bindings={"dataset": "source:dataset"},
                output_defs=[_port("raster", "Geo Raster", "geo_raster")],
            ),
            WorkflowNode(
                id="patchify",
                type="rgb.patchify_raster",
                position={"x": 420, "y": 0},
                params={
                    "tileWidth": 256,
                    "tileHeight": 256,
                    "strideX": 256,
                    "strideY": 256,
                    "edgePolicy": "pad",
                    "outputImageFormat": "png",
                },
                input_bindings={"raster": "load-raster:raster"},
                output_defs=[_port("tiles", "Tile Set", "tile_set")],
            ),
            WorkflowNode(
                id="build-samples",
                type="dataset.build_samples",
                position={"x": 640, "y": 0},
                params={},
                input_bindings={"tiles": "patchify:tiles"},
                output_defs=[_port("samples", "Sample Set", "sample_set")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="source",
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
                source="patchify",
                target="build-samples",
                source_handle="tiles",
                target_handle="tiles",
            ),
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_valid_sample_custom_api_prediction_graph_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": SEED_RASTER_DATASET_VERSION_ID},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-raster",
                type="raster.load_georaster",
                position={"x": 200, "y": 0},
                params={},
                input_bindings={"dataset": "source:dataset"},
                output_defs=[_port("raster", "Geo Raster", "geo_raster")],
            ),
            WorkflowNode(
                id="patchify",
                type="rgb.patchify_raster",
                position={"x": 420, "y": 0},
                params={
                    "tileWidth": 256,
                    "tileHeight": 256,
                    "strideX": 256,
                    "strideY": 256,
                    "edgePolicy": "pad",
                    "outputImageFormat": "png",
                },
                input_bindings={"raster": "load-raster:raster"},
                output_defs=[_port("tiles", "Tile Set", "tile_set")],
            ),
            WorkflowNode(
                id="build-samples",
                type="dataset.build_samples",
                position={"x": 640, "y": 0},
                params={},
                input_bindings={"tiles": "patchify:tiles"},
                output_defs=[_port("samples", "Sample Set", "sample_set")],
            ),
            WorkflowNode(
                id="model-source",
                type="source.model_version",
                position={"x": 640, "y": 220},
                params={"modelVersionId": "model-custom-api-v1"},
                input_bindings={},
                output_defs=[_port("model", "Model Version", "model_version")],
            ),
            WorkflowNode(
                id="predict",
                type="custom.api_predict_samples",
                position={"x": 880, "y": 80},
                params={"callParametersJson": "{}"},
                input_bindings={
                    "samples": "build-samples:samples",
                    "model": "model-source:model",
                },
                output_defs=[_port("predictions", "Prediction Set", "prediction_set")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="source",
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
                source="patchify",
                target="build-samples",
                source_handle="tiles",
                target_handle="tiles",
            ),
            WorkflowEdge(
                id="e4",
                source="build-samples",
                target="predict",
                source_handle="samples",
                target_handle="samples",
            ),
            WorkflowEdge(
                id="e5",
                source="model-source",
                target="predict",
                source_handle="model",
                target_handle="model",
            ),
        ],
    )

    result = validate_workflow_graph(
        graph,
        dataset_semantics_resolver=_seed_dataset_semantics,
    )
    assert result.valid is True


def test_valid_tabular_graph_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-table-v1"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-table",
                type="table.load_csv",
                position={"x": 200, "y": 0},
                params={"delimiter": ","},
                input_bindings={"dataset": "source:dataset"},
                output_defs=[_port("table", "Table", "table")],
            ),
            WorkflowNode(
                id="split-table",
                type="table.train_test_split",
                position={"x": 420, "y": 0},
                params={"testSize": 0.2, "shuffle": True, "randomState": 42},
                input_bindings={"table": "load-table:table"},
                output_defs=[
                    _port("trainTable", "Train Table", "table"),
                    _port("testTable", "Test Table", "table"),
                ],
            ),
            WorkflowNode(
                id="train-model",
                type="tabular.train_regression_model",
                position={"x": 700, "y": 0},
                params={
                    "algorithm": "linear_regression",
                    "featureColumns": "feature_a, feature_b",
                    "targetColumn": "target",
                    "hyperparametersJson": "{}",
                },
                input_bindings={
                    "trainTable": "split-table:trainTable",
                    "testTable": "split-table:testTable",
                },
                output_defs=[
                    _port("model", "Trained Model", "model_ref"),
                    _port("report", "Training Metrics", "metrics_report"),
                ],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="source",
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
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_tabular_column_contracts_propagate_through_split_prediction_and_validation() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="table-source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-table",
                type="table.load_csv",
                position={"x": 220, "y": 0},
                params={"delimiter": ","},
                input_bindings={"dataset": "table-source:dataset"},
                output_defs=[_port("table", "Table", "table")],
            ),
            WorkflowNode(
                id="split-table",
                type="table.train_test_split",
                position={"x": 440, "y": 0},
                params={"testSize": 0.2, "shuffle": True, "randomState": 42},
                input_bindings={"table": "load-table:table"},
                output_defs=[
                    _port("trainTable", "Train Table", "table"),
                    _port("testTable", "Test Table", "table"),
                ],
            ),
            WorkflowNode(
                id="train-model",
                type="tabular.train_regression_model",
                position={"x": 700, "y": -80},
                params={
                    "algorithm": "linear_regression",
                    "featureColumns": "feature_a, feature_b",
                    "targetColumn": "target",
                    "hyperparametersJson": "{}",
                },
                input_bindings={
                    "trainTable": "split-table:trainTable",
                    "testTable": "split-table:testTable",
                },
                output_defs=[
                    _port("model", "Trained Model", "model_ref"),
                    _port("report", "Training Metrics", "metrics_report"),
                ],
            ),
            WorkflowNode(
                id="save-model",
                type="model.save_trained_model",
                position={"x": 980, "y": -80},
                params={
                    "saveToPlatform": True,
                    "outputModelName": "Trained Model",
                    "outputModelVersion": "1.0.0",
                },
                input_bindings={"model": "train-model:model"},
                output_defs=[
                    _port("model", "Model Version", "model_version"),
                    _port("artifact", "Artifact", "artifact"),
                ],
            ),
            WorkflowNode(
                id="predict",
                type="tabular.predict_model",
                position={"x": 980, "y": 120},
                params={
                    "predictionColumn": "prediction",
                    "runtimeParametersJson": "{}",
                },
                input_bindings={
                    "model": "save-model:model",
                    "table": "split-table:testTable",
                },
                output_defs=[_port("table", "Prediction Table", "table")],
            ),
            WorkflowNode(
                id="validate",
                type="metrics.validate_regression",
                position={"x": 1240, "y": 120},
                params={
                    "predictionColumn": "prediction",
                    "groundTruthColumn": "target",
                    "metrics": ["r2", "rmse", "mae"],
                },
                input_bindings={
                    "predictionTable": "predict:table",
                    "groundTruthTable": "split-table:testTable",
                },
                output_defs=[_port("report", "Metrics Report", "metrics_report")],
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
    )

    result = validate_workflow_graph(
        graph,
        dataset_semantics_resolver=_seed_dataset_semantics,
    )
    assert result.valid is True


def test_type_mismatch_is_rejected() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="model-source",
                type="source.model_version",
                position={"x": 0, "y": 0},
                params={"modelVersionId": "model-v1"},
                input_bindings={},
                output_defs=[_port("model", "Model Version", "model_version")],
            ),
            WorkflowNode(
                id="load-table",
                type="table.load_csv",
                position={"x": 200, "y": 0},
                params={"delimiter": ","},
                input_bindings={"dataset": "model-source:model"},
                output_defs=[_port("table", "Table", "table")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="model-source",
                target="load-table",
                source_handle="model",
                target_handle="dataset",
            )
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert any("incompatible data types" in error for error in result.errors)


def test_dataset_contract_mismatch_is_rejected() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-raster-v1"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-table",
                type="table.load_csv",
                position={"x": 200, "y": 0},
                params={"delimiter": ","},
                input_bindings={"dataset": "source:dataset"},
                output_defs=[_port("table", "Table", "table")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="source",
                target="load-table",
                source_handle="dataset",
                target_handle="dataset",
            )
        ],
    )

    result = validate_workflow_graph(
        graph,
        dataset_semantics_resolver=lambda dataset_version_id: (
            WorkflowDatasetSemantics(
                dataset_kind="raster",
                original_file_name="example.tif",
                content_type="image/tiff",
            )
            if dataset_version_id == "dsv-raster-v1"
            else None
        ),
    )
    assert result.valid is False
    assert any("expects Tabular dataset version stored as a CSV file" in error for error in result.errors)


def test_output_contract_mismatch_is_rejected() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="sentinel-source",
                type="source.sentinel2_gee_download",
                position={"x": 0, "y": 0},
                params={
                    "roiMode": "bbox",
                    "bbox": "116.10,39.70,116.65,40.10",
                    "startDate": "2025-06-01",
                    "endDate": "2025-06-30",
                    "maxCloudCover": 20,
                    "bands": ["B4", "B3", "B2"],
                    "scale": 10,
                    "credentialMode": "platform_default",
                },
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-table",
                type="table.load_csv",
                position={"x": 240, "y": 0},
                params={"delimiter": ","},
                input_bindings={"dataset": "sentinel-source:dataset"},
                output_defs=[_port("table", "Table", "table")],
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="sentinel-source",
                target="load-table",
                source_handle="dataset",
                target_handle="dataset",
            )
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert any("produces Raster dataset version in GeoTIFF format" in error for error in result.errors)


def test_control_guard_preserves_dataset_contract_semantics() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": SEED_RASTER_DATASET_VERSION_ID},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="enabled",
                type="control.boolean_literal",
                position={"x": 0, "y": 160},
                params={"value": True},
                input_bindings={},
                output_defs=[_port("value", "Value", "value")],
            ),
            WorkflowNode(
                id="guard",
                type="control.guard",
                position={"x": 220, "y": 80},
                params={},
                input_bindings={
                    "enabled": "enabled:value",
                    "payload": "source:dataset",
                },
                output_defs=[_port("payload", "Payload", "dataset_version")],
            ),
            WorkflowNode(
                id="load-raster",
                type="raster.load_georaster",
                position={"x": 460, "y": 80},
                params={},
                input_bindings={"dataset": "guard:payload"},
                output_defs=[_port("raster", "Geo Raster", "geo_raster")],
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="enabled", target="guard", source_handle="value", target_handle="enabled"),
            WorkflowEdge(id="e2", source="source", target="guard", source_handle="dataset", target_handle="payload"),
            WorkflowEdge(id="e3", source="guard", target="load-raster", source_handle="payload", target_handle="dataset"),
        ],
    )

    result = validate_workflow_graph(
        graph,
        dataset_semantics_resolver=_seed_dataset_semantics,
    )
    assert result.valid is True


def test_control_coalesce_requires_all_possible_dataset_branches_to_match_target_contract() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="raster-source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": SEED_RASTER_DATASET_VERSION_ID},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="table-source",
                type="source.dataset_version",
                position={"x": 0, "y": 180},
                params={"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="merge",
                type="control.coalesce",
                position={"x": 240, "y": 80},
                params={},
                input_bindings={
                    "primary": "raster-source:dataset",
                    "fallback": "table-source:dataset",
                },
                output_defs=[_port("output", "Output", "dataset_version")],
            ),
            WorkflowNode(
                id="load-raster",
                type="raster.load_georaster",
                position={"x": 480, "y": 80},
                params={},
                input_bindings={"dataset": "merge:output"},
                output_defs=[_port("raster", "Geo Raster", "geo_raster")],
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="raster-source", target="merge", source_handle="dataset", target_handle="primary"),
            WorkflowEdge(id="e2", source="table-source", target="merge", source_handle="dataset", target_handle="fallback"),
            WorkflowEdge(id="e3", source="merge", target="load-raster", source_handle="output", target_handle="dataset"),
        ],
    )

    result = validate_workflow_graph(
        graph,
        dataset_semantics_resolver=_seed_dataset_semantics,
    )
    assert result.valid is False
    assert any("table dataset" in error and "table-source.dataset" in error for error in result.errors)


def test_dataset_contract_requires_task_annotation_and_sample_semantics() -> None:
    contract = WorkflowPortContract(
        port_key="samples",
        summary="Semantic segmentation image-tile samples with mask annotations.",
        task_types=["semantic_segmentation"],
        annotation_kinds=["mask"],
        sample_kinds=["image_tile"],
    )
    semantics = WorkflowDatasetSemantics(
        dataset_kind="artifact",
        task_types=frozenset({"image_classification"}),
        annotation_kinds=frozenset({"class_label"}),
        sample_kinds=frozenset({"image"}),
    )

    reasons = _dataset_contract_mismatch_reasons(semantics, contract)

    assert any("task types image_classification does not satisfy semantic_segmentation" in reason for reason in reasons)
    assert any("annotation kinds class_label does not satisfy mask" in reason for reason in reasons)
    assert any("sample kinds image does not satisfy image_tile" in reason for reason in reasons)


def test_dataset_contract_rejects_missing_value_type_metadata() -> None:
    contract = WorkflowPortContract(
        port_key="flag",
        summary="Boolean control value.",
        value_types=["boolean"],
    )
    semantics = WorkflowDatasetSemantics(dataset_kind="artifact")

    reasons = _dataset_contract_mismatch_reasons(semantics, contract)

    assert "value types metadata is missing; expected one of boolean" in reasons


def test_edge_contract_rejects_missing_task_semantics_from_upstream_contract() -> None:
    source_contract = WorkflowPortContract(
        port_key="samples",
        summary="Generic sample set.",
    )
    target_contract = WorkflowPortContract(
        port_key="samples",
        summary="Semantic segmentation sample set.",
        task_types=["semantic_segmentation"],
    )

    reasons = _contract_mismatch_reasons(source_contract, target_contract)

    assert "task types are not declared by the upstream contract; expected semantic_segmentation" in reasons


def test_classification_sample_semantics_flow_into_custom_api_training() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="image-source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-images"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="label-source",
                type="source.dataset_version",
                position={"x": 0, "y": 200},
                params={"datasetVersionId": "dsv-labels"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-images",
                type="image.load_image_collection",
                position={"x": 200, "y": 0},
                params={},
                input_bindings={"dataset": "image-source:dataset"},
                output_defs=[_port("images", "Image Collection", "image_collection")],
            ),
            WorkflowNode(
                id="patchify",
                type="rgb.patchify_image_collection",
                position={"x": 420, "y": 0},
                params={
                    "tileWidth": 256,
                    "tileHeight": 256,
                    "strideX": 256,
                    "strideY": 256,
                    "edgePolicy": "skip",
                    "outputImageFormat": "png",
                },
                input_bindings={"images": "load-images:images"},
                output_defs=[_port("tiles", "Tile Set", "tile_set")],
            ),
            WorkflowNode(
                id="load-features",
                type="vector.load_features",
                position={"x": 200, "y": 200},
                params={},
                input_bindings={"dataset": "label-source:dataset"},
                output_defs=[_port("features", "Feature Collection", "feature_collection")],
            ),
            WorkflowNode(
                id="annotate",
                type="annotation.project_features_to_tile_classes",
                position={"x": 640, "y": 120},
                params={"classProperty": "class"},
                input_bindings={
                    "tiles": "patchify:tiles",
                    "features": "load-features:features",
                },
                output_defs=[_port("annotations", "Annotations", "annotation_set")],
            ),
            WorkflowNode(
                id="build-samples",
                type="dataset.build_samples",
                position={"x": 880, "y": 80},
                params={},
                input_bindings={
                    "tiles": "patchify:tiles",
                    "labels": "annotate:annotations",
                },
                output_defs=[_port("samples", "Sample Set", "sample_set")],
            ),
            WorkflowNode(
                id="split-samples",
                type="dataset.split_samples",
                position={"x": 1100, "y": 80},
                params={
                    "strategy": "random",
                    "trainRatio": 0.8,
                    "valRatio": 0.1,
                    "testRatio": 0.1,
                    "randomSeed": 42,
                },
                input_bindings={"samples": "build-samples:samples"},
                output_defs=[
                    _port("trainSamples", "Train Samples", "sample_set"),
                    _port("valSamples", "Val Samples", "sample_set"),
                    _port("testSamples", "Test Samples", "sample_set"),
                ],
            ),
            WorkflowNode(
                id="train",
                type="custom.api_train_samples",
                position={"x": 1360, "y": 80},
                params={
                    "taskType": "image_classification",
                    "outputModelName": "Classifier",
                    "outputModelVersion": "1.0.0",
                    "predictionEndpointUrl": "https://example.com/predict",
                    "authType": "none",
                    "timeoutSeconds": 45,
                    "responseMode": "prediction_values",
                    "defaultPredictionColumn": "prediction",
                    "callParametersJson": "{}",
                },
                input_bindings={
                    "trainSamples": "split-samples:trainSamples",
                    "validationSamples": "split-samples:valSamples",
                },
                output_defs=[
                    _port("model", "Custom Model", "model_version"),
                    _port("artifact", "Artifact", "artifact"),
                ],
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="image-source", target="load-images", source_handle="dataset", target_handle="dataset"),
            WorkflowEdge(id="e2", source="load-images", target="patchify", source_handle="images", target_handle="images"),
            WorkflowEdge(id="e3", source="label-source", target="load-features", source_handle="dataset", target_handle="dataset"),
            WorkflowEdge(id="e4", source="patchify", target="annotate", source_handle="tiles", target_handle="tiles"),
            WorkflowEdge(id="e5", source="load-features", target="annotate", source_handle="features", target_handle="features"),
            WorkflowEdge(id="e6", source="patchify", target="build-samples", source_handle="tiles", target_handle="tiles"),
            WorkflowEdge(id="e7", source="annotate", target="build-samples", source_handle="annotations", target_handle="labels"),
            WorkflowEdge(id="e8", source="build-samples", target="split-samples", source_handle="samples", target_handle="samples"),
            WorkflowEdge(id="e9", source="split-samples", target="train", source_handle="trainSamples", target_handle="trainSamples"),
            WorkflowEdge(id="e10", source="split-samples", target="train", source_handle="valSamples", target_handle="validationSamples"),
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_custom_api_training_rejects_mismatched_sample_task_semantics() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="image-source",
                type="source.dataset_version",
                position={"x": 0, "y": 0},
                params={"datasetVersionId": "dsv-images"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="label-source",
                type="source.dataset_version",
                position={"x": 0, "y": 200},
                params={"datasetVersionId": "dsv-labels"},
                input_bindings={},
                output_defs=[_port("dataset", "Dataset Version", "dataset_version")],
            ),
            WorkflowNode(
                id="load-images",
                type="image.load_image_collection",
                position={"x": 200, "y": 0},
                params={},
                input_bindings={"dataset": "image-source:dataset"},
                output_defs=[_port("images", "Image Collection", "image_collection")],
            ),
            WorkflowNode(
                id="patchify",
                type="rgb.patchify_image_collection",
                position={"x": 420, "y": 0},
                params={
                    "tileWidth": 256,
                    "tileHeight": 256,
                    "strideX": 256,
                    "strideY": 256,
                    "edgePolicy": "skip",
                    "outputImageFormat": "png",
                },
                input_bindings={"images": "load-images:images"},
                output_defs=[_port("tiles", "Tile Set", "tile_set")],
            ),
            WorkflowNode(
                id="load-features",
                type="vector.load_features",
                position={"x": 200, "y": 200},
                params={},
                input_bindings={"dataset": "label-source:dataset"},
                output_defs=[_port("features", "Feature Collection", "feature_collection")],
            ),
            WorkflowNode(
                id="annotate",
                type="annotation.project_features_to_tile_classes",
                position={"x": 640, "y": 120},
                params={"classProperty": "class"},
                input_bindings={
                    "tiles": "patchify:tiles",
                    "features": "load-features:features",
                },
                output_defs=[_port("annotations", "Annotations", "annotation_set")],
            ),
            WorkflowNode(
                id="build-samples",
                type="dataset.build_samples",
                position={"x": 880, "y": 80},
                params={},
                input_bindings={
                    "tiles": "patchify:tiles",
                    "labels": "annotate:annotations",
                },
                output_defs=[_port("samples", "Sample Set", "sample_set")],
            ),
            WorkflowNode(
                id="train",
                type="custom.api_train_samples",
                position={"x": 1120, "y": 80},
                params={
                    "taskType": "semantic_segmentation",
                    "outputModelName": "Wrong Task",
                    "outputModelVersion": "1.0.0",
                    "predictionEndpointUrl": "https://example.com/predict",
                    "authType": "none",
                    "timeoutSeconds": 45,
                    "responseMode": "prediction_masks",
                    "defaultPredictionColumn": "prediction",
                    "callParametersJson": "{}",
                },
                input_bindings={"trainSamples": "build-samples:samples"},
                output_defs=[
                    _port("model", "Custom Model", "model_version"),
                    _port("artifact", "Artifact", "artifact"),
                ],
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source="image-source", target="load-images", source_handle="dataset", target_handle="dataset"),
            WorkflowEdge(id="e2", source="load-images", target="patchify", source_handle="images", target_handle="images"),
            WorkflowEdge(id="e3", source="label-source", target="load-features", source_handle="dataset", target_handle="dataset"),
            WorkflowEdge(id="e4", source="patchify", target="annotate", source_handle="tiles", target_handle="tiles"),
            WorkflowEdge(id="e5", source="load-features", target="annotate", source_handle="features", target_handle="features"),
            WorkflowEdge(id="e6", source="patchify", target="build-samples", source_handle="tiles", target_handle="tiles"),
            WorkflowEdge(id="e7", source="annotate", target="build-samples", source_handle="annotations", target_handle="labels"),
            WorkflowEdge(id="e8", source="build-samples", target="train", source_handle="samples", target_handle="trainSamples"),
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert any(
        "image_classification" in error and "semantic_segmentation" in error
        for error in result.errors
    )


def test_camel_case_port_payload_still_validates() -> None:
    graph = WorkflowGraph.model_validate(
        {
            "nodes": [
                {
                    "id": "source-node",
                    "type": "source.dataset_version",
                    "position": {"x": 0, "y": 0},
                    "params": {"datasetVersionId": "dsv-1"},
                    "inputBindings": {},
                    "outputDefs": [
                        {
                            "key": "dataset",
                            "label": "Dataset Version",
                            "dataTypes": ["dataset_version"],
                        }
                    ],
                },
                {
                    "id": "load-node",
                    "type": "raster.load_georaster",
                    "position": {"x": 200, "y": 0},
                    "params": {},
                    "inputBindings": {"dataset": "source-node:dataset"},
                    "outputDefs": [
                        {
                            "key": "raster",
                            "label": "Geo Raster",
                            "dataTypes": ["geo_raster"],
                        }
                    ],
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "source": "source-node",
                    "target": "load-node",
                    "sourceHandle": "dataset",
                    "targetHandle": "dataset",
                }
            ],
        }
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_validation_falls_back_to_catalog_output_types() -> None:
    graph = WorkflowGraph.model_validate(
        {
            "nodes": [
                {
                    "id": "source-node",
                    "type": "source.dataset_version",
                    "position": {"x": 0, "y": 0},
                    "params": {"datasetVersionId": "dsv-1"},
                    "inputBindings": {},
                    "outputDefs": [
                        {
                            "key": "dataset",
                            "label": "Dataset Version",
                            "dataTypes": [],
                        }
                    ],
                },
                {
                    "id": "load-node",
                    "type": "raster.load_georaster",
                    "position": {"x": 200, "y": 0},
                    "params": {},
                    "inputBindings": {"dataset": "source-node:dataset"},
                    "outputDefs": [
                        {
                            "key": "raster",
                            "label": "Geo Raster",
                            "dataTypes": [],
                        }
                    ],
                },
            ],
            "edges": [
                {
                    "id": "edge-1",
                    "source": "source-node",
                    "target": "load-node",
                    "sourceHandle": "dataset",
                    "targetHandle": "dataset",
                }
            ],
        }
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_subgraph_call_node_with_boundary_ports_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="flag",
                type="control.boolean_literal",
                position={"x": 0, "y": 0},
                params={"value": True},
                input_bindings={},
                output_defs=[_port("value", "Value", "value")],
            ),
            WorkflowNode(
                id="branch",
                type="workflow.call_subgraph",
                position={"x": 240, "y": 0},
                params={},
                input_bindings={"flag": "flag:value"},
                output_defs=[],
                subgraph=WorkflowGraph(
                    nodes=[
                        WorkflowNode(
                            id="sub-in",
                            type="workflow.subgraph_input",
                            position={"x": 0, "y": 0},
                            params={},
                            input_bindings={},
                            input_defs=[],
                            output_defs=[_port("flag", "Flag", "value")],
                            output_contracts=[
                                WorkflowPortContract(
                                    port_key="flag",
                                    summary="Boolean flag.",
                                    value_types=["boolean"],
                                )
                            ],
                        ),
                        WorkflowNode(
                            id="invert",
                            type="control.not",
                            position={"x": 220, "y": 0},
                            params={},
                            input_bindings={"value": "sub-in:flag"},
                            output_defs=[_port("result", "Result", "value")],
                        ),
                        WorkflowNode(
                            id="sub-out",
                            type="workflow.subgraph_output",
                            position={"x": 440, "y": 0},
                            params={},
                            input_bindings={"result": "invert:result"},
                            input_defs=[_port("result", "Result", "value")],
                            input_contracts=[
                                WorkflowPortContract(
                                    port_key="result",
                                    summary="Boolean result.",
                                    value_types=["boolean"],
                                )
                            ],
                            output_defs=[],
                        ),
                    ],
                    edges=[
                        WorkflowEdge(
                            id="se1",
                            source="sub-in",
                            target="invert",
                            source_handle="flag",
                            target_handle="value",
                        ),
                        WorkflowEdge(
                            id="se2",
                            source="invert",
                            target="sub-out",
                            source_handle="result",
                            target_handle="result",
                        ),
                    ],
                ),
            ),
        ],
        edges=[
            WorkflowEdge(
                id="e1",
                source="flag",
                target="branch",
                source_handle="value",
                target_handle="flag",
            )
        ],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_subgraph_boundary_node_fails_at_root_level() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="sub-in",
                type="workflow.subgraph_input",
                position={"x": 0, "y": 0},
                params={},
                input_bindings={},
                input_defs=[],
                output_defs=[_port("value", "Value", "value")],
            )
        ],
        edges=[],
    )

    result = validate_workflow_graph(graph)
    assert result.valid is False
    assert any(issue.code == "subgraph_boundary_outside_subgraph" for issue in result.issues)


def test_for_each_node_with_reserved_loop_ports_passes() -> None:
    graph = WorkflowGraph(
        nodes=[
            WorkflowNode(
                id="items",
                type="control.list_literal",
                position={"x": 0, "y": 0},
                params={"itemsJson": '["tile-a", "tile-b"]'},
                input_bindings={},
                output_defs=[_port("items", "Items", "value_list")],
            ),
            WorkflowNode(
                id="loop",
                type="control.for_each",
                position={"x": 260, "y": 0},
                params={},
                input_bindings={"items": "items:items"},
                input_defs=[WorkflowNodePort(key="items", label="Items", data_types=["value_list"], required=True)],
                input_contracts=[
                    WorkflowPortContract(
                        port_key="items",
                        summary="Ordered list of values to iterate over.",
                        value_types=["array"],
                    )
                ],
                output_defs=[],
                subgraph=WorkflowGraph(
                    nodes=[
                        WorkflowNode(
                            id="sub-item",
                            type="workflow.subgraph_input",
                            position={"x": 0, "y": 0},
                            params={},
                            input_bindings={},
                            input_defs=[],
                            output_defs=[_port("item", "Item", "value")],
                            output_contracts=[
                                WorkflowPortContract(
                                    port_key="item",
                                    summary="Current loop item.",
                                )
                            ],
                        ),
                        WorkflowNode(
                            id="sub-index",
                            type="workflow.subgraph_input",
                            position={"x": 0, "y": 160},
                            params={},
                            input_bindings={},
                            input_defs=[],
                            output_defs=[_port("index", "Index", "value")],
                            output_contracts=[
                                WorkflowPortContract(
                                    port_key="index",
                                    summary="Zero-based loop index.",
                                    value_types=["number"],
                                )
                            ],
                        ),
                        WorkflowNode(
                            id="out-item",
                            type="workflow.subgraph_output",
                            position={"x": 280, "y": 0},
                            params={},
                            input_bindings={"item": "sub-item:item"},
                            input_defs=[_port("item", "Item", "value")],
                            input_contracts=[
                                WorkflowPortContract(
                                    port_key="item",
                                    summary="Current loop item emitted by the body.",
                                )
                            ],
                            output_defs=[],
                        ),
                        WorkflowNode(
                            id="out-index",
                            type="workflow.subgraph_output",
                            position={"x": 280, "y": 160},
                            params={},
                            input_bindings={"index": "sub-index:index"},
                            input_defs=[_port("index", "Index", "value")],
                            input_contracts=[
                                WorkflowPortContract(
                                    port_key="index",
                                    summary="Zero-based loop index emitted by the body.",
                                    value_types=["number"],
                                )
                            ],
                            output_defs=[],
                        ),
                    ],
                    edges=[
                        WorkflowEdge(
                            id="se1",
                            source="sub-item",
                            target="out-item",
                            source_handle="item",
                            target_handle="item",
                        ),
                        WorkflowEdge(
                            id="se2",
                            source="sub-index",
                            target="out-index",
                            source_handle="index",
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
    )

    result = validate_workflow_graph(graph)
    assert result.valid is True


def test_all_builtin_templates_map_to_exactly_one_runtime() -> None:
    for template in BUILTIN_WORKFLOW_TEMPLATES:
        graph_json = template.graph.model_dump(mode="json")
        runtimes = [
            runtime_name
            for runtime_name, is_supported in (
                ("gee", gee_runtime.is_supported_gee_graph(graph_json)),
                ("asset", patch_runtime.is_supported_asset_graph(graph_json)),
                ("tabular", tabular_runtime.is_supported_tabular_graph(graph_json)),
            )
            if is_supported
        ]
        assert runtimes, f"Template {template.id} is not supported by any runtime."
        assert len(runtimes) == 1, (
            f"Template {template.id} is ambiguously supported by multiple runtimes: {runtimes}"
        )


def test_templates_with_resolved_seed_bindings_validate_semantically() -> None:
    for template in BUILTIN_WORKFLOW_TEMPLATES:
        graph = _graph_with_template_sample_bindings(template.id)
        if _has_unbound_dataset_sources(graph):
            continue

        result = validate_workflow_graph(
            graph,
            dataset_semantics_resolver=_seed_dataset_semantics,
        )
        assert result.valid is True, (
            f"Template {template.id} failed semantic validation with seed bindings: "
            f"{result.errors}"
        )


def test_provider_tagged_nodes_are_boundary_nodes() -> None:
    for item in BUILTIN_NODE_CATALOG:
        tags = set(item.tags)
        provider_tags = {tag for tag in tags if tag.startswith("provider_")}
        if not provider_tags:
            continue
        assert "boundary" in tags, (
            f"Node {item.type} uses provider tags {sorted(provider_tags)} "
            "but is not marked as a boundary node."
        )


def test_builtin_templates_do_not_use_convenience_nodes() -> None:
    convenience_node_types = {
        item.type for item in BUILTIN_NODE_CATALOG if "convenience" in set(item.tags)
    }

    for template in BUILTIN_WORKFLOW_TEMPLATES:
        used_convenience_nodes = sorted(
            {node.type for node in template.graph.nodes if node.type in convenience_node_types}
        )
        assert not used_convenience_nodes, (
            f"Template {template.id} uses convenience nodes {used_convenience_nodes}; "
            "built-in templates should prefer primitive nodes."
        )
