from fastapi.testclient import TestClient

from platform_backend.main import app

client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_workflow_validation_endpoint() -> None:
    response = client.post(
        "/api/v1/workflows/validate",
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
