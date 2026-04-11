from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import (
    ApiMessage,
    CustomApiModelCreateRequest,
    ModelSummary,
    ModelVersionUpdateRequest,
    ModelVersionSummary,
    UserProfile,
)
from platform_backend.services.platform_store import (
    create_custom_api_model,
    create_model_upload,
    delete_model_version,
    get_model_version_download_payload,
    list_model_versions,
    list_models,
    update_model_version,
)
from platform_backend.workflows.tabular_runtime import parse_json_object

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
ModelViewUserDep = Annotated[UserProfile, Depends(require_permission("model.view"))]
ModelManageUserDep = Annotated[UserProfile, Depends(require_permission("model.manage"))]


@router.get(
    "",
    response_model=list[ModelSummary],
)
def list_models_route(
    db: DatabaseDep,
    current_user: ModelViewUserDep,
    scope: str = "visible",
) -> list[ModelSummary]:
    try:
        return list_models(db, current_user=current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get(
    "/versions",
    response_model=list[ModelVersionSummary],
)
def list_model_versions_route(
    db: DatabaseDep,
    current_user: ModelViewUserDep,
    scope: str = "visible",
) -> list[ModelVersionSummary]:
    try:
        return list_model_versions(db, current_user=current_user, scope=scope)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/custom",
    response_model=ModelVersionSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_custom_api_model_route(
    request: CustomApiModelCreateRequest,
    db: DatabaseDep,
    current_user: ModelManageUserDep,
) -> ModelVersionSummary:
    try:
        return create_custom_api_model(db, request=request, current_user=current_user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/upload",
    response_model=ModelVersionSummary,
    status_code=status.HTTP_201_CREATED,
)
def upload_model_route(
    db: DatabaseDep,
    current_user: ModelManageUserDep,
    workspace_id: Annotated[str, Form(...)],
    model_name: Annotated[str, Form(...)],
    version: Annotated[str, Form(...)],
    algorithm_key: Annotated[str, Form(...)],
    task_type: Annotated[str, Form(...)],
    file: Annotated[UploadFile, File(...)],
    framework: Annotated[str, Form()] = "",
    feature_names_json: Annotated[str, Form()] = "[]",
    default_parameters_json: Annotated[str, Form()] = "{}",
) -> ModelVersionSummary:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    try:
        feature_names_payload = json.loads(feature_names_json)
        if not isinstance(feature_names_payload, list) or not all(
            isinstance(item, str) for item in feature_names_payload
        ):
            raise ValueError("feature_names_json must be a JSON array of strings.")
        return create_model_upload(
            db,
            workspace_id=workspace_id,
            model_name=model_name,
            version=version,
            algorithm_key=algorithm_key,
            task_type=task_type,
            framework=framework,
            feature_names=[item.strip() for item in feature_names_payload if item.strip()],
            default_parameters=parse_json_object(
                default_parameters_json,
                field_name="default_parameters_json",
            ),
            current_user=current_user,
            upload_file=file.file,
            original_file_name=file.filename,
        )
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/versions/{model_version_id}/download")
def download_model_version_route(
    model_version_id: str,
    db: DatabaseDep,
    current_user: ModelViewUserDep,
):
    payload = get_model_version_download_payload(db, model_version_id, current_user=current_user)
    if payload is None:
        raise HTTPException(status_code=404, detail="Model version not found.")

    body, file_name, media_type = payload
    return Response(
        content=body,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{file_name}"'},
    )


@router.patch(
    "/versions/{model_version_id}",
    response_model=ModelVersionSummary,
)
def update_model_version_route(
    model_version_id: str,
    request: ModelVersionUpdateRequest,
    db: DatabaseDep,
    current_user: ModelManageUserDep,
) -> ModelVersionSummary:
    try:
        return update_model_version(
            db,
            model_version_id,
            visibility=request.visibility,
            current_user=current_user,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/versions/{model_version_id}",
    response_model=ApiMessage,
)
def delete_model_version_route(
    model_version_id: str,
    db: DatabaseDep,
    current_user: ModelManageUserDep,
) -> ApiMessage:
    try:
        delete_model_version(db, model_version_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return ApiMessage(message="Model version deleted.")
