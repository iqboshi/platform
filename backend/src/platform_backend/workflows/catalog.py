from __future__ import annotations

from platform_backend.schemas.workflow import (
    WorkflowCatalogItem,
    WorkflowEdge,
    WorkflowGraph,
    WorkflowNode,
    WorkflowNodePort,
    WorkflowParamDefinition,
    WorkflowParamFieldType,
    WorkflowParamOption,
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


BUILTIN_NODE_CATALOG: list[WorkflowCatalogItem] = [
    WorkflowCatalogItem(
        type="source.dataset_version",
        label="Dataset Version",
        category="source",
        description="Select a dataset version and expose it to downstream table nodes.",
        runtime_kind="source",
        supported_tasks=["tabular_prediction", "tabular_validation"],
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
        type="table.load_csv",
        label="Load CSV Table",
        category="source",
        description="Load a CSV dataset version into an in-memory tabular dataset.",
        runtime_kind="transform",
        supported_tasks=["tabular_prediction", "tabular_validation"],
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
                description="Choose the uploaded linear regression model version.",
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
                description="Choose the uploaded SVM regression model version.",
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
                description="Choose the uploaded random forest model version.",
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
                description="Choose the uploaded tabular model package to use.",
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
]


def workflow_templates() -> list[WorkflowTemplateDefinition]:
    return BUILTIN_WORKFLOW_TEMPLATES
