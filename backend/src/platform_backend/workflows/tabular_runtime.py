from __future__ import annotations

import csv
import json
import math
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from platform_backend.domain_enums import DatasetKind
from platform_backend.models.entities import DatasetVersion, ModelVersion, WorkflowVersion

TABULAR_MODEL_KIND = "tabular_model"

ALGORITHM_LINEAR_REGRESSION = "linear_regression"
ALGORITHM_SVM_REGRESSION = "svm_regression"
ALGORITHM_RANDOM_FOREST_REGRESSION = "random_forest_regression"

TABULAR_NODE_ALGORITHMS: dict[str, str] = {
    "tabular.linear_regression_predict": ALGORITHM_LINEAR_REGRESSION,
    "tabular.svm_regression_predict": ALGORITHM_SVM_REGRESSION,
    "tabular.random_forest_regression_predict": ALGORITHM_RANDOM_FOREST_REGRESSION,
}

TABULAR_EXECUTABLE_NODE_TYPES = {
    "source.dataset_version",
    "source.model_version",
    "table.load_csv",
    "metrics.validate_regression",
    "export.table",
    "export.metrics",
    "tabular.predict",
    *TABULAR_NODE_ALGORITHMS.keys(),
}

CreatePrivateDatasetVersionFn = Callable[..., Any]


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
    if not node_types.intersection(
        {"metrics.validate_regression", "export.table", "export.metrics", *TABULAR_NODE_ALGORITHMS}
    ) and "tabular.predict" not in node_types:
        return False

    return node_types.issubset(TABULAR_EXECUTABLE_NODE_TYPES)


def _topological_node_order(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes_by_id = {str(node.get("id", "")): node for node in nodes if isinstance(node, dict)}
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


def _resolve_input_value(
    resolved_outputs: dict[str, dict[str, Any]],
    bindings: dict[str, str],
    key: str,
) -> Any:
    binding = str(bindings.get(key, "")).strip()
    if not binding:
        raise ValueError(f"Missing required input binding: {key}")
    source_node_id, _, source_handle = binding.partition(":")
    return resolved_outputs[source_node_id][source_handle]


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


def execute_tabular_graph(
    *,
    db,
    workflow_version: WorkflowVersion,
    current_user,
    workspace_id: str,
    run_id: str,
    storage_root: Path,
    create_private_dataset_version: CreatePrivateDatasetVersionFn,
) -> dict[str, Any]:
    graph_json = (
        workflow_version.graph_json
        if isinstance(workflow_version.graph_json, dict)
        else {}
    )
    raw_nodes = graph_json.get("nodes", [])
    if not isinstance(raw_nodes, list):
        raise ValueError("Workflow graph nodes must be a list.")

    resolved_outputs: dict[str, dict[str, Any]] = {}
    saved_dataset_version_ids: list[str] = []
    result_dataset_version_id: str | None = None
    artifact_path: str | None = None
    latest_metrics: dict[str, float] = {}

    for node in _topological_node_order(raw_nodes):
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
            resolved_outputs[node_id] = {"dataset": dataset_version_id}
        elif node_type == "source.model_version":
            resolved_outputs[node_id] = {"model": str(params.get("modelVersionId", "")).strip()}
        elif node_type == "table.load_csv":
            dataset_version_id = _resolve_input_value(resolved_outputs, bindings, "dataset")
            resolved_outputs[node_id] = {"table": _load_table(db, str(dataset_version_id))}
        elif node_type in TABULAR_NODE_ALGORITHMS or node_type == "tabular.predict":
            input_table = _resolve_input_value(resolved_outputs, bindings, "table")
            resolved_outputs[node_id] = {
                "table": _execute_prediction_node(
                    db=db,
                    node_type=node_type,
                    params=params,
                    table=input_table,
                )
            }
        elif node_type == "metrics.validate_regression":
            prediction_table = _resolve_input_value(resolved_outputs, bindings, "predictionTable")
            ground_truth_table = _resolve_input_value(
                resolved_outputs,
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
            latest_metrics = dict(report.metrics)
            resolved_outputs[node_id] = {"report": report}
        elif node_type == "export.table":
            table = _resolve_input_value(resolved_outputs, bindings, "input")
            target_path = _write_table_csv(storage_root, run_id, node_id, table)
            artifact_path = str(target_path.resolve())
            node_outputs: dict[str, Any] = {"artifact": artifact_path}
            if bool(params.get("saveToPlatform", True)):
                dataset_name = (
                    str(params.get("outputDatasetName", "")).strip()
                    or "Prediction Output"
                )
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
                saved_dataset_version_ids.append(version_summary.id)
                result_dataset_version_id = version_summary.id
                node_outputs["datasetVersionId"] = version_summary.id
            resolved_outputs[node_id] = node_outputs
        elif node_type == "export.metrics":
            report = _resolve_input_value(resolved_outputs, bindings, "input")
            target_path = _write_metrics_artifact(
                storage_root,
                run_id,
                node_id,
                report,
                str(params.get("format", "json")),
            )
            artifact_path = str(target_path.resolve())
            node_outputs = {"artifact": artifact_path}
            if bool(params.get("saveToPlatform", True)):
                dataset_name = (
                    str(params.get("outputDatasetName", "")).strip()
                    or "Validation Metrics"
                )
                content_type = (
                    "text/csv"
                    if target_path.suffix.lower() == ".csv"
                    else "application/json"
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
                saved_dataset_version_ids.append(version_summary.id)
                result_dataset_version_id = version_summary.id
                node_outputs["datasetVersionId"] = version_summary.id
            resolved_outputs[node_id] = node_outputs
        else:
            raise ValueError(f"Unsupported tabular node type: {node_type}")

    return {
        "result_dataset_version_id": result_dataset_version_id,
        "saved_dataset_version_ids": saved_dataset_version_ids,
        "artifact_path": artifact_path,
        "metrics": latest_metrics,
    }
