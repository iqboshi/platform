from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.domain_enums import DatasetKind
from platform_backend.schemas.platform import (
    DatasetSummary,
    DatasetUploadConfirmRequest,
    DatasetUploadRequest,
    DatasetVersionSummary,
    UploadSessionResponse,
)
from platform_backend.services.platform_store import (
    confirm_upload,
    create_dataset_upload,
    create_upload_session,
    get_dataset,
    list_datasets,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]


@router.get(
    "",
    response_model=list[DatasetSummary],
    dependencies=[Depends(require_permission("dataset.view"))],
)
def list_datasets_route(db: DatabaseDep) -> list[DatasetSummary]:
    return list_datasets(db)


@router.get(
    "/{dataset_id}",
    response_model=DatasetSummary,
    dependencies=[Depends(require_permission("dataset.view"))],
)
def get_dataset_route(dataset_id: str, db: DatabaseDep) -> DatasetSummary:
    dataset = get_dataset(db, dataset_id)
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
) -> DatasetVersionSummary:
    return confirm_upload(db, request)
