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
    monkeypatch.setenv("PLATFORM_EMAIL_ENABLED", "true")
    monkeypatch.setenv("PLATFORM_SMTP_HOST", "smtp.qq.com")
    monkeypatch.setenv("PLATFORM_SMTP_PORT", "465")
    monkeypatch.setenv("PLATFORM_SMTP_USE_SSL", "true")
    monkeypatch.setenv("PLATFORM_SMTP_USERNAME", "noreply@example.com")
    monkeypatch.setenv("PLATFORM_SMTP_PASSWORD", "dummy-password")
    monkeypatch.setenv("PLATFORM_SMTP_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setenv("PLATFORM_EMAIL_CODE_RESEND_SECONDS", "60")
    monkeypatch.setenv("PLATFORM_EMAIL_CODE_EXPIRE_MINUTES", "10")
    monkeypatch.setenv("PLATFORM_IMAGE_CAPTCHA_EXPIRE_MINUTES", "5")

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
