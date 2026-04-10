from fastapi.testclient import TestClient


def _issue_email_code(
    client: TestClient,
    monkeypatch,
    *,
    email: str,
    scene: str,
    captcha_code: str = "ABCD",
    email_code: str = "654321",
    token: str | None = None,
) -> str:
    monkeypatch.setattr(
        "platform_backend.services.auth.generate_image_captcha_code",
        lambda: captcha_code,
    )
    monkeypatch.setattr(
        "platform_backend.services.auth.generate_email_verification_code",
        lambda: email_code,
    )
    monkeypatch.setattr(
        "platform_backend.services.auth.send_text_email",
        lambda **_: None,
    )

    captcha = client.get("/api/v1/auth/captcha")
    assert captcha.status_code == 200

    send = client.post(
        "/api/v1/auth/email-code/send",
        json={
            "email": email,
            "scene": scene,
            "captcha_key": captcha.json()["captcha_key"],
            "captcha_code": captcha_code,
        },
        headers={"Authorization": f"Bearer {token}"} if token else None,
    )
    assert send.status_code == 200
    return email_code


def test_register_creates_pending_user(client: TestClient, monkeypatch) -> None:
    email_code = _issue_email_code(
        client,
        monkeypatch,
        email="new-user@platform.local",
        scene="register",
    )
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "new-user@platform.local",
            "display_name": "New User",
            "password": "StrongPass1!",
            "email_code": email_code,
            "preferred_locale": "zh-CN",
        },
    )
    assert response.status_code == 201
    assert response.json()["approval_status"] == "PENDING"


def test_email_code_send_has_cooldown(client: TestClient, monkeypatch) -> None:
    _issue_email_code(
        client,
        monkeypatch,
        email="cooldown-user@platform.local",
        scene="register",
    )

    captcha = client.get("/api/v1/auth/captcha")
    assert captcha.status_code == 200
    resend = client.post(
        "/api/v1/auth/email-code/send",
        json={
            "email": "cooldown-user@platform.local",
            "scene": "register",
            "captcha_key": captcha.json()["captcha_key"],
            "captcha_code": "ABCD",
        },
    )
    assert resend.status_code == 429
    assert resend.json()["detail"]["code"] == "email_code_send_cooldown"


def test_pending_user_cannot_login(client: TestClient) -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "pending@platform.local", "password": "Pending123!"},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "pending_approval"


def test_admin_can_approve_registered_user(
    client: TestClient,
    admin_token: str,
    monkeypatch,
) -> None:
    email_code = _issue_email_code(
        client,
        monkeypatch,
        email="reviewer@platform.local",
        scene="register",
    )
    register = client.post(
        "/api/v1/auth/register",
        json={
            "email": "reviewer@platform.local",
            "display_name": "Reviewer",
            "password": "Review123!",
            "email_code": email_code,
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


def test_member_can_update_profile_email_and_password(
    client: TestClient,
    monkeypatch,
) -> None:
    token = client.post(
        "/api/v1/auth/login",
        json={"email": "member@platform.local", "password": "Member123!"},
    ).json()["access_token"]

    email_code = _issue_email_code(
        client,
        monkeypatch,
        email="member-new@platform.local",
        scene="change_email",
        token=token,
    )

    update_profile = client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "display_name": "Member Updated",
            "preferred_locale": "en-US",
            "email": "member-new@platform.local",
            "email_code": email_code,
            "avatar_url": "data:image/png;base64,ZmFrZS1hdmF0YXI=",
            "job_title": "Data Scientist",
            "organization": "Platform Lab",
            "bio": "Builds and validates tabular ML workflows.",
        },
    )
    assert update_profile.status_code == 200
    assert update_profile.json()["display_name"] == "Member Updated"
    assert update_profile.json()["email"] == "member-new@platform.local"
    assert update_profile.json()["avatar_url"].startswith("data:image/png;base64,")
    assert update_profile.json()["job_title"] == "Data Scientist"
    assert update_profile.json()["organization"] == "Platform Lab"
    assert update_profile.json()["bio"] == "Builds and validates tabular ML workflows."

    change_password = client.post(
        "/api/v1/auth/me/password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": "Member123!",
            "new_password": "Member456!",
        },
    )
    assert change_password.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "member-new@platform.local", "password": "Member456!"},
    )
    assert login.status_code == 200
    assert login.json()["user"]["preferred_locale"] == "en-US"
    assert login.json()["user"]["job_title"] == "Data Scientist"


def test_member_can_request_role_upgrade_and_admin_can_approve(
    client: TestClient,
    admin_token: str,
) -> None:
    member_login = client.post(
        "/api/v1/auth/login",
        json={"email": "member@platform.local", "password": "Member123!"},
    )
    member_token = member_login.json()["access_token"]

    created = client.post(
        "/api/v1/auth/role-upgrade-requests",
        headers={"Authorization": f"Bearer {member_token}"},
        json={"reason": "Need access to train and manage platform models."},
    )
    assert created.status_code == 200
    request_id = created.json()["id"]
    assert created.json()["status"] == "pending"
    assert created.json()["requested_role"] == "ML_ENGINEER"

    all_requests = client.get(
        "/api/v1/auth/role-upgrade-requests",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert all_requests.status_code == 200
    assert any(item["id"] == request_id for item in all_requests.json())

    approved = client.post(
        f"/api/v1/auth/role-upgrade-requests/{request_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"review_note": "Approved for model management work."},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["review_note"] == "Approved for model management work."

    me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {member_token}"},
    )
    assert me.status_code == 200
    assert me.json()["role"] == "ML_ENGINEER"
