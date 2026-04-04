from __future__ import annotations

import csv
import json
import math
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable
from urllib import error as urllib_error
from urllib import request as urllib_request
from uuid import uuid4

from platform_backend.domain_enums import DatasetKind
from platform_backend.models.entities import (
    Dataset,
    DatasetVersion,
    Model,
    ModelVersion,
    WorkflowVersion,
)

TABULAR_MODEL_KIND = "tabular_model"

ALGORITHM_LINEAR_REGRESSION = "linear_regression"
ALGORITHM_SVM_REGRESSION = "svm_regression"
ALGORITHM_RANDOM_FOREST_REGRESSION = "random_forest_regression"

TABULAR_NODE_ALGORITHMS: dict[str, str] = {
    "tabular.linear_regression_predict": ALGORITHM_LINEAR_REGRESSION,
    "tabular.svm_regression_predict": ALGORITHM_SVM_REGRESSION,
    "tabular.random_forest_regression_predict": ALGORITHM_RANDOM_FOREST_REGRESSION,
}

TABULAR_TRAIN_NODE_ALGORITHMS: dict[str, str] = {
    "tabular.linear_regression_train": ALGORITHM_LINEAR_REGRESSION,
    "tabular.svm_regression_train": ALGORITHM_SVM_REGRESSION,
    "tabular.random_forest_regression_train": ALGORITHM_RANDOM_FOREST_REGRESSION,
}

TABULAR_EXECUTABLE_NODE_TYPES = {
    "source.dataset_version",
    "source.model_version",
    "table.load_csv",
    "table.train_test_split",
    "metrics.validate_regression",
    "export.table",
    "export.metrics",
    "model.save_trained_model",
    "custom.api_predict",
    "tabular.predict",
    *TABULAR_NODE_ALGORITHMS.keys(),
    *TABULAR_TRAIN_NODE_ALGORITHMS.keys(),
}

CreatePrivateDatasetVersionFn = Callable[..., Any]
CreatePrivateModelVersionFn = Callable[..., Any]


@dataclass(slots=True)
class TableArtifact:
    columns: list[str]
    rows: list[dict[str, Any]]


@dataclass(slots=True)
class MetricsArtifact:
    metrics: dict[str, float]
    prediction_column: str
    ground_truth_column: str
    row_count: int


@dataclass(slots=True)
class TabularModelSpec:
    algorithm_key: str
    artifact_format: str
    feature_names: list[str]
    default_parameters: dict[str, Any]
    package: dict[str, Any] | None = None


@dataclass(slots=True)
class TrainedModelArtifact:
    algorithm_key: str
    estimator: Any
    feature_names: list[str]
    target_column: str
    default_parameters: dict[str, Any]
    training_hyperparameters: dict[str, Any]
    metrics: dict[str, float]
    row_count: int
    framework: str = "scikit-learn"


@dataclass(slots=True)
class TabularExecutionState:
    resolved_outputs: dict[str, dict[str, Any]] = field(default_factory=dict)
    saved_dataset_version_ids: list[str] = field(default_factory=list)
    saved_model_version_ids: list[str] = field(default_factory=list)
    result_dataset_version_id: str | None = None
    result_model_version_id: str | None = None
    artifact_path: str | None = None
    latest_metrics: dict[str, float] = field(default_factory=dict)


def parse_json_value(text: str, *, field_name: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{field_name} must be valid JSON.") from exc


def parse_json_object(text: str, *, field_name: str) -> dict[str, Any]:
    payload = parse_json_value(text, field_name=field_name)
    if not isinstance(payload, dict):
        raise ValueError(f"{field_name} must be a JSON object.")
    return payload


def parse_json_string_list(text: str, *, field_name: str) -> list[str]:
    payload = parse_json_value(text, field_name=field_name)
    if not isinstance(payload, list) or not all(isinstance(item, str) for item in payload):
        raise ValueError(f"{field_name} must be a JSON array of strings.")
    return [item.strip() for item in payload if item.strip()]


def summarize_csv_file(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        rows = list(reader)

    columns = list(reader.fieldnames or [])
    return {
        "columns": columns,
        "row_count": len(rows),
        "sample_rows": rows[:5],
    }


def validate_model_package(payload: dict[str, Any]) -> dict[str, Any]:
    if str(payload.get("kind", "")).strip() != TABULAR_MODEL_KIND:
        raise ValueError("Model package kind must be 'tabular_model'.")

    algorithm_key = str(payload.get("model_type", "")).strip()
    if algorithm_key != ALGORITHM_LINEAR_REGRESSION:
        raise ValueError("JSON model packages currently support only linear_regression.")

    task_type = str(payload.get("task_type", "")).strip() or "regression"
    if task_type != "regression":
        raise ValueError("Only regression tabular models are supported.")

    features = payload.get("features")
    if not isinstance(features, list) or not all(isinstance(item, str) for item in features):
        raise ValueError("Model package features must be a string array.")
    normalized_features = [item.strip() for item in features if item.strip()]
    if not normalized_features:
        raise ValueError("Model package features cannot be empty.")

    coefficients = payload.get("coefficients")
    if not isinstance(coefficients, dict):
        raise ValueError("Model package coefficients must be an object.")

    normalized_coefficients: dict[str, float] = {}
    for feature_name in normalized_features:
        value = coefficients.get(feature_name)
        if not isinstance(value, int | float):
            raise ValueError(f"Missing numeric coefficient for feature '{feature_name}'.")
        normalized_coefficients[feature_name] = float(value)

    intercept = payload.get("intercept", 0.0)
    if not isinstance(intercept, int | float):
        raise ValueError("Model package intercept must be numeric.")

    prediction_column = str(payload.get("prediction_column", "")).strip() or "prediction"
    default_parameters = payload.get("default_parameters", {})
    if not isinstance(default_parameters, dict):
        raise ValueError("Model package default_parameters must be an object.")

    return {
        "kind": TABULAR_MODEL_KIND,
        "model_type": ALGORITHM_LINEAR_REGRESSION,
        "task_type": task_type,
        "features": normalized_features,
        "intercept": float(intercept),
        "coefficients": normalized_coefficients,
        "prediction_column": prediction_column,
        "default_parameters": dict(default_parameters),
    }


def _snake_to_camel_parameters(parameters: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "round_digits": "roundDigits",
        "prediction_column": "predictionColumn",
        "cache_size": "cacheSize",
        "n_jobs": "nJobs",
        "clip_min": "clipMin",
        "clip_max": "clipMax",
    }
    normalized: dict[str, Any] = {}
    for key, value in parameters.items():
        normalized[mapping.get(key, key)] = value
    return normalized


def _default_runtime_parameters(algorithm_key: str) -> dict[str, Any]:
    base_defaults: dict[str, Any] = {"roundDigits": 4}
    if algorithm_key == ALGORITHM_SVM_REGRESSION:
        base_defaults["cacheSize"] = 200
    if algorithm_key == ALGORITHM_RANDOM_FOREST_REGRESSION:
        base_defaults["nJobs"] = 1
    return base_defaults


def _normalize_default_parameters(
    algorithm_key: str,
    parameters: dict[str, Any] | None,
) -> dict[str, Any]:
    normalized = _default_runtime_parameters(algorithm_key)
    if parameters:
        normalized.update(_snake_to_camel_parameters(parameters))
    return normalized


def _load_joblib():
    import joblib

    return joblib


def _infer_algorithm_key_from_estimator(estimator: Any) -> str:
    try:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.linear_model import LinearRegression
        from sklearn.svm import SVR
    except ImportError as exc:
        raise RuntimeError("scikit-learn is required for joblib tabular model support.") from exc

    if isinstance(estimator, LinearRegression):
        return ALGORITHM_LINEAR_REGRESSION
    if isinstance(estimator, SVR):
        return ALGORITHM_SVM_REGRESSION
    if isinstance(estimator, RandomForestRegressor):
        return ALGORITHM_RANDOM_FOREST_REGRESSION
    raise ValueError(
        "Unsupported estimator type. "
        "Expected LinearRegression, SVR, or RandomForestRegressor."
    )


def _extract_feature_names(estimator: Any, explicit_feature_names: list[str]) -> list[str]:
    if explicit_feature_names:
        return explicit_feature_names

    raw_feature_names = getattr(estimator, "feature_names_in_", None)
    if raw_feature_names is None:
        return []
    return [str(item) for item in raw_feature_names]


def _extract_training_hyperparameters(estimator: Any, algorithm_key: str) -> dict[str, Any]:
    get_params = getattr(estimator, "get_params", None)
    if not callable(get_params):
        return {}

    params = get_params(deep=False)
    selected_keys: list[str]
    if algorithm_key == ALGORITHM_LINEAR_REGRESSION:
        selected_keys = ["fit_intercept", "positive"]
    elif algorithm_key == ALGORITHM_SVM_REGRESSION:
        selected_keys = ["kernel", "C", "gamma", "epsilon"]
    else:
        selected_keys = ["n_estimators", "max_depth", "min_samples_split", "min_samples_leaf"]

    return {
        key: params[key]
        for key in selected_keys
        if key in params and isinstance(params[key], str | int | float | bool | type(None))
    }


def create_tabular_model_metadata(
    *,
    file_path: Path,
    original_file_name: str,
    algorithm_key: str,
    framework: str,
    task_type: str,
    feature_names: list[str] | None = None,
    default_parameters: dict[str, Any] | None = None,
) -> tuple[str, str, dict[str, Any]]:
    normalized_algorithm_key = algorithm_key.strip()
    if normalized_algorithm_key not in {
        ALGORITHM_LINEAR_REGRESSION,
        ALGORITHM_SVM_REGRESSION,
        ALGORITHM_RANDOM_FOREST_REGRESSION,
    }:
        raise ValueError(f"Unsupported algorithm_key: {algorithm_key}")

    explicit_feature_names = [item.strip() for item in (feature_names or []) if item.strip()]
    explicit_default_parameters = _normalize_default_parameters(
        normalized_algorithm_key,
        default_parameters,
    )

    file_extension = file_path.suffix.lower()
    if file_extension == ".json" or framework.strip().lower() == "json":
        package = validate_model_package(
            parse_json_object(file_path.read_text(encoding="utf-8"), field_name="Model package")
        )
        if normalized_algorithm_key != ALGORITHM_LINEAR_REGRESSION:
            raise ValueError("JSON model packages are supported only for linear_regression.")
        metadata = {
            "kind": TABULAR_MODEL_KIND,
            "algorithm_key": ALGORITHM_LINEAR_REGRESSION,
            "artifact_format": "json",
            "feature_names": explicit_feature_names or list(package["features"]),
            "default_parameters": _normalize_default_parameters(
                ALGORITHM_LINEAR_REGRESSION,
                dict(package.get("default_parameters", {})) | explicit_default_parameters,
            ),
            "training_hyperparameters": {},
            "original_file_name": original_file_name,
            "package": package,
        }
        return (
            str(package.get("task_type", task_type)).strip() or "regression",
            framework.strip() or "json",
            metadata,
        )

    estimator = _load_joblib().load(file_path)
    detected_algorithm_key = _infer_algorithm_key_from_estimator(estimator)
    if detected_algorithm_key != normalized_algorithm_key:
        raise ValueError(
            "Uploaded estimator type does not match algorithm_key. "
            f"Expected {normalized_algorithm_key}, got {detected_algorithm_key}."
        )

    resolved_feature_names = _extract_feature_names(estimator, explicit_feature_names)
    if not resolved_feature_names:
        raise ValueError(
            "Feature names are required for joblib model uploads. "
            "Provide feature_names or upload a model fitted on named columns."
        )

    metadata = {
        "kind": TABULAR_MODEL_KIND,
        "algorithm_key": detected_algorithm_key,
        "artifact_format": "joblib",
        "feature_names": resolved_feature_names,
        "default_parameters": explicit_default_parameters,
        "training_hyperparameters": _extract_training_hyperparameters(
            estimator,
            detected_algorithm_key,
        ),
        "original_file_name": original_file_name,
        "estimator_class": estimator.__class__.__name__,
    }
    return "regression", framework.strip() or "scikit-learn", metadata


def is_supported_tabular_graph(graph_json: dict[str, Any]) -> bool:
    nodes = graph_json.get("nodes", [])
    if not isinstance(nodes, list) or not nodes:
        return False

    node_types = {
        str(node.get("type", ""))
        for node in nodes
        if isinstance(node, dict)
    }
    executable_entry_types = {
        "metrics.validate_regression",
        "export.table",
        "export.metrics",
        "table.train_test_split",
        "model.save_trained_model",
        "custom.api_predict",
        "tabular.predict",
        *TABULAR_NODE_ALGORITHMS,
        *TABULAR_TRAIN_NODE_ALGORITHMS,
    }
    if not node_types.intersection(executable_entry_types):
        return False

    return node_types.issubset(TABULAR_EXECUTABLE_NODE_TYPES)


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

    queue = deque([node_id for node_id, count in indegree.items() if count == 0])
    ordered: list[dict[str, Any]] = []
    while queue:
        node_id = queue.popleft()
        ordered.append(nodes_by_id[node_id])
        for neighbor in adjacency[node_id]:
            indegree[neighbor] -= 1
            if indegree[neighbor] == 0:
                queue.append(neighbor)

    if len(ordered) != len(nodes_by_id):
        raise ValueError("Workflow graph must be acyclic for tabular execution.")
    return ordered


def _collect_required_node_ids(
    nodes: list[dict[str, Any]],
    target_node_id: str,
) -> set[str]:
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
        raise ValueError(
            f"Input binding for {key} references unknown output '{source_handle}'."
        )
    return source_outputs[source_handle]


def _load_table(db, dataset_version_id: str) -> TableArtifact:
    dataset_version = db.get(DatasetVersion, dataset_version_id)
    if dataset_version is None:
        raise LookupError(f"Dataset version not found: {dataset_version_id}")

    file_path = Path(dataset_version.asset_path)
    if not file_path.exists():
        raise LookupError(f"Dataset file not found: {file_path}")

    with file_path.open("r", encoding="utf-8-sig", newline="") as input_file:
        reader = csv.DictReader(input_file)
        rows = list(reader)
    return TableArtifact(columns=list(reader.fieldnames or []), rows=rows)


def _load_model_spec(model_version: ModelVersion) -> TabularModelSpec:
    metadata = model_version.metadata_json if isinstance(model_version.metadata_json, dict) else {}
    if str(metadata.get("kind", "")).strip() != TABULAR_MODEL_KIND:
        raise ValueError(f"Model version {model_version.id} is not a tabular model.")

    algorithm_key = str(metadata.get("algorithm_key", "")).strip()
    if not algorithm_key:
        package = metadata.get("package")
        if isinstance(package, dict):
            algorithm_key = str(package.get("model_type", "")).strip()
    if not algorithm_key:
        raise ValueError(f"Model version {model_version.id} is missing algorithm metadata.")

    return TabularModelSpec(
        algorithm_key=algorithm_key,
        artifact_format=str(metadata.get("artifact_format", "")).strip() or "joblib",
        feature_names=[
            str(item)
            for item in metadata.get("feature_names", [])
            if isinstance(item, str) and item.strip()
        ],
        default_parameters=_normalize_default_parameters(
            algorithm_key,
            (
                metadata.get("default_parameters")
                if isinstance(metadata.get("default_parameters"), dict)
                else None
            ),
        ),
        package=metadata.get("package") if isinstance(metadata.get("package"), dict) else None,
    )


def _merged_runtime_parameters(
    node_type: str,
    params: dict[str, Any],
    model_spec: TabularModelSpec,
) -> dict[str, Any]:
    runtime_parameters = dict(model_spec.default_parameters)
    runtime_parameters.update(params)
    if node_type == "tabular.predict":
        legacy_runtime = params.get("runtimeParametersJson")
        if isinstance(legacy_runtime, str) and legacy_runtime.strip():
            runtime_parameters.update(
                _snake_to_camel_parameters(
                    parse_json_object(
                        legacy_runtime,
                        field_name=f"runtimeParametersJson for {node_type}",
                    )
                )
            )
    return runtime_parameters


def _resolve_prediction_column(
    runtime_parameters: dict[str, Any],
    model_spec: TabularModelSpec,
) -> str:
    value = str(runtime_parameters.get("predictionColumn", "")).strip()
    if value:
        return value
    if model_spec.package is not None:
        package_value = str(model_spec.package.get("prediction_column", "")).strip()
        if package_value:
            return package_value
    return "prediction"


def _coerce_float(value: Any, *, field_name: str) -> float:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError as exc:
            raise ValueError(f"{field_name} must be numeric.") from exc
    raise ValueError(f"{field_name} must be numeric.")


def _coerce_optional_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return _coerce_float(value, field_name="Optional numeric parameter")


def _extract_feature_matrix(table: TableArtifact, feature_names: list[str]) -> list[list[float]]:
    matrix: list[list[float]] = []
    for row_index, row in enumerate(table.rows, start=1):
        matrix_row: list[float] = []
        for feature_name in feature_names:
            if feature_name not in row:
                raise ValueError(f"Feature '{feature_name}' is missing from the input table.")
            try:
                matrix_row.append(float(row[feature_name]))
            except (TypeError, ValueError) as exc:
                raise ValueError(
                    f"Feature '{feature_name}' contains a non-numeric value on row {row_index}."
                ) from exc
        matrix.append(matrix_row)
    return matrix


def _parse_feature_names_param(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _extract_target_values(table: TableArtifact, target_column: str) -> list[float]:
    if not target_column.strip():
        raise ValueError("targetColumn is required.")
    values: list[float] = []
    for row_index, row in enumerate(table.rows, start=1):
        if target_column not in row:
            raise ValueError(f"Target column '{target_column}' is missing on row {row_index}.")
        values.append(_coerce_float(row[target_column], field_name=target_column))
    return values


def _clone_table_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**row} for row in rows]


def _split_table(
    table: TableArtifact,
    *,
    test_size: float,
    shuffle: bool,
    random_state: int | None,
) -> tuple[TableArtifact, TableArtifact]:
    if not 0 < test_size < 1:
        raise ValueError("testSize must be between 0 and 1.")
    if len(table.rows) < 2:
        raise ValueError("At least two rows are required for train/test split.")

    try:
        from sklearn.model_selection import train_test_split
    except ImportError as exc:
        raise RuntimeError("scikit-learn is required for table.train_test_split.") from exc

    row_indices = list(range(len(table.rows)))
    train_indices, test_indices = train_test_split(
        row_indices,
        test_size=test_size,
        shuffle=shuffle,
        random_state=random_state if shuffle else None,
    )
    train_rows = [_clone_table_rows([table.rows[index]])[0] for index in train_indices]
    test_rows = [_clone_table_rows([table.rows[index]])[0] for index in test_indices]
    return (
        TableArtifact(columns=list(table.columns), rows=train_rows),
        TableArtifact(columns=list(table.columns), rows=test_rows),
    )


def _fit_estimator(
    algorithm_key: str,
    *,
    feature_matrix: list[list[float]],
    target_values: list[float],
    params: dict[str, Any],
) -> Any:
    try:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.linear_model import LinearRegression
        from sklearn.svm import SVR
    except ImportError as exc:
        raise RuntimeError("scikit-learn is required for tabular training nodes.") from exc

    if algorithm_key == ALGORITHM_LINEAR_REGRESSION:
        estimator = LinearRegression(
            fit_intercept=bool(params.get("fitIntercept", True)),
            positive=bool(params.get("positive", False)),
        )
    elif algorithm_key == ALGORITHM_SVM_REGRESSION:
        estimator = SVR(
            kernel=str(params.get("kernel", "rbf")).strip() or "rbf",
            C=_coerce_float(params.get("c", 1.0), field_name="c"),
            epsilon=_coerce_float(params.get("epsilon", 0.1), field_name="epsilon"),
            gamma=str(params.get("gamma", "scale")).strip() or "scale",
            cache_size=_coerce_float(params.get("cacheSize", 200), field_name="cacheSize"),
        )
    else:
        max_depth_raw = params.get("maxDepth")
        estimator = RandomForestRegressor(
            n_estimators=int(
                _coerce_float(
                    params.get("nEstimators", 100),
                    field_name="nEstimators",
                )
            ),
            max_depth=int(_coerce_float(max_depth_raw, field_name="maxDepth"))
            if max_depth_raw not in {None, ""}
            else None,
            min_samples_split=int(
                _coerce_float(params.get("minSamplesSplit", 2), field_name="minSamplesSplit")
            ),
            min_samples_leaf=int(
                _coerce_float(params.get("minSamplesLeaf", 1), field_name="minSamplesLeaf")
            ),
            random_state=int(
                _coerce_float(
                    params.get("randomState", 42),
                    field_name="randomState",
                )
            ),
            n_jobs=int(_coerce_float(params.get("nJobs", 1), field_name="nJobs")),
        )

    estimator.fit(feature_matrix, target_values)
    return estimator


def _predict_with_estimator(
    estimator: Any,
    table: TableArtifact,
    feature_names: list[str],
    prediction_column: str = "prediction",
) -> TableArtifact:
    predictions = [
        float(item)
        for item in estimator.predict(_extract_feature_matrix(table, feature_names))
    ]
    columns = list(table.columns)
    if prediction_column not in columns:
        columns.append(prediction_column)
    rows = [
        {**row, prediction_column: prediction}
        for row, prediction in zip(table.rows, predictions, strict=True)
    ]
    return TableArtifact(columns=columns, rows=rows)


def _train_model_node(
    *,
    node_type: str,
    params: dict[str, Any],
    train_table: TableArtifact,
    evaluation_table: TableArtifact | None,
) -> tuple[TrainedModelArtifact, MetricsArtifact]:
    algorithm_key = TABULAR_TRAIN_NODE_ALGORITHMS[node_type]
    feature_names = _parse_feature_names_param(params.get("featureColumns"))
    if not feature_names:
        raise ValueError(f"{node_type} requires featureColumns.")
    target_column = str(params.get("targetColumn", "")).strip()
    if not target_column:
        raise ValueError(f"{node_type} requires targetColumn.")

    train_matrix = _extract_feature_matrix(train_table, feature_names)
    train_targets = _extract_target_values(train_table, target_column)
    estimator = _fit_estimator(
        algorithm_key,
        feature_matrix=train_matrix,
        target_values=train_targets,
        params=params,
    )
    evaluation_source = evaluation_table or train_table
    prediction_table = _predict_with_estimator(
        estimator,
        evaluation_source,
        feature_names,
        "prediction",
    )
    report = _compute_regression_metrics(
        prediction_table,
        evaluation_source,
        "prediction",
        target_column,
        ["r2", "mae", "rmse"],
    )
    return (
        TrainedModelArtifact(
            algorithm_key=algorithm_key,
            estimator=estimator,
            feature_names=feature_names,
            target_column=target_column,
            default_parameters=_default_runtime_parameters(algorithm_key),
            training_hyperparameters=_extract_training_hyperparameters(estimator, algorithm_key),
            metrics=dict(report.metrics),
            row_count=len(train_table.rows),
        ),
        report,
    )


def _predict_with_linear_package(
    package: dict[str, Any],
    table: TableArtifact,
    prediction_column: str,
    round_digits: int | None,
    clip_min: float | None,
    clip_max: float | None,
) -> TableArtifact:
    features = [str(item) for item in package["features"]]
    coefficients = {str(key): float(value) for key, value in dict(package["coefficients"]).items()}
    intercept = float(package["intercept"])

    rows: list[dict[str, Any]] = []
    columns = list(table.columns)
    if prediction_column not in columns:
        columns.append(prediction_column)

    for row in table.rows:
        prediction = intercept + sum(
            float(row[feature_name]) * coefficients[feature_name]
            for feature_name in features
        )
        if clip_min is not None:
            prediction = max(prediction, clip_min)
        if clip_max is not None:
            prediction = min(prediction, clip_max)
        if round_digits is not None:
            prediction = round(prediction, round_digits)

        rows.append({**row, prediction_column: prediction})
    return TableArtifact(columns=columns, rows=rows)


def _predict_with_joblib_model(
    model_version: ModelVersion,
    model_spec: TabularModelSpec,
    table: TableArtifact,
    prediction_column: str,
    runtime_parameters: dict[str, Any],
) -> TableArtifact:
    estimator = _load_joblib().load(model_version.weights_path)
    feature_matrix = _extract_feature_matrix(table, model_spec.feature_names)

    if (
        model_spec.algorithm_key == ALGORITHM_SVM_REGRESSION
        and "cacheSize" in runtime_parameters
    ):
        estimator.cache_size = int(runtime_parameters["cacheSize"])
    if (
        model_spec.algorithm_key == ALGORITHM_RANDOM_FOREST_REGRESSION
        and "nJobs" in runtime_parameters
    ):
        estimator.n_jobs = int(runtime_parameters["nJobs"])

    predictions = [float(value) for value in estimator.predict(feature_matrix)]
    round_digits = runtime_parameters.get("roundDigits")
    rounded_digits = int(round_digits) if isinstance(round_digits, int | float) else None
    clip_min = _coerce_optional_float(runtime_parameters.get("clipMin"))
    clip_max = _coerce_optional_float(runtime_parameters.get("clipMax"))

    rows: list[dict[str, Any]] = []
    columns = list(table.columns)
    if prediction_column not in columns:
        columns.append(prediction_column)

    for row, prediction in zip(table.rows, predictions, strict=True):
        value = prediction
        if clip_min is not None:
            value = max(value, clip_min)
        if clip_max is not None:
            value = min(value, clip_max)
        if rounded_digits is not None:
            value = round(value, rounded_digits)
        rows.append({**row, prediction_column: value})

    return TableArtifact(columns=columns, rows=rows)


def _execute_prediction_node(
    *,
    db,
    node_type: str,
    params: dict[str, Any],
    table: TableArtifact,
) -> TableArtifact:
    model_version_id = str(params.get("modelVersionId", "")).strip()
    if not model_version_id:
        raise ValueError(f"{node_type} requires modelVersionId.")

    model_version = db.get(ModelVersion, model_version_id)
    if model_version is None:
        raise LookupError(f"Model version not found: {model_version_id}")

    model_spec = _load_model_spec(model_version)
    expected_algorithm = TABULAR_NODE_ALGORITHMS.get(node_type)
    if expected_algorithm and model_spec.algorithm_key != expected_algorithm:
        raise ValueError(
            f"Node {node_type} requires a {expected_algorithm} model, "
            f"got {model_spec.algorithm_key}."
        )

    runtime_parameters = _merged_runtime_parameters(node_type, params, model_spec)
    prediction_column = _resolve_prediction_column(runtime_parameters, model_spec)

    if model_spec.artifact_format == "json":
        if model_spec.package is None:
            raise ValueError(f"Model version {model_version.id} is missing JSON package metadata.")
        round_digits = runtime_parameters.get("roundDigits")
        return _predict_with_linear_package(
            model_spec.package,
            table,
            prediction_column,
            int(round_digits) if isinstance(round_digits, int | float) else None,
            _coerce_optional_float(runtime_parameters.get("clipMin")),
            _coerce_optional_float(runtime_parameters.get("clipMax")),
        )

    return _predict_with_joblib_model(
        model_version,
        model_spec,
        table,
        prediction_column,
        runtime_parameters,
    )


def _load_custom_api_config(model_version: ModelVersion) -> dict[str, Any]:
    metadata = model_version.metadata_json if isinstance(model_version.metadata_json, dict) else {}
    if str(metadata.get("source_type", "")).strip() != "custom_api":
        raise ValueError(f"Model version {model_version.id} is not a custom API model.")
    api_config = metadata.get("api_config")
    if not isinstance(api_config, dict):
        raise ValueError(f"Model version {model_version.id} is missing api_config.")
    return api_config


def _predict_with_custom_api_model(
    *,
    db,
    params: dict[str, Any],
    table: TableArtifact,
) -> TableArtifact:
    model_version_id = str(params.get("modelVersionId", "")).strip()
    if not model_version_id:
        raise ValueError("custom.api_predict requires modelVersionId.")

    model_version = db.get(ModelVersion, model_version_id)
    if model_version is None:
        raise LookupError(f"Model version not found: {model_version_id}")

    api_config = _load_custom_api_config(model_version)
    default_parameters = (
        api_config.get("default_parameters")
        if isinstance(api_config.get("default_parameters"), dict)
        else {}
    )
    node_runtime_parameters = params.get("callParametersJson")
    runtime_parameters = dict(default_parameters)
    if isinstance(node_runtime_parameters, str) and node_runtime_parameters.strip():
        runtime_parameters.update(
            parse_json_object(node_runtime_parameters, field_name="callParametersJson")
        )

    request_payload = {
        "columns": list(table.columns),
        "rows": table.rows,
        "parameters": runtime_parameters,
    }
    body = json.dumps(request_payload).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    auth_type = str(api_config.get("auth_type", "none")).strip()
    auth_token = str(api_config.get("auth_token", "")).strip()
    if auth_type == "bearer" and auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"
    elif auth_type == "header" and auth_token:
        header_name = str(api_config.get("auth_header_name", "")).strip()
        if not header_name:
            raise ValueError("Custom API model is missing auth_header_name.")
        headers[header_name] = auth_token

    timeout_seconds = int(api_config.get("timeout_seconds", 30))
    endpoint_url = str(api_config.get("endpoint_url", "")).strip()
    if not endpoint_url:
        raise ValueError("Custom API model is missing endpoint_url.")

    request_obj = urllib_request.Request(
        endpoint_url,
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib_request.urlopen(request_obj, timeout=timeout_seconds) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except urllib_error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(
            f"Custom API request failed with HTTP {exc.code}: {payload or exc.reason}"
        ) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"Custom API request failed: {exc.reason}") from exc

    response_mode = str(api_config.get("response_mode", "prediction_values")).strip()
    prediction_column = (
        str(params.get("predictionColumn", "")).strip()
        or str(api_config.get("default_prediction_column", "")).strip()
        or "prediction"
    )

    if response_mode == "prediction_values":
        predictions = response_payload.get("predictions")
        if not isinstance(predictions, list):
            raise ValueError("Custom API response must include a 'predictions' array.")
        if len(predictions) != len(table.rows):
            raise ValueError("Custom API predictions length must match the input row count.")

        columns = list(table.columns)
        if prediction_column not in columns:
            columns.append(prediction_column)
        rows = [
            {**row, prediction_column: prediction}
            for row, prediction in zip(table.rows, predictions, strict=True)
        ]
        return TableArtifact(columns=columns, rows=rows)

    rows_payload = response_payload.get("rows")
    if not isinstance(rows_payload, list):
        raise ValueError("Custom API response must include a 'rows' array.")
    if len(rows_payload) != len(table.rows):
        raise ValueError("Custom API response row count must match the input row count.")

    merged_rows: list[dict[str, Any]] = []
    merged_columns = list(table.columns)
    for row, extra in zip(table.rows, rows_payload, strict=True):
        if not isinstance(extra, dict):
            raise ValueError("Each custom API response row must be an object.")
        merged_rows.append({**row, **extra})
        for key in extra:
            if key not in merged_columns:
                merged_columns.append(key)
    return TableArtifact(columns=merged_columns, rows=merged_rows)


def _write_trained_model_artifact(
    storage_root: Path,
    run_id: str,
    node_id: str,
    artifact: TrainedModelArtifact,
) -> Path:
    target_dir = storage_root / "workflow-runs" / run_id / "model-artifacts"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{node_id}.joblib"
    _load_joblib().dump(artifact.estimator, target_path)
    return target_path


def _compute_regression_metrics(
    prediction_table: TableArtifact,
    ground_truth_table: TableArtifact,
    prediction_column: str,
    ground_truth_column: str,
    metrics: list[str],
) -> MetricsArtifact:
    if len(prediction_table.rows) != len(ground_truth_table.rows):
        raise ValueError("Prediction and ground-truth tables must have the same number of rows.")

    y_pred: list[float] = []
    y_true: list[float] = []
    for row_index, (prediction_row, ground_truth_row) in enumerate(
        zip(prediction_table.rows, ground_truth_table.rows, strict=True),
        start=1,
    ):
        if prediction_column not in prediction_row:
            raise ValueError(
                f"Prediction column '{prediction_column}' is missing on row {row_index}."
            )
        if ground_truth_column not in ground_truth_row:
            raise ValueError(
                f"Ground-truth column '{ground_truth_column}' is missing on row {row_index}."
            )
        y_pred.append(
            _coerce_float(
                prediction_row[prediction_column],
                field_name=prediction_column,
            )
        )
        y_true.append(
            _coerce_float(
                ground_truth_row[ground_truth_column],
                field_name=ground_truth_column,
            )
        )

    row_count = len(y_true)
    if row_count == 0:
        raise ValueError("Validation input tables cannot be empty.")

    errors = [pred - truth for pred, truth in zip(y_pred, y_true, strict=True)]
    absolute_errors = [abs(item) for item in errors]
    squared_errors = [item * item for item in errors]
    mean_truth = sum(y_true) / row_count
    truth_variance = sum((value - mean_truth) ** 2 for value in y_true)

    computed_metrics: dict[str, float] = {}
    for metric_key in metrics:
        normalized_metric_key = str(metric_key).strip().lower()
        if normalized_metric_key == "mae":
            computed_metrics["mae"] = sum(absolute_errors) / row_count
        elif normalized_metric_key == "mse":
            computed_metrics["mse"] = sum(squared_errors) / row_count
        elif normalized_metric_key == "rmse":
            computed_metrics["rmse"] = math.sqrt(sum(squared_errors) / row_count)
        elif normalized_metric_key == "mape":
            non_zero_pairs = [
                abs((truth - pred) / truth)
                for pred, truth in zip(y_pred, y_true, strict=True)
                if truth != 0
            ]
            computed_metrics["mape"] = (
                sum(non_zero_pairs) / len(non_zero_pairs) if non_zero_pairs else 0.0
            )
        elif normalized_metric_key == "r2":
            computed_metrics["r2"] = (
                0.0
                if truth_variance == 0
                else 1 - (sum(squared_errors) / truth_variance)
            )
        else:
            raise ValueError(f"Unsupported regression metric: {metric_key}")

    return MetricsArtifact(
        metrics=computed_metrics,
        prediction_column=prediction_column,
        ground_truth_column=ground_truth_column,
        row_count=row_count,
    )


def _write_table_csv(storage_root: Path, run_id: str, node_id: str, table: TableArtifact) -> Path:
    target_dir = storage_root / "workflow-runs" / run_id / "table-artifacts"
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{node_id}.csv"
    with target_path.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=table.columns)
        writer.writeheader()
        writer.writerows(table.rows)
    return target_path


def _write_metrics_artifact(
    storage_root: Path,
    run_id: str,
    node_id: str,
    artifact: MetricsArtifact,
    format_key: str,
) -> Path:
    target_dir = storage_root / "workflow-runs" / run_id / "metric-artifacts"
    target_dir.mkdir(parents=True, exist_ok=True)
    normalized_format = format_key.lower()
    if normalized_format == "csv":
        target_path = target_dir / f"{node_id}.csv"
        with target_path.open("w", encoding="utf-8", newline="") as output_file:
            writer = csv.writer(output_file)
            writer.writerow(["metric", "value"])
            for key, value in artifact.metrics.items():
                writer.writerow([key, value])
        return target_path

    target_path = target_dir / f"{node_id}.json"
    payload = {
        "metrics": artifact.metrics,
        "prediction_column": artifact.prediction_column,
        "ground_truth_column": artifact.ground_truth_column,
        "row_count": artifact.row_count,
    }
    target_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return target_path


def _dataset_version_preview(db, dataset_version_id: str) -> dict[str, Any]:
    dataset_version = db.get(DatasetVersion, dataset_version_id)
    if dataset_version is None:
        return {
            "kind": "dataset_version",
            "dataset_version_id": dataset_version_id,
        }

    dataset = db.get(Dataset, dataset_version.dataset_id)
    return {
        "kind": "dataset_version",
        "dataset_version_id": dataset_version.id,
        "dataset_id": dataset_version.dataset_id,
        "dataset_name": dataset.name if dataset is not None else None,
        "version": dataset_version.version,
        "asset_path": dataset_version.asset_path,
        "status": dataset_version.status.value,
    }


def _model_version_preview(db, model_version_id: str) -> dict[str, Any]:
    model_version = db.get(ModelVersion, model_version_id)
    if model_version is None:
        return {
            "kind": "model_version",
            "model_version_id": model_version_id,
        }

    model = db.get(Model, model_version.model_id)
    return {
        "kind": "model_version",
        "model_version_id": model_version.id,
        "model_id": model_version.model_id,
        "model_name": model.name if model is not None else None,
        "version": model_version.version,
        "framework": model_version.framework,
        "task_type": model_version.task_type,
        "source_type": (
            str(model_version.metadata_json.get("source_type", "")).strip()
            if isinstance(model_version.metadata_json, dict)
            else None
        ),
    }


def _table_preview(table: TableArtifact) -> dict[str, Any]:
    return {
        "kind": "table",
        "columns": list(table.columns),
        "row_count": len(table.rows),
        "sample_rows": table.rows[:5],
    }


def _metrics_preview(artifact: MetricsArtifact) -> dict[str, Any]:
    return {
        "kind": "metrics_report",
        "metrics": dict(artifact.metrics),
        "prediction_column": artifact.prediction_column,
        "ground_truth_column": artifact.ground_truth_column,
        "row_count": artifact.row_count,
    }


def _trained_model_preview(artifact: TrainedModelArtifact) -> dict[str, Any]:
    return {
        "kind": "model_ref",
        "algorithm_key": artifact.algorithm_key,
        "feature_names": list(artifact.feature_names),
        "target_column": artifact.target_column,
        "default_parameters": dict(artifact.default_parameters),
        "training_hyperparameters": dict(artifact.training_hyperparameters),
        "metrics": dict(artifact.metrics),
        "row_count": artifact.row_count,
        "framework": artifact.framework,
    }


def _artifact_file_preview(path_value: str) -> dict[str, Any]:
    path = Path(path_value)
    size_bytes: int | None = None
    try:
        if path.exists():
            size_bytes = path.stat().st_size
    except OSError:
        size_bytes = None

    return {
        "kind": "artifact_file",
        "path": path_value,
        "name": path.name,
        "size_bytes": size_bytes,
    }


def _value_preview(value: Any) -> dict[str, Any]:
    return {
        "kind": "value",
        "value": value,
    }


def _serialize_preview_value(db, value: Any) -> dict[str, Any]:
    if isinstance(value, TableArtifact):
        return _table_preview(value)
    if isinstance(value, MetricsArtifact):
        return _metrics_preview(value)
    if isinstance(value, TrainedModelArtifact):
        return _trained_model_preview(value)
    if isinstance(value, str):
        if db.get(DatasetVersion, value) is not None:
            return _dataset_version_preview(db, value)
        if db.get(ModelVersion, value) is not None:
            return _model_version_preview(db, value)
        try:
            if Path(value).exists():
                return _artifact_file_preview(value)
        except OSError:
            pass
    return _value_preview(value)


def _preview_bindings(
    db,
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
) -> dict[str, Any]:
    preview: dict[str, Any] = {}
    for key in bindings:
        preview[key] = _serialize_preview_value(
            db,
            _resolve_input_value(resolved_outputs, bindings, key),
        )
    return preview


def _execute_tabular_node(
    *,
    db,
    node: dict[str, Any],
    state: TabularExecutionState,
    storage_root: Path,
    run_id: str,
    persist_outputs: bool,
    workspace_id: str | None = None,
    current_user: Any | None = None,
    create_private_dataset_version: CreatePrivateDatasetVersionFn | None = None,
    create_private_model_version: CreatePrivateModelVersionFn | None = None,
) -> dict[str, Any]:
    node_id = str(node.get("id", "")).strip()
    node_type = str(node.get("type", "")).strip()
    params = node.get("params", {})
    bindings = node.get("input_bindings", {})
    if not isinstance(params, dict) or not isinstance(bindings, dict):
        raise ValueError(f"Node {node_id} has invalid params or input bindings.")

    if node_type == "source.dataset_version":
        dataset_version_id = str(params.get("datasetVersionId", "")).strip()
        if not dataset_version_id:
            raise ValueError(f"Node {node_id} is missing datasetVersionId.")
        return {"dataset": dataset_version_id}

    if node_type == "source.model_version":
        model_version_id = str(params.get("modelVersionId", "")).strip()
        if not model_version_id:
            raise ValueError(f"Node {node_id} is missing modelVersionId.")
        return {"model": model_version_id}

    if node_type == "table.load_csv":
        dataset_version_id = _resolve_input_value(state.resolved_outputs, bindings, "dataset")
        return {"table": _load_table(db, str(dataset_version_id))}

    if node_type == "table.train_test_split":
        input_table = _resolve_input_value(state.resolved_outputs, bindings, "table")
        train_table, test_table = _split_table(
            input_table,
            test_size=_coerce_float(params.get("testSize", 0.2), field_name="testSize"),
            shuffle=bool(params.get("shuffle", True)),
            random_state=(
                int(_coerce_float(params.get("randomState", 42), field_name="randomState"))
                if params.get("randomState", "") not in {None, ""}
                else None
            ),
        )
        return {"trainTable": train_table, "testTable": test_table}

    if node_type in TABULAR_NODE_ALGORITHMS or node_type == "tabular.predict":
        input_table = _resolve_input_value(state.resolved_outputs, bindings, "table")
        return {
            "table": _execute_prediction_node(
                db=db,
                node_type=node_type,
                params=params,
                table=input_table,
            )
        }

    if node_type == "custom.api_predict":
        input_table = _resolve_input_value(state.resolved_outputs, bindings, "table")
        return {"table": _predict_with_custom_api_model(db=db, params=params, table=input_table)}

    if node_type in TABULAR_TRAIN_NODE_ALGORITHMS:
        train_table = _resolve_input_value(state.resolved_outputs, bindings, "trainTable")
        evaluation_table = None
        if str(bindings.get("testTable", "")).strip():
            evaluation_table = _resolve_input_value(state.resolved_outputs, bindings, "testTable")
        model_artifact, report = _train_model_node(
            node_type=node_type,
            params=params,
            train_table=train_table,
            evaluation_table=evaluation_table,
        )
        state.latest_metrics = dict(report.metrics)
        return {"model": model_artifact, "report": report}

    if node_type == "metrics.validate_regression":
        prediction_table = _resolve_input_value(
            state.resolved_outputs,
            bindings,
            "predictionTable",
        )
        ground_truth_table = _resolve_input_value(
            state.resolved_outputs,
            bindings,
            "groundTruthTable",
        )
        metric_keys = params.get("metrics", ["r2", "mae", "rmse"])
        if not isinstance(metric_keys, list):
            raise ValueError("metrics.validate_regression requires a metrics array.")
        report = _compute_regression_metrics(
            prediction_table,
            ground_truth_table,
            str(params.get("predictionColumn", "")).strip() or "prediction",
            str(params.get("groundTruthColumn", "")).strip() or "target",
            [str(item) for item in metric_keys],
        )
        state.latest_metrics = dict(report.metrics)
        return {"report": report}

    if node_type == "model.save_trained_model":
        model_artifact = _resolve_input_value(state.resolved_outputs, bindings, "model")
        if not isinstance(model_artifact, TrainedModelArtifact):
            raise ValueError("model.save_trained_model requires a trained model artifact input.")
        target_path = _write_trained_model_artifact(storage_root, run_id, node_id, model_artifact)
        state.artifact_path = str(target_path.resolve())
        node_outputs: dict[str, Any] = {
            "artifact": state.artifact_path,
            "model": model_artifact,
        }
        save_to_platform = persist_outputs and bool(params.get("saveToPlatform", True))
        if save_to_platform:
            if (
                create_private_model_version is None
                or current_user is None
                or not workspace_id
            ):
                raise RuntimeError("Model persistence is not configured for this execution.")
            model_name = str(params.get("outputModelName", "")).strip() or "Trained Model"
            version = str(params.get("outputModelVersion", "")).strip() or "1.0.0"
            model_summary = create_private_model_version(
                db=db,
                workspace_id=workspace_id,
                current_user=current_user,
                model_name=model_name,
                version=version,
                algorithm_key=model_artifact.algorithm_key,
                task_type="regression",
                framework=model_artifact.framework,
                source_path=target_path,
                metadata={
                    "kind": TABULAR_MODEL_KIND,
                    "artifact_format": "joblib",
                    "feature_names": model_artifact.feature_names,
                    "default_parameters": model_artifact.default_parameters,
                    "training_hyperparameters": model_artifact.training_hyperparameters,
                    "training_metrics": model_artifact.metrics,
                    "target_column": model_artifact.target_column,
                    "trained_row_count": model_artifact.row_count,
                    "source_node_id": node_id,
                },
            )
            state.saved_model_version_ids.append(model_summary.id)
            state.result_model_version_id = model_summary.id
            node_outputs["modelVersionId"] = model_summary.id
        return node_outputs

    if node_type == "export.table":
        table = _resolve_input_value(state.resolved_outputs, bindings, "input")
        target_path = _write_table_csv(storage_root, run_id, node_id, table)
        state.artifact_path = str(target_path.resolve())
        node_outputs: dict[str, Any] = {"artifact": state.artifact_path}
        save_to_platform = persist_outputs and bool(params.get("saveToPlatform", True))
        if save_to_platform:
            if (
                create_private_dataset_version is None
                or current_user is None
                or not workspace_id
            ):
                raise RuntimeError("Dataset persistence is not configured for this execution.")
            dataset_name = str(params.get("outputDatasetName", "")).strip() or "Prediction Output"
            version_summary = create_private_dataset_version(
                db=db,
                workspace_id=workspace_id,
                current_user=current_user,
                run_id=run_id,
                dataset_name=dataset_name,
                kind=DatasetKind.TABLE,
                source_path=target_path,
                content_type="text/csv",
                metadata={"source_node_id": node_id, "output_kind": "prediction_table"},
            )
            state.saved_dataset_version_ids.append(version_summary.id)
            state.result_dataset_version_id = version_summary.id
            node_outputs["datasetVersionId"] = version_summary.id
        return node_outputs

    if node_type == "export.metrics":
        report = _resolve_input_value(state.resolved_outputs, bindings, "input")
        target_path = _write_metrics_artifact(
            storage_root,
            run_id,
            node_id,
            report,
            str(params.get("format", "json")),
        )
        state.artifact_path = str(target_path.resolve())
        node_outputs = {"artifact": state.artifact_path}
        save_to_platform = persist_outputs and bool(params.get("saveToPlatform", True))
        if save_to_platform:
            if (
                create_private_dataset_version is None
                or current_user is None
                or not workspace_id
            ):
                raise RuntimeError("Dataset persistence is not configured for this execution.")
            dataset_name = str(params.get("outputDatasetName", "")).strip() or "Validation Metrics"
            content_type = (
                "text/csv" if target_path.suffix.lower() == ".csv" else "application/json"
            )
            version_summary = create_private_dataset_version(
                db=db,
                workspace_id=workspace_id,
                current_user=current_user,
                run_id=run_id,
                dataset_name=dataset_name,
                kind=DatasetKind.ARTIFACT,
                source_path=target_path,
                content_type=content_type,
                metadata={"source_node_id": node_id, "output_kind": "metrics_report"},
            )
            state.saved_dataset_version_ids.append(version_summary.id)
            state.result_dataset_version_id = version_summary.id
            node_outputs["datasetVersionId"] = version_summary.id
        return node_outputs

    raise ValueError(f"Unsupported tabular node type: {node_type}")


def _execute_tabular_nodes(
    *,
    db,
    ordered_nodes: list[dict[str, Any]],
    storage_root: Path,
    run_id: str,
    persist_outputs: bool,
    workspace_id: str | None = None,
    current_user: Any | None = None,
    create_private_dataset_version: CreatePrivateDatasetVersionFn | None = None,
    create_private_model_version: CreatePrivateModelVersionFn | None = None,
) -> TabularExecutionState:
    state = TabularExecutionState()
    for node in ordered_nodes:
        node_id = str(node.get("id", "")).strip()
        state.resolved_outputs[node_id] = _execute_tabular_node(
            db=db,
            node=node,
            state=state,
            storage_root=storage_root,
            run_id=run_id,
            persist_outputs=persist_outputs,
            workspace_id=workspace_id,
            current_user=current_user,
            create_private_dataset_version=create_private_dataset_version,
            create_private_model_version=create_private_model_version,
        )
    return state


def test_tabular_node(
    *,
    db,
    graph_json: dict[str, Any],
    target_node_id: str,
    storage_root: Path,
) -> dict[str, Any]:
    raw_nodes = graph_json.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Workflow graph nodes must be a list.")

    required_node_ids = _collect_required_node_ids(raw_nodes, target_node_id)
    ordered_nodes = _topological_node_order(raw_nodes, include_node_ids=required_node_ids)
    unsupported_node_types = sorted(
        {
            str(node.get("type", "")).strip()
            for node in ordered_nodes
            if str(node.get("type", "")).strip() not in TABULAR_EXECUTABLE_NODE_TYPES
        }
    )
    if unsupported_node_types:
        raise NotImplementedError(
            "Node testing currently supports only executable table workflow nodes. "
            f"Unsupported node types: {', '.join(unsupported_node_types)}."
        )

    state = TabularExecutionState()
    preview_run_id = f"node-test-{uuid4().hex[:12]}"
    input_preview: dict[str, Any] = {}
    output_preview: dict[str, Any] = {}

    for node in ordered_nodes:
        node_id = str(node.get("id", "")).strip()
        bindings = node.get("input_bindings", {})
        if not isinstance(bindings, dict):
            raise ValueError(f"Node {node_id} has invalid input bindings.")
        if node_id == target_node_id:
            input_preview = _preview_bindings(db, state.resolved_outputs, bindings)

        outputs = _execute_tabular_node(
            db=db,
            node=node,
            state=state,
            storage_root=storage_root,
            run_id=preview_run_id,
            persist_outputs=False,
        )
        state.resolved_outputs[node_id] = outputs

        if node_id == target_node_id:
            output_preview = {
                key: _serialize_preview_value(db, value)
                for key, value in outputs.items()
            }
            break

    return {
        "node_id": target_node_id,
        "input_preview": input_preview,
        "output_preview": output_preview,
    }


def execute_tabular_graph(
    *,
    db,
    workflow_version: WorkflowVersion,
    current_user,
    workspace_id: str,
    run_id: str,
    storage_root: Path,
    create_private_dataset_version: CreatePrivateDatasetVersionFn,
    create_private_model_version: CreatePrivateModelVersionFn | None = None,
) -> dict[str, Any]:
    graph_json = (
        workflow_version.graph_json
        if isinstance(workflow_version.graph_json, dict)
        else {}
    )
    raw_nodes = graph_json.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Workflow graph nodes must be a list.")
    execution_state = _execute_tabular_nodes(
        db=db,
        ordered_nodes=_topological_node_order(raw_nodes),
        storage_root=storage_root,
        run_id=run_id,
        persist_outputs=True,
        workspace_id=workspace_id,
        current_user=current_user,
        create_private_dataset_version=create_private_dataset_version,
        create_private_model_version=create_private_model_version,
    )

    return {
        "result_dataset_version_id": execution_state.result_dataset_version_id,
        "result_model_version_id": execution_state.result_model_version_id,
        "saved_dataset_version_ids": execution_state.saved_dataset_version_ids,
        "saved_model_version_ids": execution_state.saved_model_version_ids,
        "artifact_path": execution_state.artifact_path,
        "metrics": execution_state.latest_metrics,
    }
