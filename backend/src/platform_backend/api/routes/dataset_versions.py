from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from platform_backend.api.deps import require_permission
from platform_backend.db.session import get_db
from platform_backend.schemas.platform import DatasetVersionSummary, UserProfile
from platform_backend.services.platform_store import (
    get_dataset_version,
    get_dataset_version_file,
    list_dataset_versions,
)

router = APIRouter()
DatabaseDep = Annotated[Session, Depends(get_db)]
DatasetViewUserDep = Annotated[UserProfile, Depends(require_permission("dataset.view"))]


@router.get(
    "",
    response_model=list[DatasetVersionSummary],
)
def list_dataset_versions_route(
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
    dataset_id: str | None = None,
) -> list[DatasetVersionSummary]:
    return list_dataset_versions(db, current_user=current_user, dataset_id=dataset_id)


@router.get(
    "/{dataset_version_id}",
    response_model=DatasetVersionSummary,
)
def get_dataset_version_route(
    dataset_version_id: str,
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
) -> DatasetVersionSummary:
    version = get_dataset_version(db, dataset_version_id, current_user)
    if version is None:
        raise HTTPException(status_code=404, detail="Dataset version not found.")
    return version


@router.get(
    "/{dataset_version_id}/download",
)
def download_dataset_version(
    dataset_version_id: str,
    db: DatabaseDep,
    current_user: DatasetViewUserDep,
) -> FileResponse:
    payload = get_dataset_version_file(db, dataset_version_id, current_user)
    if payload is None:
        raise HTTPException(status_code=404, detail="Dataset version not found.")

    file_path, file_name, media_type = payload
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Dataset file not found.")
    return FileResponse(file_path, filename=file_name, media_type=media_type)
