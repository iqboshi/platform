from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from sqlalchemy import select
from sqlalchemy.orm import Session

from platform_backend.core.settings import get_settings
from platform_backend.domain_enums import ApprovalStatus, RoleKey
from platform_backend.models.entities import User
from platform_backend.schemas.auth import PendingUserSummary, RegisterRequest
from platform_backend.schemas.platform import TokenResponse, UserProfile
from platform_backend.services.permissions import ROLE_PERMISSIONS


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        120_000,
    ).hex()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email.lower()))


def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def list_pending_users(db: Session) -> list[PendingUserSummary]:
    rows = db.scalars(
        select(User)
        .where(User.approval_status == ApprovalStatus.PENDING)
        .order_by(User.created_at.asc())
    ).all()
    return [to_pending_user_summary(row) for row in rows]


def register_user(db: Session, request: RegisterRequest) -> User:
    email = request.email.lower()
    if get_user_by_email(db, email) is not None:
        raise ValueError("Email is already registered.")

    salt = secrets.token_hex(16)
    user = User(
        email=email,
        display_name=request.display_name,
        password_salt=salt,
        password_hash=_hash_password(request.password, salt),
        role_key=RoleKey.MEMBER,
        approval_status=ApprovalStatus.PENDING,
        preferred_locale=request.preferred_locale,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        return None

    candidate_hash = _hash_password(password, user.password_salt)
    if secrets.compare_digest(candidate_hash, user.password_hash):
        return user
    return None


def approve_user(db: Session, user_id: str, role: RoleKey) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")
    user.approval_status = ApprovalStatus.APPROVED
    user.role_key = role
    db.commit()
    db.refresh(user)
    return user


def reject_user(db: Session, user_id: str) -> User:
    user = get_user_by_id(db, user_id)
    if user is None:
        raise LookupError("User not found.")
    user.approval_status = ApprovalStatus.REJECTED
    db.commit()
    db.refresh(user)
    return user


def create_access_token(user: User) -> str:
    settings = get_settings()
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": user.id,
        "role": user.role_key.value,
        "approval_status": user.approval_status.value,
        "exp": expires_at,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, str]:
    settings = get_settings()
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])


def touch_last_login(db: Session, user: User) -> None:
    user.last_login_at = datetime.now(UTC)
    db.commit()


def to_user_profile(user: User) -> UserProfile:
    permissions = sorted(ROLE_PERMISSIONS.get(user.role_key, set()))
    return UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role_key,
        approval_status=user.approval_status,
        preferred_locale=user.preferred_locale,
        permissions=permissions,
    )


def to_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user),
        user=to_user_profile(user),
    )


def to_pending_user_summary(user: User) -> PendingUserSummary:
    return PendingUserSummary(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role_key,
        approval_status=user.approval_status,
        preferred_locale=user.preferred_locale,
        created_at=user.created_at,
    )
