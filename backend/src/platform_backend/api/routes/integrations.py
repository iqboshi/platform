from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import (
    ApiMessage,
    GeeCredentialCreateRequest,
    GeeCredentialSummary,
    UserProfile,
)
from platform_backend.services.platform_store import (
    create_gee_credential,
    delete_gee_credential,
    list_gee_credentials,
    set_platform_default_gee_credential,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
WorkflowViewUserDep = Annotated[UserProfile, Depends(require_permission("workflow.view"))]
WorkflowManageUserDep = Annotated[UserProfile, Depends(require_permission("workflow.manage"))]
SystemConfigureUserDep = Annotated[UserProfile, Depends(require_permission("system.configure"))]


@router.get(
    "/gee-credentials",
    response_model=list[GeeCredentialSummary],
)
def list_gee_credentials_route(
    db: DatabaseDep,
    current_user: WorkflowViewUserDep,
    scope: str = "mine",
) -> list[GeeCredentialSummary]:
    try:
        return list_gee_credentials(db, current_user=current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/gee-credentials",
    response_model=GeeCredentialSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_gee_credentials_route(
    request: GeeCredentialCreateRequest,
    db: DatabaseDep,
    current_user: WorkflowManageUserDep,
) -> GeeCredentialSummary:
    try:
        return create_gee_credential(db, request=request, current_user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/gee-credentials/{credential_id}",
    response_model=ApiMessage,
)
def delete_gee_credential_route(
    credential_id: str,
    db: DatabaseDep,
    current_user: WorkflowManageUserDep,
) -> ApiMessage:
    try:
        delete_gee_credential(db, credential_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="GEE credential deleted.")


@router.post(
    "/gee-credentials/{credential_id}/set-platform-default",
    response_model=GeeCredentialSummary,
)
def set_platform_default_gee_credential_route(
    credential_id: str,
    db: DatabaseDep,
    current_user: SystemConfigureUserDep,
) -> GeeCredentialSummary:
    try:
        return set_platform_default_gee_credential(
            db,
            credential_id,
            current_user=current_user,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
