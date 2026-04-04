import io
import json

import joblib
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.svm import SVR


def _login(client: TestClient, email: str, password: str) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _workspace_id(client: TestClient, token: str) -> str:
    response = client.get(
        "/api/v1/workspaces",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()[0]["id"]


def _current_user(client: TestClient, token: str) -> dict[str, object]:
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _upload_table_dataset(
    client: TestClient,
    token: str,
    workspace_id: str,
    dataset_name: str,
    csv_text: str,
    description: str | None = None,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/datasets/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": (f"{dataset_name}.csv", csv_text.encode("utf-8"), "text/csv")},
        data={
            "workspace_id": workspace_id,
            "dataset_name": dataset_name,
            "description": description or "",
            "kind": "table",
        },
    )
    assert response.status_code == 201
    return response.json()


def _upload_model_package(
    client: TestClient,
    token: str,
    workspace_id: str,
    model_name: str,
    version: str = "1.0.0",
) -> dict[str, object]:
    payload = {
        "kind": "tabular_model",
        "model_type": "linear_regression",
        "task_type": "regression",
        "features": ["feature_a", "feature_b"],
        "intercept": 1.0,
        "coefficients": {
            "feature_a": 0.5,
            "feature_b": 0.25,
        },
        "prediction_column": "prediction",
        "default_parameters": {
            "round_digits": 4,
        },
    }
    response = client.post(
        "/api/v1/models/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (f"{model_name}.json", json.dumps(payload).encode("utf-8"), "application/json")
        },
        data={
            "workspace_id": workspace_id,
            "model_name": model_name,
            "version": version,
            "algorithm_key": "linear_regression",
            "task_type": "regression",
            "framework": "json",
            "feature_names_json": json.dumps(["feature_a", "feature_b"]),
            "default_parameters_json": json.dumps({"roundDigits": 4}),
        },
    )
    assert response.status_code == 201
    return response.json()


def _upload_joblib_model_package(
    client: TestClient,
    token: str,
    workspace_id: str,
    model_name: str,
    algorithm_key: str,
    estimator,
    *,
    version: str = "1.0.0",
    feature_names: list[str] | None = None,
    default_parameters: dict[str, object] | None = None,
) -> dict[str, object]:
    buffer = io.BytesIO()
    joblib.dump(estimator, buffer)
    response = client.post(
        "/api/v1/models/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                f"{model_name}.joblib",
                buffer.getvalue(),
                "application/octet-stream",
            )
        },
        data={
            "workspace_id": workspace_id,
            "model_name": model_name,
            "version": version,
            "algorithm_key": algorithm_key,
            "task_type": "regression",
            "framework": "scikit-learn",
            "feature_names_json": json.dumps(feature_names or ["feature_a", "feature_b"]),
            "default_parameters_json": json.dumps(default_parameters or {}),
        },
    )
    assert response.status_code == 201
    return response.json()


def _create_custom_api_model(
    client: TestClient,
    token: str,
    workspace_id: str,
    model_name: str,
    *,
    version: str = "1.0.0",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/models/custom",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workspace_id": workspace_id,
            "model_name": model_name,
            "version": version,
            "task_type": "regression",
            "description": "External API backed regression model.",
            "endpoint_url": "https://example.com/predict",
            "timeout_seconds": 45,
            "auth_type": "header",
            "auth_token": "secret-token",
            "auth_header_name": "X-API-Key",
            "response_mode": "prediction_values",
            "default_prediction_column": "prediction",
            "default_parameters": {"threshold": 0.5},
        },
    )
    assert response.status_code == 201
    return response.json()


def _template_graph(client: TestClient, token: str, template_id: str) -> dict[str, object]:
    response = client.get(
        "/api/v1/workflows/templates",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    template = next(item for item in response.json() if item["id"] == template_id)
    return template["graph"]


def _save_workflow_graph(
    client: TestClient,
    token: str,
    graph: dict[str, object],
) -> dict[str, object]:
    response = client.put(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {token}"},
        json=graph,
    )
    assert response.status_code == 200
    return response.json()


def _run_workflow(
    client: TestClient,
    token: str,
    workflow_version_id: str,
    workspace_id: str,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/workflow-runs",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workflow_version_id": workflow_version_id,
            "workspace_id": workspace_id,
            "priority": 5,
        },
    )
    assert response.status_code == 200
    return response.json()


def _workflow_run_details(client: TestClient, token: str, run_id: str) -> dict[str, object]:
    response = client.get(
        "/api/v1/workflow-runs",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return next(item for item in response.json() if item["id"] == run_id)


def _test_workflow_node(
    client: TestClient,
    token: str,
    graph: dict[str, object],
    node_id: str,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/workflows/test-node",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "graph": graph,
            "node_id": node_id,
        },
    )
    assert response.status_code == 200
    return response.json()


def test_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_cors_preflight_allows_local_dev_ports(client: TestClient) -> None:
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://127.0.0.1:5177",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5177"


def test_workflow_validation_endpoint(client: TestClient, admin_token: str) -> None:
    response = client.post(
        "/api/v1/workflows/validate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "nodes": [
                {
                    "id": "source",
                    "type": "source.dataset_version",
                    "position": {"x": 0, "y": 0},
                    "params": {"datasetVersionId": "dsv-source"},
                    "input_bindings": {},
                    "output_defs": [
                        {
                            "key": "dataset",
                            "label": "Dataset Version",
                            "data_types": ["dataset_version"],
                        }
                    ],
                }
            ],
            "edges": [],
        },
    )
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_workflow_templates_endpoint(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/v1/workflows/templates",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload
    assert payload[0]["graph"]["nodes"]
    assert any(item.get("sample_bindings") for item in payload if item["id"].startswith("tabular"))


def test_workflow_node_test_returns_table_preview(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    dataset_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "preview-input",
        "feature_a,feature_b,target\n1,2,1.0\n3,4,2.0\n",
    )
    graph = _template_graph(client, engineer_token, "tabular.prediction")

    target_node_id = ""
    for node in graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = dataset_version["id"]
        if node["type"] == "table.load_csv":
            target_node_id = node["id"]

    payload = _test_workflow_node(client, engineer_token, graph, target_node_id)
    assert payload["status"] == "succeeded"
    assert payload["input_preview"]["dataset"]["kind"] == "dataset_version"
    assert payload["output_preview"]["table"]["kind"] == "table"
    assert payload["output_preview"]["table"]["row_count"] == 2
    assert payload["output_preview"]["table"]["columns"] == ["feature_a", "feature_b", "target"]


def test_workflow_node_test_returns_prediction_preview(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    dataset_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "prediction-preview-input",
        "feature_a,feature_b,target\n1,2,1.0\n3,4,2.0\n",
    )
    model_version = _upload_model_package(
        client,
        engineer_token,
        workspace_id,
        "prediction-preview-model",
    )
    graph = _template_graph(client, engineer_token, "tabular.prediction")

    target_node_id = ""
    for node in graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = dataset_version["id"]
        if node["type"] == "tabular.linear_regression_predict":
            node["params"]["modelVersionId"] = model_version["id"]
            node["params"]["predictionColumn"] = "prediction"
            target_node_id = node["id"]

    payload = _test_workflow_node(client, engineer_token, graph, target_node_id)
    assert payload["status"] == "succeeded"
    assert payload["input_preview"]["table"]["kind"] == "table"
    assert payload["output_preview"]["table"]["kind"] == "table"
    assert "prediction" in payload["output_preview"]["table"]["columns"]
    assert payload["output_preview"]["table"]["sample_rows"][0]["prediction"] == 2.0


def test_workflow_node_test_returns_metrics_preview(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    prediction_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "prediction-preview-table",
        "feature_a,prediction\n1,2.0\n2,4.0\n3,6.0\n",
    )
    ground_truth_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "ground-truth-preview-table",
        "feature_a,target\n1,2.5\n2,3.5\n3,6.5\n",
    )
    graph = _template_graph(client, engineer_token, "tabular.validation")

    target_node_id = ""
    dataset_source_nodes = [
        node for node in graph["nodes"] if node["type"] == "source.dataset_version"
    ]
    dataset_source_nodes[0]["params"]["datasetVersionId"] = prediction_version["id"]
    dataset_source_nodes[1]["params"]["datasetVersionId"] = ground_truth_version["id"]
    for node in graph["nodes"]:
        if node["type"] == "metrics.validate_regression":
            node["params"]["predictionColumn"] = "prediction"
            node["params"]["groundTruthColumn"] = "target"
            node["params"]["metrics"] = ["r2", "mae"]
            target_node_id = node["id"]

    payload = _test_workflow_node(client, engineer_token, graph, target_node_id)
    assert payload["status"] == "succeeded"
    assert payload["input_preview"]["predictionTable"]["kind"] == "table"
    assert payload["input_preview"]["groundTruthTable"]["kind"] == "table"
    assert payload["output_preview"]["report"]["kind"] == "metrics_report"
    assert set(payload["output_preview"]["report"]["metrics"]) == {"r2", "mae"}
    assert payload["output_preview"]["report"]["row_count"] == 3


def test_workflow_node_test_reports_not_supported_nodes(client: TestClient) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    payload = _test_workflow_node(
        client,
        admin_token,
        {
            "nodes": [
                {
                    "id": "unsupported-node",
                    "type": "raster.clip",
                    "position": {"x": 0, "y": 0},
                    "params": {},
                    "input_bindings": {},
                    "output_defs": [],
                }
            ],
            "edges": [],
        },
        "unsupported-node",
    )
    assert payload["status"] == "not_supported"
    assert "Unsupported node types" in payload["errors"][0]


def test_workflow_node_test_reports_binding_errors(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    graph = _template_graph(client, engineer_token, "tabular.prediction")

    target_node_id = ""
    for node in graph["nodes"]:
        if node["type"] == "table.load_csv":
            node["input_bindings"] = {}
            target_node_id = node["id"]

    payload = _test_workflow_node(client, engineer_token, graph, target_node_id)
    assert payload["status"] == "failed"
    assert "Missing required input binding: dataset" in payload["errors"][0]


def test_models_endpoint_allows_members_with_model_view_permission(
    client: TestClient,
    admin_token: str,
) -> None:
    member_token = _login(client, "member@platform.local", "Member123!")

    member_response = client.get(
        "/api/v1/models",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_response.status_code == 200

    allowed = client.get(
        "/api/v1/models",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200


def test_joblib_model_upload_persists_algorithm_metadata(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    estimator = SVR(kernel="linear", C=1.0, epsilon=0.1).fit(
        [[1.0, 2.0], [2.0, 3.0], [3.0, 4.0]],
        [1.5, 2.5, 3.5],
    )

    payload = _upload_joblib_model_package(
        client,
        engineer_token,
        workspace_id,
        "svr-runtime-model",
        "svm_regression",
        estimator,
        default_parameters={"roundDigits": 3, "cacheSize": 256},
    )

    assert payload["algorithm_key"] == "svm_regression"
    assert payload["artifact_format"] == "joblib"
    assert payload["feature_names"] == ["feature_a", "feature_b"]
    assert payload["default_parameters"]["cacheSize"] == 256


def test_dataset_upload_persists_version(client: TestClient, admin_token: str) -> None:
    workspace_id = _workspace_id(client, admin_token)
    description = "Generic artifact package for public sharing."

    response = client.post(
        "/api/v1/datasets/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("sample.txt", b"hello platform", "text/plain")},
        data={
            "workspace_id": workspace_id,
            "dataset_name": "Uploaded Sample",
            "description": description,
            "kind": "artifact",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["metadata"]["size_bytes"] == 14

    datasets = client.get(
        "/api/v1/datasets",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    versions = client.get(
        "/api/v1/dataset-versions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert datasets.status_code == 200
    assert versions.status_code == 200
    assert any(item["id"] == payload["id"] for item in versions.json())
    uploaded_dataset = next(item for item in datasets.json() if item["name"] == "Uploaded Sample")
    assert uploaded_dataset["description"] == description


def test_table_dataset_upload_extracts_csv_metadata(client: TestClient, admin_token: str) -> None:
    workspace_id = _workspace_id(client, admin_token)
    payload = _upload_table_dataset(
        client,
        admin_token,
        workspace_id,
        "tabular-training-data",
        "feature_a,feature_b,target\n1,2,2.0\n3,4,3.5\n",
    )

    assert payload["metadata"]["columns"] == ["feature_a", "feature_b", "target"]
    assert payload["metadata"]["row_count"] == 2
    assert payload["metadata"]["sample_rows"][0]["feature_a"] == "1"


def test_dataset_description_can_be_updated(client: TestClient, admin_token: str) -> None:
    workspace_id = _workspace_id(client, admin_token)
    _upload_table_dataset(
        client,
        admin_token,
        workspace_id,
        "editable-dataset",
        "feature_a,feature_b,target\n1,2,2.0\n",
        description="Initial description",
    )

    datasets = client.get(
        "/api/v1/datasets?scope=mine",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert datasets.status_code == 200
    dataset = next(item for item in datasets.json() if item["name"] == "editable-dataset")

    update = client.patch(
        f"/api/v1/datasets/{dataset['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "name": "editable-dataset",
            "description": "Updated public-facing description",
            "original_file_name": "curated-output.csv",
            "content_type": "text/csv",
            "row_count": 128,
            "columns": ["feature_a", "feature_b", "prediction"],
            "sample_record": {
                "feature_a": 1.25,
                "feature_b": 3.5,
                "prediction": 0.91,
            },
        },
    )
    assert update.status_code == 200
    assert update.json()["description"] == "Updated public-facing description"

    versions = client.get(
        f"/api/v1/dataset-versions?dataset_id={dataset['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert versions.status_code == 200
    latest_version = versions.json()[0]
    assert latest_version["metadata"]["original_file_name"] == "curated-output.csv"
    assert latest_version["metadata"]["content_type"] == "text/csv"
    assert latest_version["metadata"]["row_count"] == 128
    assert latest_version["metadata"]["columns"] == [
        "feature_a",
        "feature_b",
        "prediction",
    ]
    assert latest_version["metadata"]["sample_record"]["prediction"] == 0.91


def test_workflow_save_creates_new_version(client: TestClient, admin_token: str) -> None:
    current = client.get(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert current.status_code == 200
    current_payload = current.json()

    saved = client.put(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=current_payload["graph"],
    )
    assert saved.status_code == 200
    saved_payload = saved.json()
    assert saved_payload["version"] == current_payload["version"] + 1


@pytest.mark.parametrize(
    ("template_id", "prediction_node_type", "model_factory"),
    [
        (
            "tabular.prediction",
            "tabular.linear_regression_predict",
            lambda client, token, workspace_id: _upload_model_package(
                client,
                token,
                workspace_id,
                "simple-linear-model",
            ),
        ),
        (
            "tabular.svm_prediction",
            "tabular.svm_regression_predict",
            lambda client, token, workspace_id: _upload_joblib_model_package(
                client,
                token,
                workspace_id,
                "simple-svm-model",
                "svm_regression",
                SVR(kernel="linear", C=1.0, epsilon=0.1).fit(
                    [[1.0, 2.0], [2.0, 3.0], [3.0, 4.0], [4.0, 5.0]],
                    [1.5, 2.5, 3.5, 4.5],
                ),
                default_parameters={"roundDigits": 3, "cacheSize": 256},
            ),
        ),
        (
            "tabular.random_forest_prediction",
            "tabular.random_forest_regression_predict",
            lambda client, token, workspace_id: _upload_joblib_model_package(
                client,
                token,
                workspace_id,
                "simple-rf-model",
                "random_forest_regression",
                RandomForestRegressor(
                    n_estimators=8,
                    max_depth=4,
                    random_state=0,
                ).fit(
                    [[1.0, 2.0], [2.0, 3.0], [3.0, 4.0], [4.0, 5.0], [5.0, 6.0]],
                    [1.5, 2.5, 3.5, 4.5, 5.5],
                ),
                default_parameters={"roundDigits": 2, "nJobs": 1},
            ),
        ),
    ],
)
def test_prediction_workflow_run_creates_private_table_output(
    client: TestClient,
    template_id: str,
    prediction_node_type: str,
    model_factory,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    dataset_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "prediction-input",
        "feature_a,feature_b,target\n1,2,1.0\n3,4,2.0\n",
    )
    model_version = model_factory(client, engineer_token, workspace_id)

    graph = _template_graph(client, engineer_token, template_id)
    for node in graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = dataset_version["id"]
        if node["type"] == prediction_node_type:
            node["params"]["modelVersionId"] = model_version["id"]
            node["params"]["predictionColumn"] = "prediction"
            if prediction_node_type == "tabular.linear_regression_predict":
                node["params"]["roundDigits"] = 2
            if prediction_node_type == "tabular.svm_regression_predict":
                node["params"]["cacheSize"] = 256
            if prediction_node_type == "tabular.random_forest_regression_predict":
                node["params"]["nJobs"] = 1
        if node["type"] == "export.table":
            node["params"]["outputDatasetName"] = "Engineer Prediction Output"

    workflow_version = _save_workflow_graph(client, engineer_token, graph)
    accepted_run = _run_workflow(client, engineer_token, workflow_version["id"], workspace_id)
    assert accepted_run["status"] == "succeeded"

    run = _workflow_run_details(client, engineer_token, accepted_run["id"])
    result_dataset_version_id = run["result_dataset_version_id"]
    assert result_dataset_version_id

    download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert download.status_code == 200
    assert "prediction" in download.text

    engineer_versions = client.get(
        "/api/v1/dataset-versions",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_versions = client.get(
        "/api/v1/dataset-versions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_versions = client.get(
        "/api/v1/dataset-versions",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_versions.status_code == 200
    assert admin_versions.status_code == 200
    assert member_versions.status_code == 200
    assert any(item["id"] == result_dataset_version_id for item in engineer_versions.json())
    assert any(item["id"] == result_dataset_version_id for item in admin_versions.json())
    assert not any(item["id"] == result_dataset_version_id for item in member_versions.json())


def test_validation_workflow_exports_metrics_and_keeps_output_private(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    prediction_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "prediction-table",
        "feature_a,prediction\n1,2.0\n2,4.0\n3,6.0\n",
    )
    ground_truth_version = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "ground-truth-table",
        "feature_a,target\n1,2.5\n2,3.5\n3,6.5\n",
    )

    graph = _template_graph(client, engineer_token, "tabular.validation")
    dataset_source_nodes = [
        node for node in graph["nodes"] if node["type"] == "source.dataset_version"
    ]
    dataset_source_nodes[0]["params"]["datasetVersionId"] = prediction_version["id"]
    dataset_source_nodes[1]["params"]["datasetVersionId"] = ground_truth_version["id"]
    for node in graph["nodes"]:
        if node["type"] == "metrics.validate_regression":
            node["params"]["predictionColumn"] = "prediction"
            node["params"]["groundTruthColumn"] = "target"
            node["params"]["metrics"] = ["r2", "mae", "rmse"]
        if node["type"] == "export.metrics":
            node["params"]["outputDatasetName"] = "Engineer Validation Metrics"
            node["params"]["format"] = "json"

    workflow_version = _save_workflow_graph(client, engineer_token, graph)
    accepted_run = _run_workflow(client, engineer_token, workflow_version["id"], workspace_id)
    assert accepted_run["status"] == "succeeded"

    run = _workflow_run_details(client, engineer_token, accepted_run["id"])
    result_dataset_version_id = run["result_dataset_version_id"]
    assert result_dataset_version_id
    assert set(run["metrics"]) == {"r2", "mae", "rmse"}

    engineer_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    member_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    admin_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert engineer_download.status_code == 200
    assert admin_download.status_code == 200
    assert member_download.status_code == 404

    metrics_payload = admin_download.json()
    assert set(metrics_payload["metrics"]) == {"r2", "mae", "rmse"}


def test_private_dataset_can_be_published_by_admin(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "engineer-private-dataset",
        "feature_a,feature_b,target\n1,2,3.0\n",
    )

    engineer_datasets = client.get(
        "/api/v1/datasets?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    member_visible_before = client.get(
        "/api/v1/datasets",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_datasets.status_code == 200
    assert member_visible_before.status_code == 200

    engineer_dataset = next(
        item for item in engineer_datasets.json() if item["name"] == "engineer-private-dataset"
    )
    assert engineer_dataset["visibility"] == "private"
    assert not any(
        item["id"] == engineer_dataset["id"] for item in member_visible_before.json()
    )

    publish = client.patch(
        f"/api/v1/datasets/{engineer_dataset['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert publish.status_code == 200
    assert publish.json()["visibility"] == "public"

    member_visible_after = client.get(
        "/api/v1/datasets",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    public_versions = client.get(
        "/api/v1/dataset-versions?visibility=public",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_after.status_code == 200
    assert public_versions.status_code == 200
    assert any(item["id"] == engineer_dataset["id"] for item in member_visible_after.json())
    assert any(
        item["dataset_id"] == engineer_dataset["id"] for item in public_versions.json()
    )


def test_workflow_versions_are_user_scoped_and_downloadable(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")

    engineer_current = client.get(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    member_current = client.get(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_current.status_code == 200
    assert member_current.status_code == 200
    assert engineer_current.json()["id"] != member_current.json()["id"]
    assert engineer_current.json()["owner_user_id"] != member_current.json()["owner_user_id"]

    member_versions = client.get(
        "/api/v1/workflows/versions?scope=mine",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    forbidden_all_scope = client.get(
        "/api/v1/workflows/versions?scope=all",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_versions.status_code == 200
    assert forbidden_all_scope.status_code == 403
    assert all(
        item["owner_user_id"] == member_current.json()["owner_user_id"]
        for item in member_versions.json()
    )

    download = client.get(
        f"/api/v1/workflows/versions/{member_current.json()['id']}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/json")

    imported = client.post(
        "/api/v1/workflows/versions/import",
        headers={"Authorization": f"Bearer {member_token}"},
        json=member_current.json()["graph"],
    )
    assert imported.status_code == 200
    imported_id = imported.json()["id"]

    delete_response = client.delete(
        f"/api/v1/workflows/versions/{imported_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert delete_response.status_code == 200


def test_custom_api_model_assets_are_private_downloadable_and_deletable(
    client: TestClient,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, engineer_token)
    engineer_user = _current_user(client, engineer_token)

    model_version = _create_custom_api_model(
        client,
        engineer_token,
        workspace_id,
        "external-regressor",
    )
    assert model_version["source_type"] == "custom_api"
    assert model_version["execution_mode"] == "external_api"
    assert model_version["visibility"] == "private"
    assert model_version["owner_user_id"] == engineer_user["id"]

    engineer_models = client.get(
        "/api/v1/models/versions?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    member_visible_models = client.get(
        "/api/v1/models/versions",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    admin_all_models = client.get(
        "/api/v1/models/versions?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert engineer_models.status_code == 200
    assert member_visible_models.status_code == 200
    assert admin_all_models.status_code == 200
    assert any(item["id"] == model_version["id"] for item in engineer_models.json())
    assert not any(item["id"] == model_version["id"] for item in member_visible_models.json())
    assert any(item["id"] == model_version["id"] for item in admin_all_models.json())

    engineer_download = client.get(
        f"/api/v1/models/versions/{model_version['id']}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_download = client.get(
        f"/api/v1/models/versions/{model_version['id']}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_download = client.get(
        f"/api/v1/models/versions/{model_version['id']}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_download.status_code == 200
    assert admin_download.status_code == 200
    assert member_download.status_code == 404
    assert engineer_download.json()["endpoint_url"] == "https://example.com/predict"

    member_delete = client.delete(
        f"/api/v1/models/versions/{model_version['id']}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    owner_delete = client.delete(
        f"/api/v1/models/versions/{model_version['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert member_delete.status_code == 403
    assert owner_delete.status_code == 200


def test_trained_model_assets_can_power_prediction_workflows(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, engineer_token)
    engineer_user = _current_user(client, engineer_token)

    training_dataset = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "training-data",
        (
            "feature_a,feature_b,target\n"
            "1,2,1.4\n"
            "2,3,2.2\n"
            "3,4,3.1\n"
            "4,5,4.1\n"
            "5,6,5.0\n"
            "6,7,5.9\n"
        ),
    )

    training_graph = _template_graph(
        client,
        engineer_token,
        "tabular.linear_regression_training",
    )
    for node in training_graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = training_dataset["id"]
        if node["type"] == "model.save_trained_model":
            node["params"]["outputModelName"] = "Engineer Linear Model"
            node["params"]["outputModelVersion"] = "2026.04"

    training_workflow_version = _save_workflow_graph(
        client,
        engineer_token,
        training_graph,
    )
    training_run = _run_workflow(
        client,
        engineer_token,
        training_workflow_version["id"],
        workspace_id,
    )
    assert training_run["status"] == "succeeded"

    engineer_models = client.get(
        "/api/v1/models/versions?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_models = client.get(
        "/api/v1/models/versions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_models = client.get(
        "/api/v1/models/versions",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_models.status_code == 200
    assert admin_models.status_code == 200
    assert member_models.status_code == 200

    trained_model = next(
        item
        for item in engineer_models.json()
        if item["model_name"] == "Engineer Linear Model"
        and item["version"] == "2026.04"
        and item["source_type"] == "trained"
    )
    assert trained_model["owner_user_id"] == engineer_user["id"]
    assert any(item["id"] == trained_model["id"] for item in admin_models.json())
    assert not any(item["id"] == trained_model["id"] for item in member_models.json())

    trained_model_download = client.get(
        f"/api/v1/models/versions/{trained_model['id']}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert trained_model_download.status_code == 200
    assert trained_model_download.headers["content-type"] == "application/octet-stream"

    prediction_dataset = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "prediction-data",
        "feature_a,feature_b,target\n7,8,0\n8,9,0\n",
    )
    prediction_graph = _template_graph(client, engineer_token, "tabular.prediction")
    for node in prediction_graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = prediction_dataset["id"]
        if node["type"] == "tabular.linear_regression_predict":
            node["params"]["modelVersionId"] = trained_model["id"]
            node["params"]["predictionColumn"] = "prediction"
            node["params"]["roundDigits"] = 3
        if node["type"] == "export.table":
            node["params"]["outputDatasetName"] = "Prediction From Trained Model"

    prediction_workflow_version = _save_workflow_graph(
        client,
        engineer_token,
        prediction_graph,
    )
    prediction_run = _run_workflow(
        client,
        engineer_token,
        prediction_workflow_version["id"],
        workspace_id,
    )
    assert prediction_run["status"] == "succeeded"

    run_details = _workflow_run_details(client, engineer_token, prediction_run["id"])
    result_dataset_version_id = run_details["result_dataset_version_id"]
    assert result_dataset_version_id

    engineer_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_download.status_code == 200
    assert admin_download.status_code == 200
    assert member_download.status_code == 404
    assert "prediction" in engineer_download.text
