from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from platform_backend.core.settings import get_settings
from platform_backend.db.session import get_engine
from platform_backend.main import create_app


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    root = Path("tmp") / f"pytest-{uuid4()}"
    root.mkdir(parents=True, exist_ok=True)
    database_path = root / "platform-test.db"
    storage_root = root / "storage"

    monkeypatch.setenv("PLATFORM_DATABASE_URL", f"sqlite:///{database_path.as_posix()}")
    monkeypatch.setenv("PLATFORM_STORAGE_ROOT", storage_root.as_posix())
    monkeypatch.setenv("PLATFORM_TILE_BASE_URL", "http://testserver/tiles")
    monkeypatch.setenv("PLATFORM_CORS_ORIGINS", '["http://localhost:5173"]')

    get_settings.cache_clear()
    get_engine.cache_clear()

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

    get_settings.cache_clear()
    get_engine.cache_clear()


@pytest.fixture()
def admin_token(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@platform.local", "password": "Admin123!"},
    )
    return response.json()["access_token"]
