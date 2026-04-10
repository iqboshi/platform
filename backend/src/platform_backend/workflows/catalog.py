# ruff: noqa: E501

from __future__ import annotations

import json
from typing import Any

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodeExample,
    WorkflowNodePort,
    WorkflowParamDefinition,
    WorkflowParamFieldType,
    WorkflowParamOption,
    WorkflowPortContract,
    WorkflowTemplateDefinition,
    WorkflowTemplateSampleBinding,
)
from platform_backend.seed_data import (
    SEED_LINEAR_MODEL_VERSION_ID,
    SEED_RANDOM_FOREST_MODEL_VERSION_ID,
    SEED_SVM_MODEL_VERSION_ID,
    SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID,
    SEED_TABULAR_INPUT_DATASET_VERSION_ID,
    SEED_TABULAR_PREDICTION_DATASET_VERSION_ID,
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


def _contract(
    port_key: str,
    summary: str,
    *,
    dataset_kinds: list[str] | None = None,
    file_formats: list[str] | None = None,
    column_requirements: list[str] | None = None,
    sample_columns: list[str] | None = None,
    produced_columns: list[str] | None = None,
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
        notes=notes or [],
    )


def _example(
    title: str,
    kind: str,
    *,
    port_key: str | None = None,
    columns: list[str] | None = None,
    rows: list[dict[str, Any]] | None = None,
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


def _catalog_contract_metadata(node_type: str) -> dict[str, object]:
    feature_rows = [
        {"feature_a": 1.0, "feature_b": 2.0, "target": 2.1},
        {"feature_a": 2.0, "feature_b": 3.0, "target": 3.4},
    ]
    prediction_rows = [
        {"feature_a": 1.0, "feature_b": 2.0, "prediction": 2.3},
        {"feature_a": 2.0, "feature_b": 3.0, "prediction": 3.5},
    ]
    metrics_rows = [
        {"metric": "r2", "value": 0.94},
        {"metric": "rmse", "value": 0.31},
    ]

    if node_type == "source.dataset_version":
        return {
            "input_contracts": [],
            "output_contracts": [
                _contract(
                    "dataset",
                    "Outputs a dataset version handle that downstream nodes can consume.",
                    dataset_kinds=["table"],
                    file_formats=["csv"],
                    notes=[
                        "For the current tabular workflow chain, use a table dataset backed by CSV.",
                    ],
                ),
            ],
            "example_inputs": [
                _example(
                    "Example selection",
                    "text",
                    content="Select a table dataset version such as sample-regression-dataset / v1.",
                )
            ],
            "example_outputs": [
                _example(
                    "Example output handle",
                    "text",
                    port_key="dataset",
                    content="dataset_version: sample-regression-dataset / v1",
                )
            ],
            "common_errors": [
                "No dataset version is selected.",
                "The selected dataset version does not belong to a table dataset.",
            ],
        }

    if node_type == "source.sentinel2_gee_download":
        return {
            "input_contracts": [],
            "output_contracts": [
                _contract(
                    "dataset",
                    "Downloads one Sentinel-2 L2A scene and outputs a raster dataset version.",
                    dataset_kinds=["raster"],
                    file_formats=["GeoTIFF"],
                    notes=[
                        "Use either a manual EPSG:4326 bbox or a saved ROI asset.",
                        "The node picks the lowest-cloud scene, then prefers the newest acquisition.",
                    ],
                ),
            ],
            "example_inputs": [
                _example(
                    "Example manual bbox and filters",
                    "json",
                    content=json.dumps(
                        {
                            "roiMode": "manual_bbox",
                            "bbox": "116.10,39.70,116.65,40.10",
                            "startDate": "2025-06-01",
                            "endDate": "2025-06-30",
                            "maxCloudCover": 20,
                            "bands": ["B4", "B3", "B2"],
                            "scale": 10,
                        },
                        indent=2,
                    ),
                )
            ],
            "example_outputs": [
                _example(
                    "Downloaded raster handle",
                    "text",
                    port_key="dataset",
                    content="dataset_version: Sentinel-2 L2A scene clipped to bbox",
                )
            ],
            "common_errors": [
                "bbox is missing or malformed when roiMode is manual_bbox.",
                "roiId is missing when roiMode is saved_roi.",
                "No Sentinel-2 scene matched the date and cloud filters.",
                "The selected GEE credential is missing or invalid.",
            ],
        }

    if node_type == "table.load_csv":
        return {
            "input_contracts": [
                _contract(
                    "dataset",
                    "Accepts a table dataset version backed by a CSV file.",
                    dataset_kinds=["table"],
                    file_formats=["csv"],
                    column_requirements=["The CSV must include a header row."],
                    sample_columns=["feature_a", "feature_b", "target"],
                    notes=["Each CSV row is treated as one sample."],
                ),
            ],
            "output_contracts": [
                _contract(
                    "table",
                    "Outputs a table whose columns come from the CSV header.",
                    produced_columns=["feature_a", "feature_b", "target"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Example CSV table",
                    "table",
                    port_key="dataset",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows,
                )
            ],
            "example_outputs": [
                _example(
                    "Loaded table",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows,
                )
            ],
            "common_errors": [
                "The selected dataset is not a table dataset.",
                "The CSV file does not contain a header row.",
            ],
        }

    if node_type == "table.train_test_split":
        return {
            "input_contracts": [
                _contract(
                    "table",
                    "Accepts a loaded table and keeps all columns during splitting.",
                    sample_columns=["feature_a", "feature_b", "target"],
                    notes=[
                        "Use testSize to control the split ratio.",
                        "Both outputs keep the same schema as the input table.",
                    ],
                ),
            ],
            "output_contracts": [
                _contract(
                    "trainTable",
                    "Outputs the training split.",
                    produced_columns=["feature_a", "feature_b", "target"],
                ),
                _contract(
                    "testTable",
                    "Outputs the test split.",
                    produced_columns=["feature_a", "feature_b", "target"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Input table",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows,
                )
            ],
            "example_outputs": [
                _example(
                    "Train split",
                    "table",
                    port_key="trainTable",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows[:1],
                ),
                _example(
                    "Test split",
                    "table",
                    port_key="testTable",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows[1:],
                ),
            ],
            "common_errors": [
                "The input table is missing.",
                "testSize must be between 0 and 1.",
            ],
        }

    if node_type in {
        "tabular.linear_regression_train",
        "tabular.svm_regression_train",
        "tabular.random_forest_regression_train",
    }:
        label = {
            "tabular.linear_regression_train": "trained linear regression model",
            "tabular.svm_regression_train": "trained SVM regression model",
            "tabular.random_forest_regression_train": "trained random forest regression model",
        }[node_type]
        return {
            "input_contracts": [
                _contract(
                    "trainTable",
                    "Accepts the training table for model fitting.",
                    column_requirements=[
                        "Every column named in featureColumns must exist.",
                        "The column named in targetColumn must exist.",
                    ],
                    sample_columns=["feature_a", "feature_b", "target"],
                ),
                _contract(
                    "testTable",
                    "Optional evaluation table using the same schema as the training table.",
                    sample_columns=["feature_a", "feature_b", "target"],
                    notes=["When connected, the node computes evaluation metrics on this table."],
                ),
            ],
            "output_contracts": [
                _contract(
                    "model",
                    f"Outputs a {label}.",
                    notes=["The output can be passed to Save Trained Model."],
                ),
                _contract(
                    "report",
                    "Outputs regression metrics such as r2, mae, and rmse.",
                    produced_columns=["metric", "value"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Training table",
                    "table",
                    port_key="trainTable",
                    columns=["feature_a", "feature_b", "target"],
                    rows=feature_rows,
                )
            ],
            "example_outputs": [
                _example(
                    "Model artifact",
                    "text",
                    port_key="model",
                    content=f"model_ref: {label}",
                ),
                _example(
                    "Training metrics",
                    "table",
                    port_key="report",
                    columns=["metric", "value"],
                    rows=metrics_rows,
                ),
            ],
            "common_errors": [
                "featureColumns is empty or contains unknown columns.",
                "targetColumn is missing from the table schema.",
            ],
        }

    if node_type in {
        "tabular.linear_regression_predict",
        "tabular.svm_regression_predict",
        "tabular.random_forest_regression_predict",
        "tabular.predict",
    }:
        return {
            "input_contracts": [
                _contract(
                    "table",
                    "Accepts a feature table for batch prediction.",
                    column_requirements=[
                        "All feature columns required by the selected model must exist.",
                    ],
                    sample_columns=["feature_a", "feature_b"],
                ),
            ],
            "output_contracts": [
                _contract(
                    "table",
                    "Outputs the input table plus a prediction column.",
                    produced_columns=["feature_a", "feature_b", "prediction"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Prediction input",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b"],
                    rows=[
                        {"feature_a": 1.0, "feature_b": 2.0},
                        {"feature_a": 2.0, "feature_b": 3.0},
                    ],
                )
            ],
            "example_outputs": [
                _example(
                    "Prediction output",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b", "prediction"],
                    rows=prediction_rows,
                )
            ],
            "common_errors": [
                "No compatible model asset is selected.",
                "The input table is missing one or more model feature columns.",
            ],
        }

    if node_type == "custom.api_predict":
        return {
            "input_contracts": [
                _contract(
                    "table",
                    "Accepts a feature table and sends it to the saved external API model.",
                    sample_columns=["feature_a", "feature_b"],
                    notes=[
                        "The selected model asset must be a Custom API model.",
                        "The external API must return prediction_values or table_rows.",
                    ],
                ),
            ],
            "output_contracts": [
                _contract(
                    "table",
                    "Outputs a prediction table returned by the external API.",
                    produced_columns=["feature_a", "feature_b", "prediction"],
                ),
            ],
            "example_inputs": [
                _example(
                    "External API request table",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b"],
                    rows=[
                        {"feature_a": 1.0, "feature_b": 2.0},
                        {"feature_a": 2.0, "feature_b": 3.0},
                    ],
                )
            ],
            "example_outputs": [
                _example(
                    "External API prediction table",
                    "table",
                    port_key="table",
                    columns=["feature_a", "feature_b", "prediction"],
                    rows=prediction_rows,
                )
            ],
            "common_errors": [
                "The selected model asset is not a Custom API model.",
                "The external API response format does not match the configured response mode.",
            ],
        }

    if node_type == "metrics.validate_regression":
        return {
            "input_contracts": [
                _contract(
                    "predictionTable",
                    "Accepts a prediction table containing predictionColumn.",
                    column_requirements=["The column named in predictionColumn must exist."],
                    sample_columns=["feature_a", "prediction"],
                ),
                _contract(
                    "groundTruthTable",
                    "Accepts a ground-truth table containing groundTruthColumn.",
                    column_requirements=["The column named in groundTruthColumn must exist."],
                    sample_columns=["feature_a", "target"],
                ),
            ],
            "output_contracts": [
                _contract(
                    "report",
                    "Outputs regression metrics for the selected metric list.",
                    produced_columns=["metric", "value"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Prediction table",
                    "table",
                    port_key="predictionTable",
                    columns=["feature_a", "prediction"],
                    rows=[
                        {"feature_a": 1.0, "prediction": 2.3},
                        {"feature_a": 2.0, "prediction": 3.5},
                    ],
                ),
                _example(
                    "Ground-truth table",
                    "table",
                    port_key="groundTruthTable",
                    columns=["feature_a", "target"],
                    rows=[
                        {"feature_a": 1.0, "target": 2.1},
                        {"feature_a": 2.0, "target": 3.4},
                    ],
                ),
            ],
            "example_outputs": [
                _example(
                    "Validation metrics",
                    "table",
                    port_key="report",
                    columns=["metric", "value"],
                    rows=metrics_rows,
                )
            ],
            "common_errors": [
                "predictionColumn is missing from the prediction table.",
                "groundTruthColumn is missing from the ground-truth table.",
            ],
        }

    if node_type == "model.save_trained_model":
        return {
            "input_contracts": [
                _contract(
                    "model",
                    "Accepts a trained model artifact produced by a training node.",
                    notes=["Use this node to save the trained model into personal assets."],
                ),
            ],
            "output_contracts": [
                _contract(
                    "model",
                    "Outputs a saved model reference.",
                    notes=["The saved model can be reused in prediction nodes."],
                ),
                _contract(
                    "artifact",
                    "Outputs the raw model artifact file path.",
                ),
            ],
            "example_inputs": [
                _example(
                    "Incoming trained model",
                    "text",
                    port_key="model",
                    content="model_ref: trained random forest regression model",
                )
            ],
            "example_outputs": [
                _example(
                    "Saved model asset",
                    "text",
                    port_key="model",
                    content="model_ref: Engineer Random Forest Model / 1.0.0",
                )
            ],
            "common_errors": [
                "The incoming model port is not connected.",
                "saveToPlatform is enabled but the model cannot be persisted.",
            ],
        }

    if node_type == "export.table":
        return {
            "input_contracts": [
                _contract(
                    "input",
                    "Accepts any table output that should be written to CSV.",
                    sample_columns=["feature_a", "feature_b", "prediction"],
                ),
            ],
            "output_contracts": [
                _contract(
                    "artifact",
                    "Outputs a CSV artifact and can optionally save it as a dataset version.",
                    file_formats=["csv"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Table to export",
                    "table",
                    port_key="input",
                    columns=["feature_a", "feature_b", "prediction"],
                    rows=prediction_rows,
                )
            ],
            "example_outputs": [
                _example(
                    "Exported artifact",
                    "text",
                    port_key="artifact",
                    content="prediction-output.csv",
                )
            ],
            "common_errors": [
                "The input table is not connected.",
                "The table cannot be serialized to CSV.",
            ],
        }

    if node_type == "export.metrics":
        return {
            "input_contracts": [
                _contract(
                    "input",
                    "Accepts a metrics report produced by Regression Validation or training nodes.",
                    produced_columns=["metric", "value"],
                ),
            ],
            "output_contracts": [
                _contract(
                    "artifact",
                    "Outputs a JSON or CSV metrics artifact and can optionally save it as a dataset version.",
                    file_formats=["json", "csv"],
                ),
            ],
            "example_inputs": [
                _example(
                    "Metrics report",
                    "table",
                    port_key="input",
                    columns=["metric", "value"],
                    rows=metrics_rows,
                )
            ],
            "example_outputs": [
                _example(
                    "Exported metrics artifact",
                    "text",
                    port_key="artifact",
                    content="validation-metrics.json",
                )
            ],
            "common_errors": [
                "The metrics input is not connected.",
                "The selected export format is not supported.",
            ],
        }

    return {
        "input_contracts": [],
        "output_contracts": [],
        "example_inputs": [],
        "example_outputs": [],
        "common_errors": [],
    }


def _augment_catalog_item(item: WorkflowCatalogItem) -> WorkflowCatalogItem:
    return item.model_copy(update=_catalog_contract_metadata(item.type))


BUILTIN_NODE_CATALOG: list[WorkflowCatalogItem] = [
    WorkflowCatalogItem(
        type="source.dataset_version",
        label="Dataset Version",
        category="source",
        description="Select a dataset version and expose it to downstream table nodes.",
        runtime_kind="source",
        supported_tasks=["tabular_training", "tabular_prediction", "tabular_validation", "custom_api_prediction"],
        tags=["dataset", "version", "input"],
        outputs=[_port("dataset", "Dataset Version", "dataset_version")],
        params=[
            _param(
                "datasetVersionId",
                "Dataset Version",
                "datasetVersion",
                description="Choose the CSV dataset version bound to this source node.",
                required=True,
            )
        ],
    ),
    WorkflowCatalogItem(
        type="source.sentinel2_gee_download",
        label="Sentinel-2 Download",
        category="source",
        description="Download one Sentinel-2 L2A scene from Google Earth Engine by manual bbox or saved ROI.",
        runtime_kind="source",
        supported_tasks=["sentinel_download"],
        tags=["sentinel", "gee", "download", "raster"],
        outputs=[_port("dataset", "Raster Dataset", "dataset_version")],
        params=[
            _param(
                "roiMode",
                "ROI Mode",
                "select",
                default_value="manual_bbox",
                required=True,
                options=[
                    ("manual_bbox", "Manual BBox"),
                    ("saved_roi", "Saved ROI"),
                ],
            ),
            _param(
                "roiId",
                "Saved ROI",
                "select",
                description="Used only when ROI Mode is Saved ROI.",
            ),
            _param(
                "bbox",
                "BBox",
                "text",
                description="Used only when ROI Mode is Manual BBox. Use minLon,minLat,maxLon,maxLat in EPSG:4326.",
                placeholder="116.10,39.70,116.65,40.10",
            ),
            _param(
                "startDate",
                "Start Date",
                "text",
                default_value="2025-06-01",
                placeholder="YYYY-MM-DD",
                required=True,
            ),
            _param(
                "endDate",
                "End Date",
                "text",
                default_value="2025-06-30",
                placeholder="YYYY-MM-DD",
                required=True,
            ),
            _param(
                "maxCloudCover",
                "Max Cloud Cover (%)",
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
                required=True,
                options=[
                    ("B2", "B2 Blue"),
                    ("B3", "B3 Green"),
                    ("B4", "B4 Red"),
                    ("B8", "B8 NIR"),
                    ("B11", "B11 SWIR1"),
                    ("B12", "B12 SWIR2"),
                    ("SCL", "SCL Scene Classification"),
                ],
            ),
            _param(
                "scale",
                "Scale (m)",
                "number",
                default_value=10,
                min=10,
                step=10,
                required=True,
            ),
            _param(
                "credentialMode",
                "Credential Mode",
                "select",
                default_value="platform_default",
                required=True,
                options=[
                    ("platform_default", "Platform Default"),
                    ("personal", "Personal Credential"),
                ],
            ),
            _param(
                "personalCredentialId",
                "Personal Credential",
                "select",
                description="Used only when Credential Mode is Personal.",
            ),
            _param(
                "outputDatasetName",
                "Output Dataset Name",
                "text",
                default_value="Sentinel-2 Download",
                placeholder="Sentinel-2 Download",
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="table.load_csv",
        label="Load CSV Table",
        category="source",
        description="Load a CSV dataset version into an in-memory tabular dataset.",
        runtime_kind="transform",
        supported_tasks=["tabular_training", "tabular_prediction", "tabular_validation", "custom_api_prediction"],
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
                options=[
                    (",", "Comma"),
                    (";", "Semicolon"),
                    ("\\t", "Tab"),
                ],
            )
        ],
    ),
    WorkflowCatalogItem(
        type="table.train_test_split",
        label="Train/Test Split",
        category="preprocess",
        description="Split a tabular dataset into train and test tables.",
        runtime_kind="transform",
        supported_tasks=["tabular_training"],
        tags=["table", "split", "train", "test"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[
            _port("trainTable", "Train Table", "table"),
            _port("testTable", "Test Table", "table"),
        ],
        params=[
            _param("testSize", "Test Size", "number", default_value=0.2, min=0.05, max=0.95, step=0.05, required=True),
            _param("shuffle", "Shuffle", "boolean", default_value=True),
            _param("randomState", "Random State", "number", default_value=42, step=1),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.linear_regression_train",
        label="Linear Regression Train",
        category="inference",
        description="Train a linear regression model from a CSV table.",
        runtime_kind="inference",
        supported_tasks=["tabular_training"],
        tags=["table", "training", "regression", "linear"],
        inputs=[
            _port("trainTable", "Train Table", "table", required=True),
            _port("testTable", "Test Table", "table"),
        ],
        outputs=[
            _port("model", "Trained Model", "model_ref"),
            _port("report", "Training Metrics", "metrics_report"),
        ],
        params=[
            _param("featureColumns", "Feature Columns", "text", placeholder="feature_a, feature_b", required=True),
            _param("targetColumn", "Target Column", "text", default_value="target", placeholder="target", required=True),
            _param("fitIntercept", "Fit Intercept", "boolean", default_value=True),
            _param("positive", "Positive Coefficients", "boolean", default_value=False),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.svm_regression_train",
        label="SVM Regression Train",
        category="inference",
        description="Train an SVR model from a CSV table.",
        runtime_kind="inference",
        supported_tasks=["tabular_training"],
        tags=["table", "training", "regression", "svm"],
        inputs=[
            _port("trainTable", "Train Table", "table", required=True),
            _port("testTable", "Test Table", "table"),
        ],
        outputs=[
            _port("model", "Trained Model", "model_ref"),
            _port("report", "Training Metrics", "metrics_report"),
        ],
        params=[
            _param("featureColumns", "Feature Columns", "text", placeholder="feature_a, feature_b", required=True),
            _param("targetColumn", "Target Column", "text", default_value="target", placeholder="target", required=True),
            _param("kernel", "Kernel", "select", default_value="rbf", required=True, options=[("rbf", "RBF"), ("linear", "Linear"), ("poly", "Poly"), ("sigmoid", "Sigmoid")]),
            _param("c", "C", "number", default_value=1.0, min=0.01, step=0.1),
            _param("epsilon", "Epsilon", "number", default_value=0.1, min=0.0, step=0.1),
            _param("gamma", "Gamma", "text", default_value="scale", placeholder="scale"),
            _param("cacheSize", "Cache Size (MB)", "number", default_value=200, min=16, step=16),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.random_forest_regression_train",
        label="Random Forest Train",
        category="inference",
        description="Train a random forest regressor from a CSV table.",
        runtime_kind="inference",
        supported_tasks=["tabular_training"],
        tags=["table", "training", "regression", "random-forest"],
        inputs=[
            _port("trainTable", "Train Table", "table", required=True),
            _port("testTable", "Test Table", "table"),
        ],
        outputs=[
            _port("model", "Trained Model", "model_ref"),
            _port("report", "Training Metrics", "metrics_report"),
        ],
        params=[
            _param("featureColumns", "Feature Columns", "text", placeholder="feature_a, feature_b", required=True),
            _param("targetColumn", "Target Column", "text", default_value="target", placeholder="target", required=True),
            _param("nEstimators", "Trees", "number", default_value=100, min=1, step=1),
            _param("maxDepth", "Max Depth", "text", placeholder="Optional"),
            _param("minSamplesSplit", "Min Samples Split", "number", default_value=2, min=2, step=1),
            _param("minSamplesLeaf", "Min Samples Leaf", "number", default_value=1, min=1, step=1),
            _param("randomState", "Random State", "number", default_value=42, step=1),
            _param("nJobs", "Parallel Jobs", "number", default_value=1, min=1, step=1),
        ],
    ),
    WorkflowCatalogItem(
        type="model.save_trained_model",
        label="Save Trained Model",
        category="postprocess",
        description="Persist a trained model into your private model assets.",
        runtime_kind="export",
        supported_tasks=["tabular_training"],
        tags=["model", "save", "asset"],
        inputs=[_port("model", "Trained Model", "model_ref", required=True)],
        outputs=[
            _port("model", "Model", "model_ref"),
            _port("artifact", "Artifact", "artifact"),
        ],
        params=[
            _param("saveToPlatform", "Save To Platform", "boolean", default_value=True),
            _param("outputModelName", "Model Name", "text", default_value="Trained Model", placeholder="Trained Model"),
            _param("outputModelVersion", "Model Version", "text", default_value="1.0.0", placeholder="1.0.0"),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.linear_regression_predict",
        label="Linear Regression Predict",
        category="inference",
        description="Run a linear regression model against CSV rows and append predictions.",
        runtime_kind="inference",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["table", "prediction", "regression", "linear"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param(
                "modelVersionId",
                "Model Version",
                "modelVersion",
                description="Choose a platform model version compatible with linear regression.",
                required=True,
            ),
            _param(
                "predictionColumn",
                "Prediction Column",
                "text",
                default_value="prediction",
                placeholder="prediction",
                required=True,
            ),
            _param(
                "roundDigits",
                "Round Digits",
                "number",
                default_value=4,
                min=0,
                step=1,
            ),
            _param(
                "clipMin",
                "Clip Minimum",
                "text",
                placeholder="Optional minimum prediction value",
            ),
            _param(
                "clipMax",
                "Clip Maximum",
                "text",
                placeholder="Optional maximum prediction value",
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.svm_regression_predict",
        label="SVM Regression Predict",
        category="inference",
        description="Run an SVR model against CSV rows and append predictions.",
        runtime_kind="inference",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["table", "prediction", "regression", "svm"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param(
                "modelVersionId",
                "Model Version",
                "modelVersion",
                description="Choose a platform model version compatible with SVM regression.",
                required=True,
            ),
            _param(
                "predictionColumn",
                "Prediction Column",
                "text",
                default_value="prediction",
                placeholder="prediction",
                required=True,
            ),
            _param(
                "roundDigits",
                "Round Digits",
                "number",
                default_value=4,
                min=0,
                step=1,
            ),
            _param(
                "cacheSize",
                "Cache Size (MB)",
                "number",
                default_value=200,
                min=16,
                step=16,
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.random_forest_regression_predict",
        label="Random Forest Predict",
        category="inference",
        description="Run a random forest regressor against CSV rows and append predictions.",
        runtime_kind="inference",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["table", "prediction", "regression", "random-forest"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param(
                "modelVersionId",
                "Model Version",
                "modelVersion",
                description="Choose a platform model version compatible with random forest regression.",
                required=True,
            ),
            _param(
                "predictionColumn",
                "Prediction Column",
                "text",
                default_value="prediction",
                placeholder="prediction",
                required=True,
            ),
            _param(
                "roundDigits",
                "Round Digits",
                "number",
                default_value=4,
                min=0,
                step=1,
            ),
            _param(
                "nJobs",
                "Parallel Jobs",
                "number",
                default_value=1,
                min=1,
                step=1,
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="tabular.predict",
        label="Legacy Tabular Prediction",
        category="inference",
        description="Legacy generic tabular prediction node kept for backward compatibility.",
        runtime_kind="inference",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["table", "prediction", "regression", "legacy"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param(
                "modelVersionId",
                "Model Version",
                "modelVersion",
                description="Choose a compatible platform model version to use.",
                required=True,
            ),
            _param(
                "predictionColumn",
                "Prediction Column",
                "text",
                default_value="prediction",
                placeholder="prediction",
                required=True,
            ),
            _param(
                "runtimeParametersJson",
                "Runtime Parameters JSON",
                "text",
                default_value="{}",
                placeholder='{"round_digits": 4}',
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="custom.api_predict",
        label="Custom API Predict",
        category="inference",
        description="Send a table to an external HTTP API model and merge the prediction result back.",
        runtime_kind="inference",
        supported_tasks=["custom_api_prediction"],
        tags=["table", "prediction", "custom", "api"],
        inputs=[_port("table", "Input Table", "table", required=True)],
        outputs=[_port("table", "Prediction Table", "table")],
        params=[
            _param("modelVersionId", "Custom Model", "modelVersion", description="Choose a saved custom API model asset.", required=True),
            _param("predictionColumn", "Prediction Column", "text", default_value="prediction", placeholder="prediction"),
            _param("callParametersJson", "Call Parameters JSON", "text", default_value="{}", placeholder='{"threshold": 0.5}'),
        ],
    ),
    WorkflowCatalogItem(
        type="metrics.validate_regression",
        label="Regression Validation",
        category="postprocess",
        description="Compare prediction and ground-truth tables and compute regression metrics.",
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
                placeholder="prediction",
                required=True,
            ),
            _param(
                "groundTruthColumn",
                "Ground Truth Column",
                "text",
                default_value="target",
                placeholder="target",
                required=True,
            ),
            _param(
                "metrics",
                "Metrics",
                "multiselect",
                default_value=["r2", "mae", "rmse"],
                required=True,
                options=[
                    ("r2", "R2"),
                    ("mae", "MAE"),
                    ("mse", "MSE"),
                    ("rmse", "RMSE"),
                    ("mape", "MAPE"),
                ],
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="export.table",
        label="Export Prediction Table",
        category="postprocess",
        description="Write the current table to CSV and optionally save it back to the platform.",
        runtime_kind="export",
        supported_tasks=["tabular_prediction", "tabular_validation"],
        tags=["export", "table", "csv"],
        inputs=[_port("input", "Table Input", "table", required=True)],
        outputs=[_port("artifact", "Artifact", "artifact")],
        params=[
            _param(
                "saveToPlatform",
                "Save To Platform",
                "boolean",
                default_value=True,
            ),
            _param(
                "outputDatasetName",
                "Output Dataset Name",
                "text",
                default_value="Prediction Output",
                placeholder="Prediction Output",
            ),
        ],
    ),
    WorkflowCatalogItem(
        type="export.metrics",
        label="Export Metrics Report",
        category="postprocess",
        description=(
            "Write metrics to JSON or CSV and optionally save "
            "the artifact to the platform."
        ),
        runtime_kind="export",
        supported_tasks=["tabular_validation"],
        tags=["export", "metrics", "report"],
        inputs=[_port("input", "Metrics Input", "metrics_report", required=True)],
        outputs=[_port("artifact", "Artifact", "artifact")],
        params=[
            _param(
                "saveToPlatform",
                "Save To Platform",
                "boolean",
                default_value=True,
            ),
            _param(
                "outputDatasetName",
                "Output Dataset Name",
                "text",
                default_value="Validation Metrics",
                placeholder="Validation Metrics",
            ),
            _param(
                "format",
                "Format",
                "select",
                default_value="json",
                required=True,
                options=[
                    ("json", "JSON"),
                    ("csv", "CSV"),
                ],
            ),
        ],
    ),
]

BUILTIN_NODE_CATALOG = [_augment_catalog_item(item) for item in BUILTIN_NODE_CATALOG]

BUILTIN_NODE_DEFINITIONS = {item.type: item for item in BUILTIN_NODE_CATALOG}


def supported_node_types() -> set[str]:
    return set(BUILTIN_NODE_DEFINITIONS)


def catalog_definition(node_type: str) -> WorkflowCatalogItem:
    try:
        return BUILTIN_NODE_DEFINITIONS[node_type]
    except KeyError as exc:
        raise LookupError(f"Unsupported node type: {node_type}") from exc


def _node(
    node_id: str,
    node_type: str,
    x: float,
    y: float,
    *,
    params: dict[str, object] | None = None,
    input_bindings: dict[str, str] | None = None,
) -> WorkflowNode:
    definition = catalog_definition(node_type)
    return WorkflowNode(
        id=node_id,
        type=node_type,
        position={"x": x, "y": y},
        params=params or {},
        input_bindings=input_bindings or {},
        output_defs=definition.outputs,
    )


def _sample(node_id: str, params: dict[str, object]) -> WorkflowTemplateSampleBinding:
    return WorkflowTemplateSampleBinding(node_id=node_id, params=params)


BUILTIN_WORKFLOW_TEMPLATES: list[WorkflowTemplateDefinition] = [
    WorkflowTemplateDefinition(
        id="tabular.prediction",
        label="CSV Linear Regression Pipeline",
        description=(
            "Load a CSV dataset, run linear regression prediction, "
            "and export the result table."
        ),
        tags=["tabular", "prediction", "csv", "linear"],
        supported_tasks=["tabular_prediction"],
        sample_bindings=[
            _sample(
                "dataset-source",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
            _sample(
                "predict-table",
                {"modelVersionId": SEED_LINEAR_MODEL_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("dataset-source", "source.dataset_version", 0, 160),
                _node(
                    "load-table",
                    "table.load_csv",
                    260,
                    160,
                    input_bindings={"dataset": "dataset-source:dataset"},
                ),
                _node(
                    "predict-table",
                    "tabular.linear_regression_predict",
                    560,
                    160,
                    input_bindings={"table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "roundDigits": 4,
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    860,
                    160,
                    input_bindings={"input": "predict-table:table"},
                    params={
                        "saveToPlatform": True,
                        "outputDatasetName": "Prediction Output",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="template-edge-1",
                    source="dataset-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="template-edge-2",
                    source="load-table",
                    target="predict-table",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="template-edge-3",
                    source="predict-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.svm_prediction",
        label="CSV SVM Regression Pipeline",
        description=(
            "Load a CSV dataset, run SVM regression prediction, "
            "and export the result table."
        ),
        tags=["tabular", "prediction", "csv", "svm"],
        supported_tasks=["tabular_prediction"],
        sample_bindings=[
            _sample(
                "dataset-source",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
            _sample(
                "predict-table",
                {"modelVersionId": SEED_SVM_MODEL_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("dataset-source", "source.dataset_version", 0, 160),
                _node(
                    "load-table",
                    "table.load_csv",
                    260,
                    160,
                    input_bindings={"dataset": "dataset-source:dataset"},
                ),
                _node(
                    "predict-table",
                    "tabular.svm_regression_predict",
                    560,
                    160,
                    input_bindings={"table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "roundDigits": 4,
                        "cacheSize": 200,
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    860,
                    160,
                    input_bindings={"input": "predict-table:table"},
                    params={
                        "saveToPlatform": True,
                        "outputDatasetName": "Prediction Output",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="template-edge-1",
                    source="dataset-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="template-edge-2",
                    source="load-table",
                    target="predict-table",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="template-edge-3",
                    source="predict-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.random_forest_prediction",
        label="CSV Random Forest Pipeline",
        description=(
            "Load a CSV dataset, run random forest prediction, "
            "and export the result table."
        ),
        tags=["tabular", "prediction", "csv", "random-forest"],
        supported_tasks=["tabular_prediction"],
        sample_bindings=[
            _sample(
                "dataset-source",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
            _sample(
                "predict-table",
                {"modelVersionId": SEED_RANDOM_FOREST_MODEL_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("dataset-source", "source.dataset_version", 0, 160),
                _node(
                    "load-table",
                    "table.load_csv",
                    260,
                    160,
                    input_bindings={"dataset": "dataset-source:dataset"},
                ),
                _node(
                    "predict-table",
                    "tabular.random_forest_regression_predict",
                    560,
                    160,
                    input_bindings={"table": "load-table:table"},
                    params={
                        "predictionColumn": "prediction",
                        "roundDigits": 4,
                        "nJobs": 1,
                    },
                ),
                _node(
                    "export-table",
                    "export.table",
                    860,
                    160,
                    input_bindings={"input": "predict-table:table"},
                    params={
                        "saveToPlatform": True,
                        "outputDatasetName": "Prediction Output",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="template-edge-1",
                    source="dataset-source",
                    target="load-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="template-edge-2",
                    source="load-table",
                    target="predict-table",
                    source_handle="table",
                    target_handle="table",
                ),
                WorkflowEdge(
                    id="template-edge-3",
                    source="predict-table",
                    target="export-table",
                    source_handle="table",
                    target_handle="input",
                ),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.linear_regression_training",
        label="CSV Linear Regression Training",
        description="Split a CSV table, train linear regression, and save the trained model asset.",
        tags=["tabular", "training", "csv", "linear"],
        supported_tasks=["tabular_training"],
        sample_bindings=[
            _sample(
                "training-dataset",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("training-dataset", "source.dataset_version", 0, 180),
                _node(
                    "load-training-table",
                    "table.load_csv",
                    250,
                    180,
                    input_bindings={"dataset": "training-dataset:dataset"},
                ),
                _node(
                    "split-training-table",
                    "table.train_test_split",
                    500,
                    180,
                    input_bindings={"table": "load-training-table:table"},
                    params={"testSize": 0.25, "shuffle": True, "randomState": 42},
                ),
                _node(
                    "train-linear-model",
                    "tabular.linear_regression_train",
                    800,
                    180,
                    input_bindings={
                        "trainTable": "split-training-table:trainTable",
                        "testTable": "split-training-table:testTable",
                    },
                    params={
                        "featureColumns": "feature_a, feature_b",
                        "targetColumn": "target",
                        "fitIntercept": True,
                        "positive": False,
                    },
                ),
                _node(
                    "save-linear-model",
                    "model.save_trained_model",
                    1080,
                    180,
                    input_bindings={"model": "train-linear-model:model"},
                    params={
                        "saveToPlatform": True,
                        "outputModelName": "Linear Regression Model",
                        "outputModelVersion": "1.0.0",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(id="template-edge-1", source="training-dataset", target="load-training-table", source_handle="dataset", target_handle="dataset"),
                WorkflowEdge(id="template-edge-2", source="load-training-table", target="split-training-table", source_handle="table", target_handle="table"),
                WorkflowEdge(id="template-edge-3", source="split-training-table", target="train-linear-model", source_handle="trainTable", target_handle="trainTable"),
                WorkflowEdge(id="template-edge-4", source="split-training-table", target="train-linear-model", source_handle="testTable", target_handle="testTable"),
                WorkflowEdge(id="template-edge-5", source="train-linear-model", target="save-linear-model", source_handle="model", target_handle="model"),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.svm_training",
        label="CSV SVM Regression Training",
        description="Split a CSV table, train SVM regression, and save the trained model asset.",
        tags=["tabular", "training", "csv", "svm"],
        supported_tasks=["tabular_training"],
        sample_bindings=[
            _sample(
                "training-dataset",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("training-dataset", "source.dataset_version", 0, 180),
                _node("load-training-table", "table.load_csv", 250, 180, input_bindings={"dataset": "training-dataset:dataset"}),
                _node("split-training-table", "table.train_test_split", 500, 180, input_bindings={"table": "load-training-table:table"}, params={"testSize": 0.25, "shuffle": True, "randomState": 42}),
                _node(
                    "train-svm-model",
                    "tabular.svm_regression_train",
                    800,
                    180,
                    input_bindings={
                        "trainTable": "split-training-table:trainTable",
                        "testTable": "split-training-table:testTable",
                    },
                    params={
                        "featureColumns": "feature_a, feature_b",
                        "targetColumn": "target",
                        "kernel": "linear",
                        "c": 1.0,
                        "epsilon": 0.1,
                        "gamma": "scale",
                        "cacheSize": 200,
                    },
                ),
                _node(
                    "save-svm-model",
                    "model.save_trained_model",
                    1080,
                    180,
                    input_bindings={"model": "train-svm-model:model"},
                    params={
                        "saveToPlatform": True,
                        "outputModelName": "SVM Regression Model",
                        "outputModelVersion": "1.0.0",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(id="template-edge-1", source="training-dataset", target="load-training-table", source_handle="dataset", target_handle="dataset"),
                WorkflowEdge(id="template-edge-2", source="load-training-table", target="split-training-table", source_handle="table", target_handle="table"),
                WorkflowEdge(id="template-edge-3", source="split-training-table", target="train-svm-model", source_handle="trainTable", target_handle="trainTable"),
                WorkflowEdge(id="template-edge-4", source="split-training-table", target="train-svm-model", source_handle="testTable", target_handle="testTable"),
                WorkflowEdge(id="template-edge-5", source="train-svm-model", target="save-svm-model", source_handle="model", target_handle="model"),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.random_forest_training",
        label="CSV Random Forest Training",
        description="Split a CSV table, train random forest regression, and save the trained model asset.",
        tags=["tabular", "training", "csv", "random-forest"],
        supported_tasks=["tabular_training"],
        sample_bindings=[
            _sample(
                "training-dataset",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("training-dataset", "source.dataset_version", 0, 180),
                _node("load-training-table", "table.load_csv", 250, 180, input_bindings={"dataset": "training-dataset:dataset"}),
                _node("split-training-table", "table.train_test_split", 500, 180, input_bindings={"table": "load-training-table:table"}, params={"testSize": 0.25, "shuffle": True, "randomState": 42}),
                _node(
                    "train-rf-model",
                    "tabular.random_forest_regression_train",
                    800,
                    180,
                    input_bindings={
                        "trainTable": "split-training-table:trainTable",
                        "testTable": "split-training-table:testTable",
                    },
                    params={
                        "featureColumns": "feature_a, feature_b",
                        "targetColumn": "target",
                        "nEstimators": 100,
                        "maxDepth": "",
                        "minSamplesSplit": 2,
                        "minSamplesLeaf": 1,
                        "randomState": 42,
                        "nJobs": 1,
                    },
                ),
                _node(
                    "save-rf-model",
                    "model.save_trained_model",
                    1080,
                    180,
                    input_bindings={"model": "train-rf-model:model"},
                    params={
                        "saveToPlatform": True,
                        "outputModelName": "Random Forest Regression Model",
                        "outputModelVersion": "1.0.0",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(id="template-edge-1", source="training-dataset", target="load-training-table", source_handle="dataset", target_handle="dataset"),
                WorkflowEdge(id="template-edge-2", source="load-training-table", target="split-training-table", source_handle="table", target_handle="table"),
                WorkflowEdge(id="template-edge-3", source="split-training-table", target="train-rf-model", source_handle="trainTable", target_handle="trainTable"),
                WorkflowEdge(id="template-edge-4", source="split-training-table", target="train-rf-model", source_handle="testTable", target_handle="testTable"),
                WorkflowEdge(id="template-edge-5", source="train-rf-model", target="save-rf-model", source_handle="model", target_handle="model"),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.custom_api_prediction",
        label="CSV Custom API Prediction",
        description="Load a CSV table, call a saved external API model, and export the prediction result.",
        tags=["tabular", "prediction", "custom", "api"],
        supported_tasks=["custom_api_prediction"],
        sample_bindings=[
            _sample(
                "dataset-source",
                {"datasetVersionId": SEED_TABULAR_INPUT_DATASET_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("dataset-source", "source.dataset_version", 0, 160),
                _node("load-table", "table.load_csv", 260, 160, input_bindings={"dataset": "dataset-source:dataset"}),
                _node(
                    "custom-api-predict",
                    "custom.api_predict",
                    560,
                    160,
                    input_bindings={"table": "load-table:table"},
                    params={"predictionColumn": "prediction", "callParametersJson": "{}"},
                ),
                _node(
                    "export-table",
                    "export.table",
                    860,
                    160,
                    input_bindings={"input": "custom-api-predict:table"},
                    params={"saveToPlatform": True, "outputDatasetName": "Custom API Prediction Output"},
                ),
            ],
            edges=[
                WorkflowEdge(id="template-edge-1", source="dataset-source", target="load-table", source_handle="dataset", target_handle="dataset"),
                WorkflowEdge(id="template-edge-2", source="load-table", target="custom-api-predict", source_handle="table", target_handle="table"),
                WorkflowEdge(id="template-edge-3", source="custom-api-predict", target="export-table", source_handle="table", target_handle="input"),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="tabular.validation",
        label="CSV Validation Pipeline",
        description="Compare a prediction table and a ground-truth CSV table, then export metrics.",
        tags=["tabular", "validation", "metrics"],
        supported_tasks=["tabular_validation"],
        sample_bindings=[
            _sample(
                "prediction-dataset",
                {"datasetVersionId": SEED_TABULAR_PREDICTION_DATASET_VERSION_ID},
            ),
            _sample(
                "ground-truth-dataset",
                {"datasetVersionId": SEED_TABULAR_GROUND_TRUTH_DATASET_VERSION_ID},
            ),
        ],
        graph=WorkflowGraph(
            nodes=[
                _node("prediction-dataset", "source.dataset_version", 0, 120),
                _node("ground-truth-dataset", "source.dataset_version", 0, 340),
                _node(
                    "load-prediction-table",
                    "table.load_csv",
                    260,
                    120,
                    input_bindings={"dataset": "prediction-dataset:dataset"},
                ),
                _node(
                    "load-ground-truth-table",
                    "table.load_csv",
                    260,
                    340,
                    input_bindings={"dataset": "ground-truth-dataset:dataset"},
                ),
                _node(
                    "validate-regression",
                    "metrics.validate_regression",
                    580,
                    220,
                    input_bindings={
                        "predictionTable": "load-prediction-table:table",
                        "groundTruthTable": "load-ground-truth-table:table",
                    },
                    params={
                        "predictionColumn": "prediction",
                        "groundTruthColumn": "target",
                        "metrics": ["r2", "mae", "rmse"],
                    },
                ),
                _node(
                    "export-metrics",
                    "export.metrics",
                    900,
                    220,
                    input_bindings={"input": "validate-regression:report"},
                    params={
                        "saveToPlatform": True,
                        "outputDatasetName": "Validation Metrics",
                        "format": "json",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(
                    id="template-edge-1",
                    source="prediction-dataset",
                    target="load-prediction-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="template-edge-2",
                    source="ground-truth-dataset",
                    target="load-ground-truth-table",
                    source_handle="dataset",
                    target_handle="dataset",
                ),
                WorkflowEdge(
                    id="template-edge-3",
                    source="load-prediction-table",
                    target="validate-regression",
                    source_handle="table",
                    target_handle="predictionTable",
                ),
                WorkflowEdge(
                    id="template-edge-4",
                    source="load-ground-truth-table",
                    target="validate-regression",
                    source_handle="table",
                    target_handle="groundTruthTable",
                ),
                WorkflowEdge(
                    id="template-edge-5",
                    source="validate-regression",
                    target="export-metrics",
                    source_handle="report",
                    target_handle="input",
                ),
            ],
        ),
    ),
    WorkflowTemplateDefinition(
        id="sentinel2.single_scene_download",
        label="Sentinel-2 Single Scene Download",
        description="Download a Sentinel-2 L2A scene from Google Earth Engine and save it as a private raster dataset.",
        tags=["sentinel", "gee", "download", "raster"],
        supported_tasks=["sentinel_download"],
        graph=WorkflowGraph(
            nodes=[
                _node(
                    "sentinel-source",
                    "source.sentinel2_gee_download",
                    160,
                    180,
                    params={
                        "roiMode": "manual_bbox",
                        "bbox": "116.10,39.70,116.65,40.10",
                        "startDate": "2025-06-01",
                        "endDate": "2025-06-30",
                        "maxCloudCover": 20,
                        "bands": ["B4", "B3", "B2"],
                        "scale": 10,
                        "credentialMode": "platform_default",
                        "outputDatasetName": "Sentinel-2 Download",
                    },
                ),
            ],
            edges=[],
        ),
    ),
]


def workflow_templates() -> list[WorkflowTemplateDefinition]:
    return BUILTIN_WORKFLOW_TEMPLATES
