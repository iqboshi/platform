from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import (
    get_current_user,
    get_optional_current_user,
    require_permission,
)
from platform_backend.db.session import get_db
from platform_backend.schemas.auth import (
    ApprovalRequest,
    EmailCodeSendRequest,
    EmailCodeSendResponse,
    ImageCaptchaResponse,
    LoginRequest,
    PasswordChangeRequest,
    PendingUserSummary,
    RegisterRequest,
    RegisterResponse,
    RoleUpgradeRequestCreateRequest,
    RoleUpgradeRequestReviewRequest,
    RoleUpgradeRequestSummary,
    UserProfileUpdateRequest,
)
from platform_backend.schemas.platform import ApiMessage, TokenResponse, UserProfile
from platform_backend.services.auth import (
    AuthFlowError,
    approve_role_upgrade_request,
    approve_user,
    authenticate_user,
    change_user_password,
    create_image_captcha,
    create_role_upgrade_request,
    list_my_role_upgrade_requests,
    list_pending_users,
    list_role_upgrade_requests,
    register_user,
    reject_role_upgrade_request,
    reject_user,
    send_email_verification_code,
    to_token_response,
    to_user_profile,
    touch_last_login,
    update_user_profile,
)

router = APIRouter()
CurrentUserDep = Annotated[UserProfile, Depends(get_current_user)]
OptionalCurrentUserDep = Annotated[UserProfile | None, Depends(get_optional_current_user)]
DatabaseDep = Annotated[Session, Depends(get_db)]


def _raise_auth_flow_error(exc: AuthFlowError) -> None:
    raise HTTPException(
        status_code=exc.status_code,
        detail={"code": exc.code, "message": exc.message},
    ) from exc


@router.get("/captcha", response_model=ImageCaptchaResponse)
def captcha(db: DatabaseDep) -> ImageCaptchaResponse:
    return create_image_captcha(db)


@router.post("/email-code/send", response_model=EmailCodeSendResponse)
def send_email_code(
    request: EmailCodeSendRequest,
    db: DatabaseDep,
    current_user: OptionalCurrentUserDep,
) -> EmailCodeSendResponse:
    try:
        return send_email_verification_code(db, request, current_user)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, db: DatabaseDep) -> RegisterResponse:
    try:
        user = register_user(db, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
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
    return to_token_response(user, db)


@router.post("/logout", response_model=ApiMessage)
def logout(_: CurrentUserDep) -> ApiMessage:
    return ApiMessage(message="Logout acknowledged. Clear the token client-side.")


@router.get("/me", response_model=UserProfile)
def me(current_user: CurrentUserDep) -> UserProfile:
    return current_user


@router.patch("/me", response_model=UserProfile)
def patch_me(
    request: UserProfileUpdateRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> UserProfile:
    try:
        user = update_user_profile(db, current_user.id, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_user_profile(user, db)


@router.post("/me/password", response_model=ApiMessage)
def update_password(
    request: PasswordChangeRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> ApiMessage:
    try:
        change_user_password(db, current_user.id, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ApiMessage(message="Password updated.")


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
    return to_user_profile(user, db)


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
    return to_user_profile(user, db)


@router.get("/role-upgrade-requests/mine", response_model=list[RoleUpgradeRequestSummary])
def my_role_upgrade_requests(
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> list[RoleUpgradeRequestSummary]:
    return list_my_role_upgrade_requests(db, current_user.id)


@router.post("/role-upgrade-requests", response_model=RoleUpgradeRequestSummary)
def create_role_request(
    request: RoleUpgradeRequestCreateRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> RoleUpgradeRequestSummary:
    try:
        return create_role_upgrade_request(db, current_user.id, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get(
    "/role-upgrade-requests",
    response_model=list[RoleUpgradeRequestSummary],
    dependencies=[Depends(require_permission("user.approve"))],
)
def all_role_upgrade_requests(db: DatabaseDep) -> list[RoleUpgradeRequestSummary]:
    return list_role_upgrade_requests(db)


@router.post(
    "/role-upgrade-requests/{request_id}/approve",
    response_model=RoleUpgradeRequestSummary,
    dependencies=[Depends(require_permission("user.approve"))],
)
def approve_role_request(
    request_id: str,
    request: RoleUpgradeRequestReviewRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> RoleUpgradeRequestSummary:
    try:
        return approve_role_upgrade_request(db, request_id, current_user.id, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/role-upgrade-requests/{request_id}/reject",
    response_model=RoleUpgradeRequestSummary,
    dependencies=[Depends(require_permission("user.approve"))],
)
def reject_role_request(
    request_id: str,
    request: RoleUpgradeRequestReviewRequest,
    current_user: CurrentUserDep,
    db: DatabaseDep,
) -> RoleUpgradeRequestSummary:
    try:
        return reject_role_upgrade_request(db, request_id, current_user.id, request)
    except AuthFlowError as exc:
        _raise_auth_flow_error(exc)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
