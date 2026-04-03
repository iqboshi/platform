from fastapi.testclient import TestClient


def test_register_creates_pending_user(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new-user@platform.local",
            "display_name": "New User",
            "password": "StrongPass1!",
            "preferred_locale": "zh-CN",
        },
    )
    assert response.status_code == 201
    assert response.json()["approval_status"] == "PENDING"


def test_pending_user_cannot_login(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "pending@platform.local", "password": "Pending123!"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "pending_approval"


def test_admin_can_approve_registered_user(client: TestClient, admin_token: str) -> None:
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": "reviewer@platform.local",
            "display_name": "Reviewer",
            "password": "Review123!",
            "preferred_locale": "en-US",
        },
    )
    user_id = register.json()["user_id"]

    pending = client.get(
        "/api/v1/auth/pending-users",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert pending.status_code == 200
    assert any(user["id"] == user_id for user in pending.json())

    approve = client.post(
        f"/api/v1/auth/approve/{user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"role": "ML_ENGINEER"},
    )
    assert approve.status_code == 200
    assert approve.json()["approval_status"] == "APPROVED"
    assert approve.json()["role"] == "ML_ENGINEER"

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "reviewer@platform.local", "password": "Review123!"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["role"] == "ML_ENGINEER"


def test_me_returns_permissions(client: TestClient, admin_token: str) -> None:
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    assert "user.approve" in response.json()["permissions"]
