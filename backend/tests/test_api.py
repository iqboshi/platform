from fastapi.testclient import TestClient


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
                    "type": "source.dataset",
                    "position": {"x": 0, "y": 0},
                    "params": {},
                    "input_bindings": {},
                    "output_defs": [{"key": "image", "label": "Image"}],
                }
            ],
            "edges": [],
        },
    )
    assert response.status_code == 200
    assert response.json()["valid"] is True


def test_models_endpoint_requires_model_permission(
    client: TestClient,
    admin_token: str,
) -> None:
    member_login = client.post(
        "/api/v1/auth/login",
        json={"email": "member@platform.local", "password": "Member123!"},
    )
    member_token = member_login.json()["access_token"]

    forbidden = client.get(
        "/api/v1/models",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert forbidden.status_code == 403

    allowed = client.get(
        "/api/v1/models",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert allowed.status_code == 200


def test_dataset_upload_persists_version(client: TestClient, admin_token: str) -> None:
    workspaces = client.get(
        "/api/v1/workspaces",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    workspace_id = workspaces.json()[0]["id"]

    response = client.post(
        "/api/v1/datasets/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files={"file": ("sample.txt", b"hello platform", "text/plain")},
        data={
            "workspace_id": workspace_id,
            "dataset_name": "Uploaded Sample",
            "kind": "artifact",
        },
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["metadata"]["size_bytes"] == 14

    versions = client.get(
        "/api/v1/dataset-versions",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert versions.status_code == 200
    assert any(item["id"] == payload["id"] for item in versions.json())


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
