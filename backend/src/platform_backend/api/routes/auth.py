from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import get_current_user, require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.auth import (
    ApprovalRequest,
    LoginRequest,
    PendingUserSummary,
    RegisterRequest,
    RegisterResponse,
)
from platform_backend.schemas.platform import ApiMessage, TokenResponse, UserProfile
from platform_backend.services.auth import (
    approve_user,
    authenticate_user,
    list_pending_users,
    register_user,
    reject_user,
    to_token_response,
    to_user_profile,
    touch_last_login,
)

router = APIRouter()
CurrentUserDep = Annotated[UserProfile, Depends(get_current_user)]
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: DatabaseDep) -> RegisterResponse:
    try:
        user = register_user(db, request)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "email_exists", "message": str(exc)},
        ) from exc

    return RegisterResponse(
        user_id=user.id,
        approval_status=user.approval_status,
        message="Registration submitted. An administrator must approve the account.",
    )


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: DatabaseDep) -> TokenResponse:
    user = authenticate_user(db, request.email, request.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_credentials", "message": "Email or password is incorrect."},
        )

    if user.approval_status.name == "PENDING":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "pending_approval", "message": "Account is pending approval."},
        )
    if user.approval_status.name == "REJECTED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "account_rejected", "message": "Account registration was rejected."},
        )

    touch_last_login(db, user)
    return to_token_response(user)


@router.post("/logout", response_model=ApiMessage)
def logout(_: CurrentUserDep) -> ApiMessage:
    return ApiMessage(message="Logout acknowledged. Clear the token client-side.")


@router.get("/me", response_model=UserProfile)
def me(current_user: CurrentUserDep) -> UserProfile:
    return current_user


@router.get(
    "/pending-users",
    response_model=list[PendingUserSummary],
    dependencies=[Depends(require_permission("user.approve"))],
)
def pending_users(db: DatabaseDep) -> list[PendingUserSummary]:
    return list_pending_users(db)


@router.post(
    "/approve/{user_id}",
    response_model=UserProfile,
    dependencies=[Depends(require_permission("user.approve"))],
)
def approve_registered_user(user_id: str, request: ApprovalRequest, db: DatabaseDep) -> UserProfile:
    try:
        user = approve_user(db, user_id, request.role)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_user_profile(user)


@router.post(
    "/reject/{user_id}",
    response_model=UserProfile,
    dependencies=[Depends(require_permission("user.approve"))],
)
def reject_registered_user(user_id: str, db: DatabaseDep) -> UserProfile:
    try:
        user = reject_user(db, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_user_profile(user)
