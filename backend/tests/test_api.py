import io
import json
import tempfile
from pathlib import Path

import joblib
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.svm import SVR

from platform_backend.core.settings import get_settings
from platform_backend.workflows.gee_runtime import (
    _build_download_plan,
    _download_image,
    parse_sentinel_download_params,
)


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


def _upload_vector_dataset(
    client: TestClient,
    token: str,
    workspace_id: str,
    dataset_name: str,
    geojson_text: str,
    description: str | None = None,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/datasets/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                f"{dataset_name}.geojson",
                geojson_text.encode("utf-8"),
                "application/geo+json",
            )
        },
        data={
            "workspace_id": workspace_id,
            "dataset_name": dataset_name,
            "description": description or "",
            "kind": "vector",
        },
    )
    assert response.status_code == 201
    return response.json()


def _upload_product_asset(
    client: TestClient,
    token: str,
    workspace_id: str,
    product_name: str,
    *,
    description: str = "Product asset for automated tests.",
    category: str = "Hardware",
    visibility: str | None = None,
    file_name: str | None = None,
    content: bytes | None = None,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/products/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={
            "file": (
                file_name or f"{product_name}.stp",
                content or b"ISO-10303-21;\nEND-ISO-10303-21;\n",
                "application/step",
            )
        },
        data={
            "workspace_id": workspace_id,
            "name": product_name,
            "description": description,
            "category": category,
            "tags_json": json.dumps(["test", "product"]),
            "highlights_json": json.dumps(["downloadable", "private by default"]),
            "specifications_json": json.dumps({"Material": "Aluminum"}),
            **({"visibility": visibility} if visibility is not None else {}),
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


def _create_gee_credential(
    client: TestClient,
    token: str,
    workspace_id: str,
    name: str = "Engineer GEE Credential",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/integrations/gee-credentials",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workspace_id": workspace_id,
            "name": name,
            "description": "Personal GEE credential for workflow tests.",
            "project_id": "platform-gee-test",
            "service_account_json": json.dumps(
                {
                    "type": "service_account",
                    "project_id": "platform-gee-test",
                    "private_key_id": "dummy-key-id",
                    "private_key": (
                        "-----BEGIN PRIVATE KEY-----\n"
                        "MIIBVwIBADANBgkqhkiG9w0BAQEFAASCAT8wggE7AgEAAkEAu\n"
                        "-----END PRIVATE KEY-----\n"
                    ),
                    "client_email": "gee-test@platform-gee-test.iam.gserviceaccount.com",
                    "client_id": "1234567890",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            ),
        },
    )
    assert response.status_code == 201
    return response.json()


def _set_platform_default_gee_credential(
    client: TestClient,
    token: str,
    credential_id: str,
) -> dict[str, object]:
    response = client.post(
        f"/api/v1/integrations/gee-credentials/{credential_id}/set-platform-default",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return response.json()


def _create_spatial_roi(
    client: TestClient,
    token: str,
    workspace_id: str,
    name: str = "Test ROI",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/spatial/rois",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "workspace_id": workspace_id,
            "name": name,
            "description": "ROI for automated tests.",
            "geometry_type": "rectangle",
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [116.10, 39.70],
                        [116.65, 39.70],
                        [116.65, 40.10],
                        [116.10, 40.10],
                        [116.10, 39.70],
                    ]
                ],
            },
            "tags": ["test", "roi"],
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


def test_workflow_catalog_endpoint_exposes_contract_metadata(
    client: TestClient,
    admin_token: str,
) -> None:
    response = client.get(
        "/api/v1/workflows/catalog",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200

    payload = response.json()
    assert payload

    load_csv = next(item for item in payload if item["type"] == "table.load_csv")
    validate_regression = next(
        item for item in payload if item["type"] == "metrics.validate_regression"
    )

    assert load_csv["input_contracts"]
    assert load_csv["output_contracts"]
    assert load_csv["example_inputs"]
    assert load_csv["example_outputs"]
    assert load_csv["common_errors"]
    assert load_csv["input_contracts"][0]["port_key"] == "dataset"
    assert "csv" in load_csv["input_contracts"][0]["file_formats"]

    assert validate_regression["input_contracts"]
    assert validate_regression["output_contracts"][0]["port_key"] == "report"
    assert validate_regression["example_outputs"][0]["kind"] == "table"

    sentinel_download = next(
        item for item in payload if item["type"] == "source.sentinel2_gee_download"
    )
    assert sentinel_download["output_contracts"][0]["dataset_kinds"] == ["raster"]
    assert sentinel_download["params"]


def test_workflow_templates_endpoint_includes_sentinel_template(
    client: TestClient,
    admin_token: str,
) -> None:
    response = client.get(
        "/api/v1/workflows/templates",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    sentinel_template = next(
        item for item in response.json() if item["id"] == "sentinel2.single_scene_download"
    )
    assert sentinel_template["graph"]["nodes"][0]["type"] == "source.sentinel2_gee_download"


def test_gee_credentials_are_user_scoped_private_assets(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    created = _create_gee_credential(client, engineer_token, workspace_id)

    engineer_credentials = client.get(
        "/api/v1/integrations/gee-credentials?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_all_credentials = client.get(
        "/api/v1/integrations/gee-credentials?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_forbidden = client.get(
        "/api/v1/integrations/gee-credentials?scope=all",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_credentials.status_code == 200
    assert admin_all_credentials.status_code == 200
    assert member_forbidden.status_code == 403
    assert any(item["id"] == created["id"] for item in engineer_credentials.json())
    assert any(item["id"] == created["id"] for item in admin_all_credentials.json())


def test_admin_can_set_platform_default_gee_credential(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    created = _create_gee_credential(client, engineer_token, workspace_id)
    configured = _set_platform_default_gee_credential(client, admin_token, created["id"])
    assert configured["is_platform_default"] is True

    visible = client.get(
        "/api/v1/integrations/gee-credentials?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    forbidden = client.post(
        f"/api/v1/integrations/gee-credentials/{created['id']}/set-platform-default",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert visible.status_code == 200
    assert forbidden.status_code == 403
    assert any(
        item["id"] == created["id"] and item["is_platform_default"] is True
        for item in visible.json()
    )


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


def test_workflow_node_test_returns_sentinel_preview(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    credential = _create_gee_credential(client, engineer_token, workspace_id)

    def fake_preview(params, resolved_credential):
        assert resolved_credential.name == credential["name"]
        return {
            "scene_id": "S2A_TEST_SCENE",
            "cloud_cover": 4.2,
            "acquired_at": "2025-06-21T02:31:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.preview_sentinel_scene",
        fake_preview,
    )

    graph = _template_graph(client, engineer_token, "sentinel2.single_scene_download")
    target_node_id = graph["nodes"][0]["id"]
    graph["nodes"][0]["params"]["credentialMode"] = "personal"
    graph["nodes"][0]["params"]["personalCredentialId"] = credential["id"]

    payload = _test_workflow_node(client, engineer_token, graph, target_node_id)
    assert payload["status"] == "succeeded"
    assert payload["output_preview"]["dataset"]["kind"] == "dataset_version"
    assert payload["output_preview"]["dataset"]["scene_id"] == "S2A_TEST_SCENE"


def test_workflow_node_test_uses_platform_default_gee_credential(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, admin_token)
    credential = _create_gee_credential(client, admin_token, workspace_id, "Admin Default GEE")
    _set_platform_default_gee_credential(client, admin_token, credential["id"])

    def fake_preview(params, resolved_credential):
        assert resolved_credential.source == "platform_default"
        assert resolved_credential.name == credential["name"]
        return {
            "scene_id": "S2A_PLATFORM_DEFAULT",
            "cloud_cover": 1.8,
            "acquired_at": "2025-06-22T01:11:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.preview_sentinel_scene",
        fake_preview,
    )

    graph = _template_graph(client, admin_token, "sentinel2.single_scene_download")
    target_node_id = graph["nodes"][0]["id"]
    graph["nodes"][0]["params"]["credentialMode"] = "platform_default"
    graph["nodes"][0]["params"].pop("personalCredentialId", None)

    payload = _test_workflow_node(client, admin_token, graph, target_node_id)
    assert payload["status"] == "succeeded"
    assert payload["output_preview"]["dataset"]["scene_id"] == "S2A_PLATFORM_DEFAULT"


def test_workflow_node_test_reports_gee_connectivity_errors_clearly(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, admin_token)
    credential = _create_gee_credential(client, admin_token, workspace_id, "Admin Default GEE")
    _set_platform_default_gee_credential(client, admin_token, credential["id"])

    monkeypatch.setenv("PLATFORM_HTTPS_PROXY", "http://127.0.0.1:7897")
    monkeypatch.setenv("PLATFORM_GEE_REQUEST_TIMEOUT_SECONDS", "20")
    get_settings.cache_clear()

    def fake_resolve_scene(_params, _credential):
        raise TimeoutError(
            "HTTPSConnectionPool(host='oauth2.googleapis.com', port=443): "
            "Max retries exceeded with url: /token"
        )

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime._resolve_scene",
        fake_resolve_scene,
    )

    graph = _template_graph(client, admin_token, "sentinel2.single_scene_download")
    graph["nodes"][0]["params"]["credentialMode"] = "platform_default"
    graph["nodes"][0]["params"].pop("personalCredentialId", None)

    payload = _test_workflow_node(client, admin_token, graph, graph["nodes"][0]["id"])
    assert payload["status"] == "failed"
    assert "oauth2.googleapis.com" in payload["errors"][0]
    assert "127.0.0.1:7897" in payload["errors"][0]
    get_settings.cache_clear()


def test_spatial_roi_crud_and_admin_scope(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    created = _create_spatial_roi(client, engineer_token, workspace_id, "Engineer ROI")

    mine = client.get(
        "/api/v1/spatial/rois?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_all = client.get(
        "/api/v1/spatial/rois?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_all = client.get(
        "/api/v1/spatial/rois?scope=all",
        headers={"Authorization": f"Bearer {member_token}"},
    )

    assert mine.status_code == 200
    assert admin_all.status_code == 200
    assert member_all.status_code == 403
    assert any(item["id"] == created["id"] for item in mine.json())
    assert any(item["id"] == created["id"] for item in admin_all.json())

    updated = client.patch(
        f"/api/v1/spatial/rois/{created['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={
            "name": "Engineer ROI Updated",
            "description": "Updated ROI description.",
            "tags": ["updated", "roi"],
        },
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Engineer ROI Updated"

    deleted = client.delete(
        f"/api/v1/spatial/rois/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert deleted.status_code == 200


def test_spatial_overlay_creation_accepts_geojson_dataset_and_admin_scope(
    client: TestClient,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, engineer_token)

    dataset_version = _upload_vector_dataset(
        client,
        engineer_token,
        workspace_id,
        "vector-overlay-source",
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"name": "Area A"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [116.20, 39.80],
                                    [116.40, 39.80],
                                    [116.40, 39.98],
                                    [116.20, 39.98],
                                    [116.20, 39.80],
                                ]
                            ],
                        },
                    }
                ],
            }
        ),
    )

    created = client.post(
        "/api/v1/spatial/overlays",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={
            "workspace_id": workspace_id,
            "dataset_version_id": dataset_version["id"],
            "name": "Engineer Vector Overlay",
            "description": "Saved vector overlay.",
            "opacity": 0.6,
        },
    )
    assert created.status_code == 201
    assert created.json()["overlay_type"] == "vector"

    mine = client.get(
        "/api/v1/spatial/overlays?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_all = client.get(
        "/api/v1/spatial/overlays?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert mine.status_code == 200
    assert admin_all.status_code == 200
    assert any(item["id"] == created.json()["id"] for item in mine.json())
    assert any(item["id"] == created.json()["id"] for item in admin_all.json())


def test_spatial_roi_assets_can_be_published_to_visible_scope(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    created = _create_spatial_roi(client, engineer_token, workspace_id, "Shared ROI")
    assert created["visibility"] == "private"

    member_visible_before = client.get(
        "/api/v1/spatial/rois?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_before.status_code == 200
    assert not any(item["id"] == created["id"] for item in member_visible_before.json())

    owner_publish_forbidden = client.patch(
        f"/api/v1/spatial/rois/{created['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={"visibility": "public"},
    )
    assert owner_publish_forbidden.status_code == 403

    admin_publish = client.patch(
        f"/api/v1/spatial/rois/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert admin_publish.status_code == 200
    assert admin_publish.json()["visibility"] == "public"

    member_visible_after = client.get(
        "/api/v1/spatial/rois?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_after.status_code == 200
    assert any(item["id"] == created["id"] for item in member_visible_after.json())


def test_spatial_overlays_require_public_source_before_publish(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    dataset_version = _upload_vector_dataset(
        client,
        engineer_token,
        workspace_id,
        "shared-overlay-source",
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"name": "Shared Area"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [
                                    [116.20, 39.80],
                                    [116.40, 39.80],
                                    [116.40, 39.98],
                                    [116.20, 39.98],
                                    [116.20, 39.80],
                                ]
                            ],
                        },
                    }
                ],
            }
        ),
    )
    overlay_created = client.post(
        "/api/v1/spatial/overlays",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={
            "workspace_id": workspace_id,
            "dataset_version_id": dataset_version["id"],
            "name": "Shared Overlay",
            "description": "Overlay that depends on a published source dataset.",
            "opacity": 0.7,
        },
    )
    assert overlay_created.status_code == 201
    overlay = overlay_created.json()
    assert overlay["visibility"] == "private"

    owner_publish_forbidden = client.patch(
        f"/api/v1/spatial/overlays/{overlay['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={"visibility": "public"},
    )
    assert owner_publish_forbidden.status_code == 403

    publish_before_dataset = client.patch(
        f"/api/v1/spatial/overlays/{overlay['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert publish_before_dataset.status_code == 400
    assert "source dataset version is public" in publish_before_dataset.json()["detail"]

    dataset_publish = client.patch(
        f"/api/v1/datasets/{dataset_version['dataset_id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert dataset_publish.status_code == 200
    assert dataset_publish.json()["visibility"] == "public"

    publish_after_dataset = client.patch(
        f"/api/v1/spatial/overlays/{overlay['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert publish_after_dataset.status_code == 200
    assert publish_after_dataset.json()["visibility"] == "public"

    member_visible_overlays = client.get(
        "/api/v1/spatial/overlays?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_overlays.status_code == 200
    assert any(item["id"] == overlay["id"] for item in member_visible_overlays.json())


def test_workflow_validate_accepts_saved_roi_for_sentinel(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    roi = _create_spatial_roi(client, engineer_token, workspace_id, "Workflow ROI")
    graph = _template_graph(client, engineer_token, "sentinel2.single_scene_download")

    graph["nodes"][0]["params"]["roiMode"] = "saved_roi"
    graph["nodes"][0]["params"]["roiId"] = roi["id"]
    graph["nodes"][0]["params"].pop("bbox", None)

    response = client.post(
        "/api/v1/workflows/validate",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json=graph,
    )
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_workflow_node_test_resolves_saved_roi_for_sentinel(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    credential = _create_gee_credential(client, engineer_token, workspace_id)
    roi = _create_spatial_roi(client, engineer_token, workspace_id, "Sentinel ROI")

    def fake_preview(params, resolved_credential):
        assert resolved_credential.name == credential["name"]
        assert list(params.bbox) == roi["bbox"]
        return {
            "scene_id": "S2A_SAVED_ROI",
            "cloud_cover": 4.8,
            "acquired_at": "2025-06-21T02:31:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.preview_sentinel_scene",
        fake_preview,
    )

    graph = _template_graph(client, engineer_token, "sentinel2.single_scene_download")
    graph["nodes"][0]["params"]["roiMode"] = "saved_roi"
    graph["nodes"][0]["params"]["roiId"] = roi["id"]
    graph["nodes"][0]["params"].pop("bbox", None)
    graph["nodes"][0]["params"]["credentialMode"] = "personal"
    graph["nodes"][0]["params"]["personalCredentialId"] = credential["id"]

    payload = _test_workflow_node(client, engineer_token, graph, graph["nodes"][0]["id"])
    assert payload["status"] == "succeeded"
    assert payload["output_preview"]["dataset"]["scene_id"] == "S2A_SAVED_ROI"


def test_sentinel_band_aliases_are_normalized_for_gee_runtime(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, admin_token)
    credential = _create_gee_credential(client, admin_token, workspace_id, "Admin Default GEE")
    _set_platform_default_gee_credential(client, admin_token, credential["id"])

    def fake_preview(params, resolved_credential):
        assert resolved_credential.name == credential["name"]
        assert list(params.bands) == ["B4", "B3", "B2"]
        return {
            "scene_id": "S2A_ALIAS_TEST",
            "cloud_cover": 2.1,
            "acquired_at": "2025-06-22T01:11:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.preview_sentinel_scene",
        fake_preview,
    )

    graph = _template_graph(client, admin_token, "sentinel2.single_scene_download")
    graph["nodes"][0]["params"]["credentialMode"] = "platform_default"
    graph["nodes"][0]["params"]["bands"] = ["B04", "B03", "B02"]
    graph["nodes"][0]["params"].pop("personalCredentialId", None)

    payload = _test_workflow_node(client, admin_token, graph, graph["nodes"][0]["id"])
    assert payload["status"] == "succeeded"
    assert payload["output_preview"]["dataset"]["bands"] == ["B4", "B3", "B2"]


def test_sentinel_download_plan_auto_adjusts_scale_for_large_requests() -> None:
    params = parse_sentinel_download_params(
        {
            "bbox": "116.10,39.70,116.65,40.10",
            "startDate": "2025-06-01",
            "endDate": "2025-06-30",
            "maxCloudCover": 20,
            "bands": ["B4", "B3", "B2"],
            "scale": 10,
            "credentialMode": "platform_default",
        }
    )

    plan = _build_download_plan(params)

    assert plan.effective_scale > params.scale
    assert plan.download_estimated_bytes <= get_settings().gee_single_request_max_bytes
    assert plan.download_pixel_width < plan.requested_pixel_width
    assert plan.download_pixel_height < plan.requested_pixel_height


def test_sentinel_download_retries_with_larger_scale_after_size_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    params = parse_sentinel_download_params(
        {
            "bbox": "116.10,39.70,116.65,40.10",
            "startDate": "2025-06-01",
            "endDate": "2025-06-30",
            "maxCloudCover": 20,
            "bands": ["B4", "B3", "B2"],
            "scale": 10,
            "credentialMode": "platform_default",
        }
    )

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def raise_for_status(self) -> None:
            return None

        def iter_content(self, chunk_size: int):
            del chunk_size
            yield b"FAKE-GEOTIFF-DATA"

    class FakeSession:
        def get(self, url: str, *, stream: bool, timeout: float) -> FakeResponse:
            assert url == "https://example.com/fake-download.tif"
            assert stream is True
            assert timeout == float(get_settings().gee_request_timeout_seconds)
            return FakeResponse()

    class FakeRegion:
        def getInfo(self) -> dict[str, object]:
            return {"coordinates": [[[116.1, 39.7], [116.65, 39.7], [116.65, 40.1]]]}

    class FakeImage:
        def __init__(self) -> None:
            self.scales: list[int] = []

        def select(self, bands: list[str]):
            assert bands == ["B4", "B3", "B2"]
            return self

        def clip(self, region: FakeRegion):
            assert isinstance(region, FakeRegion)
            return self

        def getDownloadURL(self, payload: dict[str, object]) -> str:
            scale = int(payload["scale"])
            self.scales.append(scale)
            if len(self.scales) == 1:
                raise RuntimeError(
                    "Total request size (245446578 bytes) "
                    "must be less than or equal to 50331648 bytes"
                )
            return "https://example.com/fake-download.tif"

    image = FakeImage()
    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime._build_requests_session",
        lambda: FakeSession(),
    )
    with tempfile.TemporaryDirectory(dir="backend") as temp_dir:
        output_path = Path(temp_dir) / "sentinel-scene.tif"
        details = _download_image(
            None,
            image,
            FakeRegion(),
            params,
            output_path,
        )

        assert output_path.read_bytes() == b"FAKE-GEOTIFF-DATA"
        assert len(image.scales) == 2
        assert image.scales[1] > image.scales[0]
        assert details["scale"] == image.scales[1]
        assert details["scale_adjusted"] is True

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
    assert run["input_asset_version_ids"] == [dataset_version["id"]]
    assert result_dataset_version_id in run["output_asset_version_ids"]
    assert run["primary_output_asset_version_id"] == result_dataset_version_id

    download = client.get(
        f"/api/v1/dataset-versions/{result_dataset_version_id}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert download.status_code == 200
    assert "prediction" in download.text

    asset_flow = client.get(
        "/api/v1/asset-flow/overview?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert asset_flow.status_code == 200
    asset_flow_payload = asset_flow.json()
    execution = next(
        item for item in asset_flow_payload["executions"] if item["id"] == accepted_run["id"]
    )
    assert execution["workflow_version_id"] == workflow_version["id"]
    assert execution["input_asset_version_ids"] == [dataset_version["id"]]
    assert result_dataset_version_id in execution["output_asset_version_ids"]
    assert any(
        item["id"] == workflow_version["id"]
        and item["asset"]["asset_type"] == "workflow"
        for item in asset_flow_payload["asset_versions"]
    )
    assert any(
        item["id"] == result_dataset_version_id
        and item["source_execution_id"] == accepted_run["id"]
        and item["upstream_asset_version_ids"] == [dataset_version["id"]]
        for item in asset_flow_payload["asset_versions"]
    )
    assert any(
        item["source_asset_version_id"] == dataset_version["id"]
        and item["target_asset_version_id"] == result_dataset_version_id
        and item["execution_id"] == accepted_run["id"]
        for item in asset_flow_payload["lineage_edges"]
    )

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


def test_sentinel_workflow_run_creates_private_raster_output(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)
    credential = _create_gee_credential(client, engineer_token, workspace_id)

    def fake_download(params, resolved_credential, output_path):
        assert resolved_credential.name == credential["name"]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"FAKE-GEOTIFF-DATA")
        return {
            "scene_id": "S2B_FAKE_SCENE",
            "cloud_cover": 3.5,
            "acquired_at": "2025-06-19T02:11:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
            "size_bytes": output_path.stat().st_size,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.download_sentinel_scene",
        fake_download,
    )

    graph = _template_graph(client, engineer_token, "sentinel2.single_scene_download")
    graph["nodes"][0]["params"]["credentialMode"] = "personal"
    graph["nodes"][0]["params"]["personalCredentialId"] = credential["id"]
    graph["nodes"][0]["params"]["outputDatasetName"] = "Engineer Sentinel Raster"

    workflow_version = _save_workflow_graph(client, engineer_token, graph)
    accepted_run = _run_workflow(client, engineer_token, workflow_version["id"], workspace_id)
    assert accepted_run["status"] == "succeeded"

    run = _workflow_run_details(client, engineer_token, accepted_run["id"])
    result_dataset_version_id = run["result_dataset_version_id"]
    assert result_dataset_version_id
    assert run["metrics"]["scene_id"] == "S2B_FAKE_SCENE"

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
    assert engineer_download.content == b"FAKE-GEOTIFF-DATA"


def test_sentinel_workflow_run_resolves_saved_roi_bbox(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    workspace_id = _workspace_id(client, engineer_token)
    credential = _create_gee_credential(client, engineer_token, workspace_id)
    roi = _create_spatial_roi(client, engineer_token, workspace_id, "Run ROI")

    def fake_download(params, resolved_credential, output_path):
        assert resolved_credential.name == credential["name"]
        assert list(params.bbox) == roi["bbox"]
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"FAKE-SAVED-ROI-GEOTIFF")
        return {
            "scene_id": "S2B_SAVED_ROI",
            "cloud_cover": 1.9,
            "acquired_at": "2025-06-19T02:11:00+00:00",
            "bbox": list(params.bbox),
            "bands": list(params.bands),
            "scale": params.scale,
            "size_bytes": output_path.stat().st_size,
        }

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.download_sentinel_scene",
        fake_download,
    )

    graph = _template_graph(client, engineer_token, "sentinel2.single_scene_download")
    graph["nodes"][0]["params"]["roiMode"] = "saved_roi"
    graph["nodes"][0]["params"]["roiId"] = roi["id"]
    graph["nodes"][0]["params"].pop("bbox", None)
    graph["nodes"][0]["params"]["credentialMode"] = "personal"
    graph["nodes"][0]["params"]["personalCredentialId"] = credential["id"]

    workflow_version = _save_workflow_graph(client, engineer_token, graph)
    accepted_run = _run_workflow(client, engineer_token, workflow_version["id"], workspace_id)

    assert accepted_run["status"] == "succeeded"
    run = _workflow_run_details(client, engineer_token, accepted_run["id"])
    assert run["metrics"]["scene_id"] == "S2B_SAVED_ROI"

    map_candidates = client.get(
        "/api/v1/asset-flow/input-candidates?consumer=map_overlay&scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert map_candidates.status_code == 200
    payload = map_candidates.json()
    matched = next(
        item
        for item in payload
        if item["asset_version"]["id"] == run["result_dataset_version_id"]
    )
    assert matched["consumer"] == "map_overlay"
    assert matched["candidate_type"] == "asset_version"
    assert matched["asset_version"]["source_execution_id"] == accepted_run["id"]
    assert "map_overlay_ready" in matched["asset_version"]["capabilities"]
    assert "workflow_dataset" in matched["asset_version"]["consumable_by"]
    assert matched["asset_version"]["spatial_traits"]["overlay_type"] == "raster"


def test_asset_flow_workflow_roi_candidates_include_visible_rois(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)

    roi = _create_spatial_roi(client, engineer_token, workspace_id, "Visible Workflow ROI")

    publish = client.patch(
        f"/api/v1/spatial/rois/{roi['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert publish.status_code == 200
    assert publish.json()["visibility"] == "public"

    response = client.get(
        "/api/v1/asset-flow/input-candidates?consumer=workflow_roi&scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert response.status_code == 200
    payload = response.json()
    matched = next(item for item in payload if item["spatial_roi"]["id"] == roi["id"])
    assert matched["consumer"] == "workflow_roi"
    assert matched["candidate_type"] == "spatial_roi"
    assert matched["title"] == "Visible Workflow ROI"
    assert matched["spatial_roi"]["visibility"] == "public"


def test_sentinel_platform_default_workflow_run_returns_failed_status_not_500(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, admin_token)
    credential = _create_gee_credential(client, admin_token, workspace_id, "Admin Default GEE")
    _set_platform_default_gee_credential(client, admin_token, credential["id"])

    def fake_download(params, resolved_credential, output_path):
        assert resolved_credential.source == "platform_default"
        assert resolved_credential.name == credential["name"]
        raise RuntimeError("Synthetic Sentinel download failure.")

    monkeypatch.setattr(
        "platform_backend.workflows.gee_runtime.download_sentinel_scene",
        fake_download,
    )

    graph = _template_graph(client, admin_token, "sentinel2.single_scene_download")
    workflow_version = _save_workflow_graph(client, admin_token, graph)
    failed_run = _run_workflow(client, admin_token, workflow_version["id"], workspace_id)

    assert failed_run["status"] == "failed"
    assert failed_run["error_message"] == "Synthetic Sentinel download failure."

    run = _workflow_run_details(client, admin_token, failed_run["id"])
    assert run["status"] == "failed"
    assert run["metrics"]["error"] == "Synthetic Sentinel download failure."


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


def test_workflow_versions_can_be_published_to_visible_scope(client: TestClient) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")

    engineer_current = client.get(
        "/api/v1/workflows/versions/current",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    assert engineer_current.status_code == 200
    workflow_version = engineer_current.json()
    assert workflow_version["visibility"] == "private"

    member_visible_before = client.get(
        "/api/v1/workflows/versions?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_before.status_code == 200
    assert not any(item["id"] == workflow_version["id"] for item in member_visible_before.json())

    owner_publish_forbidden = client.patch(
        f"/api/v1/workflows/versions/{workflow_version['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={"visibility": "public"},
    )
    assert owner_publish_forbidden.status_code == 403

    admin_publish = client.patch(
        f"/api/v1/workflows/versions/{workflow_version['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert admin_publish.status_code == 200
    assert admin_publish.json()["visibility"] == "public"

    member_visible_after = client.get(
        "/api/v1/workflows/versions?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_after.status_code == 200
    assert any(item["id"] == workflow_version["id"] for item in member_visible_after.json())

    member_download = client.get(
        f"/api/v1/workflows/versions/{workflow_version['id']}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_download.status_code == 200
    assert member_download.headers["content-type"].startswith("application/json")


def test_product_assets_are_user_scoped_publishable_and_downloadable(
    client: TestClient,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, engineer_token)
    engineer_user = _current_user(client, engineer_token)

    created = _upload_product_asset(
        client,
        engineer_token,
        workspace_id,
        "engineer-private-product",
    )
    assert created["visibility"] == "private"
    assert created["owner_user_id"] == engineer_user["id"]

    engineer_products = client.get(
        "/api/v1/products?scope=mine",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    admin_all_products = client.get(
        "/api/v1/products?scope=all",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_forbidden_all_scope = client.get(
        "/api/v1/products?scope=all",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    member_visible_before = client.get(
        "/api/v1/products",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert engineer_products.status_code == 200
    assert admin_all_products.status_code == 200
    assert member_forbidden_all_scope.status_code == 403
    assert member_visible_before.status_code == 200
    assert any(item["id"] == created["id"] for item in engineer_products.json())
    assert any(item["id"] == created["id"] for item in admin_all_products.json())
    assert not any(item["id"] == created["id"] for item in member_visible_before.json())

    owner_rename = client.patch(
        f"/api/v1/products/{created['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        data={"name": "engineer-private-product-v2"},
    )
    owner_publish_forbidden = client.patch(
        f"/api/v1/products/{created['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        data={"visibility": "public"},
    )
    assert owner_rename.status_code == 200
    assert owner_rename.json()["name"] == "engineer-private-product-v2"
    assert owner_publish_forbidden.status_code == 403

    admin_publish = client.patch(
        f"/api/v1/products/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={"visibility": "public"},
    )
    assert admin_publish.status_code == 200
    assert admin_publish.json()["visibility"] == "public"

    member_visible_after = client.get(
        "/api/v1/products?visibility=public",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_after.status_code == 200
    assert any(item["id"] == created["id"] for item in member_visible_after.json())

    owner_download = client.get(
        f"/api/v1/products/{created['id']}/download",
        headers={"Authorization": f"Bearer {engineer_token}"},
    )
    member_download = client.get(
        f"/api/v1/products/{created['id']}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert owner_download.status_code == 200
    assert member_download.status_code == 200

    member_delete_forbidden = client.delete(
        f"/api/v1/products/{created['id']}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    admin_delete = client.delete(
        f"/api/v1/products/{created['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert member_delete_forbidden.status_code == 403
    assert admin_delete.status_code == 200


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


def test_custom_api_models_can_be_published_and_keep_runtime_auth(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engineer_token = _login(client, "engineer@platform.local", "Engineer123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    workspace_id = _workspace_id(client, engineer_token)

    model_version = _create_custom_api_model(
        client,
        engineer_token,
        workspace_id,
        "shared-external-regressor",
        version="2.0.0",
    )
    assert model_version["visibility"] == "private"

    owner_publish_forbidden = client.patch(
        f"/api/v1/models/versions/{model_version['id']}",
        headers={"Authorization": f"Bearer {engineer_token}"},
        json={"visibility": "public"},
    )
    assert owner_publish_forbidden.status_code == 403

    admin_publish = client.patch(
        f"/api/v1/models/versions/{model_version['id']}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"visibility": "public"},
    )
    assert admin_publish.status_code == 200
    assert admin_publish.json()["visibility"] == "public"
    assert "auth_token" not in admin_publish.json()["metadata"]["api_config"]

    member_visible_models = client.get(
        "/api/v1/models/versions?scope=visible",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_visible_models.status_code == 200
    assert any(item["id"] == model_version["id"] for item in member_visible_models.json())

    member_download = client.get(
        f"/api/v1/models/versions/{model_version['id']}/download",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_download.status_code == 200

    prediction_dataset = _upload_table_dataset(
        client,
        engineer_token,
        workspace_id,
        "custom-api-input",
        "feature_a,feature_b\n7,8\n8,9\n",
    )
    graph = _template_graph(client, engineer_token, "tabular.custom_api_prediction")
    for node in graph["nodes"]:
        if node["type"] == "source.dataset_version":
            node["params"]["datasetVersionId"] = prediction_dataset["id"]
        if node["type"] == "custom.api_predict":
            node["params"]["modelVersionId"] = model_version["id"]
            node["params"]["predictionColumn"] = "prediction"
            node["params"]["callParametersJson"] = "{}"
        if node["type"] == "export.table":
            node["params"]["outputDatasetName"] = "Custom API Published Output"

    captured_request: dict[str, object] = {}

    class FakeApiResponse:
        def __enter__(self) -> "FakeApiResponse":
            return self

        def __exit__(self, exc_type, exc, tb) -> bool:
            return False

        def read(self) -> bytes:
            return json.dumps({"predictions": [10.5, 12.25]}).encode("utf-8")

    def fake_urlopen(request_obj, timeout: int = 30):
        captured_request["url"] = request_obj.full_url
        captured_request["timeout"] = timeout
        captured_request["headers"] = {
            key.lower(): value for key, value in request_obj.header_items()
        }
        return FakeApiResponse()

    monkeypatch.setattr(
        "platform_backend.workflows.tabular_runtime.urllib_request.urlopen",
        fake_urlopen,
    )

    workflow_version = _save_workflow_graph(client, engineer_token, graph)
    run = _run_workflow(client, engineer_token, workflow_version["id"], workspace_id)
    assert run["status"] == "succeeded"
    assert captured_request["url"] == "https://example.com/predict"
    assert captured_request["headers"]["x-api-key"] == "secret-token"


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


def test_dashboard_config_requires_admin_for_updates(client: TestClient) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")

    default_config = client.get(
        "/api/v1/platform-settings/dashboard",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert default_config.status_code == 200
    assert default_config.json()["feature_sections"]

    update_payload = {
        "feature_sections": [
            {
                "id": "workspace-entry",
                "title_zh": "工作空间入口",
                "title_en": "Workspace Entry",
                "summary_zh": "统一进入工作流与资产模块。",
                "summary_en": "One place to enter workflows and asset modules.",
                "button_label_zh": "进入",
                "button_label_en": "Open",
                "href": "/workflows",
                "icon_key": "workflows",
                "enabled": True,
            }
        ],
        "announcements": [
            {
                "id": "release-001",
                "title_zh": "首页已升级",
                "title_en": "Homepage upgraded",
                "summary_zh": "新的门户页已启用。",
                "summary_en": "The new portal page is now live.",
                "content_zh": "管理员可以直接在平台内维护首页内容。",
                "content_en": "Administrators can now manage homepage content in-platform.",
                "tag_zh": "更新",
                "tag_en": "Update",
                "published_at": "2026-04-05",
                "pinned": True,
                "published": True,
            }
        ],
    }

    forbidden = client.put(
        "/api/v1/platform-settings/dashboard",
        headers={"Authorization": f"Bearer {member_token}"},
        json=update_payload,
    )
    assert forbidden.status_code == 403

    updated = client.put(
        "/api/v1/platform-settings/dashboard",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=update_payload,
    )
    assert updated.status_code == 200
    assert updated.json()["feature_sections"][0]["title_en"] == "Workspace Entry"

    refreshed = client.get(
        "/api/v1/platform-settings/dashboard",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["announcements"][0]["id"] == "release-001"


def test_email_settings_require_admin_for_updates(client: TestClient) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")

    forbidden = client.get(
        "/api/v1/platform-settings/email",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert forbidden.status_code == 403

    current = client.get(
        "/api/v1/platform-settings/email",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert current.status_code == 200

    update_payload = {
        "email_enabled": True,
        "smtp_host": "smtp.qq.com",
        "smtp_port": 465,
        "smtp_use_ssl": True,
        "smtp_username": "ops@example.com",
        "smtp_password": "smtp-secret",
        "smtp_from_email": "ops@example.com",
        "smtp_from_name": "Platform Ops",
        "smtp_timeout_seconds": 18,
        "email_code_expire_minutes": 12,
        "email_code_resend_seconds": 90,
        "image_captcha_expire_minutes": 6,
    }

    updated = client.put(
        "/api/v1/platform-settings/email",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=update_payload,
    )
    assert updated.status_code == 200
    assert updated.json()["email_enabled"] is True
    assert updated.json()["smtp_username"] == "ops@example.com"
    assert updated.json()["smtp_password_configured"] is True
    assert updated.json()["email_code_resend_seconds"] == 90

    refreshed = client.get(
        "/api/v1/platform-settings/email",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["smtp_from_name"] == "Platform Ops"


def test_feedback_tickets_support_member_submission_and_admin_triage(
    client: TestClient,
) -> None:
    admin_token = _login(client, "admin@platform.local", "Admin123!")
    member_token = _login(client, "member@platform.local", "Member123!")
    workspace_id = _workspace_id(client, member_token)

    created = client.post(
        "/api/v1/feedback-tickets",
        headers={"Authorization": f"Bearer {member_token}"},
        json={
            "workspace_id": workspace_id,
            "title": "Need clearer workflow onboarding",
            "category": "feature_request",
            "priority": "high",
            "content": "Please add more guidance for first-time workflow users.",
            "contact": "member@platform.local",
        },
    )
    assert created.status_code == 201
    ticket_id = created.json()["id"]

    member_list = client.get(
        "/api/v1/feedback-tickets?scope=mine&limit=10",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    admin_list = client.get(
        "/api/v1/feedback-tickets?scope=all&limit=10",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    forbidden_all_scope = client.get(
        "/api/v1/feedback-tickets?scope=all&limit=10",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_list.status_code == 200
    assert admin_list.status_code == 200
    assert forbidden_all_scope.status_code == 403
    assert any(item["id"] == ticket_id for item in member_list.json())
    assert any(item["id"] == ticket_id for item in admin_list.json())

    member_status_update = client.patch(
        f"/api/v1/feedback-tickets/{ticket_id}",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"status": "resolved"},
    )
    assert member_status_update.status_code == 403

    admin_update = client.patch(
        f"/api/v1/feedback-tickets/{ticket_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "status": "in_progress",
            "admin_reply": "Acknowledged. We will add onboarding guidance to the dashboard.",
        },
    )
    assert admin_update.status_code == 200
    assert admin_update.json()["status"] == "in_progress"
    assert admin_update.json()["admin_reply"].startswith("Acknowledged.")

    member_detail = client.get(
        f"/api/v1/feedback-tickets/{ticket_id}",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    admin_summary = client.get(
        "/api/v1/feedback-tickets/summary",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    member_summary = client.get(
        "/api/v1/feedback-tickets/summary",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert member_detail.status_code == 200
    assert member_detail.json()["admin_reply"].startswith("Acknowledged.")
    assert admin_summary.status_code == 200
    assert member_summary.status_code == 200
    assert admin_summary.json()["admin_in_progress_count"] >= 1
    assert member_summary.json()["my_active_count"] >= 1
