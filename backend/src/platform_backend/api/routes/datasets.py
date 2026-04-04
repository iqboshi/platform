from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.domain_enums import DatasetKind
from platform_backend.schemas.platform import (
    ApiMessage,
    DatasetSummary,
    DatasetUpdateRequest,
    DatasetUploadConfirmRequest,
    DatasetUploadRequest,
    DatasetVersionSummary,
    UploadSessionResponse,
    UserProfile,
)
from platform_backend.services.platform_store import (
    confirm_upload,
    create_dataset_upload,
    create_upload_session,
    delete_dataset,
    get_dataset,
    list_datasets,
    update_dataset,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
DatasetViewUserDep = Annotated[UserProfile, Depends(require_permission("dataset.view"))]
DatasetManageUserDep = Annotated[UserProfile, Depends(require_permission("dataset.manage"))]


@router.get(
    "",
    response_model=list[DatasetSummary],
)
def list_datasets_route(
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
    scope: str = "visible",
    visibility: str | None = None,
) -> list[DatasetSummary]:
    try:
        return list_datasets(db, current_user, scope=scope, visibility=visibility)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get(
    "/{dataset_id}",
    response_model=DatasetSummary,
)
def get_dataset_route(
    dataset_id: str,
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
) -> DatasetSummary:
    dataset = get_dataset(db, dataset_id, current_user)
    if dataset is None:
        raise HTTPException(status_code=404, detail="Dataset not found.")
    return dataset


@router.post(
    "/upload-session",
    response_model=UploadSessionResponse,
    dependencies=[Depends(require_permission("dataset.manage"))],
)
def create_upload_session_route(request: DatasetUploadRequest) -> UploadSessionResponse:
    return create_upload_session(
        workspace_id=request.workspace_id,
        dataset_name=request.dataset_name,
        file_name=request.file_name,
        content_type=request.content_type,
    )


@router.post(
    "/upload",
    response_model=DatasetVersionSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("dataset.manage"))],
)
def upload_dataset(
    db: DatabaseDep,
    current_user: DatasetManageUserDep,
    workspace_id: Annotated[str, Form(...)],
    dataset_name: Annotated[str, Form(...)],
    kind: Annotated[DatasetKind, Form(...)],
    file: Annotated[UploadFile, File(...)],
) -> DatasetVersionSummary:
    if file.filename is None:
        raise HTTPException(status_code=400, detail="Uploaded file must have a filename.")

    try:
        file.file.seek(0, 2)
        size_bytes = file.file.tell()
        file.file.seek(0)
    except OSError:
        size_bytes = 0

    return create_dataset_upload(
        db,
        workspace_id=workspace_id,
        dataset_name=dataset_name,
        kind=kind,
        current_user=current_user,
        upload_file=file.file,
        original_file_name=file.filename,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size_bytes,
    )


@router.post(
    "/confirm",
    response_model=DatasetVersionSummary,
    dependencies=[Depends(require_permission("dataset.manage"))],
)
def confirm_dataset_upload(
    request: DatasetUploadConfirmRequest,
    db: DatabaseDep,
    current_user: DatasetManageUserDep,
) -> DatasetVersionSummary:
    return confirm_upload(db, request, current_user)


@router.patch(
    "/{dataset_id}",
    response_model=DatasetSummary,
)
def update_dataset_route(
    dataset_id: str,
    request: DatasetUpdateRequest,
    db: DatabaseDep,
    current_user: DatasetManageUserDep,
) -> DatasetSummary:
    try:
        return update_dataset(
            db,
            dataset_id,
            current_user=current_user,
            name=request.name,
            visibility=request.visibility,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete(
    "/{dataset_id}",
    response_model=ApiMessage,
)
def delete_dataset_route(
    dataset_id: str,
    db: DatabaseDep,
    current_user: DatasetManageUserDep,
) -> ApiMessage:
    try:
        delete_dataset(db, dataset_id, current_user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ApiMessage(message="Dataset deleted.")
