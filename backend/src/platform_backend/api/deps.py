from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from platform_backend.db.session import get_db
from platform_backend.schemas.platform import UserProfile
from platform_backend.services.auth import decode_access_token, get_user_by_id, to_user_profile
from platform_backend.services.permissions import has_permission

bearer_scheme = HTTPBearer(auto_error=False)
AuthCredentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def get_current_user(
    credentials: AuthCredentials,
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_token", "message": "Authentication token is required."},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Authentication token is invalid."},
        ) from exc

    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_token", "message": "Authentication token is invalid."},
        )

    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "user_not_found", "message": "User account no longer exists."},
        )
    return to_user_profile(user)


def require_permission(permission: str):
    def dependency(
        current_user: Annotated[UserProfile, Depends(get_current_user)],
    ) -> UserProfile:
        if not has_permission(current_user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "permission_denied",
                    "message": f"Permission '{permission}' is required.",
                },
            )
        return current_user

    return dependency
